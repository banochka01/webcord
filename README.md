# WebCord

WebCord is a Discord-like web chat with channels, direct messages, friends, file uploads, voice rooms, screen sharing support, and a dark responsive client UI.

The primary installable clients are the Flutter native Windows, Android and iOS builds in `clients/webcord_native`. They authenticate through the WebCord API directly and are not PWA/WebView wrappers. Electron, Tauri and Capacitor scripts remain in the repository as legacy shells around the web UI.

The canonical project logo is `webcord.png` in the repository root. The web favicon/PWA icons, Tauri/Electron icon, Android launcher icon, and Android splash assets are generated from that source image.

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
- `ADMIN_USERNAMES` for `/admin` access, comma-separated existing login names.

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
See `docs/roadmap.md` for the client, voice, backend and release roadmap.

## Client Downloads

Public download buttons point to server-hosted client files:

- Windows: `/downloads/windows`
- Android: `/downloads/android`
- iPhone / iPad: `/downloads/ios`

Admins listed in `ADMIN_USERNAMES` can sign in at `/adminka` with their normal WebCord account and replace these files from the admin panel. Uploaded client files are stored in `CLIENT_DOWNLOAD_DIR`; Docker keeps them in the `client_downloads` volume.

## Desktop Client

```bash
npm install
npm run desktop:start
```

Build Windows packages:

```bash
npm run desktop:build
```

The primary desktop shell uses Tauri v2 with a frameless native window, React titlebar controls, WebView2 on Windows, native notifications, external release links, and `webcord://` deep-link handling. Install Rust before building Tauri packages.

The previous Electron shell is kept as a legacy fallback under `desktop:electron:*` scripts.

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

## iOS Client

The Flutter iOS target lives in `clients/webcord_native/ios` and supports voice rooms, camera/video calls, file picking, voice messages, local notifications and persisted client settings. Building requires macOS with Xcode and an Apple signing identity.

Create a locally signed IPA on a configured Mac:

```bash
npm run native:ios:release
```

The manual GitHub Actions workflow `.github/workflows/ios-ipa.yml` produces an unsigned IPA for build verification without Apple credentials. An unsigned IPA must be signed with an Apple Development, Ad Hoc or App Store provisioning profile before it can be installed or distributed.

## Security Notes

Do not commit real `.env` files. Only `.env.example` files are intended to be public. Replace all placeholder secrets before deploying.
