# WebCord

Self-hosted Discord-like web app:
- регистрация/логин (JWT)
- серверы (guilds), каналы, сообщения
- realtime чат через Socket.IO
- voice комнаты через WebRTC signaling
- управление громкостью удалённых участников voice
- кастомизация цветов интерфейса (фон/панель/акцент/текст)

## Быстрый запуск одной командой (рекомендуется)

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

## Ручной запуск через Docker Compose

```bash
docker compose up --build
```

Для фонового запуска:

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

Backend (`backend/.env.example`):
- `PORT=3000`
- `DATABASE_URL=postgresql://webcord:webcord@postgres:5432/webcord?schema=public`
- `JWT_SECRET=please_change_me`
- `CLIENT_URL=http://localhost:5173`

Frontend (`frontend/.env.example`):
- `VITE_API_URL=http://localhost:3000`
