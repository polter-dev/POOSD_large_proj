import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "Nov 3, 2026", in the phone's time zone.
String _savedOn(String iso) {
  final d = DateTime.parse(iso).toLocal();
  return '${_months[d.month - 1]} ${d.day}, ${d.year}';
}

/// The Saved tab, same as web's FavoritesPage (#34): GET/DELETE /favorites. A favorite stores only the
/// place ID and a label (spec N4: no address or location), so this lists labels; saving happens on Nearby.
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key, this.active = true, required this.onFindRestaurants});

  final bool active; // this tab is showing; coming back reloads, since Nearby can save more
  final VoidCallback onFindRestaurants;

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  List<Favorite>? _favorites;
  String? _error;
  String? _removing; // favorite id

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(FavoritesScreen old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _load();
  }

  Future<void> _load() async {
    if (_error != null) setState(() => _error = null);
    try {
      final favorites = await ApiScope.of(context).getFavorites();
      if (mounted) setState(() => _favorites = favorites);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _remove(Favorite f) async {
    setState(() {
      _removing = f.id;
      _error = null;
    });
    try {
      await ApiScope.of(context).removeFavorite(f.id);
    } on ApiError catch (e) {
      // 404: already gone (removed on another device), which is what we wanted.
      if (e.status != 404) {
        if (mounted) {
          setState(() {
            _error = e.message;
            _removing = null;
          });
        }
        return;
      }
    }
    if (mounted) {
      setState(() {
        _favorites?.removeWhere((x) => x.id == f.id);
        _removing = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final favorites = _favorites;
    return Scaffold(
      appBar: appBar('Saved'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // pull to refresh even when it all fits
          padding: const EdgeInsets.all(AppSpace.s4),
          children: [
            const Text(
              'Places you saved on Nearby. When one is in range, its card there shows "Saved".',
              style: TextStyle(fontSize: 16, color: AppColors.textMuted),
            ),
            const SizedBox(height: AppSpace.s4),
            if (_error != null) ...[
              ErrorBanner(message: _error!, actionLabel: favorites == null ? 'Try again' : null, onAction: _load),
              const SizedBox(height: AppSpace.s4),
            ],
            if (favorites == null)
              if (_error == null)
                const StatusMessage(message: 'Loading your saved restaurants…', loading: true)
              else
                const SizedBox.shrink()
            else if (favorites.isEmpty)
              StatusMessage(
                title: 'Nothing saved yet',
                message: 'Tap Save on a restaurant in Nearby to keep it here.',
                actions: [
                  FilledButton(onPressed: widget.onFindRestaurants, child: const Text('Find restaurants near me')),
                ],
              )
            else
              for (final (i, f) in favorites.indexed) ...[
                if (i > 0) const SizedBox(height: AppSpace.s3),
                AppCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(f.label ?? 'Saved restaurant', style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: AppSpace.s1),
                            Text(
                              'Saved ${_savedOn(f.createdAt)}',
                              style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpace.s3),
                      Semantics(
                        button: true,
                        label: 'Remove ${f.label ?? 'saved restaurant'}',
                        excludeSemantics: true,
                        child: TextButton(
                          onPressed: _removing == f.id ? null : () => _remove(f),
                          style: TextButton.styleFrom(foregroundColor: AppColors.error),
                          child: Text(_removing == f.id ? 'Removing…' : 'Remove'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
          ],
        ),
      ),
    );
  }
}
