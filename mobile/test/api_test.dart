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
  'profile': {
    'heightIn': 65,
    'weightLb': 160,
    'birthDate': '2006-03-14',
    'sex': 'female',
    'activityLevel': 'very_active',
    'goal': 'lose',
  },
  'preferences': {'units': 'imperial', 'searchRadius': 5, 'recommendationMode': 'carb', 'mealCalorieLimit': null},
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

    final res = await api.login(email: 'jane.doe@example.com', password: 'Password123!');
    expect(res.user.username, 'janedoe');
    expect(tokens.token, 'jwt-123');
    expect(jsonDecode(sent[0].body), {'email': 'jane.doe@example.com', 'password': 'Password123!'});
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

    final noProfile = apiWith((r) async => json({...janeJson, 'profile': null}));
    expect((await noProfile.getMe()).profile, isNull);
  });

  test("server errors become ApiError with the server's message", () async {
    final api = apiWith((r) async => json({'error': 'Email not verified'}, 403));
    await expectLater(
      api.login(email: 'alex.kim@example.com', password: 'Password123!'),
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

  test('addFavorite sends label null explicitly; DELETE returns nothing', () async {
    final api = apiWith(
      (r) async => r.method == 'DELETE'
          ? http.Response('', 204)
          : json({'id': 'f1', 'placeId': 'node/9661240581', 'label': null, 'createdAt': '2026-10-27T12:00:00Z'}, 201),
    );
    final fav = await api.addFavorite(placeId: 'node/9661240581');
    expect(jsonDecode(sent[0].body), {'placeId': 'node/9661240581', 'label': null});
    expect(fav.label, isNull);
    await api.removeFavorite('f1');
    expect(sent[1].url.path, '/api/favorites/f1');
  });
}
