import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:menu_macro_fitter/main.dart';
import 'package:menu_macro_fitter/services/api.dart';
import 'package:menu_macro_fitter/theme.dart';

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  setUp(() => useGoogleFonts = false);

  Future<List<http.Request>> pumpApp(WidgetTester tester, Future<http.Response> Function(http.Request) handler) async {
    final sent = <http.Request>[];
    final api = Api(
      ApiClient(
        httpClient: MockClient((r) {
          sent.add(r);
          return handler(r);
        }),
        baseUrl: 'http://test/api',
        tokens: MemoryTokenStore(),
      ),
    );
    await tester.pumpWidget(MenuMacroFitterApp(api: api));
    await tester.pumpAndSettle();
    return sent;
  }

  Future<void> openSignUpAndSubmit(WidgetTester tester, {String username = 'JaneDoe'}) async {
    await tester.tap(find.widgetWithText(TextButton, 'Sign up'));
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Jane');
    await tester.enterText(fields.at(1), 'Doe');
    await tester.enterText(fields.at(2), username);
    await tester.enterText(fields.at(3), 'Jane.Doe@Example.com');
    await tester.enterText(fields.at(4), 'Password123!');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Create account'));
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();
  }

  testWidgets('201 sends lowercased username and email, then shows Check your email', (tester) async {
    final sent = await pumpApp(tester, (r) async => json({'message': 'Verification email sent'}, 201));
    await openSignUpAndSubmit(tester);

    expect(sent.single.url.path, '/api/auth/register');
    expect(jsonDecode(sent.single.body), {
      'firstName': 'Jane',
      'lastName': 'Doe',
      'username': 'janedoe',
      'email': 'jane.doe@example.com',
      'password': 'Password123!',
    });
    expect(find.text('Check your email'), findsOneWidget);
    expect(find.textContaining('jane.doe@example.com', findRichText: true), findsOneWidget);
  });

  testWidgets("409 shows the server's message and stays on Sign up", (tester) async {
    await pumpApp(tester, (r) async => json({'error': 'Email or username already taken'}, 409));
    await openSignUpAndSubmit(tester);

    expect(find.text('Email or username already taken'), findsOneWidget);
    expect(find.text('Create account'), findsWidgets);
    expect(find.text('Check your email'), findsNothing);
  });

  testWidgets('a bad username is caught before any request', (tester) async {
    final sent = await pumpApp(tester, (r) async => json({}));
    await openSignUpAndSubmit(tester, username: 'jd');

    expect(find.text('Username: 3 to 30 letters, numbers, _ or .'), findsOneWidget);
    expect(sent, isEmpty);
  });

  testWidgets("forgot password shows the server's message, not a promise that a link was sent", (tester) async {
    await pumpApp(tester, (r) async => json({'message': 'If that email exists, a reset link was sent'}));
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'nobody@example.com');
    await tester.tap(find.widgetWithText(FilledButton, 'Send reset link'));
    await tester.pumpAndSettle();

    expect(find.text('Check your email'), findsOneWidget);
    expect(find.textContaining('If that email exists, a reset link was sent', findRichText: true), findsOneWidget);
  });
}
