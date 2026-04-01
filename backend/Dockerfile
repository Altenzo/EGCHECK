# Dockerfile (FastAPI Backend)
FROM python:3.11-slim

WORKDIR /app

# Ускоряем установку зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем остальной код
COPY . .

# Прокидываем порт для Railway/Docker
EXPOSE 8000

# Запуск сервера uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
