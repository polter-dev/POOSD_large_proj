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
}
