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

  test(
    'saved messages, media pages and call history decode server payloads',
    () {
      final messagePayload = {
        'id': 42,
        'content': 'keep this',
        'conversationId': 12,
        'bookmarked': true,
        'createdAt': '2026-07-28T01:00:00.000Z',
        'author': {'id': 2, 'username': 'alice'},
      };
      final saved = SavedMessage.fromJson({
        'id': 8,
        'type': 'direct-message',
        'createdAt': '2026-07-28T01:00:00.000Z',
        'conversation': {
          'id': 12,
          'type': 'DIRECT',
          'title': 'Alice',
          'user': {'id': 2, 'username': 'alice'},
        },
        'message': messagePayload,
      });
      final media = MediaPage.fromJson({
        'items': [
          {...messagePayload, 'bookmarked': false},
        ],
        'nextCursor': 40,
      });
      final call = CallRecord.fromJson({
        'id': 'call-1',
        'conversationId': 12,
        'title': 'Alice',
        'callerId': 1,
        'status': 'COMPLETED',
        'startedAt': '2026-07-28T01:00:00.000Z',
        'durationSeconds': 61,
        'outgoing': true,
        'participants': const [],
      });

      expect(saved.message.bookmarked, isTrue);
      expect(saved.conversation?.displayTitle, 'alice');
      expect(media.items.single.bookmarked, isFalse);
      expect(media.nextCursor, 40);
      expect(call.durationSeconds, 61);
      expect(call.outgoing, isTrue);
    },
  );

  test('voice participants decode and prioritize raised hands', () {
    final state = WebCordState()
      ..voiceParticipants = [
        VoiceParticipant.fromJson({
          'socketId': 'speaker',
          'userId': 1,
          'username': 'speaker',
        }),
        VoiceParticipant.fromJson({
          'socketId': 'raised',
          'userId': 2,
          'username': 'raised',
          'handRaised': true,
        }),
      ];
    addTearDown(state.dispose);

    expect(state.prioritizedVoiceParticipants.first.socketId, 'raised');
    expect(state.prioritizedVoiceParticipants.first.handRaised, isTrue);
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
