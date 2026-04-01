# Dockerfile (React Frontend)
FROM node:18-alpine

WORKDIR /app

# Копируем зависимости
COPY package*.json ./
RUN npm install

# Копируем код
COPY . .

# Пробрасываем порт Vite
EXPOSE 5173

# Запуск в режиме разработки (для VPS это ок, если хотим быструю сборку)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
