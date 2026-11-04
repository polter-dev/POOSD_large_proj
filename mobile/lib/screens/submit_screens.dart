import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../submissions.dart';
import '../theme.dart';
import '../units.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';
import 'my_submissions_screen.dart';

// #120, same as web's SubmissionDialogs (#117): the three community forms. All send POST /submissions; the
// server decides "auto_applied" (written now) or "pending" (an admin reviews it), and the screen says which.
// Each pops true once something was sent, so the screen that opened it can reload.

/// What the user sees once the server has answered.
class _Result extends StatelessWidget {
  const _Result({required this.submission});

  final Submission submission;

  @override
  Widget build(BuildContext context) {
    final applied = submission.status == SubmissionStatus.autoApplied;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ErrorBanner(
          info: true,
          message: applied
              ? 'Applied. Thanks! Your change is live now.'
              : 'Sent for review. An admin will check it, and you can follow it under My submissions.',
        ),
        const SizedBox(height: AppSpace.s4),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Done')),
        const SizedBox(height: AppSpace.s3),
        OutlinedButton(
          onPressed: () =>
              Navigator.of(context)
                  .pushReplacement(MaterialPageRoute<bool>(builder: (_) => const MySubmissionsScreen()), result: true),
          child: const Text('My submissions'),
        ),
      ],
    );
  }
}

/// Sends one submission and keeps what came back or went wrong. The API's 409 and 429 messages are written
/// for users, so they're shown as they are.
mixin _Sender<T extends StatefulWidget> on State<T> {
  bool busy = false;
  String? error;
  Submission? result;

  Future<void> send(SubmissionKind kind, String? targetId, Map<String, dynamic> payload) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final s = await ApiScope.of(context).createSubmission(kind: kind, targetId: targetId, payload: payload);
      if (mounted) setState(() => result = s);
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

String? _number(String? v, {required String label, double? max, bool optional = false}) {
  final s = v?.trim() ?? '';
  if (s.isEmpty) return optional ? null : '$label is required';
  final n = double.tryParse(s);
  if (n == null || n < 0 || (max != null && n > max)) {
    return optional ? '$label: 0 or more grams, or blank if unknown' : '$label: 0 to ${formatCalories(max!)}';
  }
  return null;
}

/// "Suggest a correction" when [item] is given (prefilled; only the changed fields are sent), else "Add an item"
/// to the chain [chainId] / [chainName].
class ItemFormScreen extends StatefulWidget {
  const ItemFormScreen.correction({super.key, required MenuItem this.item}) : chainId = null, chainName = null;

  const ItemFormScreen.add({super.key, required String this.chainId, required String this.chainName}) : item = null;

  final MenuItem? item;
  final String? chainId;
  final String? chainName;

  @override
  State<ItemFormScreen> createState() => _ItemFormScreenState();
}

class _ItemFormScreenState extends State<ItemFormScreen> with _Sender {
  final _form = GlobalKey<FormState>();
  late final MenuItem? _item = widget.item;
  late final _name = TextEditingController(text: _item?.name ?? '');
  late Category? _category = _item?.category;
  String? _categoryError;
  late final _calories = TextEditingController(text: _item == null ? '' : plainNumber(_item.calories));
  late final _macros = [
    for (final v in [_item?.proteinG, _item?.carbsG, _item?.fatG])
      TextEditingController(text: v == null ? '' : plainNumber(v)),
  ];

  @override
  void dispose() {
    for (final c in [_name, _calories, ..._macros]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final valid = _form.currentState!.validate();
    setState(() => _categoryError = _category == null ? 'Category is required' : null);
    if (!valid || _category == null) return;
    double? macro(TextEditingController c) => c.text.trim().isEmpty ? null : double.parse(c.text.trim());
    final fields = <String, dynamic>{
      'name': _name.text.trim(),
      'category': _category!.name,
      'calories': double.parse(_calories.text.trim()),
      'proteinG': macro(_macros[0]),
      'carbsG': macro(_macros[1]),
      'fatG': macro(_macros[2]),
    };
    final item = _item;
    if (item == null) {
      send(SubmissionKind.newItem, widget.chainId, fields);
      return;
    }
    // A correction sends only what changed (contract: edit_item takes a non-empty subset).
    final current = <String, dynamic>{
      'name': item.name,
      'category': item.category.name,
      'calories': item.calories,
      'proteinG': item.proteinG,
      'carbsG': item.carbsG,
      'fatG': item.fatG,
    };
    final changed = {
      for (final e in fields.entries)
        if (e.value != current[e.key]) e.key: e.value,
    };
    if (changed.isEmpty) {
      setState(() => error = 'Change at least one field to suggest a correction.');
      return;
    }
    send(SubmissionKind.editItem, item.id, changed);
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final result = this.result;
    return Scaffold(
      appBar: appBar(item != null ? 'Suggest a correction' : 'Add an item'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          if (result != null)
            _Result(submission: result)
          else
            Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    item != null
                        ? "${item.chainName}. Fix what's wrong; only the fields you change are sent. "
                              "Leave a macro blank if it's unknown."
                        : "To ${widget.chainName}. Leave a macro blank if it's unknown.",
                    style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpace.s4),
                  if (error != null) ...[ErrorBanner(message: error!), const SizedBox(height: AppSpace.s4)],
                  LabeledField(
                    label: 'Name',
                    controller: _name,
                    validator: (v) {
                      final s = v?.trim() ?? '';
                      if (s.isEmpty) return 'Name is required';
                      return s.length > 150 ? 'Name: 150 characters max' : null;
                    },
                  ),
                  const SizedBox(height: AppSpace.s4),
                  const Text('Category', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: AppSpace.s2),
                  DropdownButtonFormField<Category>(
                    initialValue: _category,
                    hint: const Text('Pick a category'),
                    decoration: InputDecoration(errorText: _categoryError),
                    items: [
                      for (final c in Category.values) DropdownMenuItem(value: c, child: Text(categoryLabels[c]!)),
                    ],
                    onChanged: (v) => setState(() {
                      _category = v;
                      _categoryError = null;
                    }),
                  ),
                  const SizedBox(height: AppSpace.s4),
                  LabeledField(
                    label: 'Calories',
                    controller: _calories,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) => _number(v, label: 'Calories', max: 5000),
                  ),
                  for (final (i, label) in ['Protein (g)', 'Carbs (g)', 'Fat (g)'].indexed) ...[
                    const SizedBox(height: AppSpace.s4),
                    LabeledField(
                      label: '$label, blank if unknown',
                      controller: _macros[i],
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) => _number(v, label: label.split(' ').first, optional: true),
                    ),
                  ],
                  const SizedBox(height: AppSpace.s6),
                  PrimaryButton(
                    label: item != null ? 'Send correction' : 'Add item',
                    loading: busy,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// "Add a restaurant": its name, the chain's published nutrition page, and other names it goes by. Always
/// reviewed by an admin (contract: new_chain is always flagged).
class ChainFormScreen extends StatefulWidget {
  const ChainFormScreen({super.key, this.initialName = ''});

  final String initialName;

  @override
  State<ChainFormScreen> createState() => _ChainFormScreenState();
}

class _ChainFormScreenState extends State<ChainFormScreen> with _Sender {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initialName);
  final _url = TextEditingController();
  final _alts = TextEditingController();

  List<String> get _altList => [
    for (final a in _alts.text.split(','))
      if (a.trim().isNotEmpty) a.trim(),
  ];

  @override
  void dispose() {
    for (final c in [_name, _url, _alts]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    final alts = _altList;
    send(SubmissionKind.newChain, null, {
      'name': _name.text.trim(),
      'nutritionSourceUrl': _url.text.trim(),
      if (alts.isNotEmpty) 'alternateNames': alts,
    });
  }

  @override
  Widget build(BuildContext context) {
    final result = this.result;
    return Scaffold(
      appBar: appBar('Add a restaurant'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          if (result != null)
            _Result(submission: result)
          else
            Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'New restaurants are always checked by an admin before they show up.',
                    style: TextStyle(fontSize: 14, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: AppSpace.s4),
                  if (error != null) ...[ErrorBanner(message: error!), const SizedBox(height: AppSpace.s4)],
                  LabeledField(
                    label: 'Restaurant name',
                    controller: _name,
                    validator: (v) {
                      final s = v?.trim() ?? '';
                      if (s.isEmpty) return 'Name is required';
                      return s.length > 100 ? 'Name: 100 characters max' : null;
                    },
                  ),
                  const SizedBox(height: AppSpace.s4),
                  // Not LabeledField: that capitalizes words ("Https://") or lowercases everything, and a
                  // link's path can be case-sensitive.
                  const Text('Nutrition page', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: AppSpace.s2),
                  TextFormField(
                    controller: _url,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.none,
                    autovalidateMode: AutovalidateMode.onUnfocus,
                    decoration: const InputDecoration(hintText: 'https://'),
                    validator: (v) => RegExp(r'^https://\S+$').hasMatch(v?.trim() ?? '')
                        ? null
                        : 'Nutrition page: a link starting with https://',
                  ),
                  const SizedBox(height: AppSpace.s4),
                  LabeledField(
                    label: 'Other names (optional, comma separated)',
                    controller: _alts,
                    textInputAction: TextInputAction.done,
                    validator: (_) {
                      final alts = _altList;
                      if (alts.length > 10) return 'Other names: 10 at most';
                      return alts.any((a) => a.length > 100) ? 'Other names: 100 characters each' : null;
                    },
                  ),
                  const SizedBox(height: AppSpace.s6),
                  PrimaryButton(label: 'Send for review', loading: busy, onPressed: _submit),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A small text button that opens one of the forms, for menu item and restaurant cards.
class ContributeButton extends StatelessWidget {
  const ContributeButton({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onPressed,
    style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2)),
    child: Text(label),
  );
}

/// Opens [screen] and tells the caller whether something was sent.
Future<bool> openSubmissionForm(BuildContext context, Widget screen) async =>
    await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => screen)) ?? false;
