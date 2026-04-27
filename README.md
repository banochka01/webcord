# WebCord

Webcord ecosystem now includes:
- Web client (existing `frontend/`)
- Android native client (`mobile-android/`, React Native)
- Windows desktop client (`desktop/`, Electron renderer with local UI, not website wrapper)
- Shared backend (`backend/`) for all clients

## Architecture

- Backend API: `https://webcordes.ru/api`
- Realtime Socket.IO: `https://webcordes.ru/socket.io`
- Media uploads: `https://webcordes.ru/uploads/*`
- Voice signaling: Socket.IO (`voice-*` events)

API contract is documented in `docs/api-contract.md`.

## Recommended stacks

- **Android**: React Native (current implementation) or Kotlin + Jetpack Compose.
- **Windows**: Electron (current implementation) or Tauri/React.
- **Best shared-code strategy**: keep UI separate per platform, share data layer (`api client`, `socket client`, models, contract).

## Run backend/web (Docker)

```bash
docker compose up -d --build
```

- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`

## Run Android client

```bash
cd mobile-android
npm install
npm run android
```

Token storage: `expo-secure-store`.

## Run Windows desktop client

```bash
cd desktop
npm install
npm run start
```

Hotkeys:
- `Ctrl+K` quick switcher
- `Ctrl+/` hotkeys dialog
- `Esc` close modals

Tray icon and native notifications are enabled.

## Build artifacts (.exe / .msi / .apk)

Binary files are **not committed** to Git (large + platform specific).

How to build:

- Windows `.exe/.msi`: add `electron-builder` config to `desktop/package.json` and run:
  ```bash
  npm i -D electron-builder
  npx electron-builder --win nsis msi
  ```

- Android `.apk/.aab`:
  ```bash
  cd mobile-android
  npx expo run:android --variant release
  ```
  or use EAS Build for CI distribution.
