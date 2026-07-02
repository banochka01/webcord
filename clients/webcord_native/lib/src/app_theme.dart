import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

const wcFastMotion = Duration(milliseconds: 190);
const wcBaseMotion = Duration(milliseconds: 320);
const wcSlowMotion = Duration(milliseconds: 620);
const wcEase = Curves.easeOutCubic;

enum AppThemeMode {
  liquid('Liquid Glass'),
  nebula('Nebula'),
  graphite('Graphite'),
  aurora('Aurora');

  const AppThemeMode(this.label);

  final String label;

  static AppThemeMode fromName(String? value) {
    for (final mode in values) {
      if (mode.name == value) return mode;
    }
    return AppThemeMode.liquid;
  }
}

class WebCordColors {
  static const bg = Color(0xFF070A12);
  static const bgAlt = Color(0xFF0B1020);
  static const rail = Color(0xFF0A0D18);
  static const panel = Color(0xFF11172A);
  static const panelSoft = Color(0xFF151D33);
  static const panelStrong = Color(0xFF1B2640);
  static const border = Color(0x263F5186);
  static const text = Color(0xFFF7FAFF);
  static const muted = Color(0xFF94A2C0);
  static const accent = Color(0xFF7567FF);
  static const accentHot = Color(0xFF9A5CFF);
  static const cyan = Color(0xFF31E4D1);
  static const danger = Color(0xFFFF5B6E);
  static const success = Color(0xFF42D392);
}

@immutable
class WebCordPalette extends ThemeExtension<WebCordPalette> {
  const WebCordPalette({
    required this.bg,
    required this.bgAlt,
    required this.rail,
    required this.panel,
    required this.panelSoft,
    required this.panelStrong,
    required this.border,
    required this.text,
    required this.muted,
    required this.accent,
    required this.accentHot,
    required this.cyan,
    required this.danger,
    required this.success,
    required this.backdrop,
  });

  final Color bg;
  final Color bgAlt;
  final Color rail;
  final Color panel;
  final Color panelSoft;
  final Color panelStrong;
  final Color border;
  final Color text;
  final Color muted;
  final Color accent;
  final Color accentHot;
  final Color cyan;
  final Color danger;
  final Color success;
  final List<Color> backdrop;

  static WebCordPalette of(BuildContext context) {
    return Theme.of(context).extension<WebCordPalette>() ??
        palettes[AppThemeMode.liquid]!;
  }

  @override
  WebCordPalette copyWith({
    Color? bg,
    Color? bgAlt,
    Color? rail,
    Color? panel,
    Color? panelSoft,
    Color? panelStrong,
    Color? border,
    Color? text,
    Color? muted,
    Color? accent,
    Color? accentHot,
    Color? cyan,
    Color? danger,
    Color? success,
    List<Color>? backdrop,
  }) {
    return WebCordPalette(
      bg: bg ?? this.bg,
      bgAlt: bgAlt ?? this.bgAlt,
      rail: rail ?? this.rail,
      panel: panel ?? this.panel,
      panelSoft: panelSoft ?? this.panelSoft,
      panelStrong: panelStrong ?? this.panelStrong,
      border: border ?? this.border,
      text: text ?? this.text,
      muted: muted ?? this.muted,
      accent: accent ?? this.accent,
      accentHot: accentHot ?? this.accentHot,
      cyan: cyan ?? this.cyan,
      danger: danger ?? this.danger,
      success: success ?? this.success,
      backdrop: backdrop ?? this.backdrop,
    );
  }

  @override
  WebCordPalette lerp(ThemeExtension<WebCordPalette>? other, double t) {
    if (other is! WebCordPalette) return this;
    return WebCordPalette(
      bg: Color.lerp(bg, other.bg, t)!,
      bgAlt: Color.lerp(bgAlt, other.bgAlt, t)!,
      rail: Color.lerp(rail, other.rail, t)!,
      panel: Color.lerp(panel, other.panel, t)!,
      panelSoft: Color.lerp(panelSoft, other.panelSoft, t)!,
      panelStrong: Color.lerp(panelStrong, other.panelStrong, t)!,
      border: Color.lerp(border, other.border, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      accentHot: Color.lerp(accentHot, other.accentHot, t)!,
      cyan: Color.lerp(cyan, other.cyan, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      success: Color.lerp(success, other.success, t)!,
      backdrop: List<Color>.generate(
        backdrop.length,
        (index) => Color.lerp(
          backdrop[index],
          other.backdrop[index.clamp(0, other.backdrop.length - 1).toInt()],
          t,
        )!,
      ),
    );
  }
}

const palettes = <AppThemeMode, WebCordPalette>{
  AppThemeMode.liquid: WebCordPalette(
    bg: Color(0xFF060910),
    bgAlt: Color(0xFF0B111D),
    rail: Color(0xCC0B111D),
    panel: Color(0xB8141B2A),
    panelSoft: Color(0xA61B2638),
    panelStrong: Color(0xE0222D41),
    border: Color(0x42FFFFFF),
    text: Color(0xFFF7FAFF),
    muted: Color(0xFFB1BCD0),
    accent: Color(0xFF70A7FF),
    accentHot: Color(0xFF95C8FF),
    cyan: Color(0xFF76E4FF),
    danger: WebCordColors.danger,
    success: WebCordColors.success,
    backdrop: [
      Color(0xFF05070C),
      Color(0xFF0B1422),
      Color(0xFF111C2C),
      Color(0xFF182942),
    ],
  ),
  AppThemeMode.nebula: WebCordPalette(
    bg: WebCordColors.bg,
    bgAlt: WebCordColors.bgAlt,
    rail: WebCordColors.rail,
    panel: WebCordColors.panel,
    panelSoft: WebCordColors.panelSoft,
    panelStrong: WebCordColors.panelStrong,
    border: WebCordColors.border,
    text: WebCordColors.text,
    muted: WebCordColors.muted,
    accent: WebCordColors.accent,
    accentHot: WebCordColors.accentHot,
    cyan: WebCordColors.cyan,
    danger: WebCordColors.danger,
    success: WebCordColors.success,
    backdrop: [
      Color(0xFF08101B),
      Color(0xFF09091A),
      Color(0xFF19116D),
      Color(0xFF232EB1),
    ],
  ),
  AppThemeMode.graphite: WebCordPalette(
    bg: Color(0xFF07080C),
    bgAlt: Color(0xFF0D111A),
    rail: Color(0xFF090B10),
    panel: Color(0xFF121722),
    panelSoft: Color(0xFF1A2230),
    panelStrong: Color(0xFF222B3C),
    border: Color(0x333F4B60),
    text: Color(0xFFF4F7FB),
    muted: Color(0xFF9EA9BA),
    accent: Color(0xFF5D7CFA),
    accentHot: Color(0xFF8B6DFF),
    cyan: Color(0xFF55D6BE),
    danger: WebCordColors.danger,
    success: WebCordColors.success,
    backdrop: [
      Color(0xFF050609),
      Color(0xFF0D1118),
      Color(0xFF151E2F),
      Color(0xFF1F2D46),
    ],
  ),
  AppThemeMode.aurora: WebCordPalette(
    bg: Color(0xFF06110F),
    bgAlt: Color(0xFF081917),
    rail: Color(0xFF06120F),
    panel: Color(0xFF0E211E),
    panelSoft: Color(0xFF14302B),
    panelStrong: Color(0xFF1B3B35),
    border: Color(0x334FDCC7),
    text: Color(0xFFF3FFFB),
    muted: Color(0xFF9EC7BD),
    accent: Color(0xFF4E8BFF),
    accentHot: Color(0xFF31D69C),
    cyan: Color(0xFF57F3D3),
    danger: WebCordColors.danger,
    success: WebCordColors.success,
    backdrop: [
      Color(0xFF06110F),
      Color(0xFF0A171D),
      Color(0xFF0B2B36),
      Color(0xFF143A72),
    ],
  ),
};

ThemeData webCordTheme([AppThemeMode mode = AppThemeMode.liquid]) {
  final palette = palettes[mode]!;
  final scheme = ColorScheme.fromSeed(
    seedColor: palette.accent,
    brightness: Brightness.dark,
    surface: palette.panel,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: palette.bg,
    colorScheme: scheme.copyWith(
      primary: palette.accent,
      secondary: palette.cyan,
      surface: palette.panel,
      error: palette.danger,
    ),
    extensions: [palette],
    fontFamily: 'Segoe UI',
    textTheme: TextTheme(
      headlineLarge: TextStyle(
        color: palette.text,
        fontSize: 30,
        fontWeight: FontWeight.w900,
        height: 1.06,
      ),
      headlineMedium: TextStyle(
        color: palette.text,
        fontSize: 22,
        fontWeight: FontWeight.w800,
      ),
      titleMedium: TextStyle(
        color: palette.text,
        fontSize: 15,
        fontWeight: FontWeight.w800,
      ),
      bodyMedium: TextStyle(color: palette.text, fontSize: 14, height: 1.35),
      labelMedium: TextStyle(
        color: palette.muted,
        fontSize: 12,
        fontWeight: FontWeight.w700,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: palette.bgAlt.withAlpha(190),
      hintStyle: TextStyle(color: palette.muted.withAlpha(210)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide(color: palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide(color: palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide(color: palette.accent),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        side: BorderSide(color: palette.border),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
      ),
      height: 72,
    ),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: ZoomPageTransitionsBuilder(),
        TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}

class AppBackdrop extends StatefulWidget {
  const AppBackdrop({required this.child, super.key});

  final Widget child;

  @override
  State<AppBackdrop> createState() => _AppBackdropState();
}

class _AppBackdropState extends State<AppBackdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ambient;

  @override
  void initState() {
    super.initState();
    _ambient = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 26),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ambient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final disabled = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette.backdrop,
          stops: [0, 0.34, 0.72, 1],
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: AnimatedBuilder(
              animation: disabled ? kAlwaysDismissedAnimation : _ambient,
              builder: (context, _) {
                return CustomPaint(
                  painter: _GlassVeilPainter(
                    palette,
                    disabled ? 0 : _ambient.value,
                  ),
                );
              },
            ),
          ),
          widget.child,
        ],
      ),
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color = WebCordColors.panel,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final panelColor = color == WebCordColors.panel ? palette.panel : color;
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: AnimatedContainer(
          duration: wcBaseMotion,
          curve: wcEase,
          decoration: BoxDecoration(
            color: panelColor.withAlpha(206),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: palette.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(82),
                blurRadius: 34,
                offset: Offset(0, 22),
              ),
              BoxShadow(
                color: palette.accent.withAlpha(18),
                blurRadius: 32,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: palette.muted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _GlassVeilPainter extends CustomPainter {
  const _GlassVeilPainter(this.palette, this.progress);

  final WebCordPalette palette;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final bandShift = lerpDouble(
      -size.width * .22,
      size.width * .18,
      progress,
    )!;
    final gridShift = lerpDouble(-42, 42, progress)!;

    final bandPaint = Paint()
      ..shader =
          LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.transparent,
              palette.accent.withAlpha(22),
              palette.cyan.withAlpha(14),
              Colors.transparent,
            ],
            stops: const [0.1, 0.38, 0.58, 0.9],
          ).createShader(
            Rect.fromLTWH(bandShift, 0, size.width * 1.35, size.height),
          );
    final bandPath = Path()
      ..moveTo(size.width * .16 + bandShift, 0)
      ..lineTo(size.width * .72 + bandShift, 0)
      ..lineTo(size.width * .92 + bandShift, size.height)
      ..lineTo(size.width * .32 + bandShift, size.height)
      ..close();
    canvas.drawPath(bandPath, bandPaint);

    final topLine = Paint()
      ..color = Colors.white.withAlpha(18)
      ..strokeWidth = 1;
    for (var index = 0; index < 9; index += 1) {
      final y = size.height * (index / 8) + gridShift;
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y + 34 + gridShift * .12),
        topLine,
      );
    }

    final wash = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          palette.accent.withAlpha(28),
          Colors.transparent,
          palette.cyan.withAlpha(16),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, wash);
  }

  @override
  bool shouldRepaint(covariant _GlassVeilPainter oldDelegate) =>
      oldDelegate.palette != palette || oldDelegate.progress != progress;
}
