import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../services/location.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

/// #119, opened from the Tracker: GET /meal-plans for [start] (one day, or a week from it), each day filled
/// from what's left of its target. "Nearby only" limits it to the chains near the phone, found the same way as
/// the Nearby tab. Nothing is stored until "Add to plan", which logs the items as planned (POST /meal-logs,
/// source plan). Pops true once something was added, so the Tracker reloads.
class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key, required this.user, required this.start});

  final User user;
  final DateTime start;

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  // Never before today, same as web (#152): the Tracker may be showing a past day, and a plan is for what's ahead.
  late final DateTime _start = () {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return widget.start.isBefore(today) ? today : widget.start;
  }();
  int _days = 1;
  bool _nearbyOnly = false;
  List<String>? _nearbyChains; // found once per visit; null until asked
  String? _note; // why "Nearby only" fell back to every restaurant
  MealPlanResponse? _plan;
  String? _error;
  int _request = 0;
  final _added = <String>{}; // "date|menuItemId" already logged as planned
  final _adding = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  // The nearby chains with nutrition data, or null and why when there's no location or no answer, in which
  // case the plan uses every restaurant. The caller shows the note only if its request is still the newest,
  // so turning "Nearby only" off mid-lookup leaves no stale note.
  Future<(List<String>?, String?)> _chainsNearby() async {
    if (_nearbyChains != null) return (_nearbyChains, null);
    final scope = ApiScope.locationOf(context);
    final api = ApiScope.of(context);
    try {
      final here = await scope.current();
      final restaurants = await api.nearby(
        lat: here.lat,
        lng: here.lng,
        radiusMiles: widget.user.preferences.searchRadius,
      );
      return (_nearbyChains = {for (final r in restaurants) ?r.chainId}.toList(), null);
    } on LocationException {
      return (null, "Couldn't get your location, so this plan uses every restaurant.");
    } on ApiError {
      return (null, "Couldn't load restaurants near you, so this plan uses every restaurant.");
    }
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() {
      _plan = null;
      _error = null;
      _note = null;
    });
    final api = ApiScope.of(context);
    try {
      final (chains, note) = _nearbyOnly ? await _chainsNearby() : (null, null);
      if (!mounted || request != _request) return;
      _note = note;
      // Same as web: when the nearby lookup fails the plan uses every restaurant, so the switch says so too.
      if (note != null) _nearbyOnly = false;
      if (chains != null && chains.isEmpty) {
        // Empty chainIds would mean every chain, so say so instead of asking.
        setState(
          () => _error = 'No restaurants with nutrition data within ${widget.user.preferences.searchRadius} mi.',
        );
        return;
      }
      final plan = await api.getMealPlan(start: ymd(_start), days: _days, chainIds: chains);
      if (mounted && request == _request) setState(() => _plan = plan);
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    }
  }

  Future<void> _add(String date, List<RecommendedItem> items) async {
    final todo = [
      for (final i in items)
        if (!_added.contains('$date|${i.item.id}')) i,
    ];
    final keys = [for (final i in todo) '$date|${i.item.id}'];
    if (todo.isEmpty || keys.any(_adding.contains)) return;
    setState(() {
      _adding.addAll(keys);
      _error = null;
    });
    try {
      await ApiScope.of(context).addMealLogs([
        for (final i in todo)
          MealLogEntry.menuItem(
            date: date,
            menuItemId: i.item.id,
            source: MealLogSource.plan,
            status: MealLogStatus.planned,
          ),
      ]);
      if (mounted) setState(() => _added.addAll(keys));
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _adding.removeAll(keys));
    }
  }

  String _dayTitle(String date) {
    final d = DateTime.parse(date);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (d == today) return 'Today';
    if (d == addDays(today, 1)) return 'Tomorrow';
    return weekdayDate(d);
  }

  @override
  Widget build(BuildContext context) {
    final plan = _plan;
    return PopScope<bool>(
      canPop: false,
      // Back always tells the Tracker whether anything was added.
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_added.isNotEmpty);
      },
      child: Scaffold(
        appBar: appBar('Plan meals'),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpace.s4),
            children: [
              SegmentedChoice<int>(
                options: const [(1, 'Day'), (7, 'Week')],
                value: _days,
                onChanged: (d) {
                  if (d == _days) return;
                  setState(() => _days = d);
                  _load();
                },
              ),
              const SizedBox(height: AppSpace.s2),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Nearby only'),
                subtitle: Text('Restaurants within ${widget.user.preferences.searchRadius} mi'),
                value: _nearbyOnly,
                onChanged: (v) {
                  setState(() => _nearbyOnly = v);
                  _load();
                },
              ),
              const SizedBox(height: AppSpace.s2),
              if (_note != null) ...[ErrorBanner(message: _note!, info: true), const SizedBox(height: AppSpace.s3)],
              if (_error != null) ...[
                ErrorBanner(message: _error!, actionLabel: plan == null ? 'Try again' : null, onAction: _load),
                const SizedBox(height: AppSpace.s3),
              ],
              if (plan == null && _error == null)
                StatusMessage(
                  message: _nearbyOnly && _nearbyChains == null
                      ? 'Finding restaurants near you… This can take up to a minute.'
                      : 'Planning your meals…',
                  loading: true,
                ),
              if (plan != null)
                for (final day in plan.days) ...[_dayCard(day, plan.mode), const SizedBox(height: AppSpace.s6)],
            ],
          ),
        ),
      ),
    );
  }

  Widget _dayCard(MealPlanDay day, RecommendationMode mode) {
    final t = day.totals;
    final allAdded = day.items.every((i) => _added.contains('${day.date}|${i.item.id}'));
    final busy = day.items.any((i) => _adding.contains('${day.date}|${i.item.id}'));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(_dayTitle(day.date), style: Theme.of(context).textTheme.titleLarge),
        Text(
          '${formatCalories(day.remainingCalories)} cal left · up to ${formatCalories(day.mealCalorieLimit)} cal a meal',
          style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
        ),
        const SizedBox(height: AppSpace.s3),
        if (day.items.isEmpty)
          const Text(
            'Not enough left for another meal (each needs at least 300 cal).',
            style: TextStyle(fontSize: 16, color: AppColors.textMuted),
          )
        else ...[
          for (final i in day.items) ...[
            MenuItemCard(item: i.item, score: i.score, mode: mode),
            Align(
              alignment: Alignment.centerRight,
              child: _AddButton(
                added: _added.contains('${day.date}|${i.item.id}'),
                busy: _adding.contains('${day.date}|${i.item.id}'),
                label: 'Add to plan',
                semanticLabel: 'Add ${i.item.name} to ${_dayTitle(day.date)}',
                onPressed: () => _add(day.date, [i]),
              ),
            ),
          ],
          Text(
            'In all: ${formatCalories(t.calories)} cal, ${t.incomplete ? 'at least ' : ''}${formatGrams(t.proteinG)} g protein',
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpace.s2),
          if (allAdded)
            const OutlinedButton(onPressed: null, child: Text('All added'))
          else
            OutlinedButton(
              onPressed: busy ? null : () => _add(day.date, day.items),
              child: Text('Add the whole day (${day.items.length})'),
            ),
        ],
      ],
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton({
    required this.added,
    required this.busy,
    required this.label,
    required this.semanticLabel,
    required this.onPressed,
  });

  final bool added;
  final bool busy;
  final String label;
  final String semanticLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      button: true,
      label: added ? '$semanticLabel: added' : semanticLabel,
      onTap: added || busy ? null : onPressed,
      excludeSemantics: true,
      child: TextButton.icon(
        onPressed: added || busy ? null : onPressed,
        icon: Icon(added ? Icons.check : Icons.add, size: 18),
        label: Text(added ? 'Added' : label),
      ),
    );
  }
}
