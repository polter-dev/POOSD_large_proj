import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import 'favorites_screen.dart';
import 'login_screen.dart';
import 'nearby_screen.dart';
import 'picks_screen.dart';
import 'profile_screen.dart';
import 'search_screen.dart';
import 'targets_screen.dart';
import 'tracker_screen.dart';

/// Where a logged-in user goes: profile setup until there's a profile, then the tabs.
Widget homeFor(User user) => user.profile == null ? ProfileScreen(user: user, setup: true) : AppShell(user: user);

Future<void> logOut(BuildContext context) async {
  await ApiScope.of(context).logout();
  if (!context.mounted) return;
  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
}

enum AppTab { nearby, picks, search, saved, tracker, profile }

/// The logged-in app (#35, prototype screens 06-08): bottom tabs Nearby, Picks, Search, Saved, Tracker, Profile.
/// Holds the current user, so a profile or units change reaches every tab. Opens on Profile (Your
/// targets) like the prototype's Log in link, and builds a tab the first time it's shown, so
/// Nearby only asks for location once someone opens it.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.user, this.initialTab = AppTab.profile});

  final User user;
  final AppTab initialTab;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late User _user = widget.user;
  late AppTab _tab = widget.initialTab;
  late final Set<AppTab> _opened = {_tab};

  void _select(AppTab tab) => setState(() {
    _tab = tab;
    _opened.add(tab);
  });

  Widget _build(AppTab tab) => switch (tab) {
    AppTab.nearby => NearbyScreen(user: _user, active: _tab == AppTab.nearby),
    AppTab.picks => PicksScreen(user: _user),
    AppTab.search => const SearchScreen(),
    AppTab.saved => FavoritesScreen(active: _tab == AppTab.saved, onFindRestaurants: () => _select(AppTab.nearby)),
    AppTab.tracker => TrackerScreen(user: _user, onUser: (u) => setState(() => _user = u)),
    AppTab.profile => TargetsScreen(
      user: _user,
      onUser: (u) => setState(() => _user = u),
      onFindFood: () => _select(AppTab.nearby),
    ),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab.index,
        children: [for (final t in AppTab.values) _opened.contains(t) ? _build(t) : const SizedBox.shrink()],
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: AppColors.bg,
          surfaceTintColor: Colors.transparent,
          indicatorColor: AppColors.fitGreatBg,
          labelTextStyle: WidgetStateProperty.resolveWith(
            (s) => TextStyle(
              fontSize: 13,
              fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
              color: s.contains(WidgetState.selected) ? AppColors.primary : AppColors.textMuted,
            ),
          ),
          iconTheme: WidgetStateProperty.resolveWith(
            (s) => IconThemeData(color: s.contains(WidgetState.selected) ? AppColors.primary : AppColors.textMuted),
          ),
        ),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: NavigationBar(
            selectedIndex: _tab.index,
            onDestinationSelected: (i) => _select(AppTab.values[i]),
            destinations: const [
              NavigationDestination(icon: Icon(Icons.place_outlined), selectedIcon: Icon(Icons.place), label: 'Nearby'),
              NavigationDestination(icon: Icon(Icons.star_border), selectedIcon: Icon(Icons.star), label: 'Picks'),
              NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
              NavigationDestination(
                icon: Icon(Icons.bookmark_border),
                selectedIcon: Icon(Icons.bookmark),
                label: 'Saved',
              ),
              NavigationDestination(
                icon: Icon(Icons.insert_chart_outlined),
                selectedIcon: Icon(Icons.insert_chart),
                label: 'Tracker',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Profile',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
