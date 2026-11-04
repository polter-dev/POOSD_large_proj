import 'package:flutter/widgets.dart';

import '../services/api.dart';
import '../services/location.dart';
import '../services/photos.dart';

/// Hands the one Api instance (and the location and photo sources) down the widget tree, so tests can swap
/// in a fake server, a fake location and fake photos.
class ApiScope extends InheritedWidget {
  const ApiScope({
    super.key,
    required this.api,
    this.location = const DeviceLocation(),
    this.photos = const DevicePhotos(),
    required super.child,
  });

  final Api api;
  final LocationSource location;
  final PhotoSource photos;

  // No dependency: none of them ever changes, and screens look these up in initState to start loading.
  static ApiScope _of(BuildContext context) => context.getInheritedWidgetOfExactType<ApiScope>()!;

  static Api of(BuildContext context) => _of(context).api;

  static LocationSource locationOf(BuildContext context) => _of(context).location;

  static PhotoSource photosOf(BuildContext context) => _of(context).photos;

  @override
  bool updateShouldNotify(ApiScope oldWidget) =>
      api != oldWidget.api || location != oldWidget.location || photos != oldWidget.photos;
}
