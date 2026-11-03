import 'dart:async';

import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

// The characters the server's normalize() keeps (backend/src/utils/normalize.js): ASCII letters and
// digits, "&" (it becomes "and"), and the accented Latin letters NFD turns into one (é -> e, K-sign -> k).
// Dart has no NFD, so this list was made by running normalize() on every code point. A query with none
// of them is a 400, so it's never sent (same as web's searchable()).
final _kept = RegExp(
  r'[\u0026\u0030-\u0039\u0041-\u005a\u0061-\u007a\u00c0-\u00c5\u00c7-\u00cf\u00d1-\u00d6'
  r'\u00d9-\u00dd\u00e0-\u00e5\u00e7-\u00ef\u00f1-\u00f6\u00f9-\u00fd\u00ff-\u010f\u0112-\u0125'
  r'\u0128-\u0130\u0134-\u0137\u0139-\u013e\u0143-\u0148\u014c-\u0151\u0154-\u0165\u0168-\u017e'
  r'\u01a0-\u01a1\u01af-\u01b0\u01cd-\u01dc\u01de-\u01e1\u01e6-\u01ed\u01f0\u01f4-\u01f5'
  r'\u01f8-\u01fb\u0200-\u021b\u021e-\u021f\u0226-\u0233\u1e00-\u1e99\u1ea0-\u1ef9\u212a-\u212b]',
);

bool searchable(String q) => _kept.hasMatch(q);

const _debounce = Duration(milliseconds: 250);

/// #35, the Search tab: GET /menu-items/search by item name, updating as you type (debounced, like
/// web) and 20 at a time. No score and no fit pill, since search isn't ranked by goal (spec, Menu item card).
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _q = TextEditingController();
  String? _shownQuery; // what the results are for
  final _items = <MenuItem>[];
  int _total = 0;
  bool _loading = false;
  String? _error;
  int _request = 0; // a slow answer for an older query never replaces a newer one
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _q.dispose();
    super.dispose();
  }

  /// A new search, or [more] for the next page of the same one.
  Future<void> _search({bool more = false}) async {
    if (!more) _timer?.cancel(); // Show more mid-pause keeps the newer query's pending search
    final q = more ? _shownQuery! : _q.text.trim();
    if (!searchable(q)) return;
    final request = ++_request;
    // The current results stay up until the new ones arrive, so typing doesn't flash a spinner.
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiScope.of(context).searchMenuItems(q, skip: more ? _items.length : 0);
      if (!mounted || request != _request) return;
      setState(() {
        if (!more) {
          _items.clear();
          _shownQuery = q;
        }
        _items.addAll(res.items);
        _total = res.total;
      });
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _changed(String text) {
    _timer?.cancel();
    if (searchable(text.trim())) {
      _timer = Timer(_debounce, _search);
      return;
    }
    // Back to the hint, and drop anything still in flight.
    _request++;
    setState(() {
      _shownQuery = null;
      _items.clear();
      _loading = false;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final q = _shownQuery;
    return Scaffold(
      appBar: appBar('Search'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          TextField(
            controller: _q,
            maxLength: 100,
            textInputAction: TextInputAction.search,
            onChanged: _changed,
            onSubmitted: (_) => _search(),
            decoration: InputDecoration(
              hintText: 'Search menu items',
              counterText: '',
              prefixIcon: const Icon(Icons.search, color: AppColors.textMuted),
              suffixIcon: IconButton(tooltip: 'Search', icon: const Icon(Icons.arrow_forward), onPressed: _search),
            ),
          ),
          const SizedBox(height: AppSpace.s4),
          if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: AppSpace.s4)],
          if (q == null) ...[
            if (_loading)
              const StatusMessage(message: 'Searching…', loading: true)
            else if (_error == null)
              const StatusMessage(message: 'Search every restaurant\'s menu by item name, like "chicken" or "salad".'),
          ] else if (_items.isEmpty)
            StatusMessage(title: 'No matches', message: 'No menu items match "$q".')
          else ...[
            Semantics(
              liveRegion: true,
              child: Text(
                '$_total ${_total == 1 ? 'result' : 'results'} for "$q"',
                style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
              ),
            ),
            const SizedBox(height: AppSpace.s3),
            for (final (i, item) in _items.indexed) ...[
              if (i > 0) const SizedBox(height: AppSpace.s3),
              MenuItemCard(item: item),
            ],
            if (_items.length < _total) ...[
              const SizedBox(height: AppSpace.s4),
              OutlinedButton(
                onPressed: _loading ? null : () => _search(more: true),
                child: Text(_loading ? 'Loading…' : 'Show more'),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
