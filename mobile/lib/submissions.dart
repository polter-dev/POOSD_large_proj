import 'package:flutter/material.dart';

import 'models/api_models.dart';
import 'theme.dart';
import 'units.dart';

// Same wording as web/src/submissions.ts (#117), so both apps describe a submission the same way.

const categoryLabels = {
  Category.entree: 'Entree',
  Category.side: 'Side',
  Category.breakfast: 'Breakfast',
  Category.salad: 'Salad',
  Category.drink: 'Drink',
  Category.dessert: 'Dessert',
};

const kindLabels = {
  SubmissionKind.editItem: 'Correction',
  SubmissionKind.newItem: 'New item',
  SubmissionKind.newChain: 'New restaurant',
};

/// Pill wording and colors per status. The text always says it, so color isn't the only signal.
const statusLooks = <SubmissionStatus, ({String label, Color bg, Color fg})>{
  SubmissionStatus.autoApplied: (label: 'Applied', bg: AppColors.fitGreatBg, fg: AppColors.fitGreatText),
  SubmissionStatus.pending: (label: 'In review', bg: AppColors.fitOkBg, fg: AppColors.fitOkText),
  SubmissionStatus.approved: (label: 'Approved', bg: AppColors.fitGreatBg, fg: AppColors.fitGreatText),
  SubmissionStatus.rejected: (label: 'Rejected', bg: AppColors.fitOverBg, fg: AppColors.fitOverText),
  SubmissionStatus.reverted: (label: 'Reverted', bg: AppColors.surface, fg: AppColors.textMuted),
};

const _fieldLabels = {
  'name': 'Name',
  'category': 'Category',
  'calories': 'Calories',
  'proteinG': 'Protein',
  'carbsG': 'Carbs',
  'fatG': 'Fat',
  'nutritionSourceUrl': 'Nutrition page',
  'alternateNames': 'Other names',
};
const _itemFields = ['name', 'category', 'calories', 'proteinG', 'carbsG', 'fatG'];
const _chainFields = ['name', 'nutritionSourceUrl', 'alternateNames'];

String _show(String field, Object? v) {
  if (v == null) return 'unknown';
  if (field == 'calories') return '${formatCalories(v as num)} cal';
  if (field.endsWith('G')) return '${formatGrams((v as num).toDouble())} g';
  if (field == 'category') return categoryLabels[Category.values.byName(v as String)]!;
  if (v is List) return v.isEmpty ? '—' : v.join(', ');
  return '$v';
}

/// One row per field the submission sets: its label, the value before (an applied edit only; a pending edit
/// has no "before" yet) and the proposed value.
List<({String label, String? before, String proposed})> changeRows(Submission s) => [
  for (final f in s.kind == SubmissionKind.newChain ? _chainFields : _itemFields)
    if (s.payload.containsKey(f))
      (
        label: _fieldLabels[f]!,
        before: s.kind == SubmissionKind.editItem && s.before != null ? _show(f, s.before![f]) : null,
        proposed: _show(f, s.payload[f]),
      ),
];

/// The submission's headline: the name it adds, or the item it renames.
String submissionTitle(Submission s) {
  final name = s.payload['name'] as String?;
  if (s.kind != SubmissionKind.editItem) return name ?? '';
  final oldName = s.before?['name'] as String?;
  if (oldName != null) return oldName;
  return name != null ? 'Rename to $name' : 'Menu item';
}

/// "Nov 4, 3:05 PM", in the phone's time zone.
String formatWhen(String iso) {
  final d = DateTime.parse(iso).toLocal();
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${shortDate(d)}, $h:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
}
