import 'package:flutter_test/flutter_test.dart';
import 'package:menu_macro_fitter/models/api_models.dart';
import 'package:menu_macro_fitter/units.dart';
import 'package:menu_macro_fitter/widgets/app_parts.dart';

MenuItem _item({required double calories, double? p, double? c, double? f}) => MenuItem(
  id: 'i',
  chainId: 'c',
  chainName: 'Chain',
  name: 'Item',
  category: Category.entree,
  calories: calories,
  proteinG: p,
  carbsG: c,
  fatG: f,
  isEstimate: false,
);

void main() {
  test('display formats match web/src/units.ts', () {
    expect(formatHeight(65, Units.imperial), '5 ft 5 in');
    expect(formatHeight(65, Units.metric), '165 cm');
    expect(formatWeight(160, Units.metric), '73 kg');
    expect(formatCalories(2058), '2,058');
    expect(formatCalories(519), '519');
    expect(formatGrams(2.5), '2.5');
    expect(formatGrams(32), '32');
  });

  test('fit rule: the top ceil(n / 3) are Great fit', () {
    expect(greatFitCount(10), 4);
    expect(greatFitCount(4), 2);
    expect(greatFitCount(1), 1);
    expect(greatFitCount(0), 0);
  });

  test('macro bar: all known fills the bar by kcal share', () {
    final s = MacroBar.shares(_item(calories: 400, p: 25, c: 25, f: 20)); // 100, 100, 180 kcal
    expect(s.reduce((a, b) => a + b), closeTo(1, 1e-9));
    expect(s[2], closeTo(180 / 380, 1e-9));
  });

  test('macro bar: an unknown macro leaves room for hatching, never drawn as 0 of a full bar', () {
    final s = MacroBar.shares(_item(calories: 400, p: 25, c: 25)); // fat unknown
    expect(s, [0.25, 0.25, 0]);
  });

  test('macro bar: known macros are capped so the bar never overflows', () {
    final s = MacroBar.shares(_item(calories: 100, p: 30, c: 30)); // 120 + 120 kcal on a 100 kcal item
    expect(s, [1, 0, 0]);
  });
}
