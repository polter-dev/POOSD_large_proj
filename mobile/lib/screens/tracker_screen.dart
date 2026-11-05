import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import 'photo_log_screen.dart';
import 'plan_screen.dart';
import 'search_screen.dart' show searchable;

enum _Span { day, week }

const _labels = {
  Nutrient.calories: 'Calories',
  Nutrient.protein: 'Protein',
  Nutrient.carbs: 'Carbs',
  Nutrient.fat: 'Fat',
};
const _colors = {
  Nutrient.calories: AppColors.primary,
  Nutrient.protein: AppColors.macroProtein,
  Nutrient.carbs: AppColors.macroCarbs,
  Nutrient.fat: AppColors.macroFat,
};

DateTime _today() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
}

double _amount(Nutrient n, Totals t) => switch (n) {
  Nutrient.calories => t.calories.toDouble(),
  Nutrient.protein => t.proteinG,
  Nutrient.carbs => t.carbsG,
  Nutrient.fat => t.fatG,
};

double _dailyGoal(Nutrient n, Calories c) => switch (n) {
  Nutrient.calories => c.target,
  Nutrient.protein => c.macros.proteinG,
  Nutrient.carbs => c.macros.carbsG,
  Nutrient.fat => c.macros.fatG,
}.toDouble();

/// Whether an eaten entry doesn't know [n], so its total is only a lower bound. Totals.incomplete can't say
/// which macro was unknown, and a salad's missing fat shouldn't make protein read "at least".
bool _unknown(Nutrient n, Iterable<MealLog> entries) => entries.any(
  (e) =>
      e.status == MealLogStatus.eaten &&
      switch (n) {
        Nutrient.calories => false,
        Nutrient.protein => e.proteinG == null,
        Nutrient.carbs => e.carbsG == null,
        Nutrient.fat => e.fatG == null,
      },
);

String _format(Nutrient n, double v) => n == Nutrient.calories ? '${formatCalories(v)} cal' : '${formatGrams(v)} g';

/// A week's totals: the days' sums, unknown when any day had an unknown macro.
Totals _sum(Iterable<Totals> days) {
  var calories = 0, protein = 0.0, carbs = 0.0, fat = 0.0;
  var incomplete = false;
  for (final t in days) {
    calories += t.calories;
    protein += t.proteinG;
    carbs += t.carbsG;
    fat += t.fatG;
    incomplete |= t.incomplete;
  }
  return Totals(
    calories: calories,
    proteinG: round1(protein),
    carbsG: round1(carbs),
    fatG: round1(fat),
    incomplete: incomplete,
  );
}

/// #118, the Tracker tab: what was eaten (and is planned) on a day or a week against the goals from
/// GET /users/me/calories (a week's goal is the daily one x 7, contract "Calories"). Bars only for the
/// tracked nutrients, which the chips change (PATCH preferences). Days are the phone's own calendar.
class TrackerScreen extends StatefulWidget {
  const TrackerScreen({super.key, required this.user, required this.onUser});

  final User user; // has a profile (AppShell is only shown once it does)
  final ValueChanged<User> onUser;

  @override
  State<TrackerScreen> createState() => _TrackerScreenState();
}

class _TrackerScreenState extends State<TrackerScreen> {
  _Span _span = _Span.day;
  DateTime _day = _today(); // the day shown, or a day in the week shown
  late List<Nutrient> _tracked = widget.user.preferences.trackedNutrients;
  Calories? _cal;
  MealLogsResponse? _logs;
  String? _error;
  int _request = 0; // only the newest range's answer is shown when paging quickly
  int _trackRequest = 0;
  User? _sent; // the User this screen handed to onUser, so its own change doesn't reset the chips
  final _busy = <String>{}; // entry ids with a change in flight

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(TrackerScreen old) {
    super.didUpdateWidget(old);
    if (old.user == widget.user) return;
    if (widget.user != _sent) _tracked = widget.user.preferences.trackedNutrients;
    if (!old.user.sameTargets(widget.user)) {
      _cal = null; // a new goal or weight: new targets
      _load();
    }
  }

  (DateTime, DateTime) get _range {
    if (_span == _Span.day) return (_day, _day);
    final monday = addDays(_day, 1 - _day.weekday);
    return (monday, addDays(monday, 6));
  }

  Future<void> _load() async {
    final request = ++_request;
    final (from, to) = _range;
    final api = ApiScope.of(context);
    if (_error != null) setState(() => _error = null);
    try {
      final cal = _cal ?? await api.getCalories();
      final logs = await api.getMealLogs(from: ymd(from), to: ymd(to));
      if (!mounted || request != _request) return;
      setState(() {
        _cal = cal;
        _logs = logs;
      });
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    }
  }

  void _setSpan(_Span span) {
    if (span == _span) return;
    setState(() {
      _span = span;
      _logs = null;
    });
    _load();
  }

  void _page(int direction) {
    setState(() {
      _day = addDays(_day, direction * (_span == _Span.day ? 1 : 7));
      _logs = null;
    });
    _load();
  }

  // The chips change preferences.trackedNutrients. The bars follow at once; a failed save puts them back.
  Future<void> _toggle(Nutrient n) async {
    final before = _tracked;
    final next = before.contains(n) ? [...before.where((t) => t != n)] : [...before, n];
    if (next.isEmpty) return; // at least one (contract: 1-4)
    final request = ++_trackRequest;
    setState(() {
      _tracked = next;
      _error = null;
    });
    try {
      final user = await ApiScope.of(context).updatePreferences(trackedNutrients: next);
      if (!mounted || request != _trackRequest) return;
      _sent = user;
      widget.onUser(user);
    } on ApiError catch (e) {
      if (mounted && request == _trackRequest) {
        setState(() {
          _tracked = before;
          _error = e.message;
        });
      }
    }
  }

  Future<void> _change(MealLog entry, Future<void> Function(Api api) change) async {
    if (!_busy.add(entry.id)) return;
    setState(() => _error = null);
    try {
      await change(ApiScope.of(context));
      await _load();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy.remove(entry.id));
    }
  }

  // Where new food goes: the day shown; in a week, today when it's in that week, else its Monday.
  DateTime get _target {
    final (from, to) = _range;
    final today = _today();
    return _span == _Span.day || today.isBefore(from) || today.isAfter(to) ? from : today;
  }

  Future<void> _add() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _AddFoodSheet(date: _target),
    );
    if (added == true) _load();
  }

  // Plan and Photo log only on "Add to plan" / "Log", and say so when they close.
  Future<void> _open(Widget screen) async {
    final added = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => screen));
    if (added == true) _load();
  }

  String get _rangeLabel {
    final (from, to) = _range;
    final today = _today();
    if (_span == _Span.week) return '${shortDate(from)} – ${shortDate(to)}';
    if (from == today) return 'Today';
    if (from == addDays(today, -1)) return 'Yesterday';
    if (from == addDays(today, 1)) return 'Tomorrow';
    return weekdayDate(from);
  }

  @override
  Widget build(BuildContext context) {
    final cal = _cal;
    final logs = _logs;
    final days = _span == _Span.day ? 1 : 7;
    final eaten = logs == null ? null : _sum(logs.days.map((d) => d.eaten));
    final planned = logs == null ? null : _sum(logs.days.map((d) => d.planned));
    return Scaffold(
      appBar: appBar('Tracker'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add),
        label: const Text('Add food'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // pull to refresh even when it all fits
          padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s4, AppSpace.s4, 96), // room for the button
          children: [
            SegmentedChoice<_Span>(
              options: const [(_Span.day, 'Day'), (_Span.week, 'Week')],
              value: _span,
              onChanged: _setSpan,
            ),
            const SizedBox(height: AppSpace.s2),
            Row(
              children: [
                IconButton(
                  tooltip: _span == _Span.day ? 'Previous day' : 'Previous week',
                  onPressed: () => _page(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(_rangeLabel, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
                ),
                IconButton(
                  tooltip: _span == _Span.day ? 'Next day' : 'Next week',
                  onPressed: () => _page(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s3),
            if (_error != null) ...[
              ErrorBanner(message: _error!, actionLabel: logs == null ? 'Try again' : null, onAction: _load),
              const SizedBox(height: AppSpace.s4),
            ],
            if (cal == null || eaten == null || planned == null)
              if (_error == null)
                const StatusMessage(message: 'Loading your log…', loading: true)
              else
                const SizedBox.shrink()
            else ...[
              AppCard(
                child: Column(
                  children: [
                    for (final (i, n) in _tracked.indexed) ...[
                      if (i > 0) const SizedBox(height: AppSpace.s4),
                      _GoalBar(
                        nutrient: n,
                        eaten: _amount(n, eaten),
                        planned: _amount(n, planned),
                        goal: _dailyGoal(n, cal) * days,
                        atLeast: _unknown(n, logs!.entries),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpace.s3),
              Wrap(
                spacing: AppSpace.s2,
                runSpacing: AppSpace.s2,
                children: [
                  for (final n in Nutrient.values)
                    FilterChip(
                      label: Text(_labels[n]!),
                      selected: _tracked.contains(n),
                      // The last one can't be turned off: the server keeps at least one.
                      onSelected: _tracked.length == 1 && _tracked.contains(n) ? null : (_) => _toggle(n),
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.s4),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _open(PlanScreen(user: widget.user, start: _target)),
                      icon: const Icon(Icons.restaurant_menu),
                      label: const Text('Plan meals'),
                    ),
                  ),
                  const SizedBox(width: AppSpace.s3),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _open(PhotoLogScreen(date: _target)),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Log a photo'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s6),
              ..._entries(logs!),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _entries(MealLogsResponse logs) {
    if (logs.entries.isEmpty) {
      return [
        StatusMessage(
          title: 'Nothing logged',
          message: _span == _Span.day ? 'Tap Add food to log what you ate.' : 'Nothing logged this week yet.',
        ),
      ];
    }
    final rows = <Widget>[];
    String? date;
    for (final e in logs.entries) {
      // A week lists its days in order, each under its own heading (entries come sorted by date).
      if (_span == _Span.week && e.date != date) {
        date = e.date;
        if (rows.isNotEmpty) rows.add(const SizedBox(height: AppSpace.s2));
        rows.add(
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpace.s2),
            child: Text(
              weekdayDate(DateTime.parse(e.date)),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textMuted),
            ),
          ),
        );
      } else if (rows.isNotEmpty) {
        rows.add(const SizedBox(height: AppSpace.s2));
      }
      rows.add(
        _EntryRow(
          entry: e,
          busy: _busy.contains(e.id),
          onAte: () => _change(e, (api) => api.updateMealLog(e.id, status: MealLogStatus.eaten)),
          onRemove: () => _change(e, (api) => api.deleteMealLog(e.id)),
        ),
      );
    }
    return rows;
  }
}

/// One tracked nutrient against its goal: "710 / 1,558 cal", a bar, then what's left and what's planned
/// ("848 cal left · 410 cal planned", as in prototype frames 09-10, #155). A macro an eaten entry leaves unknown
/// reads "at least" eaten, so "at most" left or "at least" over. Over the goal says "N over": red for calories only.
class _GoalBar extends StatelessWidget {
  const _GoalBar({
    required this.nutrient,
    required this.eaten,
    required this.planned,
    required this.goal,
    required this.atLeast,
  });

  final Nutrient nutrient;
  final double eaten;
  final double planned;
  final double goal;
  final bool atLeast;

  @override
  Widget build(BuildContext context) {
    final over = nutrient == Nutrient.calories && eaten > goal;
    final amount = '${atLeast ? 'at least ' : ''}${_format(nutrient, eaten)}';
    final notes = [
      if (eaten > goal)
        '${atLeast ? 'at least ' : ''}${_format(nutrient, eaten - goal)} over'
      else
        '${atLeast ? 'at most ' : ''}${_format(nutrient, goal - eaten)} left',
      if (planned > 0) '${_format(nutrient, planned)} planned',
    ];
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_labels[nutrient]!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
              Text(
                '$amount / ${_format(nutrient, goal)}',
                style: const TextStyle(fontSize: 14, fontFeatures: [FontFeature.tabularFigures()]),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s2),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: LinearProgressIndicator(
              value: goal > 0 ? math.min(1, eaten / goal) : 0,
              minHeight: 8,
              color: over ? AppColors.error : _colors[nutrient],
              backgroundColor: AppColors.surface,
            ),
          ),
          const SizedBox(height: AppSpace.s1),
          Text(notes.join(' · '), style: TextStyle(fontSize: 14, color: over ? AppColors.error : AppColors.textMuted)),
        ],
      ),
    );
  }
}

/// A logged food: name, chain and servings, calories for all its servings, and its buttons. Planned rows are
/// faded and have "Ate it".
class _EntryRow extends StatelessWidget {
  const _EntryRow({required this.entry, required this.busy, required this.onAte, required this.onRemove});

  final MealLog entry;
  final bool busy;
  final VoidCallback onAte;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    final planned = e.status == MealLogStatus.planned;
    final servings = '${plainNumber(e.servings)} ${e.servings == 1 ? 'serving' : 'servings'}';
    return AppCard(
      child: Row(
        children: [
          Expanded(
            child: Opacity(
              opacity: planned ? 0.6 : 1,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(e.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    [?e.chainName, servings, if (planned) 'planned'].join(' · '),
                    style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: AppSpace.s2),
          Opacity(
            opacity: planned ? 0.6 : 1,
            child: Text(
              '${formatCalories(e.calories * e.servings)} cal',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
          if (planned) TextButton(onPressed: busy ? null : onAte, child: const Text('Ate it')),
          IconButton(
            tooltip: 'Remove ${e.name}',
            onPressed: busy ? null : onRemove,
            icon: const Icon(Icons.delete_outline, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

/// "Add food": search the menus (like the Search tab, as you type), pick an item and its servings, then
/// POST /meal-logs with source "search". Pops true once something was added.
class _AddFoodSheet extends StatefulWidget {
  const _AddFoodSheet({required this.date});

  final DateTime date;

  @override
  State<_AddFoodSheet> createState() => _AddFoodSheetState();
}

class _AddFoodSheetState extends State<_AddFoodSheet> {
  final _q = TextEditingController();
  Timer? _timer;
  int _request = 0;
  List<MenuItem>? _results;
  bool _searching = false;
  MenuItem? _picked;
  double _servings = 1;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _timer?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _changed(String text) {
    _timer?.cancel();
    if (!searchable(text.trim())) {
      _request++;
      setState(() {
        _results = null;
        _searching = false;
      });
      return;
    }
    _timer = Timer(const Duration(milliseconds: 250), () => _search(text.trim()));
  }

  Future<void> _search(String q) async {
    final request = ++_request;
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final res = await ApiScope.of(context).searchMenuItems(q);
      if (mounted && request == _request) setState(() => _results = res.items);
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && request == _request) setState(() => _searching = false);
    }
  }

  Future<void> _save() async {
    final item = _picked!;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ApiScope.of(context).addMealLogs([
        MealLogEntry.menuItem(
          date: ymd(widget.date),
          menuItemId: item.id,
          source: MealLogSource.search,
          servings: _servings,
        ),
      ]);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final picked = _picked;
    final results = _results;
    return Padding(
      // Above the keyboard.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.85,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Add food', style: Theme.of(context).textTheme.titleLarge),
              Text('To ${weekdayDate(widget.date)}', style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
              const SizedBox(height: AppSpace.s3),
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: AppSpace.s3)],
              if (picked == null) ...[
                TextField(
                  controller: _q,
                  autofocus: true,
                  maxLength: 100,
                  textInputAction: TextInputAction.search,
                  onChanged: _changed,
                  decoration: const InputDecoration(
                    hintText: 'Search menu items',
                    counterText: '',
                    prefixIcon: Icon(Icons.search, color: AppColors.textMuted),
                  ),
                ),
                const SizedBox(height: AppSpace.s2),
                Expanded(
                  child: results == null
                      ? (_searching ? const Center(child: CircularProgressIndicator()) : const SizedBox.shrink())
                      : results.isEmpty
                      ? StatusMessage(message: 'No menu items match "${_q.text.trim()}".')
                      : ListView.separated(
                          itemCount: results.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final item = results[i];
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(item.name),
                              subtitle: Text('${item.chainName} · ${formatCalories(item.calories)} cal'),
                              onTap: () => setState(() => _picked = item),
                            );
                          },
                        ),
                ),
              ] else ...[
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(picked.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      Text(
                        '${picked.chainName} · ${formatCalories(picked.calories)} cal a serving',
                        style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.s4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton.outlined(
                      tooltip: 'Fewer servings',
                      onPressed: _servings > 0.5 ? () => setState(() => _servings -= 0.5) : null,
                      icon: const Icon(Icons.remove),
                    ),
                    SizedBox(
                      width: 120,
                      child: Text(
                        '${plainNumber(_servings)} ${_servings == 1 ? 'serving' : 'servings'}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton.outlined(
                      tooltip: 'More servings',
                      onPressed: _servings < 10 ? () => setState(() => _servings += 0.5) : null,
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.s2),
                Text(
                  '${formatCalories(picked.calories * _servings)} cal in all',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                ),
                const Spacer(),
                FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Adding…' : 'Add')),
                const SizedBox(height: AppSpace.s2),
                OutlinedButton(
                  onPressed: _saving ? null : () => setState(() => _picked = null),
                  child: const Text('Pick something else'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
