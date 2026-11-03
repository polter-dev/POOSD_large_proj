import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:menu_macro_fitter/models/api_models.dart';
import 'package:menu_macro_fitter/services/api.dart';

// Seed user janedoe as GET /users/me would return her (docs/api-contract.md, User).
final janeJson = {
  'id': '64b000000000000000000001',
  'firstName': 'Jane',
  'lastName': 'Doe',
  'username': 'janedoe',
  'email': 'jane.doe@example.com',
  'isVerified': true,
  'role': 'user',
  'profile': {
    'heightIn': 65,
    'weightLb': 160,
    'birthDate': '2006-03-14',
    'sex': 'female',
    'activityLevel': 'very_active',
    'goal': 'lose',
  },
  'preferences': {
    'units': 'imperial',
    'searchRadius': 5,
    'recommendationMode': 'carb',
    'mealCalorieLimit': null,
    'trackedNutrients': ['calories', 'protein', 'carbs'],
  },
};

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  late List<http.Request> sent;
  late MemoryTokenStore tokens;

  Api apiWith(Future<http.Response> Function(http.Request r) handler) {
    sent = [];
    tokens = MemoryTokenStore();
    final client = MockClient((r) {
      sent.add(r);
      return handler(r);
    });
    return Api(ApiClient(httpClient: client, baseUrl: 'http://test/api', tokens: tokens));
  }

  test('login stores the token and later calls send it', () async {
    final api = apiWith(
      (r) async => r.url.path.endsWith('/auth/login') ? json({'token': 'jwt-123', 'user': janeJson}) : json(janeJson),
    );

    final res = await api.login(login: 'jane.doe@example.com', password: 'Password123!');
    expect(res.user.username, 'janedoe');
    expect(tokens.token, 'jwt-123');
    expect(jsonDecode(sent[0].body), {'login': 'jane.doe@example.com', 'password': 'Password123!'});
    expect(sent[0].headers['Content-Type'], startsWith('application/json'));
    expect(sent[0].headers.containsKey('Authorization'), isFalse);

    await api.getMe();
    expect(sent[1].method, 'GET');
    expect(sent[1].headers['Authorization'], 'Bearer jwt-123');
    expect(sent[1].headers.containsKey('Content-Type'), isFalse); // no body, no content type
  });

  test('User parses enums, nullable profile and very_active', () async {
    final api = apiWith((r) async => json(janeJson));
    final u = await api.getMe();
    expect(u.profile!.activityLevel, ActivityLevel.veryActive);
    expect(u.profile!.sex, Sex.female);
    expect(u.preferences.recommendationMode, RecommendationMode.carb);
    expect(u.preferences.mealCalorieLimit, isNull);
    expect(u.profile!.toJson()['activityLevel'], 'very_active');
    expect(u.role, UserRole.user);
    expect(u.preferences.trackedNutrients, [Nutrient.calories, Nutrient.protein, Nutrient.carbs]);

    final admin = apiWith((r) async => json({...janeJson, 'role': 'admin'}));
    expect((await admin.getMe()).role, UserRole.admin);

    final noProfile = apiWith((r) async => json({...janeJson, 'profile': null}));
    expect((await noProfile.getMe()).profile, isNull);
  });

  test("server errors become ApiError with the server's message", () async {
    final api = apiWith((r) async => json({'error': 'Email not verified'}, 403));
    await expectLater(
      api.login(login: 'alex.kim@example.com', password: 'Password123!'),
      throwsA(
        isA<ApiError>()
            .having((e) => e.status, 'status', 403)
            .having((e) => e.message, 'message', 'Email not verified'),
      ),
    );
    expect(tokens.token, isNull);
  });

  test('non-JSON error page falls back to "Request failed"', () async {
    final api = apiWith((r) async => http.Response('<html>502 Bad Gateway</html>', 502));
    await expectLater(api.getMe(), throwsA(isA<ApiError>().having((e) => e.message, 'message', 'Request failed')));
  });

  test('no response becomes status 0 with a readable message', () async {
    final api = apiWith((r) async => throw http.ClientException('connection refused'));
    await expectLater(
      api.getMe(),
      throwsA(
        isA<ApiError>()
            .having((e) => e.status, 'status', 0)
            .having((e) => e.message, 'message', contains("Can't reach")),
      ),
    );
  });

  test('search builds its query; macros can be null', () async {
    final api = apiWith(
      (r) async => json({
        'items': [
          {
            'id': '1',
            'chainId': 'c1',
            'chainName': 'Chipotle',
            'name': 'Chicken Burrito Bowl',
            'category': 'entree',
            'calories': 520,
            'proteinG': 44,
            'carbsG': 62,
            'fatG': null,
            'isEstimate': false,
          },
        ],
        'total': 1,
        'limit': 20,
        'skip': 0,
      }),
    );
    final res = await api.searchMenuItems('chicken & rice');
    expect(sent.single.url.queryParameters, {'q': 'chicken & rice', 'limit': '20', 'skip': '0'});
    expect(res.items.single.fatG, isNull);
    expect(res.items.single.proteinG, 44);
  });

  test('preferences send only what changed; null clears the meal limit', () async {
    final api = apiWith((r) async => json(janeJson));
    await api.updatePreferences(searchRadius: 10, clearMealCalorieLimit: true);
    expect(sent.single.method, 'PATCH');
    expect(jsonDecode(sent.single.body), {'searchRadius': 10, 'mealCalorieLimit': null});
  });

  test('trackedNutrients are sent by name, in order', () async {
    final api = apiWith((r) async => json(janeJson));
    await api.updatePreferences(trackedNutrients: [Nutrient.fat, Nutrient.calories]);
    expect(jsonDecode(sent.single.body), {
      'trackedNutrients': ['fat', 'calories'],
    });
  });

  test('getCalories parses the daily macro targets', () async {
    final api = apiWith(
      (r) async => json({
        'age': 20,
        'maintenance': 2058,
        'target': 1558,
        'perMeal': 519,
        'macros': {'proteinG': 136, 'carbsG': 136, 'fatG': 52},
      }),
    );
    final cal = await api.getCalories();
    expect([cal.target, cal.macros.proteinG, cal.macros.carbsG, cal.macros.fatG], [1558, 136, 136, 52]);
  });

  test('getMealLogs sends the range and parses entries and day totals', () async {
    final zero = {'calories': 0, 'proteinG': 0, 'carbsG': 0, 'fatG': 0, 'incomplete': false};
    final api = apiWith(
      (r) async => json({
        'entries': [
          {
            'id': 'l1',
            'date': '2026-11-02',
            'status': 'eaten',
            'menuItemId': null,
            'name': 'Homemade smoothie',
            'chainName': null,
            'servings': 1,
            'calories': 250,
            'proteinG': 8,
            'carbsG': 45,
            'fatG': null,
            'source': 'custom',
            'createdAt': '2026-11-02T14:00:00.000Z',
          },
        ],
        'days': [
          {
            'date': '2026-11-02',
            'eaten': {'calories': 250, 'proteinG': 8, 'carbsG': 45, 'fatG': 0, 'incomplete': true},
            'planned': zero,
          },
          {'date': '2026-11-03', 'eaten': zero, 'planned': zero},
        ],
      }),
    );
    final res = await api.getMealLogs(from: '2026-11-02', to: '2026-11-03');
    expect(sent.single.url.path, '/api/meal-logs');
    expect(sent.single.url.queryParameters, {'from': '2026-11-02', 'to': '2026-11-03'});
    final log = res.entries.single;
    expect(
      [log.status, log.source, log.menuItemId, log.chainName, log.fatG],
      [MealLogStatus.eaten, MealLogSource.custom, null, null, null],
    );
    expect(log.servings, 1.0);
    expect(res.days.map((d) => d.date), ['2026-11-02', '2026-11-03']);
    expect([res.days[0].eaten.incomplete, res.days[1].eaten.calories], [true, 0]);
  });

  test('addMealLogs sends a menu item without macros and custom food with its null macros', () async {
    final saved = {
      'id': 'l1',
      'date': '2026-11-03',
      'status': 'planned',
      'menuItemId': 'm1',
      'name': 'Grilled Nuggets (8 ct)',
      'chainName': 'Chick-fil-A',
      'servings': 1,
      'calories': 130,
      'proteinG': 25,
      'carbsG': 1,
      'fatG': 3,
      'source': 'plan',
      'createdAt': '2026-11-03T12:00:00.000Z',
    };
    final api = apiWith(
      (r) async => json({
        'entries': [saved],
      }, 201),
    );
    final logs = await api.addMealLogs([
      const MealLogEntry.menuItem(
        date: '2026-11-03',
        menuItemId: 'm1',
        source: MealLogSource.plan,
        status: MealLogStatus.planned,
      ),
      const MealLogEntry.custom(
        date: '2026-11-03',
        source: MealLogSource.photo,
        name: 'Apple',
        calories: 95,
        proteinG: null,
        carbsG: 25,
        fatG: 0.3,
        servings: 0.5,
      ),
    ]);
    expect(sent.single.method, 'POST');
    expect(jsonDecode(sent.single.body), {
      'entries': [
        {'date': '2026-11-03', 'status': 'planned', 'source': 'plan', 'menuItemId': 'm1'},
        {
          'date': '2026-11-03',
          'servings': 0.5,
          'source': 'photo',
          'name': 'Apple',
          'chainName': null,
          'calories': 95,
          'proteinG': null,
          'carbsG': 25,
          'fatG': 0.3,
        },
      ],
    });
    expect([logs.single.name, logs.single.status], ['Grilled Nuggets (8 ct)', MealLogStatus.planned]);
  });

  test('updateMealLog sends only what changed; deleteMealLog returns nothing', () async {
    final api = apiWith(
      (r) async => r.method == 'DELETE'
          ? http.Response('', 204)
          : json({
              'id': 'l1',
              'date': '2026-11-03',
              'status': 'eaten',
              'menuItemId': 'm1',
              'name': 'Grilled Nuggets (8 ct)',
              'chainName': 'Chick-fil-A',
              'servings': 1.5,
              'calories': 130,
              'proteinG': 25,
              'carbsG': 1,
              'fatG': 3,
              'source': 'plan',
              'createdAt': '2026-11-03T12:00:00.000Z',
            }),
    );
    final log = await api.updateMealLog('l1', status: MealLogStatus.eaten);
    expect([sent[0].method, sent[0].url.path], ['PATCH', '/api/meal-logs/l1']);
    expect(jsonDecode(sent[0].body), {'status': 'eaten'});
    expect(log.servings, 1.5);

    await api.deleteMealLog('l1');
    expect([sent[1].method, sent[1].url.path], ['DELETE', '/api/meal-logs/l1']);
  });

  test('addFavorite sends label null explicitly; DELETE returns nothing', () async {
    final api = apiWith(
      (r) async => r.method == 'DELETE'
          ? http.Response('', 204)
          : json({'id': 'f1', 'placeId': 'osm-node-9661240581', 'label': null, 'createdAt': '2026-10-27T12:00:00Z'}, 201),
    );
    final fav = await api.addFavorite(placeId: 'osm-node-9661240581');
    expect(jsonDecode(sent[0].body), {'placeId': 'osm-node-9661240581', 'label': null});
    expect(fav.label, isNull);
    await api.removeFavorite('f1');
    expect(sent[1].url.path, '/api/favorites/f1');
  });

  test('getMealPlan builds its query and parses the days', () async {
    final api = apiWith(
      (r) async => json({
        'mode': 'carb',
        'days': [
          {
            'date': '2026-11-03',
            'remainingCalories': 1558,
            'mealCalorieLimit': 519,
            'items': [
              {
                'id': '1',
                'chainId': 'c1',
                'chainName': 'Subway',
                'name': '6-inch Grilled Chicken (Fresh Fit)',
                'category': 'entree',
                'calories': 300,
                'proteinG': 26,
                'carbsG': 40,
                'fatG': 5,
                'isEstimate': false,
                'score': 13.3,
              },
            ],
            'totals': {'calories': 300, 'proteinG': 26, 'carbsG': 40, 'fatG': 5, 'incomplete': false},
          },
        ],
      }),
    );

    final res = await api.getMealPlan(start: '2026-11-03', days: 7, chainIds: ['c1', 'c2']);
    expect(sent[0].url.queryParameters, {'start': '2026-11-03', 'days': '7', 'chainIds': 'c1,c2'});
    expect(res.mode, RecommendationMode.carb);
    expect(res.days.single.items.single.score, 13.3);
    expect(res.days.single.totals.calories, 300);

    await api.getMealPlan(start: '2026-11-03', chainIds: []);
    expect(sent[1].url.queryParameters, {'start': '2026-11-03'});
  });

  test('analyzePhoto sends the image and parses matched and unmatched PhotoItems', () async {
    final api = apiWith(
      (r) async => json({
        'items': [
          {
            'menuItemId': 'm1',
            'name': 'Chicken Bowl',
            'chainName': 'Chipotle',
            'servings': 1,
            'calories': 655,
            'proteinG': 51,
            'carbsG': 61,
            'fatG': 22,
            'confidence': 'high',
          },
          {
            'menuItemId': null,
            'name': 'Apple',
            'chainName': null,
            'servings': 0.5,
            'calories': 95,
            'proteinG': null,
            'carbsG': 25,
            'fatG': 0.3,
            'confidence': 'low',
          },
        ],
      }),
    );
    final items = await api.analyzePhoto(imageBase64: 'iVBORw0KGgo=', mediaType: 'image/png');
    expect(sent[0].url.path, '/api/photo-analyses');
    expect(jsonDecode(sent[0].body), {'imageBase64': 'iVBORw0KGgo=', 'mediaType': 'image/png'});
    expect(items[0].menuItemId, 'm1');
    expect(items[0].calories, 655.0);
    expect(items[1].menuItemId, isNull);
    expect(items[1].proteinG, isNull);
    expect(items[1].servings, 0.5);
    expect(items[1].confidence, PhotoConfidence.low);
  });

  test('createSubmission sends kind as JSON and getMySubmissions parses the list', () async {
    final sub = {
      'id': 's1',
      'kind': 'edit_item',
      'targetId': 'i1',
      'payload': {'calories': 600},
      'before': {'calories': 590},
      'resultId': null,
      'status': 'auto_applied',
      'reviewNote': null,
      'createdAt': '2026-11-03T12:00:00.000Z',
      'updatedAt': '2026-11-03T12:00:00.000Z',
    };
    final api = apiWith(
      (r) async => r.method == 'POST'
          ? json(sub, 201)
          : json({
              'submissions': [
                {...sub, 'kind': 'new_chain', 'targetId': null, 'before': null, 'status': 'pending'},
              ],
              'total': 1,
            }),
    );
    final created = await api.createSubmission(kind: SubmissionKind.editItem, targetId: 'i1', payload: {'calories': 600});
    expect(jsonDecode(sent[0].body), {
      'kind': 'edit_item',
      'targetId': 'i1',
      'payload': {'calories': 600},
    });
    expect([created.status, created.before], [SubmissionStatus.autoApplied, {'calories': 590}]);

    final mine = await api.getMySubmissions();
    expect(sent[1].url.toString(), 'http://test/api/submissions/mine?limit=50&skip=0');
    expect([mine.total, mine.submissions.single.kind, mine.submissions.single.targetId], [1, SubmissionKind.newChain, null]);
  });
}
