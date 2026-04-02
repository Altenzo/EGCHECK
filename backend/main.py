import os
import base64
import json
import re
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

# Загружаем переменные (для локальной работы)
load_dotenv()

app = FastAPI()

# Разрешаем CORS, чтобы Фронтенд мог достучаться
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализируем OpenAI
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class EvaluationRequest(BaseModel):
    text: str
    theme: str = ""

def encode_image(file_content):
    return base64.b64encode(file_content).decode('utf-8')

@app.post("/api/recognize")
async def recognize_essay(files: List[UploadFile] = File(...)):
    combined_content = []
    
    for file in files:
        content = await file.read()
        if file.content_type.startswith('image/'):
            base64_image = encode_image(content)
            combined_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{file.content_type};base64,{base64_image}"}
            })
        elif file.filename.lower().endswith('.pdf'):
            # OpenAI не ест PDF напрямую, сообщаем пользователю
            raise HTTPException(status_code=400, detail="GPT-4o пока не поддерживает PDF напрямую. Пожалуйста, отправьте скриншоты.")

    prompt = """
    Ты - профессиональный OCR-инструмент и эксперт по проверке сочинений ЕГЭ.
    1. Распознай рукописный текст с фотографий. Склей их в один логичный текст.
    2. Найди слова, в которых ты не уверен на 100% (почерк плохой или опечатка).
    3. Оцени качество фото (is_poor_quality: true/false).
    4. Проверь, является ли это вообще сочинением (is_not_essay: true/false). Если это чек, мем или рандомный текст - ставь true.

    ОБЯЗАТЕЛЬНО верни ответ СТРОГО В JSON:
    {
      "text": "полный распознанный текст",
      "issues": [{"word": "написаное_слово", "suggestion": "автономное_исправление", "reason": "почему сомневаешься"}],
      "is_poor_quality": false,
      "is_not_essay": false
    }
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [{"type": "text", "text": prompt}] + combined_content
            }],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"GPT OCR Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluate")
async def evaluate_essay(req: EvaluationRequest):
    prompt = f"""
    Ты - старший эксперт ФИПИ по проверке сочинений ЕГЭ (Задание 27). Оцени текст по критериям 2024-2025 года.
    
    ТЕКСТ: {req.text}
    ТЕМА/ПРОБЛЕМА (если указана): {req.theme}

    ИНСТРУКЦИИ:
    - Будь строгим, но справедливым.
    - Выставь баллы по К1-К12 (Максимум 21 балл).
    - Если текст - НЕ сочинение (is_not_essay), верни это в флаге.
    - Напиши теплые слова ободрения в конце.

    ВЕРНИ СТРОГО JSON:
    {{
      "is_not_essay": false,
      "total_score": 18,
      "max_total": 21,
      "overall_feedback": "Текст...",
      "recommendations": ["Совет 1", "Совет 2"],
      "encouragement": "Ты большой молодец! Продолжай...",
      "criteria": [
        {{ "id": "К1", "name": "Проблема", "score": 1, "max_score": 1, "feedback": "...", "corrections": [] }}
      ]
    }}
    (Критерии: К1-К12 по регламенту ФИПИ)
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"GPT Evaluate Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
