// Client checks with the same rules as the server (docs/api-contract.md, "Validation").
// Messages are from docs/design-spec.md section 5. Each returns null when the value is fine.

final _username = RegExp(r'^[a-z0-9_.]{3,30}$');
final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String? validateFirstName(String? v) {
  final s = (v ?? '').trim();
  return s.isEmpty || s.length > 50 ? 'First name is required' : null;
}

String? validateLastName(String? v) {
  final s = (v ?? '').trim();
  return s.isEmpty || s.length > 50 ? 'Last name is required' : null;
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
