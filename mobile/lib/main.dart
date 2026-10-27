import 'package:flutter/material.dart';

import 'models/api_models.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/api.dart';
import 'theme.dart';
import 'widgets/api_scope.dart';

void main() => runApp(MenuMacroFitterApp(api: Api()));

class MenuMacroFitterApp extends StatelessWidget {
  const MenuMacroFitterApp({super.key, required this.api});

  final Api api;

  @override
  Widget build(BuildContext context) {
    return ApiScope(
      api: api,
      child: MaterialApp(
        title: 'Menu Macro Fitter',
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
        return user == null ? const LoginScreen() : HomeScreen(user: user);
      },
    );
  }
}
