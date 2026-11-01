import 'package:flutter/widgets.dart';

import '../services/api.dart';
import '../services/location.dart';

/// Hands the one Api instance (and the location source) down the widget tree, so tests can swap
/// in a fake server and a fake location.
class ApiScope extends InheritedWidget {
  const ApiScope({super.key, required this.api, this.location = const DeviceLocation(), required super.child});

  final Api api;
  final LocationSource location;

  // No dependency: neither ever changes, and screens look these up in initState to start loading.
  static ApiScope _of(BuildContext context) => context.getInheritedWidgetOfExactType<ApiScope>()!;

  static Api of(BuildContext context) => _of(context).api;

  static LocationSource locationOf(BuildContext context) => _of(context).location;

  @override
  bool updateShouldNotify(ApiScope oldWidget) => api != oldWidget.api || location != oldWidget.location;
}
