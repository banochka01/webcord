import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';

import 'src/app_shell.dart';
import 'src/app_state.dart';
import 'src/app_theme.dart';
import 'src/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  await PushService.instance.initialize();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF11172A),
      systemNavigationBarColor: Color(0xFF070A12),
      systemNavigationBarDividerColor: Color(0xFF11172A),
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const WebCordNativeApp());
}

class WebCordNativeApp extends StatefulWidget {
  const WebCordNativeApp({super.key});

  @override
  State<WebCordNativeApp> createState() => _WebCordNativeAppState();
}

class _WebCordNativeAppState extends State<WebCordNativeApp> {
  late final WebCordState state;

  @override
  void initState() {
    super.initState();
    state = WebCordState();
    state.init();
  }

  @override
  void dispose() {
    state.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final themeSystem = WebCordThemeSystem(state.themeMode);
        return MaterialApp(
          title: 'WebCord',
          debugShowCheckedModeBanner: false,
          theme: webCordTheme(state.themeMode, Brightness.light),
          darkTheme: webCordTheme(state.themeMode, Brightness.dark),
          themeMode: state.brightnessMode.themeMode,
          themeAnimationDuration: themeSystem.baseMotion,
          themeAnimationCurve: themeSystem.curve,
          builder: (context, child) {
            final light = Theme.of(context).brightness == Brightness.light;
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                systemNavigationBarColor: light
                    ? const Color(0xFFF1F5FA)
                    : const Color(0xFF070A12),
                systemNavigationBarDividerColor: light
                    ? const Color(0xFFDDE6F1)
                    : const Color(0xFF11172A),
                statusBarIconBrightness: light
                    ? Brightness.dark
                    : Brightness.light,
                systemNavigationBarIconBrightness: light
                    ? Brightness.dark
                    : Brightness.light,
              ),
              child: child ?? const SizedBox.shrink(),
            );
          },
          home: WebCordShell(state: state),
        );
      },
    );
  }
}
