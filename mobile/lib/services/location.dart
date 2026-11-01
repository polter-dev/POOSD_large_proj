import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// Why there's no location. The Nearby screen shows a different message and button for each.
enum LocationProblem { serviceOff, denied, blocked, unavailable }

class LocationException implements Exception {
  const LocationException(this.problem);

  final LocationProblem problem;

  @override
  String toString() => 'LocationException($problem)';
}

class LatLng {
  const LatLng(this.lat, this.lng);

  final double lat;
  final double lng;
}

/// Where the phone is, for POST /restaurants/nearby. Read when Nearby needs it, never stored
/// (spec N4). Widget tests pass a fake through ApiScope.
abstract class LocationSource {
  /// Asks for permission if it hasn't been decided yet. Throws [LocationException].
  Future<LatLng> current();

  /// The system screen that fixes [problem]: location settings when it's off, else this app's settings.
  Future<void> openSettings(LocationProblem problem);
}

class DeviceLocation implements LocationSource {
  const DeviceLocation();

  @override
  Future<LatLng> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) throw const LocationException(LocationProblem.serviceOff);
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    // Android turns a second "Don't allow" into deniedForever: the dialog won't show again.
    if (permission == LocationPermission.denied) throw const LocationException(LocationProblem.denied);
    if (permission == LocationPermission.deniedForever) throw const LocationException(LocationProblem.blocked);
    try {
      // Approximate is plenty for a 5 to 20 mile search (the manifest only asks for coarse).
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 15)),
      );
      return LatLng(p.latitude, p.longitude);
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) return LatLng(last.latitude, last.longitude);
      throw const LocationException(LocationProblem.unavailable);
    }
  }

  @override
  Future<void> openSettings(LocationProblem problem) async {
    if (problem == LocationProblem.serviceOff) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }
}
