import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../services/location.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import 'picks_screen.dart';

/// #35, prototype screen 07: restaurants within 5 to 20 miles (POST /restaurants/nearby), each with
/// how many of its items fit the goal. The count is one POST /recommendations for all of them
/// (spec, Restaurant card). Asks for location the first time it opens; the position is only used
/// for the request, never stored (spec N4). Each card can be saved to favorites (Saved tab).
class NearbyScreen extends StatefulWidget {
  const NearbyScreen({super.key, required this.user, this.active = true});

  final User user;
  final bool active; // this tab is showing; coming back re-reads favorites, which the Saved tab can change

  @override
  State<NearbyScreen> createState() => _NearbyScreenState();
}

class _NearbyScreenState extends State<NearbyScreen> with WidgetsBindingObserver {
  late int _radius = widget.user.preferences.searchRadius;
  LatLng? _here; // kept while the screen is open, so changing the radius doesn't locate again
  LocationProblem? _problem;
  List<NearbyRestaurant>? _restaurants;
  Map<String, int>? _fits; // chainId -> items that fit; null if the count failed, missing if unknown
  bool _fitsFull = false; // the page was full, so every count is a lower bound
  String? _error;
  bool _loading = true;
  int _request = 0;
  Map<String, String> _saved = {}; // placeId -> favorite id
  final _saving = <String>{}; // placeIds with a save or remove in flight
  String? _saveError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _loadSaved();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from Settings with location turned on or allowed: try again without another tap.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        (_problem == LocationProblem.serviceOff || _problem == LocationProblem.blocked)) {
      _load();
    }
  }

  // A new goal or per-meal limit changes the counts.
  @override
  void didUpdateWidget(NearbyScreen old) {
    super.didUpdateWidget(old);
    if (old.user != widget.user) _load();
    if (widget.active && !old.active) _loadSaved();
  }

  // Without them the Save buttons just start empty.
  Future<void> _loadSaved() async {
    try {
      final favorites = await ApiScope.of(context).getFavorites();
      if (mounted) setState(() => _saved = {for (final f in favorites) f.placeId: f.id});
    } on ApiError {
      // keep what we had
    }
  }

  Future<void> _toggleSaved(NearbyRestaurant r) async {
    if (!_saving.add(r.placeId)) return;
    setState(() => _saveError = null);
    final api = ApiScope.of(context);
    final favoriteId = _saved[r.placeId];
    try {
      if (favoriteId != null) {
        await api.removeFavorite(favoriteId);
        if (mounted) setState(() => _saved.remove(r.placeId));
      } else {
        // The label is 1-50 characters or null.
        final label = r.name.length > 50 ? r.name.substring(0, 50) : r.name;
        final f = await api.addFavorite(placeId: r.placeId, label: label.isEmpty ? null : label);
        if (mounted) setState(() => _saved[r.placeId] = f.id);
      }
    } on ApiError catch (e) {
      // 409: saved already, 404: removed already (on another device). Either way, re-read the true state.
      if (e.status == 409 || e.status == 404) {
        await _loadSaved();
      } else if (mounted) {
        setState(() => _saveError = e.message);
      }
    } finally {
      if (mounted) setState(() => _saving.remove(r.placeId));
    }
  }

  Future<void> _load() async {
    final request = ++_request;
    if (!_loading || _problem != null || _error != null) {
      setState(() {
        _loading = true;
        _problem = null;
        _error = null;
      });
    }
    final api = ApiScope.of(context);
    try {
      var here = _here;
      if (here == null) {
        here = await ApiScope.locationOf(context).current();
        if (!mounted || request != _request) return;
        setState(() => _here = here); // the message moves on to "Finding restaurants"
      }
      final restaurants = await api.nearby(lat: here.lat, lng: here.lng, radiusMiles: _radius);
      final chainIds = {for (final r in restaurants) ?r.chainId}.toList();
      Map<String, int>? fits = {};
      var full = false;
      // Empty chainIds would mean every chain, so skip the call when nothing nearby has data.
      if (chainIds.isNotEmpty) {
        try {
          const limit = 50;
          final res = await api.recommendations(chainIds: chainIds, limit: limit);
          for (final r in res.items) {
            fits[r.item.chainId] = (fits[r.item.chainId] ?? 0) + 1;
          }
          // On a full page a chain may have more items that were outscored (or all of them, if
          // missing), so only a short page gives exact counts and proves 0.
          full = res.items.length >= limit;
          if (!full) {
            for (final id in chainIds) {
              fits.putIfAbsent(id, () => 0);
            }
          }
        } on ApiError {
          fits = null; // still show the restaurants, just without counts
        }
      }
      if (!mounted || request != _request) return;
      setState(() {
        _restaurants = restaurants;
        _fits = fits;
        _fitsFull = full;
        _loading = false;
      });
    } on LocationException catch (e) {
      if (mounted && request == _request) {
        setState(() {
          _problem = e.problem;
          _loading = false;
        });
      }
    } on ApiError catch (e) {
      if (mounted && request == _request) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  void _setRadius(int r) {
    if (r == _radius) return;
    setState(() => _radius = r);
    _load();
    // Remembered for next time; the search doesn't wait on it, so a failed save stays quiet. Not handed up
    // to AppShell: only this screen reads searchRadius, and a new User would reload every tab.
    ApiScope.of(context).updatePreferences(searchRadius: r).then<void>((_) {}, onError: (Object _) {});
  }

  void _open(NearbyRestaurant r) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => PicksScreen(user: widget.user, chainId: r.chainId, restaurantName: r.name),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final restaurants = _restaurants;
    return Scaffold(
      appBar: appBar('Nearby'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // pull to refresh even when it all fits
          padding: const EdgeInsets.all(AppSpace.s4),
          children: [
            Semantics(
              label: 'Search radius',
              child: Wrap(
                spacing: AppSpace.s2,
                runSpacing: AppSpace.s2,
                children: [
                  for (final r in searchRadii)
                    _RadiusChip(miles: r, selected: r == _radius, onTap: () => _setRadius(r)),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s4),
            if (_saveError != null) ...[ErrorBanner(message: _saveError!), const SizedBox(height: AppSpace.s4)],
            if (_problem != null)
              _LocationHelp(
                problem: _problem!,
                onRetry: _load,
                onSettings: () => ApiScope.locationOf(context).openSettings(_problem!),
              )
            else if (_error != null)
              ErrorBanner(message: _error!, actionLabel: 'Try again', onAction: _load)
            else if (_loading)
              StatusMessage(
                message: _here == null
                    ? 'Finding where you are…'
                    : 'Finding restaurants near you… This can take up to a minute.',
                loading: true,
              )
            else if (restaurants!.isEmpty)
              StatusMessage(
                title: 'No restaurants found',
                message: _radius < searchRadii.last
                    ? 'Nothing within $_radius mi. Try a bigger radius.'
                    : 'Nothing within $_radius mi.',
              )
            else
              for (final (i, r) in restaurants.indexed) ...[
                if (i > 0) const SizedBox(height: AppSpace.s3),
                _RestaurantCard(
                  restaurant: r,
                  fits: r.chainId == null ? null : _fits?[r.chainId],
                  atLeast: _fitsFull,
                  onTap: _open,
                  saved: _saved.containsKey(r.placeId),
                  saving: _saving.contains(r.placeId),
                  onToggleSaved: () => _toggleSaved(r),
                ),
              ],
          ],
        ),
      ),
    );
  }
}

class _RadiusChip extends StatelessWidget {
  const _RadiusChip({required this.miles, required this.selected, required this.onTap});

  final int miles;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected ? AppColors.primary : AppColors.bg,
        shape: StadiumBorder(side: BorderSide(color: selected ? AppColors.primary : AppColors.borderInput)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          // No alignment here: an aligned Container fills the Wrap's whole width.
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4, vertical: 10),
            child: Text(
              '$miles mi',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: selected ? AppColors.onPrimary : AppColors.text,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Restaurant card (spec): name, distance, address when there is one, and the fit badge. Only cards
/// with something that fits open Best picks; "No nutrition data" isn't tappable. Any card can be saved.
class _RestaurantCard extends StatelessWidget {
  const _RestaurantCard({
    required this.restaurant,
    required this.fits,
    required this.atLeast,
    required this.onTap,
    required this.saved,
    required this.saving,
    required this.onToggleSaved,
  });

  final NearbyRestaurant restaurant;
  final int? fits; // null: no nutrition data, or the count failed or is unknown
  final bool atLeast; // fits is a lower bound: show "3+"
  final ValueChanged<NearbyRestaurant> onTap;
  final bool saved;
  final bool saving;
  final VoidCallback onToggleSaved;

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    final hasData = r.chainId != null;
    final tappable = hasData && (fits == null || fits! > 0);
    final Widget badge;
    if (!hasData) {
      badge = const Pill(text: 'No nutrition data', bg: AppColors.surface, fg: AppColors.textMuted);
    } else if (fits == null) {
      badge = const SizedBox.shrink();
    } else if (fits == 0) {
      badge = const Pill(text: 'Nothing fits your goal', bg: AppColors.surface, fg: AppColors.textMuted);
    } else {
      badge = Pill(
        text: '$fits${atLeast ? '+' : ''} ${fits == 1 && !atLeast ? 'option fits' : 'options fit'} your goal',
        icon: Icons.check,
        bg: AppColors.fitGreatBg,
        fg: AppColors.fitGreatText,
      );
    }
    return AppCard(
      onTap: tappable ? () => onTap(r) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(r.name, style: Theme.of(context).textTheme.titleLarge)),
              const SizedBox(width: AppSpace.s3),
              Text(
                '${r.distanceMiles.toStringAsFixed(1)} mi',
                style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
              ),
            ],
          ),
          if (r.address != null) ...[
            const SizedBox(height: AppSpace.s2),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(Icons.place_outlined, size: 16, color: AppColors.textMuted),
                ),
                const SizedBox(width: AppSpace.s2),
                Expanded(
                  child: Text(r.address!, style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
                ),
              ],
            ),
          ],
          const SizedBox(height: AppSpace.s3),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(child: badge),
              const SizedBox(width: AppSpace.s2),
              // Its own node with its own tap: excludeSemantics drops the button's, and without container
              // the label merges into the card, whose tap opens Best picks.
              Semantics(
                container: true,
                button: true,
                toggled: saved,
                label: saved ? 'Saved: ${r.name}. Remove from saved' : 'Save ${r.name}',
                onTap: saving ? null : onToggleSaved,
                excludeSemantics: true,
                child: TextButton.icon(
                  onPressed: saving ? null : onToggleSaved,
                  icon: Icon(saved ? Icons.bookmark : Icons.bookmark_border, size: 18),
                  label: Text(saved ? 'Saved' : 'Save'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// What to do when there's no location, one message per [LocationProblem].
class _LocationHelp extends StatelessWidget {
  const _LocationHelp({required this.problem, required this.onRetry, required this.onSettings});

  final LocationProblem problem;
  final VoidCallback onRetry;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final (title, message) = switch (problem) {
      LocationProblem.serviceOff => ('Location is off', 'Turn on location to find restaurants near you.'),
      LocationProblem.denied => (
        'Allow location',
        'Menu Macro Fitter uses your location only to find restaurants near you. It isn\'t saved.',
      ),
      LocationProblem.blocked => (
        'Location is blocked',
        'Allow location for Menu Macro Fitter in Settings, then come back.',
      ),
      LocationProblem.unavailable => ("Can't find your location", 'Check that location is on, then try again.'),
    };
    final settings = switch (problem) {
      LocationProblem.serviceOff => 'Open location settings',
      LocationProblem.blocked => 'Open settings',
      _ => null,
    };
    return StatusMessage(
      title: title,
      message: '$message Best picks and Search work without it.',
      actions: [
        if (settings != null) FilledButton(onPressed: onSettings, child: Text(settings)),
        if (problem == LocationProblem.denied)
          FilledButton(onPressed: onRetry, child: const Text('Allow location'))
        else
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}
