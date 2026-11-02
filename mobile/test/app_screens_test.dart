import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:menu_macro_fitter/main.dart';
import 'package:menu_macro_fitter/models/api_models.dart';
import 'package:menu_macro_fitter/screens/app_shell.dart';
import 'package:menu_macro_fitter/services/api.dart';
import 'package:menu_macro_fitter/services/location.dart';
import 'package:menu_macro_fitter/theme.dart';
import 'package:menu_macro_fitter/widgets/api_scope.dart';

// #35 screens against a fake server: routes are "METHOD /path" without the /api prefix.

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> userJson({bool profile = true, String units = 'imperial'}) => {
  'id': 'u1',
  'firstName': 'Jane',
  'lastName': 'Doe',
  'username': 'janedoe',
  'email': 'jane.doe@example.com',
  'isVerified': true,
  'profile': profile
      ? {
          'heightIn': 65,
          'weightLb': 160,
          'birthDate': '2006-03-14',
          'sex': 'female',
          'activityLevel': 'light',
          'goal': 'lose',
        }
      : null,
  'preferences': {'units': units, 'searchRadius': 10, 'recommendationMode': 'protein', 'mealCalorieLimit': null},
};

const calories = {'age': 20, 'maintenance': 2058, 'target': 1558, 'perMeal': 519};

Map<String, dynamic> item(String id, String chainId, String name, {num? p = 30, num? c = 20, num? f = 10}) => {
  'id': id,
  'chainId': chainId,
  'chainName': 'Chain $chainId',
  'name': name,
  'category': 'entree',
  'calories': 400,
  'proteinG': p,
  'carbsG': c,
  'fatG': f,
  'isEstimate': false,
  'score': 7.5,
};

Map<String, dynamic> recs(List<Map<String, dynamic>> items, {String mode = 'protein'}) => {
  'mode': mode,
  'mealCalorieLimit': 519,
  'items': items,
};

class FakeServer {
  final sent = <http.Request>[];
  final routes = <String, Object Function(http.Request)>{};

  Future<http.Response> handle(http.Request r) async {
    sent.add(r);
    final key = '${r.method} ${r.url.path.replaceFirst('/api', '')}';
    final route = routes[key];
    if (route == null) return json({'error': 'no route for $key'}, 404);
    final out = route(r);
    return out is http.Response ? out : json(out);
  }

  List<http.Request> to(String key) => [
    for (final r in sent)
      if ('${r.method} ${r.url.path.replaceFirst('/api', '')}' == key) r,
  ];

  Map<String, dynamic> lastBody(String key) => jsonDecode(to(key).last.body) as Map<String, dynamic>;
}

class FakeLocation implements LocationSource {
  LatLng here = const LatLng(28.6, -81.2);
  LocationProblem? problem;
  int calls = 0;
  final opened = <LocationProblem>[];

  @override
  Future<LatLng> current() async {
    calls++;
    if (problem != null) throw LocationException(problem!);
    return here;
  }

  @override
  Future<void> openSettings(LocationProblem p) async => opened.add(p);
}

void main() {
  setUp(() => useGoogleFonts = false);

  late FakeServer server;
  late FakeLocation location;

  Future<void> pumpHome(WidgetTester tester, Map<String, dynamic> user, {Map<String, int> cal = calories}) async {
    // A tall phone, so the lists build every card (ListView skips what's far off screen).
    tester.view.physicalSize = const Size(412 * 3, 2400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    server = FakeServer();
    location = FakeLocation();
    server.routes['GET /users/me/calories'] = (_) => cal;
    final api = Api(
      ApiClient(httpClient: MockClient(server.handle), baseUrl: 'http://test/api', tokens: MemoryTokenStore()),
    );
    await tester.pumpWidget(
      ApiScope(
        api: api,
        location: location,
        child: MaterialApp(theme: buildTheme(), home: homeFor(User.fromJson(user))),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapText(WidgetTester tester, String text) async {
    await tester.ensureVisible(find.text(text).last);
    await tester.tap(find.text(text).last);
    await tester.pumpAndSettle();
  }

  group('profile', () {
    testWidgets('no profile yet: setup comes first, and an empty form sends nothing', (tester) async {
      await pumpHome(tester, userJson(profile: false));
      expect(find.text('Set up your profile'), findsOneWidget);
      expect(find.text('Nearby'), findsNothing); // no tabs until there's a profile

      await tapText(tester, 'See my targets');
      for (final msg in [
        'Height: 3 ft to 8 ft',
        'Weight: 50 to 700 lb',
        'Birth date is required',
        'Sex: choose one',
        'Activity level: choose one',
        'Goal: choose one',
      ]) {
        expect(find.text(msg), findsOneWidget, reason: msg);
      }
      expect(server.sent, isEmpty);
    });

    testWidgets('setup sends feet and inches as inches, then shows Your targets', (tester) async {
      await pumpHome(tester, userJson(profile: false));
      server.routes['PUT /users/me/profile'] = (_) => userJson();
      final boxes = find.byType(TextField);
      await tester.enterText(boxes.at(0), '5');
      await tester.enterText(boxes.at(1), '5');
      await tester.enterText(boxes.at(2), '160');
      await tapText(tester, 'Choose your birth date');
      await tapText(tester, 'OK'); // the picker opens 25 years back
      await tapText(tester, 'Female');
      await tester.tap(find.byType(DropdownButtonFormField<ActivityLevel>));
      await tester.pumpAndSettle();
      await tapText(tester, 'Light: exercise 1 to 3 days a week');
      await tapText(tester, 'Lose');
      await tapText(tester, 'See my targets');

      final body = server.lastBody('PUT /users/me/profile');
      expect(body, containsPair('heightIn', 65));
      expect(body, containsPair('weightLb', 160));
      expect(body, containsPair('sex', 'female'));
      expect(body, containsPair('activityLevel', 'light'));
      expect(body, containsPair('goal', 'lose'));
      expect(body['birthDate'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
      expect(server.to('PATCH /users/me/preferences'), isEmpty); // units didn't change
      expect(find.text('Your targets'), findsOneWidget);
      expect(find.text('1,558'), findsOneWidget);
    });

    testWidgets('edit: switching to metric keeps the stored numbers exact and saves the units', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['PUT /users/me/profile'] = (_) => userJson();
      server.routes['PATCH /users/me/preferences'] = (_) => userJson(units: 'metric');
      await tapText(tester, 'Edit');
      await tapText(tester, 'cm / kg');
      final boxes = find.byType(TextField);
      expect(tester.widget<TextField>(boxes.at(0)).controller!.text, '165');
      expect(tester.widget<TextField>(boxes.at(1)).controller!.text, '72.6');
      await tapText(tester, 'Save');

      final body = server.lastBody('PUT /users/me/profile');
      expect(body['heightIn'], 65); // not 65 -> 165 cm -> 64.96
      expect(body['weightLb'], 160); // not 72.6 kg -> 160.1 lb
      expect(server.lastBody('PATCH /users/me/preferences'), {'units': 'metric'});
      expect(find.text('Your targets'), findsOneWidget);
      expect(find.text('165 cm'), findsOneWidget);
      expect(server.to('GET /users/me/calories'), hasLength(2)); // reloaded after the edit
    });
  });

  group('targets', () {
    testWidgets('shows maintenance, target and per meal from the API', (tester) async {
      await pumpHome(tester, userJson());
      for (final text in ['2,058', '1,558', '519', 'cal a day to lose about 1 lb a week', '5 ft 5 in', 'Light']) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
    });

    testWidgets('says when the floor raised the target', (tester) async {
      await pumpHome(tester, userJson(), cal: const {'age': 20, 'maintenance': 1500, 'target': 1200, 'perMeal': 400});
      expect(find.text('cal a day, raised to the 1,200 cal minimum'), findsOneWidget);
    });
  });

  group('picks', () {
    testWidgets('the top third are Great fit, and High carb asks again', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['POST /recommendations'] = (r) => recs([
        item('a', 'c1', 'Tenders'),
        item('b', 'c1', 'Salad', f: null), // unknown fat
        item('c', 'c2', 'Wrap'),
        item('d', 'c2', 'Bowl'),
      ], mode: (jsonDecode(r.body) as Map)['mode'] as String);
      await tapText(tester, 'Picks');

      expect(server.lastBody('POST /recommendations'), {'mode': 'protein'});
      expect(find.text('Each under 519 cal, ranked by protein per calorie.'), findsOneWidget);
      expect(find.text('Great fit'), findsNWidgets(2)); // ceil(4 / 3)
      expect(find.text('OK'), findsNWidgets(2));
      expect(find.text('7.5 g protein per 100 cal'), findsNWidgets(4));
      expect(find.text('F ?'), findsOneWidget); // unknown fat, not 0

      await tapText(tester, 'High carb');
      expect(server.lastBody('POST /recommendations'), {'mode': 'carb'});
      expect(find.text('7.5 g carbs per 100 cal'), findsNWidgets(4));
    });
  });

  group('nearby', () {
    void nearbyRoutes() {
      server.routes['POST /restaurants/nearby'] = (_) => {
        'restaurants': [
          {
            'placeId': 'osm-node-1',
            'name': 'Chick-fil-A',
            'address': '12100 Collegiate Way',
            'distanceMiles': 0.4,
            'chainId': 'c1',
          },
          {'placeId': 'osm-node-2', 'name': 'Chipotle', 'address': null, 'distanceMiles': 0.6, 'chainId': 'c2'},
          {'placeId': 'osm-node-3', 'name': 'Lazy Moon Pizza', 'address': null, 'distanceMiles': 1.1, 'chainId': null},
          {
            'placeId': 'osm-node-4',
            'name': 'Chick-fil-A Express',
            'address': null,
            'distanceMiles': 1.5,
            'chainId': 'c1',
          },
        ],
      };
      server.routes['POST /recommendations'] = (_) => recs([item('a', 'c1', 'Tenders'), item('b', 'c1', 'Nuggets')]);
    }

    testWidgets('one recommendations call counts what fits at each restaurant', (tester) async {
      await pumpHome(tester, userJson());
      nearbyRoutes();
      await tapText(tester, 'Nearby');

      expect(server.lastBody('POST /restaurants/nearby'), {'lat': 28.6, 'lng': -81.2, 'radiusMiles': 10});
      expect(server.to('POST /recommendations'), hasLength(1));
      expect(server.lastBody('POST /recommendations'), {
        'chainIds': ['c1', 'c2'], // each chain once, no nulls
        'limit': 50,
      });
      expect(find.text('2 options fit your goal'), findsNWidgets(2));
      expect(find.text('Nothing fits your goal'), findsOneWidget);
      expect(find.text('No nutrition data'), findsOneWidget);
      expect(find.text('0.4 mi'), findsOneWidget);
      expect(find.text('12100 Collegiate Way'), findsOneWidget);
    });

    testWidgets('a restaurant opens its own best picks; a new radius reuses the location', (tester) async {
      await pumpHome(tester, userJson());
      nearbyRoutes();
      await tapText(tester, 'Nearby');
      await tapText(tester, 'Chick-fil-A');
      expect(find.text('Chick-fil-A'), findsOneWidget); // the picks title
      expect(server.lastBody('POST /recommendations'), {
        'mode': 'protein',
        'chainIds': ['c1'],
      });

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tapText(tester, '20 mi');
      expect(server.lastBody('POST /restaurants/nearby'), containsPair('radiusMiles', 20));
      expect(location.calls, 1);
    });

    testWidgets('a full page of results leaves a missing chain unknown, still tappable', (tester) async {
      await pumpHome(tester, userJson());
      tester.view.physicalSize = const Size(600 * 3, 2400 * 3); // the test font is wide: room for "50 options…"
      nearbyRoutes();
      server.routes['POST /recommendations'] = (r) => recs([
        if ((jsonDecode(r.body) as Map)['chainIds'].length == 2) // the combined count: c1 fills all 50
          for (var i = 0; i < 50; i++) item('a$i', 'c1', 'Item $i')
        else
          item('w', 'c2', 'Wrap'),
      ]);
      await tapText(tester, 'Nearby');
      expect(find.text('50 options fit your goal'), findsNWidgets(2));
      expect(find.text('Nothing fits your goal'), findsNothing);

      await tapText(tester, 'Chipotle');
      expect(server.lastBody('POST /recommendations'), containsPair('chainIds', ['c2']));
      expect(find.text('Wrap'), findsOneWidget);
    });

    testWidgets('without permission it explains why and asks again on tap', (tester) async {
      await pumpHome(tester, userJson());
      nearbyRoutes();
      location.problem = LocationProblem.denied;
      await tapText(tester, 'Nearby');
      expect(find.textContaining('uses your location only to find restaurants near you'), findsOneWidget);
      expect(server.to('POST /restaurants/nearby'), isEmpty);

      location.problem = null; // the user allows it this time
      await tester.tap(find.widgetWithText(FilledButton, 'Allow location'));
      await tester.pumpAndSettle();
      expect(find.text('Chipotle'), findsOneWidget);
    });

    testWidgets('blocked: offers the app settings', (tester) async {
      await pumpHome(tester, userJson());
      location.problem = LocationProblem.blocked;
      await tapText(tester, 'Nearby');
      expect(find.text('Location is blocked'), findsOneWidget);
      await tapText(tester, 'Open settings');
      expect(location.opened, [LocationProblem.blocked]);
    });
  });

  testWidgets('a 401 mid-session forgets the token and goes back to Log in', (tester) async {
    server = FakeServer();
    server.routes['GET /users/me'] = (_) => userJson();
    server.routes['GET /users/me/calories'] = (_) => json({'error': 'Invalid or expired session'}, 401);
    final tokens = MemoryTokenStore()..token = 'old';
    await tester.pumpWidget(
      MenuMacroFitterApp(
        api: Api(ApiClient(httpClient: MockClient(server.handle), baseUrl: 'http://test/api', tokens: tokens)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your session expired. Log in again.'), findsOneWidget);
    expect(find.text('Email or username'), findsOneWidget);
    expect(find.text('Your targets'), findsNothing);
    expect(tokens.token, isNull);
  });

  group('search', () {
    testWidgets('searches by name, pages with Show more, and shows no fit pill', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['GET /menu-items/search'] = (r) {
        final skip = int.parse(r.url.queryParameters['skip']!);
        return {
          'items': skip == 0
              ? [for (var i = 0; i < 20; i++) item('i$i', 'c1', 'Chicken $i')]
              : [item('i20', 'c1', 'Mystery Chicken', p: null, c: null, f: null)],
          'total': 21,
          'limit': 20,
          'skip': skip,
        };
      };
      await tapText(tester, 'Search');
      await tester.enterText(find.byType(TextField), 'chicken');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();

      final first = server.to('GET /menu-items/search').single.url.queryParameters;
      expect(first, {'q': 'chicken', 'limit': '20', 'skip': '0'});
      expect(find.text('21 results for "chicken"'), findsOneWidget);
      expect(find.text('Great fit'), findsNothing);

      await tester.scrollUntilVisible(find.text('Show more'), 500, scrollable: find.byType(Scrollable).first);
      await tapText(tester, 'Show more');
      expect(server.to('GET /menu-items/search').last.url.queryParameters['skip'], '20');
      await tester.scrollUntilVisible(find.text('Mystery Chicken'), 300);
      expect(find.text('Macros unknown'), findsOneWidget);
      expect(find.text('Show more'), findsNothing);
    });
  });
}
