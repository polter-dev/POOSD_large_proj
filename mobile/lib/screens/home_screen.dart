import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import 'login_screen.dart';

/// Placeholder for after login until the real screens land (#35): onboarding when the profile is
/// null, the feed otherwise. Shows who is logged in and lets them log out.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.user});

  final User user;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final next = user.profile == null
        ? 'Next: set up your profile (height, weight, birth date, sex, activity level, goal).'
        : 'Next: your daily target and the best picks near you.';
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        scrolledUnderElevation: 0,
        title: const Text('Menu Macro Fitter', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        actions: [
          TextButton(
            onPressed: () async {
              await ApiScope.of(context).logout();
              if (!context.mounted) return;
              Navigator.of(context)
                  .pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
            },
            child: const Text('Log out'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(AppSpace.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Hi, ${user.firstName}', style: t.headlineMedium),
            const SizedBox(height: AppSpace.s2),
            Text(next, style: t.bodyLarge?.copyWith(color: AppColors.textMuted)),
          ],
        ),
      ),
    );
  }
}
