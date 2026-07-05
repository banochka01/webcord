# WebCord Roadmap

## North Star

WebCord should feel like a fast native chat client first: stable voice rooms, polished media messages, clear moderation, and installable clients that are easy to release. The Flutter clients are the primary Windows and Android clients. Web/PWA remains the broad-access client. Electron, Tauri and Capacitor are legacy shells unless a release explicitly needs them.

## Phase 1 - Client Polish And Release Clarity

Status: in progress

Goals:

- Make the client release story unambiguous: Flutter Android APK and Flutter Windows ZIP are the primary artifacts.
- Publish native artifacts through a repeatable GitHub Release or CI path.
- Keep download buttons pointed at the latest real release, not just the repository releases page.
- Finish real liquid glass surfaces across web and Flutter with translucent panels, backdrop blur, thin highlights, and readable contrast.
- Keep the web/PWA circle recorder smooth, including realtime camera switching during one video circle.

Acceptance:

- `npm run check`, `npm run native:analyze`, and `npm run native:test` pass before release.
- Native Android and Windows artifacts are produced by one documented command.
- Release notes include SHA256 sums and install instructions.
- Web/PWA circle recording can start on front camera, switch to rear camera while still recording, and upload as one `CIRCLE_VIDEO` attachment.

## Phase 2 - Native Media Recorder Upgrade

Status: planned

Goals:

- Keep Android circle recording on one continuous file while switching front/back camera during recording.
- Use `CameraController.setDescription` where the platform supports live camera replacement.
- Add a native fallback path if a platform refuses live replacement:
  - Android: CameraX recorder or segment recorder with MediaMuxer/Transformer merge.
  - Windows: keep current single-camera recording unless a reliable encoder/merge path is added.
- Add recording-state UI for switching, unsupported-device errors, and recovery.

Acceptance:

- Android records one circle file across at least one camera switch.
- If live switching is unsupported, the UI explains it without losing the current recording.
- Temporary camera files are cleaned up after send/cancel.
- Widget/integration coverage checks start, switch, stop, discard, and send states.

## Phase 3 - Voice Reliability And Scale

Status: planned

Goals:

- Keep current P2P voice as the default for small rooms.
- Add richer diagnostics for direct vs relay route, jitter, packet loss, bitrate, and peer reconnects.
- Prepare an SFU migration for larger public rooms with LiveKit, mediasoup, or Janus.
- Preserve the existing voice presence payload shape while adding any new fields.

Acceptance:

- Voice stats are visible in web and Flutter clients.
- ICE restart/reconnect paths are covered by manual test notes or automated smoke tests.
- SFU design doc includes auth, room mapping, deployment, TURN interaction, and rollback plan.

## Phase 4 - Backend Structure And Safety

Status: planned

Goals:

- Split `backend/src/server.js` into route, socket, media, moderation, and voice modules.
- Add API tests for auth, messages, uploads, block/report/moderation, and voice signaling validation.
- Add readiness checks for database and upload storage.
- Add structured logs and basic metrics for uploads, socket connections, voice rooms, and rate limits.

Acceptance:

- Backend tests cover critical write paths and rejected unsafe uploads.
- Health endpoint distinguishes process liveness from database readiness.
- Socket signaling sanitization has focused tests for malformed SDP and ICE candidates.

## Phase 5 - Product Depth

Status: later

Goals:

- Better mobile navigation for servers, DMs, calls, stories, and settings.
- Push notifications for Android through Firebase.
- Optional iOS/TestFlight path from the Flutter client.
- More complete accessibility pass for keyboard navigation, labels, focus traps, and contrast.
- Moderation dashboard improvements for public release readiness.

Acceptance:

- Android push uses secrets outside git and has a test notification path.
- iOS release doc includes signing, privacy strings, and TestFlight checklist.
- Accessibility audit has no blocking issues in core chat, settings, media viewer, and report flows.
