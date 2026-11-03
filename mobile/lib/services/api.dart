import '../models/api_models.dart';
import 'api_client.dart';

export 'api_client.dart' show ApiError, ApiClient, MemoryTokenStore, TokenStore;

// One method per row of docs/api-contract.md section 3, named like the web client
// (web/src/api/index.ts), plus logout. Screens call these, never ApiClient directly.
class Api {
  Api([ApiClient? client]) : _c = client ?? ApiClient();

  final ApiClient _c;

  static String _message(dynamic res) => (res as Map<String, dynamic>)['message'] as String;
  static Map<String, dynamic> _map(dynamic res) => res as Map<String, dynamic>;

  // Auth
  Future<String> register({
    required String firstName,
    required String lastName,
    required String username,
    required String email,
    required String password,
  }) async => _message(
    await _c.request('POST', '/auth/register', {
      'firstName': firstName,
      'lastName': lastName,
      'username': username,
      'email': email,
      'password': password,
    }),
  );

  /// [login] is an email or a username (#87): the server looks it up as an email when it has an "@".
  Future<LoginResponse> login({required String login, required String password}) async {
    final res = _map(await _c.request('POST', '/auth/login', {'login': login, 'password': password}));
    final token = res['token'] as String;
    await _c.tokens.write(token);
    return LoginResponse(token: token, user: User.fromJson(_map(res['user'])));
  }

  Future<void> logout() => _c.tokens.clear();

  Future<bool> hasToken() async => await _c.tokens.read() != null;

  set onSessionExpired(void Function()? fn) => _c.onSessionExpired = fn;

  Future<String> verifyEmail(String token) async =>
      _message(await _c.request('GET', '/auth/verify-email?token=${Uri.encodeQueryComponent(token)}'));

  /// [login] is an email or a username; the link goes to the account's email either way.
  Future<String> resendVerification(String login) async =>
      _message(await _c.request('POST', '/auth/resend-verification', {'login': login}));

  Future<String> forgotPassword(String email) async =>
      _message(await _c.request('POST', '/auth/forgot-password', {'email': email}));

  Future<String> resetPassword({required String token, required String password}) async =>
      _message(await _c.request('POST', '/auth/reset-password', {'token': token, 'password': password}));

  // Users
  Future<User> getMe() async => User.fromJson(_map(await _c.request('GET', '/users/me')));

  Future<User> updateProfile(Profile profile) async =>
      User.fromJson(_map(await _c.request('PUT', '/users/me/profile', profile.toJson())));

  Future<User> updateGoal(Goal goal) async =>
      User.fromJson(_map(await _c.request('PUT', '/users/me/goal', {'goal': goal.name})));

  /// Partial update: pass only what changed. clearMealCalorieLimit sends null (back to target / 3).
  /// [trackedNutrients] is 1-4 different nutrients, kept in that order.
  Future<User> updatePreferences({
    Units? units,
    int? searchRadius,
    RecommendationMode? recommendationMode,
    double? mealCalorieLimit,
    bool clearMealCalorieLimit = false,
    List<Nutrient>? trackedNutrients,
  }) async {
    final body = <String, dynamic>{
      'units': ?units?.name,
      'searchRadius': ?searchRadius,
      'recommendationMode': ?recommendationMode?.name,
      'mealCalorieLimit': ?mealCalorieLimit,
      if (clearMealCalorieLimit) 'mealCalorieLimit': null,
      'trackedNutrients': ?trackedNutrients?.map((n) => n.name).toList(),
    };
    return User.fromJson(_map(await _c.request('PATCH', '/users/me/preferences', body)));
  }

  Future<Calories> getCalories() async => Calories.fromJson(_map(await _c.request('GET', '/users/me/calories')));

  // Menu (defaults match the server's)
  Future<SearchMenuItemsResponse> searchMenuItems(String q, {int limit = 20, int skip = 0}) async {
    final query = Uri(queryParameters: {'q': q, 'limit': '$limit', 'skip': '$skip'}).query;
    final res = _map(await _c.request('GET', '/menu-items/search?$query'));
    return SearchMenuItemsResponse(
      items: [for (final i in res['items'] as List) MenuItem.fromJson(_map(i))],
      total: (res['total'] as num).toInt(),
      limit: (res['limit'] as num).toInt(),
      skip: (res['skip'] as num).toInt(),
    );
  }

  Future<RecommendationsResponse> recommendations({
    List<String>? chainIds,
    RecommendationMode? mode,
    double? mealCalorieLimit,
    int? limit,
    bool? includeEstimates,
  }) async {
    final res = _map(
      await _c.request('POST', '/recommendations', {
        'chainIds': ?chainIds,
        'mode': ?mode?.name,
        'mealCalorieLimit': ?mealCalorieLimit,
        'limit': ?limit,
        'includeEstimates': ?includeEstimates,
      }),
    );
    return RecommendationsResponse(
      mode: RecommendationMode.values.byName(res['mode'] as String),
      mealCalorieLimit: (res['mealCalorieLimit'] as num).toDouble(),
      items: [for (final i in res['items'] as List) RecommendedItem.fromJson(_map(i))],
    );
  }

  // Restaurants
  Future<List<NearbyRestaurant>> nearby({required double lat, required double lng, int? radiusMiles}) async {
    final res = _map(
      // The server asks OpenStreetMap's Overpass API, which can take over 30 s (its own limit is 25 s plus
      // queueing), so wait longer than the usual 15 s.
      await _c.request('POST', '/restaurants/nearby', {
        'lat': lat,
        'lng': lng,
        'radiusMiles': ?radiusMiles,
      }, const Duration(seconds: 60)),
    );
    return [for (final r in res['restaurants'] as List) NearbyRestaurant.fromJson(_map(r))];
  }

  // Favorites
  Future<List<Favorite>> getFavorites() async {
    final res = _map(await _c.request('GET', '/favorites'));
    return [for (final f in res['favorites'] as List) Favorite.fromJson(_map(f))];
  }

  Future<Favorite> addFavorite({required String placeId, String? label}) async =>
      Favorite.fromJson(_map(await _c.request('POST', '/favorites', {'placeId': placeId, 'label': label})));

  Future<void> removeFavorite(String id) => _c.request('DELETE', '/favorites/${Uri.encodeComponent(id)}');

  // Meal logs
  /// [from] and [to] are the user's local days (YYYY-MM-DD), at most 31 days counting both.
  Future<MealLogsResponse> getMealLogs({required String from, required String to}) async {
    final query = Uri(queryParameters: {'from': from, 'to': to}).query;
    final res = _map(await _c.request('GET', '/meal-logs?$query'));
    return MealLogsResponse(
      entries: [for (final e in res['entries'] as List) MealLog.fromJson(_map(e))],
      days: [for (final d in res['days'] as List) MealLogDay.fromJson(_map(d))],
    );
  }

  /// Saves 1-50 entries, all or none, and returns them in the same order.
  Future<List<MealLog>> addMealLogs(List<MealLogEntry> entries) async {
    final res = _map(
      await _c.request('POST', '/meal-logs', {
        'entries': [for (final e in entries) e.toJson()],
      }),
    );
    return [for (final e in res['entries'] as List) MealLog.fromJson(_map(e))];
  }

  /// Pass at least one. "Ate it" on a planned entry is status: eaten.
  Future<MealLog> updateMealLog(String id, {MealLogStatus? status, double? servings}) async => MealLog.fromJson(
    _map(
      await _c.request('PATCH', '/meal-logs/${Uri.encodeComponent(id)}', {
        'status': ?status?.name,
        'servings': ?servings,
      }),
    ),
  );

  Future<void> deleteMealLog(String id) => _c.request('DELETE', '/meal-logs/${Uri.encodeComponent(id)}');

  // Meal plans (omitted values use the server's defaults)
  /// [start] is the user's local day, YYYY-MM-DD; [days] is 1 or 7.
  Future<MealPlanResponse> getMealPlan({
    required String start,
    int? days,
    List<String>? chainIds,
    RecommendationMode? mode,
  }) async {
    final query = Uri(
      queryParameters: {
        'start': start,
        'days': ?days?.toString(),
        if (chainIds != null && chainIds.isNotEmpty) 'chainIds': chainIds.join(','),
        'mode': ?mode?.name,
      },
    ).query;
    final res = _map(await _c.request('GET', '/meal-plans?$query'));
    return MealPlanResponse(
      mode: RecommendationMode.values.byName(res['mode'] as String),
      days: [for (final d in res['days'] as List) MealPlanDay.fromJson(_map(d))],
    );
  }

  // Photo analysis
  /// [imageBase64] is plain base64 (no data: prefix, at most 3,000,000 chars); [mediaType] is
  /// image/jpeg, image/png or image/webp. Nothing is saved: log the confirmed items with POST /meal-logs.
  Future<List<PhotoItem>> analyzePhoto({required String imageBase64, required String mediaType}) async {
    final res = _map(
      // The server waits on Claude (up to ~50 s with one retry), so wait longer than the usual 15 s.
      await _c.request('POST', '/photo-analyses', {
        'imageBase64': imageBase64,
        'mediaType': mediaType,
      }, const Duration(seconds: 60)),
    );
    return [for (final i in res['items'] as List) PhotoItem.fromJson(_map(i))];
  }

  // Community submissions (10 per rolling 24 h, else 429 "Too many submissions today")
  /// [targetId] is the menu item (editItem), the chain (newItem) or null (newChain); [payload] is shaped by
  /// [kind] (see Submission). A macro sent as null means unknown, so leave a key out rather than send null by accident.
  Future<Submission> createSubmission({
    required SubmissionKind kind,
    required String? targetId,
    required Map<String, dynamic> payload,
  }) async => Submission.fromJson(
    _map(await _c.request('POST', '/submissions', {'kind': kind.json, 'targetId': targetId, 'payload': payload})),
  );

  /// The caller's own submissions, newest first (defaults match the server's; limit is at most 50).
  Future<MySubmissionsResponse> getMySubmissions({int limit = 50, int skip = 0}) async {
    final query = Uri(queryParameters: {'limit': '$limit', 'skip': '$skip'}).query;
    final res = _map(await _c.request('GET', '/submissions/mine?$query'));
    return MySubmissionsResponse(
      submissions: [for (final s in res['submissions'] as List) Submission.fromJson(_map(s))],
      total: (res['total'] as num).toInt(),
    );
  }
}
