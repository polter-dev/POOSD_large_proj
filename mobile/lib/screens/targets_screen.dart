import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import 'app_shell.dart';
import 'profile_screen.dart';

// The server's lowest daily target (backend services/calories.js): a "lose" target below it is raised.
const _floor = {Sex.female: 1200, Sex.male: 1500};
const _goalAdjust = {Goal.lose: -500, Goal.maintain: 0, Goal.gain: 300};

/// The line under the daily target. Says when the floor raised it, since the server does that quietly.
String _targetNote(Profile p, Calories cal) {
  if (cal.target > cal.maintenance + _goalAdjust[p.goal]!) {
    return 'cal a day, raised to the ${formatCalories(_floor[p.sex]!)} cal minimum';
  }
  return switch (p.goal) {
    Goal.lose => 'cal a day to lose about 1 lb a week',
    Goal.gain => 'cal a day to gain about half a pound a week',
    Goal.maintain => 'cal a day, the same as maintenance',
  };
}

/// #35, prototype screen 06 (same as web TargetsPage): GET /users/me/calories as three numbers,
/// what the user entered with an Edit link, and the way on to food. The Profile tab.
class TargetsScreen extends StatefulWidget {
  const TargetsScreen({super.key, required this.user, required this.onUser, required this.onFindFood});

  final User user; // has a profile (AppShell is only shown once it does)
  final ValueChanged<User> onUser;
  final VoidCallback onFindFood;

  @override
  State<TargetsScreen> createState() => _TargetsScreenState();
}

class _TargetsScreenState extends State<TargetsScreen> {
  Calories? _cal;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  // Load again after an edit: the shell hands down the new user.
  @override
  void didUpdateWidget(TargetsScreen old) {
    super.didUpdateWidget(old);
    if (old.user != widget.user) _load();
  }

  Future<void> _load() async {
    final user = widget.user;
    try {
      final cal = await ApiScope.of(context).getCalories();
      if (!mounted || user != widget.user) return;
      setState(() {
        _cal = cal;
        _error = null;
      });
    } on ApiError catch (e) {
      if (mounted && user == widget.user) setState(() => _error = e.message);
    }
  }

  Future<void> _edit() async {
    final updated = await Navigator.of(context)
        .push<User>(MaterialPageRoute(builder: (_) => ProfileScreen(user: widget.user, setup: false)));
    if (updated != null) widget.onUser(updated);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final user = widget.user;
    final profile = user.profile!;
    final units = user.preferences.units;
    final cal = _cal;
    return Scaffold(
      appBar: appBar(
        'Your targets',
        actions: [TextButton(onPressed: () => logOut(context), child: const Text('Log out'))],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(), // pull to refresh even when it all fits
          padding: const EdgeInsets.all(AppSpace.s4),
          children: [
            Text(
              "Hi ${user.firstName}. Here's what fits your goal.",
              style: t.bodyLarge?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: AppSpace.s4),
            if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: AppSpace.s4)],
            if (cal != null) ...[
              _Tile(
                label: 'Maintenance',
                value: cal.maintenance,
                note: 'cal a day to stay at ${formatWeight(profile.weightLb, units)}',
              ),
              const SizedBox(height: AppSpace.s3),
              _Tile(label: 'Daily target', value: cal.target, note: _targetNote(profile, cal), strong: true),
              const SizedBox(height: AppSpace.s3),
              _Tile(
                label: 'Per meal',
                value: cal.perMeal,
                note: user.preferences.mealCalorieLimit != null
                    ? 'cal, the per-meal limit you set'
                    : 'cal, your target split over 3 meals',
              ),
            ] else if (_error == null)
              const StatusMessage(message: 'Working out your targets…', loading: true),
            const SizedBox(height: AppSpace.s4),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('What you entered', style: t.titleLarge)),
                      TextButton(
                        onPressed: _edit,
                        style: TextButton.styleFrom(
                          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        child: const Text('Edit'),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.s2),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 3,
                    children: [
                      for (final (label, value) in [
                        ('Height', formatHeight(profile.heightIn, units)),
                        ('Weight', formatWeight(profile.weightLb, units)),
                        ('Age', cal == null ? '…' : '${cal.age}'),
                        ('Sex', capitalize(profile.sex.name)),
                        ('Activity', activityLabels[profile.activityLevel]!.short),
                        ('Goal', capitalize(profile.goal.name)),
                      ])
                        MergeSemantics(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(label, style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
                              Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s6),
            FilledButton(onPressed: widget.onFindFood, child: const Text('Find food near me')),
            const SizedBox(height: AppSpace.s4),
            const Text(
              'Estimates from the Mifflin-St Jeor formula, not medical advice.',
              style: TextStyle(fontSize: 14, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.value, required this.note, this.strong = false});

  final String label;
  final int value;
  final String note;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final muted = strong ? AppColors.fitGreatText : AppColors.textMuted;
    return MergeSemantics(
      child: AppCard(
        highlight: strong,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 14, color: muted)),
            const SizedBox(height: AppSpace.s1),
            Text(
              formatCalories(value),
              style: Theme.of(context).textTheme.displayMedium?.copyWith(
                color: strong ? AppColors.fitGreatText : AppColors.text,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: AppSpace.s1),
            Text(note, style: TextStyle(fontSize: 14, color: muted)),
          ],
        ),
      ),
    );
  }
}
