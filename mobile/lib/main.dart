import 'package:flutter/material.dart';

import 'models/api_models.dart';
import 'screens/app_shell.dart';
import 'screens/login_screen.dart';
import 'services/api.dart';
import 'services/location.dart';
import 'theme.dart';
import 'widgets/api_scope.dart';

void main() => runApp(MenuMacroFitterApp(api: Api()));

final _navigator = GlobalKey<NavigatorState>();

class MenuMacroFitterApp extends StatelessWidget {
  const MenuMacroFitterApp({super.key, required this.api, this.location = const DeviceLocation()});

  final Api api;
  final LocationSource location;

  @override
  Widget build(BuildContext context) {
    // Like web AuthContext: a 401 mid-session forgets the token and goes back to Log in.
    api.onSessionExpired = () async {
      await api.logout();
      _navigator.currentState?.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen(info: 'Your session expired. Log in again.')),
        (_) => false,
      );
    };
    return ApiScope(
      api: api,
      location: location,
      child: MaterialApp(
        title: 'Menu Macro Fitter',
        navigatorKey: _navigator,
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _Start(),
      ),
    );
  }
}

/// Login is the first screen. A saved token skips it only if GET /users/me still accepts it.
class _Start extends StatefulWidget {
  const _Start();

  @override
  State<_Start> createState() => _StartState();
}

class _StartState extends State<_Start> {
  late final Future<User?> _user = _restore();

  Future<User?> _restore() async {
    final api = ApiScope.of(context);
    if (!await api.hasToken()) return null;
    try {
      return await api.getMe();
    } on ApiError catch (e) {
      if (e.status == 401 || e.status == 404) await api.logout(); // expired or deleted: forget it
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User?>(
      future: _user,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final user = snap.data;
        return user == null ? const LoginScreen() : homeFor(user);
      },
    );
  }
}
