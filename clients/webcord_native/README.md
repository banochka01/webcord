# WebCord Native

Flutter client for WebCord Android and Windows.

This is a real native Flutter application, not a PWA and not a WebView wrapper. It talks to the existing WebCord backend through REST and Socket.IO.

## Current Scope

- Auth against `https://webcordes.ru/api`.
- Bootstrap guild, text channels, voice channels, friends and direct conversations.
- Realtime Socket.IO connection for channel messages, direct messages, social refreshes, channel creation and voice-room presence.
- Channel chat and direct-message chat.
- Send, edit and delete messages.
- Create text and voice channels.
- Friend requests, accepting/declining requests, opening DMs.
- File upload through native file selection and the existing `/api/upload` endpoint.
- Native liquid-glass WebCord UI for desktop-width and phone-width layouts.
- Local chat wallpapers with per-chat/global selection and dim control.
- Full voice-room join/leave with WebRTC peer-to-peer microphone audio.
- WebRTC camera sharing, screen sharing, remote media playback and voice signaling through the existing Socket.IO backend.
- Voice quality layer: backend-provided STUN/TURN ICE config, Android communication audio mode, Opus SDP tuning, voice quality diagnostics and relay/direct route display.
- Settings dialog with saved theme, message density, notifications, microphone/headphones/camera selection, microphone sensitivity, master volume and noise suppression preferences.
- Voice-room controls for microphone mute, camera state and screen-share state, plus in-chat, fullscreen and floating mini call surfaces.
- Voice presence shows who is muted, speaking, sharing camera or sharing screen.
- Session unread badges are shown for channels and direct messages in the phone navigation.
- Voice messages: Android records `.m4a` through `MediaRecorder`; Windows records `.wav` through WinMM.
- Video circles: Android opens native video capture; Windows uses a native video-file picker fallback.
- In-app media viewing: images open in a zoomable fullscreen viewer; videos and circles play in-app with native controls; voice messages play inline in the chat bubble.
- Stories support a text description and optional attached music track.

Recorded voice messages and video circles are sent through the existing upload/message flow. Live voice/video/screen media uses `flutter_webrtc` and the backend `voice-offer`, `voice-answer` and `voice-ice-candidate` signaling events.

## Voice Quality

The production backend exposes `/api/voice/ice-servers`, so native clients can receive TURN credentials at runtime instead of baking secrets into APK/EXE builds. On the VPS, `coturn` is configured for:

```text
turn:webcordes.ru:3478?transport=udp
turn:webcordes.ru:3478?transport=tcp
```

The client also applies Android `inCommunication` audio routing before joining a voice room and tunes Opus for mono 48 kHz speech with in-band FEC. The settings dialog shows RTT, jitter, packet loss, bitrate and whether the call is direct or relayed.

## Remaining Release Integrations

Android push notifications require a Firebase project and `google-services.json`. Release signing requires a real upload keystore and passwords. Keep both outside git and pass them through local/CI secrets.

## Local SDK Configuration

The wrapper script at `..\..\scripts\flutter-native.ps1` prepares Flutter, Android, Java, CMake and cache paths before invoking Flutter. By default it uses the portable SDK layout under `K:\SDK`, but CI or another workstation can override every path with environment variables:

- `WEBCORD_SDK_ROOT`
- `FLUTTER_ROOT`
- `ANDROID_SDK_ROOT` or `ANDROID_HOME`
- `WEBCORD_CMAKE_ROOT`
- `JAVA_HOME`
- `WEBCORD_SDK_TMP`
- `GRADLE_USER_HOME`
- `PUB_CACHE`

The wrapper also runs `..\..\scripts\patch-flutter-windows-toolchain.ps1`, which lets a local Flutter SDK use a portable CMake installation when Visual Studio Installer metadata is incomplete and creates Windows plugin junctions when symlinks are blocked.

## Commands

From the repository root:

```powershell
npm.cmd run native:doctor
npm.cmd run native:analyze
npm.cmd run native:test
npm.cmd run native:android:debug
npm.cmd run native:android:release
npm.cmd run native:windows:release
```

Direct Flutter commands:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/flutter-native.ps1 build apk --release --dart-define=WEBCORD_API_URL=https://webcordes.ru/api
powershell -ExecutionPolicy Bypass -File scripts/flutter-native.ps1 build windows --release --dart-define=WEBCORD_API_URL=https://webcordes.ru/api
```

Android outputs:

```text
clients\webcord_native\build\app\outputs\flutter-apk\app-debug.apk
clients\webcord_native\build\app\outputs\flutter-apk\app-release.apk
```

## Windows Build Notes

Windows release output:

```text
clients\webcord_native\build\windows\x64\runner\Release\WebCord.exe
```

For distribution, keep the whole `Release` directory together with `WebCord.exe`, because it also contains `flutter_windows.dll` and Flutter asset data.

This client uses `flutter_webrtc`, which is a Flutter desktop plugin. The local Flutter SDK is patched so Windows plugin directories can be linked with junctions when Developer Mode or administrator symlink privileges are unavailable. Windows builds use the installed Visual Studio MSVC toolchain plus the CMake path supplied by `WEBCORD_CMAKE_ROOT` or the wrapper default.

If Flutter is upgraded and starts reporting the Visual Studio CMake component as missing again, rerun:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\patch-flutter-windows-toolchain.ps1
```
