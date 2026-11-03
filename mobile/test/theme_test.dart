import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:menu_macro_fitter/theme.dart';

void main() {
  setUp(() => useGoogleFonts = false);

  test('every text style is set and uses the text color, not just the ones the spec names', () {
    final t = buildTheme().textTheme;
    final styles = {
      'displayLarge': t.displayLarge,
      'displayMedium': t.displayMedium,
      'displaySmall': t.displaySmall,
      'headlineLarge': t.headlineLarge,
      'headlineMedium': t.headlineMedium,
      'headlineSmall': t.headlineSmall,
      'titleLarge': t.titleLarge,
      'titleMedium': t.titleMedium,
      'titleSmall': t.titleSmall,
      'bodyLarge': t.bodyLarge,
      'bodyMedium': t.bodyMedium,
      'bodySmall': t.bodySmall,
      'labelLarge': t.labelLarge,
      'labelMedium': t.labelMedium,
      'labelSmall': t.labelSmall,
    };
    for (final MapEntry(:key, :value) in styles.entries) {
      expect(value?.color, AppColors.text, reason: key);
    }
    // The spec's own sizes still win.
    expect(t.bodyLarge!.fontSize, 16);
    expect(t.headlineMedium!.fontSize, 28);
  });

  testWidgets('the dropdown draws its chosen value in the text color', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: Scaffold(
          body: DropdownButtonFormField<int>(
            initialValue: 1,
            items: const [DropdownMenuItem(value: 1, child: Text('Light'))],
            onChanged: (_) {},
          ),
        ),
      ),
    );
    final style = DefaultTextStyle.of(tester.element(find.text('Light'))).style;
    expect(style.color, AppColors.text);
  });
}
