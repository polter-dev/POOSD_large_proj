// Client checks with the same rules as the server (docs/api-contract.md, "Validation").
// Messages are from docs/design-spec.md section 5. Each returns null when the value is fine.

final _username = RegExp(r'^[a-z0-9_.]{3,30}$');
final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String? validateFirstName(String? v) => _name(v, 'First name');

String? validateLastName(String? v) => _name(v, 'Last name');

String? _name(String? v, String label) {
  final s = (v ?? '').trim();
  if (s.isEmpty) return '$label is required';
  return s.length > 50 ? '$label: 50 characters max' : null;
}

String? validateUsername(String? v) =>
    _username.hasMatch(normalizeLower(v)) ? null : 'Username: 3 to 30 letters, numbers, _ or .';

String? validateEmail(String? v) {
  final s = normalizeLower(v);
  return _email.hasMatch(s) && s.length <= 254 ? null : 'Email: enter a valid address';
}

String? validatePassword(String? v) => (v ?? '').length >= 8 ? null : 'Password: at least 8 characters';

/// The server trims and lowercases email and username before storing or comparing.
String normalizeLower(String? v) => (v ?? '').trim().toLowerCase();

// Profile (#35). Same rules and messages as web/src/validators.ts, which match the server.

/// A number the user typed, or null when it isn't one.
double? parseNumber(String v) {
  final n = double.tryParse(v.trim());
  return n != null && n.isFinite ? n : null;
}

/// The ft + in boxes on their own: the total check below can't see "5 ft 30 in" or "6 ft -5 in".
String? validateFeetInches(String ft, String inch) {
  final f = parseNumber(ft);
  final i = inch.trim().isEmpty ? 0.0 : parseNumber(inch);
  if (f == null || i == null) return null; // not numbers: the total check reports it
  if (f != f.roundToDouble() || f < 0) return 'Height: feet must be a whole number';
  if (i < 0 || i >= 12) return 'Height: inches must be 0 to 11';
  return null;
}

String? validateHeight(double? heightIn, {required bool metric}) {
  if (heightIn != null && heightIn >= 36 && heightIn <= 96) return null;
  return metric ? 'Height: 92 to 243 cm' : 'Height: 3 ft to 8 ft';
}

String? validateWeight(double? weightLb, {required bool metric}) {
  if (weightLb != null && weightLb >= 50 && weightLb <= 700) return null;
  return metric ? 'Weight: 23 to 317 kg' : 'Weight: 50 to 700 lb';
}

/// A real YYYY-MM-DD date, age 18 to 119 in whole years (UTC), like the server.
String? validateBirthDate(String? v, {DateTime? now}) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(v ?? '');
  if (m == null) return 'Birth date is required';
  final y = int.parse(m[1]!), mo = int.parse(m[2]!), d = int.parse(m[3]!);
  final date = DateTime.utc(y, mo, d);
  if (date.year != y || date.month != mo || date.day != d) return 'Birth date is required';
  final today = (now ?? DateTime.now()).toUtc();
  var age = today.year - y;
  if (today.month < mo || (today.month == mo && today.day < d)) age -= 1;
  if (age < 18) return 'Birth date: you must be 18 or older';
  if (age > 119) return 'Birth date: check the year';
  return null;
}

String? validateChoice(Object? v, String label) => v == null ? '$label: choose one' : null;
