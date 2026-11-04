import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:menu_macro_fitter/main.dart';
import 'package:menu_macro_fitter/models/api_models.dart';
import 'package:menu_macro_fitter/screens/app_shell.dart';
import 'package:menu_macro_fitter/screens/search_screen.dart';
import 'package:menu_macro_fitter/services/api.dart';
import 'package:menu_macro_fitter/services/location.dart';
import 'package:menu_macro_fitter/theme.dart';
import 'package:menu_macro_fitter/units.dart';
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
  'role': 'user',
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
  'preferences': {
    'units': units,
    'searchRadius': 10,
    'recommendationMode': 'protein',
    'mealCalorieLimit': null,
    'trackedNutrients': ['calories', 'protein'],
  },
};

const calories = {
  'age': 20,
  'maintenance': 2058,
  'target': 1558,
  'perMeal': 519,
  'macros': {'proteinG': 136, 'carbsG': 136, 'fatG': 52},
};

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

  Future<void> pumpHome(WidgetTester tester, Map<String, dynamic> user, {Map<String, Object> cal = calories}) async {
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
      await pumpHome(
        tester,
        userJson(),
        cal: const {
          'age': 20,
          'maintenance': 1500,
          'target': 1200,
          'perMeal': 400,
          'macros': {'proteinG': 105, 'carbsG': 105, 'fatG': 40},
        },
      );
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
      server.routes['GET /favorites'] = (_) => {
        'favorites': [
          {'id': 'f2', 'placeId': 'osm-node-2', 'label': 'Chipotle', 'createdAt': '2026-11-01T15:00:00.000Z'},
        ],
      };
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
      expect(server.lastBody('PATCH /users/me/preferences'), {'searchRadius': 20}); // remembered for next time
    });

    testWidgets('Save adds a favorite with the name as its label; Saved removes it', (tester) async {
      await pumpHome(tester, userJson());
      nearbyRoutes();
      server.routes['POST /favorites'] = (r) => json({
        'id': 'f1',
        ...jsonDecode(r.body) as Map<String, dynamic>,
        'createdAt': '2026-11-03T15:00:00.000Z',
      }, 201);
      server.routes['DELETE /favorites/f1'] = (_) => http.Response('', 204);
      await tapText(tester, 'Nearby');
      expect(find.text('Saved'), findsNWidgets(2)); // Chipotle's card, and the tab label
      expect(find.text('Save'), findsNWidgets(3));

      await tapText(tester, 'Save'); // the last card: Chick-fil-A Express
      expect(server.lastBody('POST /favorites'), {'placeId': 'osm-node-4', 'label': 'Chick-fil-A Express'});
      expect(find.text('Save'), findsNWidgets(2));

      await tester.ensureVisible(find.text('Saved').at(1));
      await tester.tap(find.text('Saved').at(1)); // the card just saved, not the tab
      await tester.pumpAndSettle();
      expect(server.to('DELETE /favorites/f1'), hasLength(1));
      expect(find.text('Save'), findsNWidgets(3));
    });

    testWidgets('a screen reader reaches Save as its own button, not the card', (tester) async {
      final semantics = tester.ensureSemantics();
      await pumpHome(tester, userJson());
      nearbyRoutes();
      server.routes['POST /favorites'] = (r) => json({
        'id': 'f1',
        ...jsonDecode(r.body) as Map<String, dynamic>,
        'createdAt': '2026-11-03T15:00:00.000Z',
      }, 201);
      await tapText(tester, 'Nearby');
      tester.semantics.tap(find.semantics.byLabel('Save Chick-fil-A Express'));
      await tester.pumpAndSettle();
      expect(server.to('POST /favorites'), hasLength(1));
      expect(find.text('Best picks'), findsNothing); // the card's tap didn't fire
      expect(find.semantics.byLabel('Save Lazy Moon Pizza'), findsOne); // no picks link, still saveable
      semantics.dispose();
    });

    testWidgets('a full page of results leaves a missing chain unknown, still tappable', (tester) async {
      await pumpHome(tester, userJson());
      tester.view.physicalSize = const Size(600 * 3, 2400 * 3); // the test font is wide: room for "50+ options…"
      nearbyRoutes();
      server.routes['POST /recommendations'] = (r) => recs([
        if ((jsonDecode(r.body) as Map)['chainIds'].length == 2) // the combined count: c1 fills all 50
          for (var i = 0; i < 50; i++) item('a$i', 'c1', 'Item $i')
        else
          item('w', 'c2', 'Wrap'),
      ]);
      await tapText(tester, 'Nearby');
      expect(find.text('50+ options fit your goal'), findsNWidgets(2));
      expect(find.text('Nothing fits your goal'), findsNothing);

      await tapText(tester, 'Chipotle');
      expect(server.lastBody('POST /recommendations'), containsPair('chainIds', ['c2']));
      expect(find.text('Wrap'), findsOneWidget);
    });

    testWidgets('a full page makes every count a lower bound: N+', (tester) async {
      await pumpHome(tester, userJson());
      tester.view.physicalSize = const Size(600 * 3, 2400 * 3); // the test font is wide
      nearbyRoutes();
      server.routes['POST /recommendations'] = (_) => recs([
        for (var i = 0; i < 47; i++) item('a$i', 'c1', 'Item $i'),
        for (var i = 0; i < 3; i++) item('b$i', 'c2', 'Bowl $i'),
      ]);
      await tapText(tester, 'Nearby');
      expect(find.text('47+ options fit your goal'), findsNWidgets(2));
      expect(find.text('3+ options fit your goal'), findsOneWidget);
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

    testWidgets('a busy map service (502) explains itself, and Try again recovers', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['POST /restaurants/nearby'] = (_) => json({'error': 'Places lookup failed'}, 502);
      await tapText(tester, 'Nearby');
      expect(find.textContaining('The map service is busy'), findsOneWidget);
      expect(find.text('Places lookup failed'), findsNothing);

      nearbyRoutes();
      await tapText(tester, 'Try again');
      expect(find.text('Chipotle'), findsOneWidget);
    });

    testWidgets("nginx's own 502 (the API is down) doesn't blame the map service", (tester) async {
      await pumpHome(tester, userJson());
      server.routes['POST /restaurants/nearby'] = (_) =>
          http.Response('<html><center><h1>502 Bad Gateway</h1></center></html>', 502);
      await tapText(tester, 'Nearby');
      expect(find.textContaining('The map service is busy'), findsNothing);
      expect(find.text('Request failed'), findsOneWidget);
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

  group('tracker', () {
    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final monday = addDays(today, 1 - today.weekday);

    Map<String, Object> totals(num calories, num p, num c, num f, {bool incomplete = false}) => {
      'calories': calories,
      'proteinG': p,
      'carbsG': c,
      'fatG': f,
      'incomplete': incomplete,
    };
    final zero = totals(0, 0, 0, 0);

    Map<String, Object?> log(String id, String name, {String status = 'eaten', num servings = 1, num? f = 10}) => {
      'id': id,
      'date': ymd(today),
      'status': status,
      'menuItemId': 'm-$id',
      'name': name,
      'chainName': 'Chick-fil-A',
      'servings': servings,
      'calories': 300,
      'proteinG': 30,
      'carbsG': 20,
      'fatG': f,
      'source': 'search',
      'createdAt': '2026-11-04T12:00:00.000Z',
    };

    // Saves trackedNutrients and answers with the user that has them.
    void prefsRoute() => server.routes['PATCH /users/me/preferences'] = (r) {
      final u = userJson();
      (u['preferences'] as Map)['trackedNutrients'] = (jsonDecode(r.body) as Map)['trackedNutrients'];
      return u;
    };

    // One day, or a week of days when the request asks for one; [days] fills them in order.
    void logRoutes({
      List<Map<String, Object?>> entries = const [],
      List<(Map<String, Object>, Map<String, Object>)>? days,
    }) {
      server.routes['GET /meal-logs'] = (r) {
        final from = DateTime.parse(r.url.queryParameters['from']!);
        final to = DateTime.parse(r.url.queryParameters['to']!);
        final n = to.difference(from).inDays + 1;
        return {
          'entries': entries,
          'days': [
            for (var i = 0; i < n; i++)
              {
                'date': ymd(addDays(from, i)),
                'eaten': (days != null && i < days.length) ? days[i].$1 : zero,
                'planned': (days != null && i < days.length) ? days[i].$2 : zero,
              },
          ],
        };
      };
    }

    testWidgets('bars only for the tracked nutrients, and a chip changes which', (tester) async {
      await pumpHome(tester, userJson());
      logRoutes(days: [(totals(600, 45, 50, 20), totals(400, 30, 30, 10))]);
      prefsRoute();
      await tapText(tester, 'Tracker');

      expect(server.to('GET /meal-logs').single.url.queryParameters, {'from': ymd(today), 'to': ymd(today)});
      expect(find.text('600 cal / 1,558 cal'), findsOneWidget);
      expect(find.text('+400 cal planned'), findsOneWidget);
      expect(find.text('45 g / 136 g'), findsOneWidget);
      expect(find.text('50 g / 136 g'), findsNothing); // carbs aren't tracked

      await tester.tap(find.widgetWithText(FilterChip, 'Protein'));
      await tester.pumpAndSettle();
      expect(server.lastBody('PATCH /users/me/preferences'), {
        'trackedNutrients': ['calories'],
      });
      expect(find.text('45 g / 136 g'), findsNothing);

      await tester.tap(find.widgetWithText(FilterChip, 'Carbs'));
      await tester.pumpAndSettle();
      expect(server.lastBody('PATCH /users/me/preferences'), {
        'trackedNutrients': ['calories', 'carbs'],
      });
      expect(find.text('50 g / 136 g'), findsOneWidget);
      expect(server.to('POST /restaurants/nearby'), isEmpty); // other tabs didn't reload for it
    });

    testWidgets('a week sums its days against the daily goal x 7', (tester) async {
      await pumpHome(tester, userJson());
      logRoutes(
        entries: [log('l1', 'Side Salad', f: null)], // its fat is unknown, so only fat reads "at least"
        days: [(totals(600, 45, 50, 20), zero), (totals(900, 45, 80, 30, incomplete: true), zero)],
      );
      prefsRoute();
      await tapText(tester, 'Tracker');
      await tapText(tester, 'Week');

      expect(server.to('GET /meal-logs').last.url.queryParameters, {
        'from': ymd(monday),
        'to': ymd(addDays(monday, 6)),
      });
      expect(find.text('1,500 cal / 10,906 cal'), findsOneWidget);
      expect(find.text('90 g / 952 g'), findsOneWidget); // protein is known in every entry: no "at least"

      await tester.tap(find.widgetWithText(FilterChip, 'Fat'));
      await tester.pumpAndSettle();
      expect(find.text('at least 50 g / 364 g'), findsOneWidget);
    });

    testWidgets('Ate it marks a planned entry eaten; Remove deletes one', (tester) async {
      await pumpHome(tester, userJson());
      logRoutes(
        entries: [
          log('l1', 'Grilled Nuggets', status: 'planned'),
          log('l2', 'Side Salad', servings: 1.5),
        ],
      );
      server.routes['PATCH /meal-logs/l1'] = (_) => log('l1', 'Grilled Nuggets');
      server.routes['DELETE /meal-logs/l2'] = (_) => http.Response('', 204);
      await tapText(tester, 'Tracker');
      expect(find.text('Chick-fil-A · 1 serving · planned'), findsOneWidget);
      expect(find.text('450 cal'), findsOneWidget); // 300 x 1.5

      await tapText(tester, 'Ate it');
      expect(server.lastBody('PATCH /meal-logs/l1'), {'status': 'eaten'});

      await tester.tap(find.byTooltip('Remove Side Salad'));
      await tester.pumpAndSettle();
      expect(server.to('DELETE /meal-logs/l2'), hasLength(1));
      expect(server.to('GET /meal-logs'), hasLength(3)); // reloaded after each
    });

    testWidgets('Add food searches as you type and logs the item with its servings to the day shown', (tester) async {
      await pumpHome(tester, userJson());
      logRoutes();
      server.routes['GET /menu-items/search'] = (_) => {
        'items': [item('i1', 'c1', 'Grilled Nuggets')],
        'total': 1,
        'limit': 20,
        'skip': 0,
      };
      server.routes['POST /meal-logs'] = (_) => json({
        'entries': [log('l9', 'Grilled Nuggets', servings: 1.5)],
      }, 201);
      await tapText(tester, 'Tracker');
      await tapText(tester, 'Add food');
      await tester.enterText(find.byType(TextField), 'nuggets');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tapText(tester, 'Grilled Nuggets');
      await tester.tap(find.byTooltip('More servings'));
      await tester.pumpAndSettle();
      expect(find.text('1.5 servings'), findsOneWidget);
      await tapText(tester, 'Add');

      expect(server.lastBody('POST /meal-logs'), {
        'entries': [
          {'date': ymd(today), 'servings': 1.5, 'source': 'search', 'menuItemId': 'i1'},
        ],
      });
      expect(find.text('Add food'), findsOneWidget); // the sheet closed: only the button is left
      expect(server.to('GET /meal-logs'), hasLength(2));
    });
  });

  group('saved', () {
    testWidgets('lists favorites by label and removes one', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['GET /favorites'] = (_) => {
        'favorites': [
          {'id': 'f1', 'placeId': 'osm-node-1', 'label': 'Chick-fil-A', 'createdAt': '2026-11-03T15:00:00.000Z'},
          {'id': 'f2', 'placeId': 'osm-node-2', 'label': null, 'createdAt': '2026-10-28T15:00:00.000Z'},
        ],
      };
      server.routes['DELETE /favorites/f1'] = (_) => http.Response('', 204);
      await tapText(tester, 'Saved');
      expect(find.text('Chick-fil-A'), findsOneWidget);
      expect(find.text('Saved Nov 3, 2026'), findsOneWidget);
      expect(find.text('Saved restaurant'), findsOneWidget); // no label

      final semantics = tester.ensureSemantics();
      tester.semantics.tap(find.semantics.byLabel('Remove Chick-fil-A')); // as a screen reader would
      await tester.pumpAndSettle();
      expect(server.to('DELETE /favorites/f1'), hasLength(1));
      expect(find.text('Chick-fil-A'), findsNothing);
      semantics.dispose();
    });

    testWidgets('empty: points to Nearby, and reloads each time the tab opens', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['GET /favorites'] = (_) => {'favorites': <Object>[]};
      await tapText(tester, 'Saved');
      expect(find.text('Nothing saved yet'), findsOneWidget);
      await tapText(tester, 'Search');
      await tapText(tester, 'Saved');
      expect(server.to('GET /favorites'), hasLength(2));

      server.routes['POST /restaurants/nearby'] = (_) => {'restaurants': <Object>[]};
      await tapText(tester, 'Find restaurants near me');
      expect(find.text('No restaurants found'), findsOneWidget);
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

    testWidgets('updates as you type, after a short pause, and never sends a query the server would reject', (
      tester,
    ) async {
      await pumpHome(tester, userJson());
      server.routes['GET /menu-items/search'] = (r) => {
        'items': [item('i1', 'c1', 'Chicken Wrap')],
        'total': 1,
        'limit': 20,
        'skip': 0,
      };
      await tapText(tester, 'Search');
      await tester.enterText(find.byType(TextField), 'ch');
      await tester.enterText(find.byType(TextField), 'chi');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      expect(server.to('GET /menu-items/search').single.url.queryParameters['q'], 'chi'); // one request, not two
      expect(find.text('1 result for "chi"'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'ø');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      expect(server.to('GET /menu-items/search'), hasLength(1));
      expect(find.textContaining('Search every restaurant'), findsOneWidget);
    });

    testWidgets('Show more during the typing pause still searches the newer query', (tester) async {
      await pumpHome(tester, userJson());
      server.routes['GET /menu-items/search'] = (r) {
        final q = r.url.queryParameters['q']!;
        final skip = int.parse(r.url.queryParameters['skip']!);
        return {
          'items': [for (var i = skip; i < skip + 20 && i < 25; i++) item('$q$i', 'c1', '$q $i')],
          'total': 25,
          'limit': 20,
          'skip': skip,
        };
      };
      await tapText(tester, 'Search');
      await tester.enterText(find.byType(TextField), 'chi');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'chicken');
      await tester.pump(const Duration(milliseconds: 50));
      await tester.scrollUntilVisible(find.text('Show more'), 500, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.text('Show more'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      final sent = [for (final r in server.to('GET /menu-items/search')) r.url.queryParameters['q']];
      expect(sent.last, 'chicken');
      expect(find.textContaining('chicken '), findsWidgets); // its results replaced the older query's
      expect(find.textContaining('chi '), findsNothing);
    });

    test('searchable follows the server normalize()', () {
      for (final q in ['chicken', 'Café', '&', '7up', 'K']) {
        expect(searchable(q), isTrue, reason: q);
      }
      for (final q in ['', '  ', 'ø', '鸡', '!!', "'"]) {
        expect(searchable(q), isFalse, reason: q);
      }
    });
  });
}
