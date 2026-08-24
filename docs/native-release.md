# Native release checklist

WebCord Android and Windows builds are produced sequentially because Flutter and Gradle share caches. iOS is built separately on macOS because Xcode and Apple code signing are unavailable on Windows.

## Android signing

Every release APK is checked against the currently published certificate SHA-256 before packaging. This prevents an accidental key change from producing an APK that existing users cannot install as an update. Override `WEBCORD_ANDROID_EXPECTED_CERT_SHA256` only during an explicitly planned signing-key migration.

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

## iOS IPA

Run `npm run native:ios:release` on macOS after configuring the `ru.webcord.webcordNative` bundle identifier, Apple Development Team and provisioning profile in Xcode. Flutter writes signed export output under `clients/webcord_native/build/ios/ipa/`.

For credential-free build verification, manually run the `Build iOS IPA` GitHub Actions workflow. It creates a clearly marked unsigned IPA and SHA-256 checksum. Do not publish that artifact as installable: it must first be signed with the intended Apple identity and provisioning profile.

The backend and landing page accept the final `.ipa` at `/downloads/ios`; uploading or publishing it remains a separate explicit release step.
