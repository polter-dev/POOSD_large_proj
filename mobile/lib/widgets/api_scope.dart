import 'package:flutter/widgets.dart';

import '../services/api.dart';

/// Hands the one Api instance down the widget tree, so tests can swap in a fake server.
class ApiScope extends InheritedWidget {
  const ApiScope({super.key, required this.api, required super.child});

  final Api api;

  static Api of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<ApiScope>()!.api;

  @override
  bool updateShouldNotify(ApiScope oldWidget) => api != oldWidget.api;
}
