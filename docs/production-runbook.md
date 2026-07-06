# WebCord Production Runbook

## Source Of Truth

- Keep production code in GitHub before deploying.
- Keep real secrets only in server `.env` files.
- Use `webcord.png` in the repository root as the master logo asset.
- Generated app icons live under `frontend/public/icons`, `desktop/build`, and `android/app/src/main/res`.

## Pre-Deploy Checklist

1. Check local status:

   ```bash
   git status -sb
   ```

2. Run build checks:

   ```bash
   $env:DATABASE_URL='postgresql://webcord:webcord@localhost:5432/webcord'
   npm run check
   npm run android:release:apk
   npm run desktop:build
   ```

3. Push the deploy branch:

   ```bash
   git push
   ```

## Deploy

On the server:

```bash
cd /opt/webcord
./scripts/deploy.sh
```

The script:

- refuses dirty tracked files unless `ALLOW_DIRTY=1` is set;
- writes a pre-deploy patch into `/opt/webcord_backups`;
- fetches the selected branch;
- applies Prisma migrations before the app handles traffic;
- rebuilds containers;
- waits for `/api/health`.

After deploy, verify:

```bash
curl -fsSL https://webcordes.ru/api/health
curl -fsSL https://webcordes.ru/api/ready
curl -fsSL https://webcordes.ru/manifest.webmanifest
```

## Moderation And Public Release

WebCord is open for registration, so public releases must keep the moderation layer enabled:

- users can report users, channel messages and DM messages;
- users can block/unblock other users;
- admins can review reports and apply temporary mute/ban actions;
- muted/banned users are blocked on message/upload write paths;
- the admin panel shows open reports, muted users, banned users and recent moderation actions.

Do not remove these flows before iOS/TestFlight review. Apps with user-generated content need reporting, blocking and moderation.

## Client Downloads

The public site downloads clients directly from the server:

- `https://webcordes.ru/downloads/windows`
- `https://webcordes.ru/downloads/android`

Admins whose username is listed in `ADMIN_USERNAMES` can open `https://webcordes.ru/adminka` after normal WebCord login and replace the Windows or Android client files. The backend stores these files and their SHA256 metadata in `CLIENT_DOWNLOAD_DIR`; Docker Compose persists them in the `client_downloads` volume.

## Voice Quality

Current voice uses peer-to-peer WebRTC with Socket.IO signaling. The production-safe improvement path currently enabled:

- backend-provided ICE servers through `/api/voice/ice-servers`;
- SDP validation and signaling rate limits;
- Opus 48 kHz mono speech tuning with in-band FEC and 64 kbps target bitrate;
- web and Flutter quality diagnostics: RTT, jitter, packet loss, bitrate and direct/relay route;
- ICE restart on failed/disconnected routes.

For larger public voice rooms, move media transport to an SFU such as LiveKit, mediasoup or Janus. That is an infrastructure migration and should be deployed separately from normal UI/client releases.

## Rollback

1. Find the previous commit:

   ```bash
   git log --oneline -5
   ```

2. Deploy it explicitly:

   ```bash
   git checkout <commit>
   docker compose up -d --build
   docker compose ps
   ```

3. If local server edits were overwritten, inspect the latest patch:

   ```bash
   ls -1t /opt/webcord_backups/*.patch | head
   git apply --check /opt/webcord_backups/<patch-name>.patch
   ```

## Release Artifacts

- Android APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Android AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Desktop installer: `src-tauri/target/release/bundle/nsis/WebCord_3.1.2_x64-setup.exe`
- Desktop portable/MSI artifacts: `src-tauri/target/release/bundle/`
- Web/PWA build: `frontend/dist/`
- Flutter native Android APK: `clients/webcord_native/build/app/outputs/flutter-apk/app-release.apk`
- Flutter Windows release: `clients/webcord_native/build/windows/x64/runner/Release/`

Android artifacts from local CI are test artifacts until a production upload keystore is configured. Keep `.jks`, `key.properties` and keystore passwords outside git.
