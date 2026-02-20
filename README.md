# WebCord

Self-hosted Discord-like web app with:
- auth (register/login)
- guilds/channels/messages
- realtime chat via Socket.IO
- minimal voice rooms via WebRTC signaling

## Run with Docker

```bash
docker compose up --build
```

After startup:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Local env files (optional)

- `backend/.env.example`
- `frontend/.env.example`

If you want to run without Docker, copy them to `.env` in each folder.
