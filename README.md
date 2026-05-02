# WebCord

WebCord is a Discord-like web chat with channels, direct messages, friends, file uploads, voice rooms, screen sharing support, and a dark responsive client UI.

The canonical project logo is `webcord.png` in the repository root. The web favicon/PWA icons, Electron icon, Android launcher icon, and Android splash assets are generated from that source image.

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

Production deploy from the server checkout:

```bash
cd /opt/webcord
BRANCH=codex/webcord-ui-redesign ./scripts/deploy.sh
```

The deploy script refuses dirty tracked files by default, writes a pre-deploy patch to `/opt/webcord_backups`, rebuilds containers, and waits for `/api/health`.

See `docs/production-runbook.md` for the deployment checklist and rollback notes.

## Desktop Client

```bash
cd desktop
npm install
npm run start
```

Build Windows packages:

```bash
cd desktop
npm run build
```

The Electron shell is frameless, uses the React titlebar, exposes safe window controls through preload IPC, supports notifications, and includes a tray entry.
Artifacts are written to `desktop/dist`.

## Android Client

```bash
npm install
npm run android:sync
npm run android:open
```

Build a debug APK:

```bash
npm run android:build
```

Build release artifacts:

```bash
npm run android:release:apk
npm run android:release:aab
```

Unsigned release outputs are generated when signing env vars are not set. For signed Android releases set `WEBCORD_ANDROID_KEYSTORE`, `WEBCORD_ANDROID_KEY_ALIAS`, `WEBCORD_ANDROID_KEYSTORE_PASSWORD`, `WEBCORD_ANDROID_KEY_PASSWORD`, and optionally `WEBCORD_ANDROID_VERSION_CODE` / `WEBCORD_ANDROID_VERSION_NAME`.

The Android client uses Capacitor, bundles `frontend/dist`, keeps the mobile safe-area viewport, disables WebView text zoom, and uses the production API origin by default for native builds.

## Security Notes

Do not commit real `.env` files. Only `.env.example` files are intended to be public. Replace all placeholder secrets before deploying.
