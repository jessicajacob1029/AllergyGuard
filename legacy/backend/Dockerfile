
FROM node:20-alpine

WORKDIR /app

COPY legacy/backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install

WORKDIR /app
COPY legacy/backend ./backend
COPY legacy/api ./api

WORKDIR /app/backend

EXPOSE 4000

CMD ["node", "src/index.js"]
