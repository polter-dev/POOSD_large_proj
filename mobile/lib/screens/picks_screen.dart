import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

/// #35, prototype screen 08: POST /recommendations, the items under the per-meal limit ranked by
/// protein (or carbs) per calorie. The Picks tab covers every chain; a restaurant on Nearby opens
/// it for that one chain ([chainId]), with a back arrow.
class PicksScreen extends StatefulWidget {
  const PicksScreen({super.key, required this.user, this.chainId, this.restaurantName});

  final User user;
  final String? chainId;
  final String? restaurantName;

  @override
  State<PicksScreen> createState() => _PicksScreenState();
}

class _PicksScreenState extends State<PicksScreen> {
  late RecommendationMode _mode = widget.user.preferences.recommendationMode;
  RecommendationsResponse? _res;
  String? _error;
  int _request = 0; // only the newest answer is shown when the mode is switched quickly

  @override
  void initState() {
    super.initState();
    _load();
  }

  // A profile or per-meal change gives a new limit.
  @override
  void didUpdateWidget(PicksScreen old) {
    super.didUpdateWidget(old);
    if (old.user != widget.user) _load();
  }

  Future<void> _load() async {
    final request = ++_request;
    if (_error != null) setState(() => _error = null);
    try {
      final res = await ApiScope.of(context)
          .recommendations(mode: _mode, chainIds: widget.chainId == null ? null : [widget.chainId!]);
      if (mounted && request == _request) setState(() => _res = res);
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    }
  }

  void _setMode(RecommendationMode mode) {
    if (mode == _mode) return;
    setState(() {
      _mode = mode;
      _res = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final res = _res;
    final items = res?.items ?? const <RecommendedItem>[];
    final great = greatFitCount(items.length);
    final macro = _mode == RecommendationMode.carb ? 'carbs' : 'protein';
    return Scaffold(
      appBar: appBar(widget.restaurantName ?? 'Best picks'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // pull to refresh even when it all fits
          padding: const EdgeInsets.all(AppSpace.s4),
          children: [
            if (res != null)
              Text(
                'Each under ${formatCalories(res.mealCalorieLimit)} cal, ranked by $macro per calorie.',
                style: const TextStyle(fontSize: 16, color: AppColors.textMuted),
              ),
            const SizedBox(height: AppSpace.s3),
            SegmentedChoice<RecommendationMode>(
              options: const [(RecommendationMode.protein, 'High protein'), (RecommendationMode.carb, 'High carb')],
              value: _mode,
              onChanged: _setMode,
            ),
            const SizedBox(height: AppSpace.s4),
            if (_error != null) ...[
              ErrorBanner(message: _error!, actionLabel: 'Try again', onAction: _load),
            ] else if (res == null)
              const StatusMessage(message: 'Finding your best picks…', loading: true)
            else if (items.isEmpty)
              StatusMessage(
                title: 'Nothing fits yet',
                message: widget.restaurantName == null
                    ? 'No menu items are between 300 and ${formatCalories(res.mealCalorieLimit)} cal with $macro data.'
                    : 'Nothing at ${widget.restaurantName} is between 300 and '
                          '${formatCalories(res.mealCalorieLimit)} cal with $macro data.',
              )
            else
              for (final (i, r) in items.indexed) ...[
                if (i > 0) const SizedBox(height: AppSpace.s3),
                MenuItemCard(item: r.item, score: r.score, mode: res.mode, great: i < great),
              ],
          ],
        ),
      ),
    );
  }
}
