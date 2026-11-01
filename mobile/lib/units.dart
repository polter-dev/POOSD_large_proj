import 'models/api_models.dart';

// Same as web/src/units.ts. The API stores height and weight imperial (inches, pounds); metric is
// display only (contract, User).
const cmPerIn = 2.54;
const kgPerLb = 0.453592;

/// One decimal, so a metric round trip doesn't drift by more than the input's own precision.
double round1(double n) => (n * 10).round() / 10;

/// For a text box: "5" rather than "5.0", "5.5" stays.
String plainNumber(double n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

String formatHeight(double heightIn, Units units) {
  if (units == Units.metric) return '${(heightIn * cmPerIn).round()} cm';
  final total = heightIn.round();
  return '${total ~/ 12} ft ${total % 12} in';
}

String formatWeight(double weightLb, Units units) =>
    units == Units.metric ? '${(weightLb * kgPerLb).round()} kg' : '${weightLb.round()} lb';

/// 2058 -> "2,058".
String formatCalories(num n) => n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

/// Grams under a macro bar: "32", "2.5".
String formatGrams(double g) => plainNumber(round1(g));

// Profile dropdown, and the short form on Your targets.
const activityLabels = <ActivityLevel, ({String label, String short})>{
  ActivityLevel.sedentary: (label: 'Sedentary: little or no exercise', short: 'Sedentary'),
  ActivityLevel.light: (label: 'Light: exercise 1 to 3 days a week', short: 'Light'),
  ActivityLevel.moderate: (label: 'Moderate: exercise 3 to 5 days a week', short: 'Moderate'),
  ActivityLevel.active: (label: 'Active: exercise 6 to 7 days a week', short: 'Active'),
  ActivityLevel.veryActive: (label: 'Very active: hard exercise daily or a physical job', short: 'Very active'),
};

String capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
