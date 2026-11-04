import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../submissions.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import 'submit_screens.dart';

const _page = 20;

/// #120, same as web's SubmissionsPage (#117): GET /submissions/mine, newest first, with each one's status,
/// what it changes and the reviewer's note. Opened from Profile.
class MySubmissionsScreen extends StatefulWidget {
  const MySubmissionsScreen({super.key});

  @override
  State<MySubmissionsScreen> createState() => _MySubmissionsScreenState();
}

class _MySubmissionsScreenState extends State<MySubmissionsScreen> {
  List<Submission>? _list;
  int _total = 0;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_error != null) setState(() => _error = null);
    try {
      final res = await ApiScope.of(context).getMySubmissions(limit: _page);
      if (!mounted) return;
      setState(() {
        _list = res.submissions;
        _total = res.total;
      });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _more() async {
    setState(() => _loadingMore = true);
    try {
      final res = await ApiScope.of(context).getMySubmissions(limit: _page, skip: _list!.length);
      if (!mounted) return;
      setState(() {
        _list = [..._list!, ...res.submissions];
        _total = res.total;
      });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _addRestaurant() async {
    if (await openSubmissionForm(context, const ChainFormScreen())) _load();
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    return Scaffold(
      appBar: appBar('My submissions'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpace.s4),
          children: [
            const Text(
              "Corrections, new items and restaurants you've sent. Suggest a correction from any menu item.",
              style: TextStyle(fontSize: 16, color: AppColors.textMuted),
            ),
            const SizedBox(height: AppSpace.s3),
            OutlinedButton(onPressed: _addRestaurant, child: const Text('Add a restaurant')),
            const SizedBox(height: AppSpace.s4),
            if (_error != null) ...[
              ErrorBanner(message: _error!, actionLabel: list == null ? 'Try again' : null, onAction: _load),
              const SizedBox(height: AppSpace.s4),
            ],
            if (list == null)
              if (_error == null)
                const StatusMessage(message: 'Loading your submissions…', loading: true)
              else
                const SizedBox.shrink()
            else if (list.isEmpty)
              const StatusMessage(
                title: 'Nothing sent yet',
                message:
                    'Spot a wrong number? Use "Suggest a correction" on any menu item, or add a missing item from a '
                    'restaurant on Nearby.',
              )
            else ...[
              for (final (i, s) in list.indexed) ...[
                if (i > 0) const SizedBox(height: AppSpace.s3),
                _SubmissionCard(submission: s),
              ],
              if (list.length < _total) ...[
                const SizedBox(height: AppSpace.s4),
                OutlinedButton(
                  onPressed: _loadingMore ? null : _more,
                  child: Text(_loadingMore ? 'Loading…' : 'Show more'),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _SubmissionCard extends StatelessWidget {
  const _SubmissionCard({required this.submission});

  final Submission submission;

  @override
  Widget build(BuildContext context) {
    final s = submission;
    final look = statusLooks[s.status]!;
    final rows = changeRows(s);
    const muted = TextStyle(fontSize: 14, color: AppColors.textMuted);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${kindLabels[s.kind]} · ${formatWhen(s.createdAt)}', style: muted),
                    Text(submissionTitle(s), style: Theme.of(context).textTheme.titleLarge),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              Pill(text: look.label, bg: look.bg, fg: look.fg),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.s1),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 110, child: Text(r.label, style: muted)),
                  Expanded(
                    child: Text(
                      r.before == null ? r.proposed : '${r.before} → ${r.proposed}',
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                ],
              ),
            ),
          if (s.reviewNote != null) ...[
            const SizedBox(height: AppSpace.s2),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpace.s3),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppRadius.md)),
              child: Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(
                      text: 'Reviewer note: ',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: s.reviewNote),
                  ],
                ),
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
