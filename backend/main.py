import os
import base64
import json
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Локальные импорты
from models import VerifyRequest, EvaluationRequest
from prompts import OCR_PROMPT, VERIFY_PROMPT_TEMPLATE, EVALUATION_PROMPT_TEMPLATE

load_dotenv()

print(f"DEBUG: Gemini Key length: {len(os.environ.get('GEMINI_API_KEY', ''))}")

app = FastAPI(title="EGCHECK Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация клиентов
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
gemini_client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
    http_options={'base_url': 'https://api.proxyapi.ru/google'}
)

def encode_image(file_content):
    return base64.b64encode(file_content).decode('utf-8')

@app.post("/api/recognize")
async def recognize_essay(files: List[UploadFile] = File(...)):
    print(f"[Backend] Received OCR request with {len(files)} files")
    gemini_contents = [OCR_PROMPT]
    raw_images_base64 = []
    
    for file in files:
        content = await file.read()
        if file.content_type.startswith('image/'):
            base_64 = encode_image(content)
            img_data = f"data:{file.content_type};base64,{base_64}"
            raw_images_base64.append(img_data)
            
            gemini_contents.append(
                types.Part.from_bytes(data=content, mime_type=file.content_type)
            )

    try:
        response = gemini_client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=gemini_contents,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        result = json.loads(response.text)
        result["images"] = raw_images_base64
        return result
    except Exception as e:
        error_msg = str(e).lower()
        if any(x in error_msg for x in ["429", "quota", "limit", "exhausted"]):
            raise HTTPException(status_code=429, detail="Лимит Gemini OCR исчерпан.")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/verify")
async def verify_text(req: VerifyRequest):
    image_content = [{"type": "image_url", "image_url": {"url": url}} for url in req.images]
    prompt = VERIFY_PROMPT_TEMPLATE.format(text=req.text)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt}] + image_content}],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluate")
async def evaluate_essay(req: EvaluationRequest):
    prompt = EVALUATION_PROMPT_TEMPLATE.format(text=req.text, theme=req.theme)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={ "type": "json_object" }
        )
        result = json.loads(response.choices[0].message.content)
        
        # Автоматический пересчет суммы баллов для надежности
        if "criteria" in result:
            result["total_score"] = sum(item.get("score", 0) for item in result["criteria"])
            result["max_total"] = sum(item.get("max_score", 0) for item in result["criteria"])
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
