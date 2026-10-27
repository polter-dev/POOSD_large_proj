import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// Colors, type and shapes from docs/design-spec.md (Option 1, fresh and clean).
// Change the spec first, then this file, so web and mobile stay the same.

class AppColors {
  static const bg = Color(0xFFFFFFFF), surface = Color(0xFFF5F6F8);
  static const border = Color(0xFFE3E6EA), borderInput = Color(0xFF8A939E);
  static const text = Color(0xFF1A1D21), textMuted = Color(0xFF5B6470);
  static const primary = Color(0xFF15803D), primaryHover = Color(0xFF166534);
  static const onPrimary = Color(0xFFFFFFFF);
  static const fitGreatBg = Color(0xFFDCFCE7), fitGreatText = Color(0xFF166534);
  static const fitOkBg = Color(0xFFFEF3C7), fitOkText = Color(0xFF92400E);
  static const fitOverBg = Color(0xFFFEE2E2), fitOverText = Color(0xFFB91C1C);
  static const error = Color(0xFFB91C1C), errorBg = Color(0xFFFEE2E2);
  static const macroProtein = Color(0xFF2563EB), macroCarbs = Color(0xFFEA580C);
  static const macroFat = Color(0xFFA16207), macroUnknown = Color(0xFF9CA3AF);
}

class AppSpace {
  static const s1 = 4.0, s2 = 8.0, s3 = 12.0, s4 = 16.0, s6 = 24.0, s8 = 32.0, s12 = 48.0;
}

class AppRadius {
  static const sm = 4.0, md = 8.0, lg = 12.0, pill = 999.0;
}

// Off in widget tests: GoogleFonts would try to download Manrope.
bool useGoogleFonts = true;

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      error: AppColors.error,
      surface: AppColors.bg,
      onSurface: AppColors.text,
    ),
    scaffoldBackgroundColor: AppColors.bg,
  );

  const textTheme = TextTheme(
    displayMedium: TextStyle(fontSize: 40, height: 44 / 40, fontWeight: FontWeight.w700), // display
    headlineMedium: TextStyle(fontSize: 28, height: 34 / 28, fontWeight: FontWeight.w700), // h1
    titleLarge: TextStyle(fontSize: 20, height: 26 / 20, fontWeight: FontWeight.w600), // h2
    bodyLarge: TextStyle(fontSize: 16, height: 1.5), // body
    bodyMedium: TextStyle(fontSize: 14, height: 20 / 14), // small
    labelSmall: TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500), // caption
    labelLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w600), // buttons
  );
  final themedText = textTheme.apply(bodyColor: AppColors.text, displayColor: AppColors.text);

  OutlineInputBorder outline(Color color, double width) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppRadius.md),
    borderSide: BorderSide(color: color, width: width),
  );

  final buttonShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md));
  const buttonSize = Size.fromHeight(48);

  return base.copyWith(
    textTheme: useGoogleFonts ? GoogleFonts.manropeTextTheme(themedText) : themedText,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface, // spec: surface is the input fill on mobile
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpace.s4, vertical: 14),
      hintStyle: const TextStyle(color: AppColors.textMuted),
      enabledBorder: outline(AppColors.borderInput, 1),
      focusedBorder: outline(AppColors.primary, 2),
      errorBorder: outline(AppColors.error, 2),
      focusedErrorBorder: outline(AppColors.error, 2),
      errorStyle: const TextStyle(color: AppColors.error, fontSize: 14),
      errorMaxLines: 2,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.7),
        disabledForegroundColor: AppColors.onPrimary,
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.text,
        side: const BorderSide(color: AppColors.borderInput),
        minimumSize: buttonSize,
        shape: buttonShape,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
  );
}
