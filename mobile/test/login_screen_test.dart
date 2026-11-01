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

  Future<void> fillAndSubmit(WidgetTester tester, String email) async {
    await tester.enterText(find.byType(TextFormField).at(0), email);
    await tester.enterText(find.byType(TextFormField).at(1), 'Password123!');
    await tester.tap(find.widgetWithText(FilledButton, 'Log in'));
    await tester.pumpAndSettle();
  }

  testWidgets('opens on Log in with one Email or username field', (tester) async {
    await pumpApp(tester, (r) async => json({}));
    expect(find.text('Log in'), findsWidgets);
    expect(find.text('Email or username'), findsOneWidget);
  });

  testWidgets('a bad email or username is caught before any request', (tester) async {
    final sent = await pumpApp(tester, (r) async => json({}));
    await fillAndSubmit(tester, 'jane@'); // has "@": checked as an email
    expect(find.text('Email: enter a valid address'), findsOneWidget);
    await fillAndSubmit(tester, 'jd'); // no "@": checked as a username
    expect(find.text('Username: 3 to 30 letters, numbers, _ or .'), findsOneWidget);
    await fillAndSubmit(tester, '');
    expect(find.text('Email or username is required'), findsOneWidget);
    expect(sent, isEmpty);
  });

  testWidgets('logs in with a username, sent as login', (tester) async {
    final sent = await pumpApp(tester, (r) async => json({'error': 'Invalid email/username or password'}, 401));
    await fillAndSubmit(tester, 'JaneDoe');
    expect(jsonDecode(sent.single.body), {'login': 'janedoe', 'password': 'Password123!'});
    expect(find.text('Invalid email/username or password'), findsOneWidget);
  });

  testWidgets('401 shows the server message', (tester) async {
    await pumpApp(tester, (r) async => json({'error': 'Invalid email or password'}, 401));
    await fillAndSubmit(tester, 'jane.doe@example.com');
    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(find.text('Resend verification email'), findsNothing);
  });

  testWidgets('coming back from Sign up clears the old error and password', (tester) async {
    await pumpApp(tester, (r) async => json({'error': 'Invalid email or password'}, 401));
    await fillAndSubmit(tester, 'jane.doe@example.com');
    expect(find.text('Invalid email or password'), findsOneWidget);

    await tester.tap(find.text('Sign up'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Invalid email or password'), findsNothing);
    expect(tester.widget<EditableText>(find.byType(EditableText).at(1)).controller.text, isEmpty);
  });

  testWidgets('a 403 that is not from the API (empty body) shows no Resend', (tester) async {
    // Seen for real: macOS AirPlay Receiver answers on port 5000 with an empty 403.
    await pumpApp(tester, (r) async => http.Response('', 403));
    await fillAndSubmit(tester, 'jane.doe@example.com');
    expect(find.text('Request failed'), findsOneWidget);
    expect(find.text('Resend verification email'), findsNothing);
  });

  testWidgets('403 offers Resend, which calls resend-verification with the typed email', (tester) async {
    final sent = await pumpApp(
      tester,
      (r) async => r.url.path.endsWith('/auth/login')
          ? json({'error': 'Email not verified'}, 403)
          : json({'message': 'If that email exists, a verification link was sent'}),
    );
    await fillAndSubmit(tester, 'Alex.Kim@Example.com');
    expect(find.text('Email not verified'), findsOneWidget);

    await tester.tap(find.text('Resend verification email'));
    await tester.pumpAndSettle();
    expect(sent.last.url.path, '/api/auth/resend-verification');
    expect(jsonDecode(sent.last.body), {'login': 'alex.kim@example.com'});
    expect(find.text('If that email exists, a verification link was sent'), findsOneWidget);
  });

  testWidgets('success goes to home; a null profile points at profile setup', (tester) async {
    await pumpApp(
      tester,
      (r) async => json({
        'token': 'jwt',
        'user': {
          'id': 'u1',
          'firstName': 'Sam',
          'lastName': 'Patel',
          'username': 'sampatel',
          'email': 'sam.patel@example.com',
          'isVerified': true,
          'profile': null,
          'preferences': {
            'units': 'imperial',
            'searchRadius': 5,
            'recommendationMode': 'protein',
            'mealCalorieLimit': null,
          },
        },
      }),
    );
    await fillAndSubmit(tester, 'sam.patel@example.com');
    expect(find.text('Hi, Sam'), findsOneWidget);
    expect(find.textContaining('set up your profile'), findsOneWidget);
  });
}
