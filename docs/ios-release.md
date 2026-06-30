# WebCord iOS Release

This repository can prepare the iOS client, but the final IPA/TestFlight upload must run on macOS with Xcode or a macOS CI runner.

## Recommended Path

1. Use the Flutter client as the primary iOS client:

   ```bash
   cd clients/webcord_native
   flutter create --platforms=ios .
   flutter pub get
   ```

2. Configure Xcode signing:

   - Bundle ID: `com.webcord.app`
   - Team: Apple Developer Program team
   - Display name: `WebCord`
   - Microphone/camera/photo usage strings in `ios/Runner/Info.plist`

3. Build the IPA:

   ```bash
   flutter build ipa --release \
     --dart-define=WEBCORD_API_URL=https://webcordes.ru/api \
     --build-name=1.1.0 \
     --build-number=3
   ```

4. Upload with Xcode Organizer, Transporter, Codemagic, Bitrise or fastlane.

5. Release first through TestFlight, then App Store Review.

## Required For Review

Keep these features available before submitting:

- user report flow;
- user block/unblock flow;
- admin moderation queue;
- mute/ban capability;
- support contact and privacy policy in App Store Connect.

Do not commit Apple certificates, provisioning profiles, App Store Connect API keys, Firebase files or any production secrets.
