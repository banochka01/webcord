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
- rebuilds containers;
- waits for `/api/health`.

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
- Desktop installer: `desktop/dist/WebCord-Setup-2.0.0-x64.exe`
- Desktop portable: `desktop/dist/WebCord-Portable-2.0.0-x64.exe`
