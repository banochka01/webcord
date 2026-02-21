# WebCord

Self-hosted Discord-like web app:
- регистрация/логин (JWT)
- серверы (guilds), текстовые и голосовые каналы
- realtime чат через Socket.IO
- voice комнаты через WebRTC signaling
- вложения (изображения/видео/файлы до 25MB)
- emoji picker
- кастомизация цветов интерфейса (фон/панель/акцент/текст)

## Быстрый запуск одной командой (dev-like)

```bash
./scripts/deploy.sh
```

Скрипт автоматически:
1. проверяет Docker/Compose,
2. собирает backend/frontend образы,
3. поднимает `postgres + backend + frontend`,
4. выводит статус сервисов.

После запуска:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

---

## DEV запуск через `docker-compose.yml` (без изменений)

```bash
docker compose up -d --build
```

Остановить:

```bash
docker compose down
```

Остановить и удалить volume БД:

```bash
docker compose down -v
```

---

## PROD запуск через `docker-compose.prod.yml`

Откройте порты:
- `80/tcp` (обязательно)
- `443/tcp` (когда включите TLS)

1) Подготовьте env:

```bash
export JWT_SECRET='strong-secret'
export CLIENT_URL='https://your-domain.example'
```

2) Запуск:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

3) Проверка:
- фронт доступен на `http://<domain-or-ip>` (через nginx, без Vite dev server)
- API проксируется через `/api/*`
- Socket.IO работает через `/socket.io/*`

4) Upload persistence:
- вложения сохраняются в `./backend/uploads` на хосте

5) Остановка:

```bash
docker compose -f docker-compose.prod.yml down
```

---

## Локальный запуск без Docker (опционально)

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run start
```

### 2) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

---

## Переменные окружения

Backend (`backend/.env.example` / `backend/.env.prod.example`):
- `PORT=3000`
- `DATABASE_URL=postgresql://webcord:webcord@postgres:5432/webcord?schema=public`
- `JWT_SECRET=please_change_me`
- `CLIENT_URL=http://localhost:5173` (dev) / `https://your-domain.example` (prod)

Frontend (`frontend/.env.example` / `frontend/.env.prod.example`):
- `VITE_API_URL=http://localhost:3000` (dev)
- `VITE_API_URL=/api` (prod)
