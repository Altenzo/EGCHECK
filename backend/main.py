import os
import base64
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

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
@app.post("/api/recognize")
async def recognize_essay(files: List[UploadFile] = File(...)):
    combined_content = []
    raw_images_base64 = []
    
    for file in files:
        content = await file.read()
        if file.content_type.startswith('image/'):
            base_64 = encode_image(content)
            img_data = f"data:{file.content_type};base64,{base_64}"
            raw_images_base64.append(img_data)
            combined_content.append({
                "type": "image_url",
                "image_url": {"url": img_data}
            })

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
      "is_not_essay": false,
      "images": [...] # Этот список мы вернем фронтенду для 2-го шага
    }
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [{"type": "text", "text": ocr_prompt}] + combined_content}],
            response_format={ "type": "json_object" }
        )
        result = json.loads(response.choices[0].message.content)
        result["images"] = raw_images_base64 # Сохраняем картинки для следующего шага
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ШАГ 2: ВЕРИФИКАЦИЯ И ПОИСК СОМНЕНИЙ ---
@app.post("/api/verify")
async def verify_text(req: VerifyRequest):
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
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [{"type": "text", "text": verify_prompt}] + image_content}],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ШАГ 3: ЭКСПЕРТНАЯ ОЦЕНКА ФИНАЛЬНОГО ТЕКСТА ---
@app.post("/api/evaluate")
async def evaluate_essay(req: EvaluationRequest):
    eval_prompt = f"""
    ЭКСПЕРТ ЕГЭ (ФИПИ 2025):
    Проверь финальный, исправленный юзером текст по всем критериям (К1-К12).
    
    ТЕКСТ: {req.text}
    ТЕМА: {req.theme}

    ИНСТРУКЦИИ:
    - Считай баллы жестко. 
    - Если К1 (проблема) не найден — ставь 0 по К1-К4 сразу.
    - В конце добавь 'Рекомендации по улучшению' и 'Поддержку'.

    ВЕРНИ СТРОГО JSON:
    {{
      "total_score": 15,
      "max_total": 21,
      "overall_feedback": "...",
      "criteria": [
        {{ "id": "К1", "name": "Проблема", "score": 1, "max_score": 1, "feedback": "...", "corrections": [] }}
      ],
      "encouragement": "..."
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
