import 'dart:ui';

import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

const wcFastMotion = Duration(milliseconds: 190);
const wcBaseMotion = Duration(milliseconds: 320);
const wcSlowMotion = Duration(milliseconds: 620);
const wcEase = Curves.easeOutCubic;

enum AppBrightnessMode {
  system('System'),
  dark('Dark'),
  light('Light');

  const AppBrightnessMode(this.label);

  final String label;

  ThemeMode get themeMode => switch (this) {
    AppBrightnessMode.system => ThemeMode.system,
    AppBrightnessMode.dark => ThemeMode.dark,
    AppBrightnessMode.light => ThemeMode.light,
  };

  static AppBrightnessMode fromName(String? value) {
    for (final mode in values) {
      if (mode.name == value) return mode;
    }
    return AppBrightnessMode.system;
  }
}

enum AppThemeMode {
  telegram('Telegram Focus'),
  material('Material Motion'),
  liquid('Adaptive Atmosphere'),
  nebula('Nebula'),
  graphite('Graphite'),
  aurora('Aurora');

  const AppThemeMode(this.label);

  final String label;

  static const flagship = <AppThemeMode>[
    AppThemeMode.telegram,
    AppThemeMode.material,
    AppThemeMode.liquid,
  ];

  String get description => switch (this) {
    AppThemeMode.telegram => 'Fast, compact and conversation-first',
    AppThemeMode.material => 'Expressive shapes and Google motion',
    AppThemeMode.liquid => 'Reactive depth and calm ambient light',
    _ => 'Legacy WebCord palette',
  };

  String get behavior => switch (this) {
    AppThemeMode.telegram => 'Outline icons | quick motion | flat surfaces',
    AppThemeMode.material =>
      'Material Symbols | emphasized motion | tonal surfaces',
    AppThemeMode.liquid => 'Luminous icons | spring motion | adaptive glass',
    _ => 'Classic motion and components',
  };

  static AppThemeMode fromName(String? value) {
    for (final mode in values) {
      if (mode.name == value) return mode;
    }
    return AppThemeMode.telegram;
  }
}

enum WebCordIconRole {
  menu,
  channels,
  friends,
  direct,
  calls,
  stories,
  profile,
  settings,
  logout,
  search,
  voice,
  send,
  attach,
  microphone,
  video,
  wallpaper,
  theme,
  selected,
}

@immutable
class WebCordThemeSystem extends ThemeExtension<WebCordThemeSystem> {
  const WebCordThemeSystem(this.mode);

  final AppThemeMode mode;

  static WebCordThemeSystem of(BuildContext context) =>
      Theme.of(context).extension<WebCordThemeSystem>() ??
      const WebCordThemeSystem(AppThemeMode.telegram);

  Duration get fastMotion => switch (mode) {
    AppThemeMode.telegram => const Duration(milliseconds: 150),
    AppThemeMode.material => const Duration(milliseconds: 260),
    AppThemeMode.liquid => const Duration(milliseconds: 230),
    _ => wcFastMotion,
  };

  Duration get baseMotion => switch (mode) {
    AppThemeMode.telegram => const Duration(milliseconds: 220),
    AppThemeMode.material => const Duration(milliseconds: 500),
    AppThemeMode.liquid => const Duration(milliseconds: 620),
    _ => wcBaseMotion,
  };

  Curve get curve => switch (mode) {
    AppThemeMode.telegram => Curves.easeOutCubic,
    AppThemeMode.material => Curves.easeOutBack,
    AppThemeMode.liquid => Curves.easeOutQuart,
    _ => wcEase,
  };

  double get controlRadius => switch (mode) {
    AppThemeMode.telegram => 10,
    AppThemeMode.material => 24,
    AppThemeMode.liquid => 18,
    _ => 16,
  };

  double get bubbleRadius => switch (mode) {
    AppThemeMode.telegram => 14,
    AppThemeMode.material => 26,
    AppThemeMode.liquid => 22,
    _ => 18,
  };

  bool get usesGlass => mode == AppThemeMode.liquid;

  IconData icon(WebCordIconRole role, {bool selected = false}) {
    if (mode == AppThemeMode.telegram) {
      return switch (role) {
        WebCordIconRole.menu => Icons.menu_rounded,
        WebCordIconRole.channels => Icons.tag_outlined,
        WebCordIconRole.friends => Icons.people_outline_rounded,
        WebCordIconRole.direct => Icons.chat_bubble_outline_rounded,
        WebCordIconRole.calls => Icons.phone_outlined,
        WebCordIconRole.stories => Icons.auto_stories_outlined,
        WebCordIconRole.profile => Icons.person_outline_rounded,
        WebCordIconRole.settings => Icons.settings_outlined,
        WebCordIconRole.logout => Icons.logout_rounded,
        WebCordIconRole.search => Icons.search_rounded,
        WebCordIconRole.voice => Icons.graphic_eq_rounded,
        WebCordIconRole.send => Icons.send_outlined,
        WebCordIconRole.attach => Icons.attach_file_rounded,
        WebCordIconRole.microphone => Icons.mic_none_rounded,
        WebCordIconRole.video => Icons.videocam_outlined,
        WebCordIconRole.wallpaper => Icons.wallpaper_outlined,
        WebCordIconRole.theme => Icons.palette_outlined,
        WebCordIconRole.selected => Icons.check_circle_outline_rounded,
      };
    }
    if (mode == AppThemeMode.material) {
      return switch (role) {
        WebCordIconRole.menu => Icons.menu_rounded,
        WebCordIconRole.channels => Icons.tag_outlined,
        WebCordIconRole.friends => Icons.group_outlined,
        WebCordIconRole.direct => Icons.chat_bubble_outline_rounded,
        WebCordIconRole.calls => Icons.call_outlined,
        WebCordIconRole.stories => Icons.auto_stories_outlined,
        WebCordIconRole.profile => Icons.account_circle_outlined,
        WebCordIconRole.settings => Icons.settings_outlined,
        WebCordIconRole.logout => Icons.logout_rounded,
        WebCordIconRole.search => Icons.search_rounded,
        WebCordIconRole.voice => Icons.graphic_eq_rounded,
        WebCordIconRole.send => Icons.send_outlined,
        WebCordIconRole.attach => Icons.attach_file_rounded,
        WebCordIconRole.microphone => Icons.mic_none_rounded,
        WebCordIconRole.video => Icons.videocam_outlined,
        WebCordIconRole.wallpaper => Icons.wallpaper_outlined,
        WebCordIconRole.theme => Icons.palette_outlined,
        WebCordIconRole.selected => Icons.check_circle_outline_rounded,
      };
    }
    return switch (role) {
      WebCordIconRole.menu => Icons.menu_open_rounded,
      WebCordIconRole.channels => Icons.tag_outlined,
      WebCordIconRole.friends => Icons.people_outline_rounded,
      WebCordIconRole.direct => Icons.chat_bubble_outline_rounded,
      WebCordIconRole.calls => Icons.phone_outlined,
      WebCordIconRole.stories => Icons.collections_outlined,
      WebCordIconRole.profile => Icons.account_circle_outlined,
      WebCordIconRole.settings => Icons.tune_rounded,
      WebCordIconRole.logout => Icons.logout_rounded,
      WebCordIconRole.search => Icons.search_rounded,
      WebCordIconRole.voice => Icons.graphic_eq_rounded,
      WebCordIconRole.send => Icons.send_outlined,
      WebCordIconRole.attach => Icons.attach_file_rounded,
      WebCordIconRole.microphone => Icons.mic_none_rounded,
      WebCordIconRole.video => Icons.videocam_outlined,
      WebCordIconRole.wallpaper => Icons.image_outlined,
      WebCordIconRole.theme => Icons.palette_outlined,
      WebCordIconRole.selected => Icons.check_circle_outline_rounded,
    };
  }

  @override
  WebCordThemeSystem copyWith({AppThemeMode? mode}) =>
      WebCordThemeSystem(mode ?? this.mode);

  @override
  WebCordThemeSystem lerp(
    covariant ThemeExtension<WebCordThemeSystem>? other,
    double t,
  ) => t < .5 || other is! WebCordThemeSystem ? this : other;
}

class WebCordColors {
  static const bg = Color(0xFF050817);
  static const bgAlt = Color(0xFF080D1D);
  static const rail = Color(0xFF040710);
  static const panel = Color(0xFF0B1020);
  static const panelSoft = Color(0xFF10172A);
  static const panelStrong = Color(0xFF18213A);
  static const border = Color(0x2EAEC2EE);
  static const text = Color(0xFFF7F8FF);
  static const muted = Color(0xFF929DB7);
  static const accent = Color(0xFF7667FF);
  static const accentHot = Color(0xFF9B7CFF);
  static const cyan = Color(0xFF5DD8EF);
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
        palettes[AppThemeMode.telegram]!;
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
  AppThemeMode.telegram: WebCordPalette(
    bg: Color(0xFF101820),
    bgAlt: Color(0xFF17212B),
    rail: Color(0xFF0E1621),
    panel: Color(0xFF18232F),
    panelSoft: Color(0xFF202D3A),
    panelStrong: Color(0xFF283745),
    border: Color(0x334F6070),
    text: Color(0xFFF5F7FA),
    muted: Color(0xFF9BAAB8),
    accent: Color(0xFF3390EC),
    accentHot: Color(0xFF64B5F6),
    cyan: Color(0xFF55B8E8),
    danger: Color(0xFFFF6B6B),
    success: Color(0xFF42D392),
    backdrop: [
      Color(0xFF101820),
      Color(0xFF111B25),
      Color(0xFF14202B),
      Color(0xFF17212B),
    ],
  ),
  AppThemeMode.liquid: WebCordPalette(
    bg: Color(0xFF050817),
    bgAlt: Color(0xFF080D1D),
    rail: Color(0xF0040710),
    panel: Color(0xE80B1020),
    panelSoft: Color(0xE610172A),
    panelStrong: Color(0xF018213A),
    border: Color(0x2EAEC2EE),
    text: Color(0xFFF7F8FF),
    muted: Color(0xFF9AA5BD),
    accent: Color(0xFF7667FF),
    accentHot: Color(0xFF9B7CFF),
    cyan: Color(0xFF5DD8EF),
    danger: WebCordColors.danger,
    success: WebCordColors.success,
    backdrop: [
      Color(0xFF030610),
      Color(0xFF050817),
      Color(0xFF091225),
      Color(0xFF101B36),
    ],
  ),
  AppThemeMode.material: WebCordPalette(
    bg: Color(0xFF141218),
    bgAlt: Color(0xFF1D1B20),
    rail: Color(0xFF18151D),
    panel: Color(0xFF211F26),
    panelSoft: Color(0xFF2B2930),
    panelStrong: Color(0xFF36343B),
    border: Color(0x2FE7E0EC),
    text: Color(0xFFF7F2FA),
    muted: Color(0xFFCAC4D0),
    accent: Color(0xFFD0BCFF),
    accentHot: Color(0xFFEFB8C8),
    cyan: Color(0xFF9BD8EF),
    danger: Color(0xFFFFB4AB),
    success: Color(0xFFB8F0C2),
    backdrop: [
      Color(0xFF141218),
      Color(0xFF1D1B20),
      Color(0xFF24212A),
      Color(0xFF322E3B),
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

WebCordPalette _lightPalette(AppThemeMode mode) {
  final accent = switch (mode) {
    AppThemeMode.material => const Color(0xFF6750A4),
    AppThemeMode.liquid => const Color(0xFF006A78),
    AppThemeMode.telegram => const Color(0xFF168ACD),
    _ => palettes[mode]!.accent,
  };
  return WebCordPalette(
    bg: const Color(0xFFF1F5FA),
    bgAlt: const Color(0xFFEAF0F7),
    rail: const Color(0xFFFFFFFF),
    panel: const Color(0xFFFFFFFF),
    panelSoft: const Color(0xFFF4F7FB),
    panelStrong: const Color(0xFFE5EBF3),
    border: const Color(0x26344152),
    text: const Color(0xFF172033),
    muted: const Color(0xFF627184),
    accent: accent,
    accentHot: Color.lerp(accent, const Color(0xFF8B3D74), .28)!,
    cyan: Color.lerp(accent, const Color(0xFF0089A6), .42)!,
    danger: const Color(0xFFBA1A1A),
    success: const Color(0xFF087F5B),
    backdrop: const [
      Color(0xFFF8FAFE),
      Color(0xFFF1F5FA),
      Color(0xFFEAF0F7),
      Color(0xFFDDE6F1),
    ],
  );
}

ThemeData webCordTheme([
  AppThemeMode mode = AppThemeMode.telegram,
  Brightness brightness = Brightness.dark,
]) {
  final palette = brightness == Brightness.light
      ? _lightPalette(mode)
      : palettes[mode]!;
  final system = WebCordThemeSystem(mode);
  final materialExpressive = mode == AppThemeMode.material;
  final telegramFocus = mode == AppThemeMode.telegram;
  final controlRadius = system.controlRadius;
  final fieldRadius = materialExpressive ? 24.0 : system.controlRadius;
  final scheme = ColorScheme.fromSeed(
    seedColor: palette.accent,
    brightness: brightness,
    surface: palette.panel,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    scaffoldBackgroundColor: palette.bg,
    visualDensity: telegramFocus
        ? VisualDensity.compact
        : VisualDensity.standard,
    splashFactory: materialExpressive
        ? InkSparkle.splashFactory
        : telegramFocus
        ? NoSplash.splashFactory
        : InkRipple.splashFactory,
    colorScheme: scheme.copyWith(
      primary: palette.accent,
      secondary: palette.cyan,
      surface: palette.panel,
      error: palette.danger,
    ),
    extensions: [palette, system],
    fontFamily: 'Segoe UI',
    textTheme: TextTheme(
      headlineLarge: TextStyle(
        color: palette.text,
        fontSize: 32,
        fontWeight: FontWeight.w900,
        height: 1.04,
        letterSpacing: -0.8,
      ),
      headlineMedium: TextStyle(
        color: palette.text,
        fontSize: 23,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
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
        borderRadius: BorderRadius.circular(fieldRadius),
        borderSide: BorderSide(color: palette.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(fieldRadius),
        borderSide: BorderSide(color: palette.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(fieldRadius),
        borderSide: BorderSide(color: palette.accent),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
        ),
        side: BorderSide(color: palette.border),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(materialExpressive ? 24 : 18),
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(
            materialExpressive
                ? 18
                : telegramFocus
                ? 10
                : 999,
          ),
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(
          materialExpressive
              ? 22
              : telegramFocus
              ? 10
              : 18,
        ),
      ),
      height: telegramFocus ? 68 : 76,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(
          color: palette.muted,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    pageTransitionsTheme: PageTransitionsTheme(
      builders: materialExpressive
          ? const {
              TargetPlatform.android: ZoomPageTransitionsBuilder(),
              TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
              TargetPlatform.iOS: ZoomPageTransitionsBuilder(),
              TargetPlatform.macOS: ZoomPageTransitionsBuilder(),
            }
          : telegramFocus
          ? const {
              TargetPlatform.android: CupertinoPageTransitionsBuilder(),
              TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
              TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
              TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
            }
          : const {
              TargetPlatform.android: ZoomPageTransitionsBuilder(),
              TargetPlatform.windows: ZoomPageTransitionsBuilder(),
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
    final system = WebCordThemeSystem.of(context);
    final disabled = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (system.mode == AppThemeMode.telegram) {
      return ColoredBox(color: palette.bg, child: widget.child);
    }
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
                    system.mode,
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
    this.radius = 18,
    this.showBorder = true,
    this.blur = true,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final double radius;
  final bool showBorder;
  final bool blur;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final system = WebCordThemeSystem.of(context);
    final panelColor = color == WebCordColors.panel ? palette.panel : color;
    final panelAlpha = (panelColor.a * 255).round().clamp(0, 255);
    final glassAlpha = panelAlpha < 255
        ? panelAlpha
        : system.usesGlass
        ? 174
        : 255;
    final resolvedRadius = radius == 18 ? system.controlRadius : radius;
    final resolvedBlur = blur && system.usesGlass;
    return ClipRRect(
      borderRadius: BorderRadius.circular(resolvedRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: resolvedBlur ? 30 : 0,
          sigmaY: resolvedBlur ? 30 : 0,
        ),
        child: AnimatedContainer(
          duration: system.baseMotion,
          curve: system.curve,
          decoration: BoxDecoration(
            color: panelColor.withAlpha(glassAlpha),
            gradient: system.usesGlass
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withAlpha(15),
                      Colors.white.withAlpha(4),
                      palette.accent.withAlpha(8),
                    ],
                    stops: const [0, 0.46, 1],
                  )
                : null,
            borderRadius: BorderRadius.circular(resolvedRadius),
            border: showBorder ? Border.all(color: palette.border) : null,
            boxShadow:
                resolvedRadius > 0 && system.mode != AppThemeMode.telegram
                ? [
                    BoxShadow(
                      color: Colors.black.withAlpha(system.usesGlass ? 58 : 30),
                      blurRadius: system.usesGlass ? 34 : 18,
                      offset: Offset(0, system.usesGlass ? 18 : 8),
                    ),
                  ]
                : null,
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
  const _GlassVeilPainter(this.palette, this.progress, this.mode);

  final WebCordPalette palette;
  final double progress;
  final AppThemeMode mode;

  @override
  void paint(Canvas canvas, Size size) {
    if (mode == AppThemeMode.material) {
      final tonalPaint = Paint()
        ..color = palette.accent.withAlpha(18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 34);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(size.width * .94, size.height * .42),
          width: size.width * .7,
          height: size.height * .82,
        ),
        tonalPaint,
      );
      return;
    }
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
      oldDelegate.palette != palette ||
      oldDelegate.progress != progress ||
      oldDelegate.mode != mode;
}
