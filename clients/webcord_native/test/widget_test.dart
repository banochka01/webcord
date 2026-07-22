import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webcord_native/main.dart';
import 'package:webcord_native/src/app_shell.dart';
import 'package:webcord_native/src/app_state.dart';
import 'package:webcord_native/src/app_theme.dart';
import 'package:webcord_native/src/models.dart';

void main() {
  test('light mode exposes a real light palette for every flagship theme', () {
    for (final mode in AppThemeMode.flagship) {
      final theme = webCordTheme(mode, Brightness.light);
      final palette = theme.extension<WebCordPalette>()!;

      expect(theme.brightness, Brightness.light);
      expect(theme.colorScheme.brightness, Brightness.light);
      expect(palette.bg.computeLuminance(), greaterThan(0.7));
      expect(palette.text.computeLuminance(), lessThan(0.12));
    }

    expect(AppBrightnessMode.fromName('light'), AppBrightnessMode.light);
    expect(AppBrightnessMode.fromName('unknown'), AppBrightnessMode.system);
  });

  test('flagship themes preserve icon semantics and change presentation', () {
    final telegram = WebCordThemeSystem(AppThemeMode.telegram);
    final material = WebCordThemeSystem(AppThemeMode.material);
    final atmosphere = WebCordThemeSystem(AppThemeMode.liquid);

    expect(AppThemeMode.flagship, hasLength(3));
    expect(telegram.icon(WebCordIconRole.send), Icons.send_outlined);
    expect(material.icon(WebCordIconRole.send), Icons.send_outlined);
    expect(atmosphere.icon(WebCordIconRole.send), Icons.send_outlined);
    expect(
      telegram.icon(WebCordIconRole.profile),
      Icons.person_outline_rounded,
    );
    expect(material.icon(WebCordIconRole.friends), Icons.group_outlined);
    expect(atmosphere.icon(WebCordIconRole.settings), Icons.tune_rounded);
    expect({
      telegram.baseMotion,
      material.baseMotion,
      atmosphere.baseMotion,
    }, hasLength(3));
    expect({
      telegram.bubbleRadius,
      material.bubbleRadius,
      atmosphere.bubbleRadius,
    }, hasLength(3));
    expect(telegram.usesGlass, isFalse);
    expect(material.usesGlass, isFalse);
    expect(atmosphere.usesGlass, isTrue);
  });

  testWidgets('renders native WebCord app shell', (tester) async {
    await tester.pumpWidget(const WebCordNativeApp());
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('WebCord'), findsWidgets);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('mobile shell exposes channel list and voice rooms', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final state = WebCordState()
      ..initializing = false
      ..token = 'token'
      ..user = const PublicUser(id: 1, username: 'monyx')
      ..guild = const Guild(id: 1, name: 'Night server')
      ..channels = const [
        Channel(id: 10, name: 'lobby', kind: ChannelKind.text, guildId: 1),
        Channel(
          id: 20,
          name: 'General Voice',
          kind: ChannelKind.voice,
          guildId: 1,
        ),
      ]
      ..selectedTextChannelId = 10
      ..selectedVoiceChannelId = 20
      ..socketStatus = 'connected';
    addTearDown(state.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: webCordTheme(),
        home: WebCordShell(state: state),
      ),
    );

    expect(find.byTooltip('Channels and calls'), findsOneWidget);
    expect(find.byIcon(Icons.graphic_eq_rounded), findsOneWidget);
    expect(find.text('General Voice'), findsNothing);

    await tester.tap(find.byTooltip('Channels and calls'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('TEXT CHANNELS'), findsOneWidget);
    expect(find.text('VOICE ROOMS'), findsOneWidget);
    expect(find.text('lobby'), findsWidgets);
    expect(find.text('General Voice'), findsWidgets);
  });
}
