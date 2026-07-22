import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webcord_native/src/app_shell.dart';
import 'package:webcord_native/src/app_state.dart';
import 'package:webcord_native/src/app_theme.dart';
import 'package:webcord_native/src/models.dart';

void main() {
  setUpAll(() async {
    Future<void> loadFont(String family, String path) async {
      final bytes = await File(path).readAsBytes();
      await (FontLoader(family)..addFont(
            Future.value(ByteData.sublistView(Uint8List.fromList(bytes))),
          ))
          .load();
    }

    await loadFont('Segoe UI', r'C:\Windows\Fonts\segoeui.ttf');
    await loadFont(
      'MaterialIcons',
      r'K:\SDK\flutter_fresh\bin\cache\artifacts\material_fonts\MaterialIcons-Regular.otf',
    );
  });

  final alina = PublicUser(
    id: 2,
    username: 'alina',
    displayName: 'Алина',
    statusText: 'Online',
  );
  final maria = PublicUser(
    id: 3,
    username: 'maria',
    displayName: 'Мария',
    statusText: 'Online',
  );
  final ivan = PublicUser(
    id: 4,
    username: 'ivan',
    displayName: 'Иван',
    statusText: 'Online',
  );

  WebCordState fixture(AppThemeMode mode) {
    return WebCordState()
      ..initializing = false
      ..token = 'preview'
      ..user = const PublicUser(id: 1, username: 'monyx', displayName: 'Максим')
      ..guild = const Guild(
        id: 1,
        name: 'Calm server',
        description: 'Команда WebCord',
      )
      ..channels = const [
        Channel(id: 10, name: 'общий', kind: ChannelKind.text, guildId: 1),
        Channel(id: 11, name: 'команда', kind: ChannelKind.text, guildId: 1),
        Channel(id: 12, name: 'дизайн', kind: ChannelKind.text, guildId: 1),
        Channel(
          id: 20,
          name: 'voice room',
          kind: ChannelKind.voice,
          guildId: 1,
        ),
      ]
      ..selectedTextChannelId = 10
      ..selectedVoiceChannelId = 20
      ..themeMode = mode
      ..socketStatus = 'connected'
      ..messages = [
        ChatMessage(
          id: 1,
          channelId: 10,
          content:
              'Всем привет!\nНапоминаю, что встреча команды сегодня в 16:00.',
          author: alina,
          createdAt: DateTime(2026, 7, 22, 10, 15),
        ),
        ChatMessage(
          id: 2,
          channelId: 10,
          content:
              'Привет! Подготовила обновлённый макет лендинга, скину в канал #команда.',
          author: maria,
          createdAt: DateTime(2026, 7, 22, 10, 17),
        ),
        ChatMessage(
          id: 3,
          channelId: 10,
          content:
              'Отлично! Я как раз закончил правки по API.\nПосле встречи выложу документацию.',
          author: ivan,
          createdAt: DateTime(2026, 7, 22, 10, 18),
        ),
        ChatMessage(
          id: 4,
          channelId: 10,
          content:
              'Супер, тогда увидимся в 16:00!\nЕсли у кого-то будут вопросы — пишите сюда.',
          author: const PublicUser(id: 1, username: 'monyx'),
          createdAt: DateTime(2026, 7, 22, 10, 20),
        ),
      ];
  }

  Future<void> capture(
    WidgetTester tester,
    Size size,
    String golden,
    AppThemeMode mode,
  ) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    final state = fixture(mode);
    addTearDown(state.dispose);
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: webCordTheme(mode),
        home: RepaintBoundary(
          key: const ValueKey('capture'),
          child: WebCordShell(state: state),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 900));
    await tester.pump(const Duration(milliseconds: 900));
    await expectLater(
      find.byKey(const ValueKey('capture')),
      matchesGoldenFile(golden),
    );
  }

  testWidgets('captures desktop implementation', (tester) async {
    await capture(
      tester,
      const Size(1536, 1024),
      'goldens/native-desktop-telegram-final.png',
      AppThemeMode.telegram,
    );
  });

  testWidgets('captures mobile implementation', (tester) async {
    await capture(
      tester,
      const Size(390, 844),
      'goldens/native-mobile-telegram-final.png',
      AppThemeMode.telegram,
    );
  });

  testWidgets('captures desktop Material Motion', (tester) async {
    await capture(
      tester,
      const Size(1536, 1024),
      'goldens/native-desktop-material-motion.png',
      AppThemeMode.material,
    );
  });

  testWidgets('captures mobile Material Motion', (tester) async {
    await capture(
      tester,
      const Size(390, 844),
      'goldens/native-mobile-material-motion.png',
      AppThemeMode.material,
    );
  });

  testWidgets('captures desktop Adaptive Atmosphere', (tester) async {
    await capture(
      tester,
      const Size(1536, 1024),
      'goldens/native-desktop-adaptive-atmosphere.png',
      AppThemeMode.liquid,
    );
  });

  testWidgets('captures mobile Adaptive Atmosphere', (tester) async {
    await capture(
      tester,
      const Size(390, 844),
      'goldens/native-mobile-adaptive-atmosphere.png',
      AppThemeMode.liquid,
    );
  });

  testWidgets('captures the unified theme studio', (tester) async {
    tester.view.physicalSize = const Size(800, 320);
    tester.view.devicePixelRatio = 1;
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: webCordTheme(AppThemeMode.material),
        home: RepaintBoundary(
          key: const ValueKey('capture'),
          child: AppBackdrop(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Material(
                type: MaterialType.transparency,
                child: Panel(
                  radius: 28,
                  child: Builder(
                    builder: (context) => Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Theme Studio',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Icons, motion, geometry and behavior apply together.',
                        ),
                        const SizedBox(height: 20),
                        ThemeSystemGallery(
                          selectedMode: AppThemeMode.material,
                          onSelected: (_) {},
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1800));

    expect(find.text('Telegram Focus'), findsOneWidget);
    expect(find.text('Material Motion'), findsOneWidget);
    expect(find.text('Adaptive Atmosphere'), findsOneWidget);
    await expectLater(
      find.byKey(const ValueKey('capture')),
      matchesGoldenFile('goldens/native-theme-system-studio.png'),
    );
  });
}
