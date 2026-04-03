import os
import base64
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
print(f"[Backend] OPENAI_API_KEY present: {'Yes' if os.environ.get('OPENAI_API_KEY') else 'No'}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class VerifyRequest(BaseModel):
    text: str
    images: List[str]  # Base64 строки

class EvaluationRequest(BaseModel):
    text: str
    theme: Optional[str] = ""

def encode_image(file_content):
    return base64.b64encode(file_content).decode('utf-8')

# --- ШАГ 1: ПЕРВИЧНОЕ РАСПОЗНАВАНИЕ (OCR) ---
gemini_client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
    http_options={'base_url': 'https://api.proxyapi.ru/google'}
)

@app.post("/api/recognize")
async def recognize_essay(files: List[UploadFile] = File(...)):
    print(f"[Backend] Received recognize request with {len(files)} files via Gemini")
    gemini_contents = []
    raw_images_base64 = []
    
    ocr_prompt = """
    ИНСТРУКЦИЯ ДЛЯ ГЛУБОКОГО OCR-АНАЛИЗА РУКОПИСИ:
    Ты — ИИ-палеограф, эксперт по сложным почеркам. Твоя единственная задача — максимально точно переписать текст.
    
    ПРАВИЛА:
    1. ИГНОРИРУЙ зачеркнутые слова (если автор зачеркнул — этого слова нет в тексте).
    2. УЧИТЫВАЙ надстрочные вставки (если автор вставил слово стрелочкой сверху — впиши его в нужное место).
    3. СОХРАНЯЙ абзацы и авторскую пунктуацию.
    4. Если слово написано неразборчиво или исправлено так, что непонятно — перепиши как видишь, но не гадай.
    5. Если на фото не текст сочинения (а чертежи, мемы, конспекты) — поставь флаг is_not_essay: true.

    ВЕРНИ СТРОГО JSON:
    {
      "text": "полный сырой текст сочинения",
      "is_not_essay": false
    }
    """
    gemini_contents.append(ocr_prompt)
    
    for file in files:
        print(f"[Backend] Processing file: {file.filename}, type: {file.content_type}")
        content = await file.read()
        if file.content_type.startswith('image/'):
            base_64 = encode_image(content)
            img_data = f"data:{file.content_type};base64,{base_64}"
            raw_images_base64.append(img_data)
            
            gemini_contents.append(
                types.Part.from_bytes(
                    data=content,
                    mime_type=file.content_type
                )
            )

    try:
        print("[Backend] Calling Gemini-3-flash-preview for OCR...")
        response = gemini_client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        print("[Backend] Gemini OCR response received")
        result = json.loads(response.text)
        result["images"] = raw_images_base64 # Сохраняем картинки для следующего шага
        return result
    except Exception as e:
        error_msg = str(e).lower()
        if "429" in error_msg or "quota" in error_msg or "limit" in error_msg or "exhausted" in error_msg:
            custom_detail = "У бесплатного гемини OCR закончился лимит, напишите @islamchik чтобы решить трабл"
            print(f"[Backend] OCR limit error: {custom_detail}")
            raise HTTPException(status_code=429, detail=custom_detail)
        print(f"[Backend] OCR error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- ШАГ 2: ВЕРИФИКАЦИЯ И ПОИСК СОМНЕНИЙ ---
@app.post("/api/verify")
async def verify_text(req: VerifyRequest):
    print(f"[Backend] Received verify request for text length: {len(req.text)}")
    image_content = [{"type": "image_url", "image_url": {"url": url}} for url in req.images]
    
    verify_prompt = f"""
    СРАВНИ ТЕКСТ С КАРТИНКАМИ:
    У тебя есть распознанный текст: "{req.text}" и оригинальные фото.
    Найди в тексте фрагменты (слова или фразы), в которых ты НЕ УВЕРЕН на 100%. 

    КРИТЕРИИ СОМНЕНИЙ:
    - Плохой почерк, где буква может быть и 'а' и 'о'.
    - Грязные исправления пастой.
    - Странные сокращения.

    НИЧЕГО НЕ ИСПРАВЛЯЙ САМ. 
    Просто выдели эти куски и напиши причину сомнения. Юзер сам решит.

    ВЕРНИ СТРОГО JSON:
    {{
      "doubts": [
        {{ "index_start": 10, "index_end": 15, "word": "преобразование", "reason": "неразборчиво написано окончание" }}
      ]
    }}
    """

    try:
        print("[Backend] Calling OpenAI GPT-4o for Verification...")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [{"type": "text", "text": verify_prompt}] + image_content}],
            response_format={ "type": "json_object" }
        )
        print("[Backend] OpenAI Verification response received")
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"[Backend] Verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- ШАГ 3: ЭКСПЕРТНАЯ ОЦЕНКА ФИНАЛЬНОГО ТЕКСТА ---
@app.post("/api/evaluate")
async def evaluate_essay(req: EvaluationRequest):
    print(f"[Backend] Received evaluate request for theme: {req.theme}")
    eval_prompt = f"""
    ЭКСПЕРТ ЕГЭ:
    Проверь финальный, исправленный юзером текст по всем критериям (К1-К12).
    
    ТЕКСТ: {req.text}
    ТЕМА: {req.theme}

    ИНСТРУКЦИИ:
    - Считай баллы максимально строго по актуальным критериям ЕГЭ, которые приведены ниже.
    - В поле `feedback` для каждого критерия ОБЯЗАТЕЛЬНО пиши подробный анализ: почему снят балл (или почему поставлен максимум), приводи цитаты из текста с ошибками.
    - В конце добавь общие `Рекомендации по улучшению` и `Слова поддержки`.

    ПРАВИЛА ПОДСЧЕТА СЛОВ И ОБЪЕМА:
    Внимательно посчитай количество слов в исходном тексте. 
    1. Если в сочинении менее 70 слов: работа не засчитывается и оценивается в 0 баллов по ВСЕМ критериям (К1-К12).
    2. Если от 70 до 150 слов: 
       - Высший балл по К7-К12 НЕ ставится (то есть максимум по этим критериям снижается). 
       - К7: 2 балла (0 или 1 ошибка), 1 балл (не более 2 ошибок), 0 баллов (>2).
       - К8: 2 балла (0 или 1 ошибка), 1 балл (1-3 ошибки), 0 баллов (>3).
       - К9: 1 балл (0 ошибок), 0 баллов (>0).
       - К10: 1 балл (не более 1 ошибки), 0 баллов (>1).
    3. При подсчёте учитываются самостоятельные и служебные части речи. Слова через дефис (всё-таки) считаются как одно слово.
    4. Если сочинение представляет собой пересказанный или полностью переписанный исходный текст: 0 баллов по К1-К12.
    5. Работа, написанная без опоры на прочитанный текст, не оценивается (0 баллов).

    КРИТЕРИИ ОЦЕНИВАНИЯ:
    К1 (Формулировка проблемы - 1 балл):
    - 1 балл если верно сформулировал(а) проблему. Нет фактических ошибок.
    - 0 баллов если не смог сформулировать. *Если 0 по К1, то автоматически К2, К3, К4 = 0*.
    
    К2 (Комментарий к проблеме - 3 балла):
    - 3 балла: Проблема прокомментирована с опорой на исходный текст, приведено не менее 2 примеров-иллюстраций из текста, важных для понимания проблемы. Нет ошибок.
    - 2 балла: Приведен 1 пример-иллюстрация из текста.
    - 1 балл: Проблема прокомментирована с опорой на текст, но без примеров иллюстраций ИЛИ допущена 1 фактическая ошибка в понимании.
    - 0 баллов: Без опоры на текст, более 1 ошибки, пересказ, или цитирование больших фрагментов.

    К3 (Позиция автора - 1 балл):
    - 1 балл: Верно сформулирована позиция автора. Нет ошибок.
    - 0 баллов: Позиция автора сформулирована неверно или отсутствует.

    К4 (Собственное мнение - 3 балла):
    - 3 балла: Выразил свое мнение (согласился/не согласился) + 2 аргумента (один из лит-ры).
    - 2 балла: Выразил мнение + 2 аргумента (из жизни), ИЛИ 1 аргумент из лит-ры.
    - 1 балл: Выразил мнение + 1 аргумент из жизни.
    - 0 баллов: Нет аргументов или мнение формально ("согласен").

    К5 (Смысловая цельность, связность - 2 балла):
    - 2 балла: Нет логических ошибок, нет нарушений абзацного членения.
    - 1 балл: 1 логическая ошибка И/ИЛИ 1 нарушение абзацев.
    - 0 баллов: Более 1 лог. ошибки И/ИЛИ 2 нарушения абзацев.

    К6 (Точность и выразительность речи - 2 балла):
    - 2 балла: Точное выражение мысли, разнообразие грамм. строя (только если К10 = 2 или высший балл).
    - 1 балл: Однообразие грамм. строя ИЛИ нарушения точности.
    - 0 баллов: Бедность словаря и однообразие.

    К7 (Орфография - 3 балла):
    - 3 балла: нет ошибок или 1 негрубая.
    - 2 балла: не более 2 ошибок.
    - 1 балл: 3-4 ошибки.
    - 0 баллов: более 4 ошибок.

    К8 (Пунктуация - 3 балла):
    - 3 балла: нет ошибок или 1 негрубая.
    - 2 балла: 1-3 ошибки.
    - 1 балл: 4-5 ошибок.
    - 0 баллов: более 5 ошибок.

    К9 (Грамматика - 2 балла):
    - 2 балла: 0 ошибок.
    - 1 балл: 1-2 ошибки.
    - 0 баллов: более 2 ошибок.

    К10 (Речь - 2 балла):
    - 2 балла: не более 1 реч. ошибки.
    - 1 балл: 2-3 ошибки.
    - 0 баллов: более 3 ошибок.

    К11 (Этика - 1 балл):
    - 1 балл: нет этич. ошибок.
    - 0 баллов: 1 и более.

    К12 (Фактологическая точность - 1 балл):
    - 1 балл: нет ошибок в фоне.
    - 0 баллов: 1 и более.

    ВЕРНИ СТРОГО JSON:
    {{
      "total_score": 15,
      "max_total": 22,
      "overall_feedback": "Твой общий комментарий по работе...",
      "criteria": [
        {{ "id": "К1", "name": "Формулировка проблемы", "score": 1, "max_score": 1, "feedback": "Отличная работа! Проблема выделена чётко: «...»" }},
        {{ "id": "К8", "name": "Пунктуация", "score": 1, "max_score": 3, "feedback": "Допущены грубые пунктуационные ошибки. Например, в предложении «...» пропущена запятая перед деепричастным оборотом. Совет: повтори обособление обстоятельств." }}
        // верни массив ОБЯЗАТЕЛЬНО из всех 12 критериев (К1-К12)
      ],
      "encouragement": "Ты молодец, продолжай работать! Обрати внимание на пунктуацию."
    }}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": eval_prompt}],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """
    Простейший эндпоинт, который позволяет быстро проверить,
    что FastAPI запущен и отвечает.
    """
    return {"status": "ok"}
