# WebCord

WebCord is a Discord-like web chat with channels, direct messages, friends, file uploads, voice rooms, screen sharing support, and a dark responsive client UI.

## Stack

- Frontend: React, Vite, PWA service worker.
- Backend: Express, Socket.IO, Prisma, PostgreSQL.
- Runtime: Docker Compose with nginx frontend proxy.

## Features

- Auth with JWT.
- Text channels and direct messages.
- Friend requests and conversations.
- File upload support for images, video, and generic files.
- WebRTC voice mesh with reconnect handling and per-peer audio volume.
- Profile avatar, banner, and bio.
- Modern Discord-style dark UI with settings, appearance controls, voice controls, and responsive layout.
- Production nginx proxy for `/api`, `/socket.io`, and `/uploads`.

## Local Setup

Install dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create environment files from examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Update secrets before production:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CLIENT_URL`
- `DATABASE_URL`

Run with Docker:

```bash
docker compose up -d --build
```

Run the frontend build check:

```bash
cd frontend
npm run build
```

## Deployment

The included Docker Compose setup starts PostgreSQL, backend, and frontend nginx. Uploaded files are stored in the `backend_uploads` Docker volume.

For an external nginx reverse proxy, forward traffic to the frontend container port and keep `client_max_body_size 25m` so uploads match the backend limit.

## Security Notes

Do not commit real `.env` files. Only `.env.example` files are intended to be public. Replace all placeholder secrets before deploying.
