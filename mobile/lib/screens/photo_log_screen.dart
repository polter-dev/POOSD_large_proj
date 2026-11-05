import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../services/photos.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';

/// One row of the confirm list: a PhotoItem the user can change before anything is logged.
class _Draft {
  _Draft(this.base)
    : name = base.name,
      servings = base.servings,
      calories = base.calories,
      proteinG = base.proteinG,
      carbsG = base.carbsG,
      fatG = base.fatG;

  final PhotoItem base; // what the analysis returned; the fields below are what the user has now
  String name;
  double servings;
  double calories;
  double? proteinG;
  double? carbsG;
  double? fatG;

  bool get changed =>
      name != base.name ||
      calories != base.calories ||
      proteinG != base.proteinG ||
      carbsG != base.carbsG ||
      fatG != base.fatG;

  /// Decided when logging, like web's toEntry (#152): a matched item the user hasn't changed (or changed back) goes
  /// as its menuItemId, so the server copies the menu's values. Anything else is a custom entry with these
  /// numbers, since a menuItemId entry may only change servings.
  bool get matched => base.menuItemId != null && !changed;

  MealLogEntry entry(String date) => matched
      ? MealLogEntry.menuItem(date: date, menuItemId: base.menuItemId!, source: MealLogSource.photo, servings: servings)
      : MealLogEntry.custom(
          date: date,
          source: MealLogSource.photo,
          name: name,
          chainName: base.chainName,
          calories: calories,
          proteinG: proteinG,
          carbsG: carbsG,
          fatG: fatG,
          servings: servings,
        );
}

/// #119, opened from the Tracker: a meal photo -> POST /photo-analyses -> a confirm list -> POST /meal-logs
/// (source photo) for [date]. Nothing is logged until "Log", and the photo is only sent for the analysis,
/// never stored (contract, Photo analysis). Pops true once something was logged.
class PhotoLogScreen extends StatefulWidget {
  const PhotoLogScreen({super.key, required this.date});

  final DateTime date;

  @override
  State<PhotoLogScreen> createState() => _PhotoLogScreenState();
}

class _PhotoLogScreenState extends State<PhotoLogScreen> {
  MealPhoto? _photo;
  bool _analyzing = false;
  ({String title, String message, bool retry})? _problem;
  List<_Draft>? _drafts;
  bool _logging = false;
  String? _logError;

  Future<void> _pick(PhotoFrom from) async {
    final bytes = await ApiScope.photosOf(context).pick(from);
    if (bytes == null || !mounted) return; // backed out of the picker
    final photo = MealPhoto.fromBytes(bytes);
    if (photo == null) {
      setState(() {
        _drafts = null;
        _problem = (title: "Can't read that photo", message: 'Use a JPEG, PNG or WebP photo.', retry: false);
      });
      return;
    }
    _photo = photo;
    await _analyze();
  }

  Future<void> _analyze() async {
    final photo = _photo!;
    setState(() {
      _analyzing = true;
      _problem = null;
      _drafts = null;
    });
    try {
      final items = await ApiScope.of(context).analyzePhoto(imageBase64: photo.base64, mediaType: photo.mediaType);
      if (!mounted) return;
      setState(() {
        _drafts = [for (final i in items) _Draft(i)];
        if (items.isEmpty) {
          _problem = (
            title: 'No food recognized',
            message: 'Try a closer photo with the whole meal in view.',
            retry: false,
          );
        }
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _problem = switch (e.status) {
          429 => (
            title: 'Daily photo limit reached',
            message: 'You can log 20 photos a day. Add food by search instead, or try again tomorrow.',
            retry: false,
          ),
          503 => (
            title: "Photo logging isn't available",
            message: "It's turned off on the server right now. Add food by search instead.",
            retry: false,
          ),
          413 => (title: 'Photo too large', message: 'Try another photo.', retry: false),
          _ => (title: "Couldn't read the photo", message: e.message, retry: true),
        };
      });
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  Future<void> _log() async {
    final drafts = _drafts!;
    setState(() {
      _logging = true;
      _logError = null;
    });
    try {
      await ApiScope.of(context).addMealLogs([for (final d in drafts) d.entry(ymd(widget.date))]);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _logError = e.message;
          _logging = false;
        });
      }
    }
  }

  Future<void> _edit(_Draft d) async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => _EditDialog(draft: d),
    );
    if (changed == true) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final drafts = _drafts;
    final problem = _problem;
    final pickButtons = [
      FilledButton.icon(
        onPressed: () => _pick(PhotoFrom.camera),
        icon: const Icon(Icons.photo_camera_outlined),
        label: const Text('Take a photo'),
      ),
      OutlinedButton.icon(
        onPressed: () => _pick(PhotoFrom.gallery),
        icon: const Icon(Icons.photo_library_outlined),
        label: const Text('Choose a photo'),
      ),
    ];
    return Scaffold(
      appBar: appBar('Log from a photo'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          if (_analyzing)
            const StatusMessage(message: 'Reading your photo… This can take up to a minute.', loading: true)
          else if (problem != null)
            StatusMessage(
              title: problem.title,
              message: problem.message,
              actions: [
                if (problem.retry) FilledButton(onPressed: _analyze, child: const Text('Try again')),
                if (!problem.retry) ...pickButtons,
              ],
            )
          else if (drafts == null)
            StatusMessage(
              title: 'Log a meal from a photo',
              message:
                  'We list the food we can see, and you check it before anything is logged. '
                  'The photo is only used for this and is not saved.',
              actions: pickButtons,
            )
          else ...[
            Text('Check what we found', style: Theme.of(context).textTheme.titleLarge),
            Text(
              'Logging to ${weekdayDate(widget.date)}. Fix the servings and remove anything that\'s wrong.',
              style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
            ),
            const SizedBox(height: AppSpace.s4),
            if (_logError != null) ...[ErrorBanner(message: _logError!), const SizedBox(height: AppSpace.s3)],
            if (drafts.isEmpty)
              const StatusMessage(message: 'Nothing left to log.')
            else
              for (final (i, d) in drafts.indexed) ...[
                if (i > 0) const SizedBox(height: AppSpace.s3),
                _DraftCard(
                  draft: d,
                  onServings: (s) => setState(() => d.servings = s),
                  onRemove: () => setState(() => drafts.remove(d)),
                  onEdit: () => _edit(d),
                ),
              ],
            const SizedBox(height: AppSpace.s6),
            FilledButton(
              onPressed: drafts.isEmpty || _logging ? null : _log,
              child: Text(_logging ? 'Logging…' : 'Log ${drafts.length} ${drafts.length == 1 ? 'item' : 'items'}'),
            ),
            const SizedBox(height: AppSpace.s2),
            OutlinedButton(
              onPressed: _logging ? null : () => setState(() => _drafts = null),
              child: const Text('Use another photo'),
            ),
          ],
        ],
      ),
    );
  }
}

// The server clamps a photo's servings to 0.25-10 but doesn't round them, so 0.33 or 9.9 can arrive. The
// stepper moves to the next quarter in that direction and stays in range: 0.33 -> 0.25 or 0.5, 9.9 -> 10.
// Quarters are exact in binary, so no 0.08000000000000002.
double _fewer(double s) => math.max(0.25, ((s * 4).ceil() - 1) / 4);
double _more(double s) => math.min(10, ((s * 4).floor() + 1) / 4);

class _DraftCard extends StatelessWidget {
  const _DraftCard({required this.draft, required this.onServings, required this.onRemove, required this.onEdit});

  final _Draft draft;
  final ValueChanged<double> onServings;
  final VoidCallback onRemove;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final d = draft;
    final chain = d.base.chainName;
    String g(String letter, double? v) => '$letter ${v == null ? '?' : '${formatGrams(v)} g'}';
    // Same wording as web (#152).
    final where = d.base.menuItemId == null
        ? (chain == null ? 'Not on our menus' : '$chain · not on our menus')
        : d.matched
        ? chain!
        : '$chain · edited, logged as custom';
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
                    Text(d.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    Text(where, style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Remove ${d.name}',
                onPressed: onRemove,
                icon: const Icon(Icons.close, color: AppColors.textMuted),
              ),
            ],
          ),
          if (d.base.confidence != PhotoConfidence.high) ...[
            const SizedBox(height: AppSpace.s1),
            Pill(
              text: d.base.confidence == PhotoConfidence.low ? 'Not sure: check this one' : 'Fairly sure',
              icon: Icons.help_outline,
              bg: AppColors.fitOkBg,
              fg: AppColors.fitOkText,
            ),
          ],
          const SizedBox(height: AppSpace.s2),
          Text(
            '${formatCalories(d.calories)} cal a serving · ${g('P', d.proteinG)} · ${g('C', d.carbsG)} · ${g('F', d.fatG)}',
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpace.s2),
          Row(
            children: [
              IconButton.outlined(
                tooltip: 'Fewer servings of ${d.name}',
                onPressed: d.servings > 0.25 ? () => onServings(_fewer(d.servings)) : null,
                icon: const Icon(Icons.remove),
              ),
              SizedBox(
                width: 110,
                child: Text(
                  '${plainNumber(d.servings)} ${d.servings == 1 ? 'serving' : 'servings'}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
              IconButton.outlined(
                tooltip: 'More servings of ${d.name}',
                onPressed: d.servings < 10 ? () => onServings(_more(d.servings)) : null,
                icon: const Icon(Icons.add),
              ),
              const Spacer(),
              TextButton(onPressed: onEdit, child: const Text('Edit')),
            ],
          ),
        ],
      ),
    );
  }
}

/// Name, calories and macros of any item on the list. Changing a matched item's numbers logs it as a custom
/// entry (see _Draft.matched). A blank macro means unknown (sent as null, never 0).
class _EditDialog extends StatefulWidget {
  const _EditDialog({required this.draft});

  final _Draft draft;

  @override
  State<_EditDialog> createState() => _EditDialogState();
}

class _EditDialogState extends State<_EditDialog> {
  late final _name = TextEditingController(text: widget.draft.name);
  late final _cal = TextEditingController(text: plainNumber(widget.draft.calories));
  late final _macros = [
    for (final v in [widget.draft.proteinG, widget.draft.carbsG, widget.draft.fatG])
      TextEditingController(text: v == null ? '' : plainNumber(v)),
  ];
  final _errors = <int, String>{}; // field index -> message: 0 name, 1 calories, 2-4 macros

  @override
  void dispose() {
    for (final c in [_name, _cal, ..._macros]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    final name = _name.text.trim();
    final cal = double.tryParse(_cal.text.trim());
    final macros = [for (final c in _macros) c.text.trim()];
    setState(() {
      _errors.clear();
      if (name.isEmpty || name.length > 150) _errors[0] = 'Name: 1 to 150 characters';
      if (cal == null || cal < 0 || cal > 5000) _errors[1] = 'Calories: 0 to 5000';
      for (final (i, m) in macros.indexed) {
        final v = double.tryParse(m);
        if (m.isNotEmpty && (v == null || v < 0)) _errors[i + 2] = 'A number, 0 or more, or blank if unknown';
      }
    });
    if (_errors.isNotEmpty) return;
    // Whether this is still a menu match is worked out at log time (_Draft.matched), so changing the numbers
    // back to the menu's makes it a match again.
    final parsed = [for (final m in macros) m.isEmpty ? null : double.parse(m)];
    widget.draft
      ..name = name
      ..calories = cal!
      ..proteinG = parsed[0]
      ..carbsG = parsed[1]
      ..fatG = parsed[2];
    Navigator.of(context).pop(true);
  }

  Widget _field(int i, String label, TextEditingController c, {bool number = true}) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpace.s3),
    child: TextField(
      controller: c,
      keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
      decoration: InputDecoration(labelText: label, errorText: _errors[i]),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit food'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _field(0, 'Name', _name, number: false),
            _field(1, 'Calories a serving', _cal),
            _field(2, 'Protein (g), blank if unknown', _macros[0]),
            _field(3, 'Carbs (g), blank if unknown', _macros[1]),
            _field(4, 'Fat (g), blank if unknown', _macros[2]),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
