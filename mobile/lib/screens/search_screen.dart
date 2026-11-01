import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

/// #35, the Search tab: GET /menu-items/search by item name, 20 at a time. No score and no fit pill,
/// since search isn't ranked by goal (spec, Menu item card).
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
  int _request = 0;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  /// A new search, or [more] for the next page of the same one.
  Future<void> _search({bool more = false}) async {
    final q = more ? _shownQuery! : _q.text.trim();
    if (q.isEmpty) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      if (!more) {
        _items.clear();
        _shownQuery = q;
      }
    });
    try {
      final res = await ApiScope.of(context).searchMenuItems(q, skip: more ? _items.length : 0);
      if (!mounted || request != _request) return;
      setState(() {
        _items.addAll(res.items);
        _total = res.total;
      });
    } on ApiError catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
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
          if (q == null)
            const StatusMessage(message: 'Search every restaurant\'s menu by item name, like "chicken" or "salad".')
          else if (_items.isEmpty && _loading)
            const StatusMessage(message: 'Searching…', loading: true)
          else if (_items.isEmpty && _error == null)
            StatusMessage(title: 'No matches', message: 'No menu items match "$q".')
          else if (_items.isNotEmpty) ...[
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
