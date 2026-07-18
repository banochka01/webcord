import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webcord_native/main.dart';
import 'package:webcord_native/src/app_shell.dart';
import 'package:webcord_native/src/app_state.dart';
import 'package:webcord_native/src/app_theme.dart';
import 'package:webcord_native/src/models.dart';

void main() {
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

    expect(find.byIcon(Icons.menu_rounded), findsOneWidget);
    expect(find.byIcon(Icons.graphic_eq_rounded), findsOneWidget);
    expect(find.text('General Voice'), findsNothing);

    await tester.tap(find.byIcon(Icons.menu_rounded));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('TEXT CHANNELS'), findsOneWidget);
    expect(find.text('VOICE ROOMS'), findsOneWidget);
    expect(find.text('lobby'), findsWidgets);
    expect(find.text('General Voice'), findsWidgets);
  });
}
