import 'package:flutter_test/flutter_test.dart';
import 'package:menu_macro_fitter/validators.dart';

void main() {
  test('username follows the server rule after lowercasing', () {
    expect(validateUsername('janedoe'), isNull);
    expect(validateUsername('Jane.Doe_1'), isNull); // lowercased first
    expect(validateUsername('jd'), isNotNull); // too short
    expect(validateUsername('a' * 31), isNotNull); // too long
    expect(validateUsername('jane doe'), isNotNull); // space
    expect(validateUsername('jane-doe'), isNotNull); // dash isn't allowed
  });

  test('email', () {
    expect(validateEmail(' Jane.Doe@Example.com '), isNull);
    expect(validateEmail('jane@'), isNotNull);
    expect(validateEmail('jane@example'), isNotNull);
    expect(validateEmail('${'a' * 250}@x.co'), isNotNull); // over 254
  });

  test('login takes an email or a username, told apart by "@"', () {
    expect(validateLogin(' Jane.Doe@Example.com '), isNull);
    expect(validateLogin('JaneDoe'), isNull);
    expect(validateLogin(''), 'Email or username is required');
    expect(validateLogin('jane@'), 'Email: enter a valid address');
    expect(validateLogin('jd'), 'Username: 3 to 30 letters, numbers, _ or .');
  });

  test('password needs 8 characters', () {
    expect(validatePassword('Password'), isNull);
    expect(validatePassword('Passwor'), isNotNull);
  });

  test('names are 1 to 50 characters', () {
    expect(validateFirstName('Jane'), isNull);
    expect(validateFirstName('   '), 'First name is required');
    expect(validateFirstName('a' * 50), isNull);
    expect(validateLastName('a' * 51), 'Last name: 50 characters max');
  });

  test('birth date: a real date, 18 to 119 (same as the server)', () {
    final now = DateTime.utc(2026, 11, 1);
    expect(validateBirthDate('2006-03-14', now: now), isNull);
    expect(validateBirthDate('2008-11-01', now: now), isNull); // 18 today
    expect(validateBirthDate('2008-11-02', now: now), 'Birth date: you must be 18 or older');
    expect(validateBirthDate('1900-01-01', now: now), 'Birth date: check the year');
    expect(validateBirthDate('2006-02-30', now: now), 'Birth date is required'); // not a real day
    expect(validateBirthDate(null, now: now), 'Birth date is required');
  });

  test('height and weight ranges, with metric messages', () {
    expect(validateFeetInches('5', '5'), isNull);
    expect(validateFeetInches('5', ''), isNull); // inches optional
    expect(validateFeetInches('5.5', '0'), 'Height: feet must be a whole number');
    expect(validateFeetInches('5', '12'), 'Height: inches must be 0 to 11');
    expect(validateHeight(65, metric: false), isNull);
    expect(validateHeight(35, metric: false), 'Height: 3 ft to 8 ft');
    expect(validateHeight(null, metric: true), 'Height: 92 to 243 cm');
    expect(validateWeight(160, metric: false), isNull);
    expect(validateWeight(701, metric: false), 'Weight: 50 to 700 lb');
    expect(validateWeight(20, metric: true), 'Weight: 23 to 317 kg');
    expect(parseNumber(' 5.5 '), 5.5);
    expect(parseNumber('Infinity'), isNull);
  });
}
