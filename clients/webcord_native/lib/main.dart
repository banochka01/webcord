import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';

import 'src/app_shell.dart';
import 'src/app_state.dart';
import 'src/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
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
        return MaterialApp(
          title: 'WebCord',
          debugShowCheckedModeBanner: false,
          theme: webCordTheme(state.themeMode),
          themeAnimationDuration: wcSlowMotion,
          themeAnimationCurve: wcEase,
          home: WebCordShell(state: state),
        );
      },
    );
  }
}
