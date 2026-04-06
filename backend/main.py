import os
import base64
import json
import logging
import time
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Локальные импорты
from models import VerifyRequest, EvaluationRequest
from prompts import OCR_PROMPT, VERIFY_PROMPT_TEMPLATE, EVALUATION_PROMPT_TEMPLATE

load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("EGCHECK")

app = FastAPI(title="EGCHECK Backend")

# Простейший Rate Limiter (в памяти)
REQUEST_HISTORY = {} # {ip: [timestamps]}
RATE_LIMIT_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 20

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    now = time.time()
    
    # Очистка старых записей
    history = [t for t in REQUEST_HISTORY.get(client_ip, []) if now - t < RATE_LIMIT_SECONDS]
    
    if len(history) >= MAX_REQUESTS_PER_WINDOW:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        return JSONResponse(
            status_code=429, 
            content={"detail": "Слишком много запросов. Попробуйте позже."}
        )
    
    history.append(now)
    REQUEST_HISTORY[client_ip] = history
    return await call_next(request)

# Глобальная обработка ошибок
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Произошла внутренняя ошибка сервера. Мы уже работаем над этим."}
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# Настройка CORS
allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [origin.strip() for origin in allowed_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация клиентов
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    timeout=30.0
)
gemini_client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
    http_options={'base_url': 'https://api.proxyapi.ru/google', 'timeout': 30000}
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

def encode_image(file_content):
    return base64.b64encode(file_content).decode('utf-8')

# Вспомогательная функция для ретраев
async def call_ai_with_retry(func, *args, retries=2, **kwargs):
    for i in range(retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            if i == retries:
                raise e
            logger.warning(f"AI call failed (attempt {i+1}), retrying... Error: {str(e)}")
            time.sleep(1 * (i + 1))

@app.post("/api/recognize")
async def recognize_essay(files: List[UploadFile] = File(...)):
    logger.info(f"Received OCR request with {len(files)} files")
    
    for file in files:
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"Файл {file.filename} не является изображением.")
        
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"Файл {file.filename} слишком большой (макс 10MB).")
        file.file.seek(0) 

    async def _gemini_call():
        contents = [OCR_PROMPT]
        raw_images = []
        for f in files:
            data = await f.read()
            raw_images.append(f"data:{f.content_type};base64,{encode_image(data)}")
            contents.append(types.Part.from_bytes(data=data, mime_type=f.content_type))
            f.file.seek(0)
        
        response = gemini_client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        res_data = json.loads(response.text)
        res_data["images"] = raw_images
        return res_data

    try:
        return await call_ai_with_retry(_gemini_call)
    except Exception as e:
        error_msg = str(e).lower()
        if any(x in error_msg for x in ["429", "quota", "limit", "exhausted"]):
            raise HTTPException(status_code=429, detail="Лимит Gemini OCR исчерпан. Попробуйте позже.")
        logger.error(f"Gemini error: {str(e)}")
        raise e

@app.post("/api/verify")
async def verify_text(req: VerifyRequest):
    async def _gpt_verify_call():
        image_content = [{"type": "image_url", "image_url": {"url": url}} for url in req.images]
        prompt = VERIFY_PROMPT_TEMPLATE.format(text=req.text)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": [{"type": "text", "text": prompt}] + image_content}],
            response_format={ "type": "json_object" }
        )
        return json.loads(response.choices[0].message.content)

    return await call_ai_with_retry(_gpt_verify_call)

@app.post("/api/evaluate")
async def evaluate_essay(req: EvaluationRequest):
    async def _gpt_evaluate_call():
        prompt = EVALUATION_PROMPT_TEMPLATE.format(text=req.text, theme=req.theme)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={ "type": "json_object" }
        )
        result = json.loads(response.choices[0].message.content)
        if "criteria" in result:
            result["total_score"] = sum(item.get("score", 0) for item in result["criteria"])
            result["max_total"] = sum(item.get("max_score", 0) for item in result["criteria"])
        return result

    return await call_ai_with_retry(_gpt_evaluate_call)
