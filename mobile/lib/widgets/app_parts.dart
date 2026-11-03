import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../theme.dart';
import '../units.dart';

// Pieces of the logged-in screens, from docs/design-spec.md section 4 and prototype screens 05-08.

const _tabular = [FontFeature.tabularFigures()];

/// Title bar of a logged-in screen: centered title over a thin line (prototype 05-08).
PreferredSizeWidget appBar(String title, {List<Widget>? actions}) => AppBar(
  backgroundColor: AppColors.bg,
  surfaceTintColor: Colors.transparent,
  scrolledUnderElevation: 0,
  centerTitle: true,
  title: Text(
    title,
    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text),
  ),
  actions: actions,
  shape: const Border(bottom: BorderSide(color: AppColors.border)),
);

/// Card: bg fill, 1px border, radius 12, faint shadow. [highlight] is the green "Daily target" tile.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.onTap, this.highlight = false, this.semanticLabel});

  final Widget child;
  final VoidCallback? onTap;
  final bool highlight;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(AppRadius.lg);
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 2, offset: Offset(0, 1))],
        ),
        child: Material(
          color: highlight ? AppColors.fitGreatBg : AppColors.bg,
          shape: RoundedRectangleBorder(
            borderRadius: radius,
            side: BorderSide(color: highlight ? AppColors.primary : AppColors.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(padding: const EdgeInsets.all(AppSpace.s4), child: child),
          ),
        ),
      ),
    );
  }
}

/// One-of-N buttons in a row: Units, Sex, Goal, High protein / High carb.
class SegmentedChoice<T> extends StatelessWidget {
  const SegmentedChoice({
    super.key,
    this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.errorText,
  });

  final String? label;
  final List<(T, String)> options;
  final T? value;
  final ValueChanged<T> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final error = errorText != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null) ...[
          Text(label!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: AppSpace.s2),
        ],
        Container(
          height: 48,
          decoration: BoxDecoration(
            border: Border.all(color: error ? AppColors.error : AppColors.borderInput, width: error ? 2 : 1),
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: [
              for (final (i, (v, text)) in options.indexed) ...[
                if (i > 0) const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderInput),
                Expanded(
                  child: Semantics(
                    label: label,
                    selected: v == value,
                    inMutuallyExclusiveGroup: true,
                    child: Material(
                      color: v == value ? AppColors.primary : AppColors.bg,
                      child: InkWell(
                        onTap: () => onChanged(v),
                        child: Center(
                          child: Text(
                            text,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                              color: v == value ? AppColors.onPrimary : AppColors.text,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (error) ...[
          const SizedBox(height: AppSpace.s1),
          Text(errorText!, style: const TextStyle(color: AppColors.error, fontSize: 14)),
        ],
      ],
    );
  }
}

/// Round caption pill. Fit colors are never the only signal: each has text and an icon.
class Pill extends StatelessWidget {
  const Pill({super.key, required this.text, this.icon, required this.bg, required this.fg});

  /// Recommendations only: the top third by score are "Great fit", the rest "OK" (spec, Fit pill).
  factory Pill.fit({required bool great}) => great
      ? const Pill(text: 'Great fit', icon: Icons.check, bg: AppColors.fitGreatBg, fg: AppColors.fitGreatText)
      : const Pill(text: 'OK', icon: Icons.remove, bg: AppColors.fitOkBg, fg: AppColors.fitOkText);

  final String text;
  final IconData? icon;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: fg), const SizedBox(width: AppSpace.s1)],
          // Wraps rather than overflowing when it shares a row (Nearby's badge next to Save).
          Flexible(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, height: 1.2, fontWeight: FontWeight.w500, color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// How many great fits in a list of [n] recommendations: ceil(n / 3) (spec, Fit pill).
int greatFitCount(int n) => (n / 3).ceil();

/// Protein / carbs / fat split of an item's calories, with unknown (null) macros hatched, never 0.
class MacroBar extends StatelessWidget {
  const MacroBar({super.key, required this.item});

  final MenuItem item;

  static const _colors = [AppColors.macroProtein, AppColors.macroCarbs, AppColors.macroFat];

  /// Each segment's share of the bar; whatever is left over is hatched as unknown.
  static List<double> shares(MenuItem item) {
    final grams = [item.proteinG, item.carbsG, item.fatG];
    const kcalPerGram = [4, 4, 9];
    final kcal = [for (var i = 0; i < 3; i++) grams[i] == null ? null : grams[i]! * kcalPerGram[i]];
    if (kcal.every((k) => k != null)) {
      final total = kcal.fold<double>(0, (a, k) => a + k!);
      return [for (final k in kcal) total > 0 ? k! / total : 0];
    }
    // Some unknown: known segments are their share of the item's calories, capped so it never overflows.
    var left = 1.0;
    final out = <double>[];
    for (final k in kcal) {
      final s = k == null || item.calories <= 0 ? 0.0 : math.min(k / item.calories, left);
      left -= s;
      out.add(s);
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final grams = [item.proteinG, item.carbsG, item.fatG];
    final allUnknown = grams.every((g) => g == null);
    const letters = ['P', 'C', 'F'];
    const names = ['protein', 'carbs', 'fat'];
    final spoken = allUnknown
        ? 'Macros unknown'
        : [
            for (var i = 0; i < 3; i++)
              '${names[i]} ${grams[i] == null ? 'unknown' : '${formatGrams(grams[i]!)} grams'}',
          ].join(', ');
    return Semantics(
      label: spoken,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 8,
            width: double.infinity,
            child: CustomPaint(painter: _MacroBarPainter(shares(item), hatch: grams.contains(null))),
          ),
          const SizedBox(height: AppSpace.s2),
          if (allUnknown)
            const Text('Macros unknown', style: TextStyle(fontSize: 14, color: AppColors.textMuted))
          else
            Wrap(
              spacing: AppSpace.s4,
              children: [
                for (var i = 0; i < 3; i++)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(color: _colors[i], shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '${letters[i]} ${grams[i] == null ? '?' : '${formatGrams(grams[i]!)}g'}',
                        style: const TextStyle(fontSize: 14, color: AppColors.textMuted, fontFeatures: _tabular),
                      ),
                    ],
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _MacroBarPainter extends CustomPainter {
  _MacroBarPainter(this.shares, {required this.hatch});

  final List<double> shares;
  final bool hatch; // false when every macro is known but the item has none (a 0 g drink): plain surface

  @override
  void paint(Canvas canvas, Size size) {
    final bar = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(AppRadius.sm));
    canvas.clipRRect(bar);
    const gap = 2.0;
    var x = 0.0;
    for (var i = 0; i < 3; i++) {
      final w = shares[i] * size.width;
      if (w <= 0) continue;
      final right = x + w;
      // A white gap between segments, like the prototype; not after the last one if the bar is full.
      final end = right >= size.width - 0.5 ? right : math.max(x, right - gap);
      canvas.drawRect(Rect.fromLTRB(x, 0, end, size.height), Paint()..color = MacroBar._colors[i]);
      x = right;
    }
    if (x >= size.width - 0.5) return;
    // Unknown: diagonal hatching on surface.
    final rest = Rect.fromLTRB(x, 0, size.width, size.height);
    canvas.save();
    canvas.clipRect(rest);
    canvas.drawRect(rest, Paint()..color = AppColors.surface);
    if (!hatch) return canvas.restore();
    final line = Paint()
      ..color = AppColors.macroUnknown
      ..strokeWidth = 1.5;
    for (var lx = x - size.height; lx < size.width; lx += 5) {
      canvas.drawLine(Offset(lx, size.height), Offset(lx + size.height, 0), line);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_MacroBarPainter old) => old.hatch != hatch || old.shares.join() != shares.join();
}

/// Menu item card: name, restaurant, calories, macro bar. In recommendations it also gets the score
/// and fit pill ([score] and [great] set); search results get neither (spec, Menu item card).
class MenuItemCard extends StatelessWidget {
  const MenuItemCard({super.key, required this.item, this.score, this.mode, this.great});

  final MenuItem item;
  final double? score;
  final RecommendationMode? mode;
  final bool? great;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final macro = mode == RecommendationMode.carb ? 'carbs' : 'protein';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(item.name, style: t.titleLarge)),
              const SizedBox(width: AppSpace.s3),
              Text(
                '${formatCalories(item.calories)} cal',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, fontFeatures: _tabular),
              ),
            ],
          ),
          Text(
            item.isEstimate ? '${item.chainName} · estimated' : item.chainName,
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpace.s3),
          MacroBar(item: item),
          if (score != null) ...[
            const SizedBox(height: AppSpace.s3),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${score!.toStringAsFixed(1)} g $macro per 100 cal',
                    style: const TextStyle(fontSize: 14, color: AppColors.textMuted, fontFeatures: _tabular),
                  ),
                ),
                if (great != null) Pill.fit(great: great!),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// A screen's empty, loading or problem state: a short title, a line of text and up to two buttons.
class StatusMessage extends StatelessWidget {
  const StatusMessage({super.key, this.title, required this.message, this.actions = const [], this.loading = false});

  final String? title;
  final String message;
  final List<Widget> actions;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.s8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (loading) ...[const Center(child: CircularProgressIndicator()), const SizedBox(height: AppSpace.s4)],
            if (title != null) ...[
              Text(title!, style: t.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: AppSpace.s2),
            ],
            Text(
              message,
              style: t.bodyLarge?.copyWith(color: AppColors.textMuted),
              textAlign: TextAlign.center,
            ),
            for (final a in actions) ...[const SizedBox(height: AppSpace.s3), a],
          ],
        ),
      ),
    );
  }
}
