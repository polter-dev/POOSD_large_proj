import 'dart:convert';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

// Same idea as web/src/api/client.ts: the only place in mobile/ that makes HTTP calls.
// It attaches the stored JWT and turns the API's { error } into ApiError.

// Where the API is. Clients use a domain name, never an IP (#19).
// - Pass it at build time: --dart-define=API_URL=https://<domain>/api
// - Release builds without it use productionApiUrl. DOMAIN_PLACEHOLDER is the same placeholder as
//   deploy/nginx.conf; replace it here once #57 picks the domain.
// - Debug builds without it use the dev API on this computer, which the emulator reaches as localhost
//   after `adb reverse tcp:5050 tcp:5050` (see mobile/README.md).
const productionApiUrl = 'https://DOMAIN_PLACEHOLDER/api';
const devApiUrl = 'http://localhost:5050/api';
const _apiUrlOverride = String.fromEnvironment('API_URL');
const apiBaseUrl = _apiUrlOverride != '' ? _apiUrlOverride : (kReleaseMode ? productionApiUrl : devApiUrl);

const networkErrorMessage = "Can't reach the server. Check your connection and try again.";

class ApiError implements Exception {
  const ApiError(this.message, this.status, {this.fromApi = false});

  final String message; // the server's error message, written for users
  final int status; // 0 = no response (offline, server down)
  final bool fromApi; // true only for the API's own { error } body, not a proxy page or another server

  @override
  String toString() => 'ApiError($status): $message';
}

abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class PrefsTokenStore implements TokenStore {
  static const _key = 'token';

  @override
  Future<String?> read() async => (await SharedPreferences.getInstance()).getString(_key);

  @override
  Future<void> write(String token) async => (await SharedPreferences.getInstance()).setString(_key, token);

  @override
  Future<void> clear() async => (await SharedPreferences.getInstance()).remove(_key);
}

class MemoryTokenStore implements TokenStore {
  String? token;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String t) async => token = t;

  @override
  Future<void> clear() async => token = null;
}

class ApiClient {
  ApiClient({http.Client? httpClient, this.baseUrl = apiBaseUrl, TokenStore? tokens})
    : _http = httpClient ?? http.Client(),
      tokens = tokens ?? PrefsTokenStore();

  final http.Client _http;
  final String baseUrl;
  final TokenStore tokens;

  /// Sends one request. Returns the decoded JSON body, or null for 204.
  Future<dynamic> request(String method, String path, [Object? body]) async {
    final headers = <String, String>{};
    if (body != null) headers['Content-Type'] = 'application/json';
    final token = await tokens.read();
    if (token != null) headers['Authorization'] = 'Bearer $token';

    final req = http.Request(method, Uri.parse('$baseUrl$path'))..headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw const ApiError(networkErrorMessage, 0);
    }

    if (res.statusCode == 204) return null;
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      // A non-JSON error page (proxy 502) still gets the fallback message.
      throw ApiError(ok ? 'Invalid response' : 'Request failed', res.statusCode);
    }
    if (!ok) {
      if (data is Map && data['error'] is String) {
        throw ApiError(data['error'] as String, res.statusCode, fromApi: true);
      }
      throw ApiError('Request failed', res.statusCode);
    }
    return data;
  }
}
