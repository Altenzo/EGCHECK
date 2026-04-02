# Dockerfile (FastAPI Backend)
FROM python:3.11-slim

WORKDIR /app

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# <-- Добавьте эту строку
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Копируем остальной код
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]