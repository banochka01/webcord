# Native release checklist

WebCord native builds are produced sequentially because Flutter and Gradle share caches.

## Android signing

Copy `clients/webcord_native/android/key.properties.example` to `clients/webcord_native/android/key.properties` and point it at the upload keystore. The real properties file and keystores are ignored by Git.

CI may use these environment variables instead:

- `WEBCORD_ANDROID_STORE_FILE`
- `WEBCORD_ANDROID_STORE_PASSWORD`
- `WEBCORD_ANDROID_KEY_ALIAS`
- `WEBCORD_ANDROID_KEY_PASSWORD`

Without production credentials Gradle prints a warning and creates a debug-signed release APK. That artifact is suitable for local testing only and must not be published.

## Build and package

Launcher icons are regenerated from the canonical `frontend/public/icons/webcord.png` before every Flutter build. The release packager starts with `flutter clean`, so Windows cannot reuse an older embedded icon from CMake cache.

Run `npm.cmd run clients:release:package`. It executes analyze, tests, Android and Windows release builds, then creates versioned artifacts in `releases/`:

- Android APK
- Windows ZIP with the complete runner directory
- JSON manifest with file sizes and SHA-256 checksums

Run `npm.cmd run clients:package` only when verified native build outputs already exist.

Publishing to the website remains a separate explicit release step.
