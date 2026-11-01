import 'package:flutter/material.dart';

import '../models/api_models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../units.dart';
import '../validators.dart';
import '../widgets/api_scope.dart';
import '../widgets/app_parts.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';
import 'app_shell.dart';

enum _Field { height, weight, birthDate, sex, activityLevel, goal }

/// #35, prototype screen 05, same fields and messages as web ProfilePage. Setup comes straight after
/// the first login (no tabs yet, "See my targets"); edit opens from Your targets and pops back with
/// the saved user. Both send the whole profile with PUT /users/me/profile, then the units with
/// PATCH preferences if they changed.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.user, required this.setup});

  final User user;
  final bool setup;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _ft = TextEditingController();
  final _inch = TextEditingController();
  final _cm = TextEditingController();
  final _weight = TextEditingController();
  late Units _units = widget.user.preferences.units;
  String? _birthDate; // YYYY-MM-DD
  Sex? _sex;
  ActivityLevel? _activity;
  Goal? _goal;
  final _errors = <_Field, String?>{};
  bool _saving = false;
  String? _error;

  // The inches and pounds behind what the boxes show, and the text they were shown as. A box nobody
  // has typed in gives its number back exactly: 160 lb shows as 72.6 kg, and 72.6 kg would be 160.1 lb.
  ({double heightIn, String ft, String inch, String cm})? _heightShown;
  ({double weightLb, String text})? _weightShown;

  bool get _metric => _units == Units.metric;

  @override
  void initState() {
    super.initState();
    final p = widget.user.profile;
    if (p != null) {
      _showHeight(p.heightIn);
      _showWeight(p.weightLb);
      _birthDate = p.birthDate;
      _sex = p.sex;
      _activity = p.activityLevel;
      _goal = p.goal;
    }
  }

  @override
  void dispose() {
    for (final c in [_ft, _inch, _cm, _weight]) {
      c.dispose();
    }
    super.dispose();
  }

  // Fill the boxes from inches / pounds (null empties them).
  void _showHeight(double? heightIn) {
    final ft = heightIn == null ? null : heightIn ~/ 12;
    _ft.text = ft == null ? '' : '$ft';
    _inch.text = ft == null ? '' : plainNumber(round1(heightIn! - ft * 12));
    _cm.text = heightIn == null ? '' : '${(heightIn * cmPerIn).round()}';
    _heightShown = heightIn == null ? null : (heightIn: heightIn, ft: _ft.text, inch: _inch.text, cm: _cm.text);
  }

  void _showWeight(double? weightLb) {
    _weight.text = weightLb == null ? '' : plainNumber(round1(_metric ? weightLb * kgPerLb : weightLb));
    _weightShown = weightLb == null ? null : (weightLb: weightLb, text: _weight.text);
  }

  // Back to what the API stores: inches and pounds. null when the boxes aren't numbers.
  double? _heightIn(Units u) {
    if (u == Units.metric) {
      final cm = parseNumber(_cm.text);
      return cm == null ? null : round1(cm / cmPerIn);
    }
    final ft = parseNumber(_ft.text);
    final inch = _inch.text.trim().isEmpty ? 0.0 : parseNumber(_inch.text);
    return ft == null || inch == null ? null : round1(ft * 12 + inch);
  }

  double? _weightLb(Units u) {
    final w = parseNumber(_weight.text);
    return w == null ? null : round1(u == Units.metric ? w / kgPerLb : w);
  }

  double? _exactHeight() {
    final s = _heightShown;
    final same = s != null && (_metric ? _cm.text == s.cm : _ft.text == s.ft && _inch.text == s.inch);
    return same ? s.heightIn : _heightIn(_units);
  }

  double? _exactWeight() {
    final s = _weightShown;
    return s != null && _weight.text == s.text ? s.weightLb : _weightLb(_units);
  }

  Map<_Field, String?> _check() => {
    _Field.height:
        (_metric ? null : validateFeetInches(_ft.text, _inch.text)) ??
        validateHeight(_heightIn(_units), metric: _metric),
    _Field.weight: validateWeight(_weightLb(_units), metric: _metric),
    _Field.birthDate: validateBirthDate(_birthDate),
    _Field.sex: validateChoice(_sex, 'Sex'),
    _Field.activityLevel: validateChoice(_activity, 'Activity level'),
    _Field.goal: validateChoice(_goal, 'Goal'),
  };

  // Re-check a field as it changes, but only once it has shown an error (same as web and the auth forms).
  void _changed(_Field f) {
    if (_errors[f] != null) setState(() => _errors[f] = _check()[f]);
  }

  void _blur(_Field f) => setState(() => _errors[f] = _check()[f]);

  // Keep what was typed when switching units: convert through inches and pounds.
  void _switchUnits(Units next) {
    if (next == _units) return;
    final h = _exactHeight();
    final w = _exactWeight();
    setState(() {
      _units = next;
      _showHeight(h);
      _showWeight(w);
      _errors[_Field.height] = _errors[_Field.weight] = null;
    });
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final current = _birthDate == null ? null : DateTime.tryParse(_birthDate!);
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 120),
      lastDate: now,
      helpText: 'Birth date',
    );
    if (picked == null || !mounted) return;
    String two(int n) => n.toString().padLeft(2, '0');
    setState(() {
      _birthDate = '${picked.year}-${two(picked.month)}-${two(picked.day)}';
      _errors[_Field.birthDate] = _check()[_Field.birthDate];
    });
  }

  Future<void> _submit() async {
    if (_saving) return;
    final errors = _check();
    setState(() => _errors.addAll(errors));
    if (errors.values.any((e) => e != null)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final api = ApiScope.of(context);
    try {
      var user = await api.updateProfile(
        Profile(
          heightIn: _exactHeight()!,
          weightLb: _exactWeight()!,
          birthDate: _birthDate!,
          sex: _sex!,
          activityLevel: _activity!,
          goal: _goal!,
        ),
      );
      if (user.preferences.units != _units) user = await api.updatePreferences(units: _units);
      if (!mounted) return;
      if (widget.setup) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => AppShell(user: user, initialTab: AppTab.profile),
          ),
        );
      } else {
        Navigator.of(context).pop(user);
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: appBar('Your profile'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.setup ? 'Set up your profile' : 'Edit your profile', style: t.headlineMedium),
              const SizedBox(height: AppSpace.s2),
              Text(
                'We use this to estimate your daily calories. You can change it any time.',
                style: t.bodyLarge?.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: AppSpace.s6),
              if (_error != null) ...[ErrorBanner(message: _error!), const SizedBox(height: AppSpace.s4)],
              SegmentedChoice<Units>(
                label: 'Units',
                options: const [(Units.imperial, 'ft / lb'), (Units.metric, 'cm / kg')],
                value: _units,
                onChanged: _switchUnits,
              ),
              const SizedBox(height: AppSpace.s6),
              _label('Height'),
              if (_metric)
                _NumberBox(
                  controller: _cm,
                  suffix: 'cm',
                  semanticLabel: 'Height in centimeters',
                  invalid: _errors[_Field.height] != null,
                  onChanged: () => _changed(_Field.height),
                  onBlur: () => _blur(_Field.height),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: _NumberBox(
                        controller: _ft,
                        suffix: 'ft',
                        semanticLabel: 'Height, feet',
                        decimal: false,
                        invalid: _errors[_Field.height] != null,
                        onChanged: () => _changed(_Field.height),
                        onBlur: () => _blur(_Field.height),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s4),
                    Expanded(
                      child: _NumberBox(
                        controller: _inch,
                        suffix: 'in',
                        semanticLabel: 'Height, inches',
                        invalid: _errors[_Field.height] != null,
                        onChanged: () => _changed(_Field.height),
                        onBlur: () => _blur(_Field.height),
                      ),
                    ),
                  ],
                ),
              _errorText(_Field.height),
              const SizedBox(height: AppSpace.s6),
              _label('Weight'),
              _NumberBox(
                controller: _weight,
                suffix: _metric ? 'kg' : 'lb',
                semanticLabel: 'Weight',
                invalid: _errors[_Field.weight] != null,
                onChanged: () => _changed(_Field.weight),
                onBlur: () => _blur(_Field.weight),
              ),
              _errorText(_Field.weight),
              const SizedBox(height: AppSpace.s6),
              _label('Birth date'),
              _BirthDateBox(value: _birthDate, invalid: _errors[_Field.birthDate] != null, onTap: _pickBirthDate),
              _errorText(_Field.birthDate),
              const SizedBox(height: AppSpace.s6),
              SegmentedChoice<Sex>(
                label: 'Sex',
                options: const [(Sex.female, 'Female'), (Sex.male, 'Male')],
                value: _sex,
                onChanged: (v) {
                  setState(() => _sex = v);
                  _changed(_Field.sex);
                },
                errorText: _errors[_Field.sex],
              ),
              const SizedBox(height: AppSpace.s6),
              _label('Activity level'),
              DropdownButtonFormField<ActivityLevel>(
                initialValue: _activity,
                isExpanded: true,
                hint: const Text('Choose your activity level'),
                decoration: InputDecoration(errorText: _errors[_Field.activityLevel]),
                items: [
                  for (final a in ActivityLevel.values)
                    DropdownMenuItem(
                      value: a,
                      child: Text(activityLabels[a]!.label, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) {
                  setState(() => _activity = v);
                  _changed(_Field.activityLevel);
                },
              ),
              const SizedBox(height: AppSpace.s6),
              SegmentedChoice<Goal>(
                label: 'Goal',
                options: const [(Goal.lose, 'Lose'), (Goal.maintain, 'Maintain'), (Goal.gain, 'Gain')],
                value: _goal,
                onChanged: (v) {
                  setState(() => _goal = v);
                  _changed(_Field.goal);
                },
                errorText: _errors[_Field.goal],
              ),
              const SizedBox(height: AppSpace.s6),
              PrimaryButton(label: widget.setup ? 'See my targets' : 'Save', loading: _saving, onPressed: _submit),
              if (!widget.setup) ...[
                const SizedBox(height: AppSpace.s3),
                OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpace.s2),
    child: Text(text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
  );

  Widget _errorText(_Field f) => _errors[f] == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: AppSpace.s1),
          child: Text(_errors[f]!, style: const TextStyle(color: AppColors.error, fontSize: 14)),
        );
}

/// Number input with its unit inside on the right ("ft", "lb"). Checks itself when it loses focus.
class _NumberBox extends StatelessWidget {
  const _NumberBox({
    required this.controller,
    required this.suffix,
    required this.semanticLabel,
    required this.invalid,
    required this.onChanged,
    required this.onBlur,
    this.decimal = true,
  });

  final TextEditingController controller;
  final String suffix;
  final String semanticLabel;
  final bool invalid;
  final VoidCallback onChanged;
  final VoidCallback onBlur;
  final bool decimal;

  @override
  Widget build(BuildContext context) {
    final border = Theme.of(context).inputDecorationTheme.errorBorder;
    return Focus(
      onFocusChange: (focused) => focused ? null : onBlur(),
      child: Semantics(
        label: semanticLabel,
        child: TextField(
          controller: controller,
          keyboardType: TextInputType.numberWithOptions(decimal: decimal),
          textInputAction: TextInputAction.next,
          onChanged: (_) => onChanged(),
          decoration: InputDecoration(
            suffixText: suffix,
            suffixStyle: const TextStyle(color: AppColors.textMuted, fontSize: 16),
            enabledBorder: invalid ? border : null,
            focusedBorder: invalid ? border : null,
          ),
        ),
      ),
    );
  }
}

/// Birth date shown as MM/DD/YYYY (prototype 05); tapping opens the date picker.
class _BirthDateBox extends StatelessWidget {
  const _BirthDateBox({required this.value, required this.invalid, required this.onTap});

  final String? value; // YYYY-MM-DD
  final bool invalid;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = value?.split('-');
    final shown = p == null || p.length != 3 ? null : '${p[1]}/${p[2]}/${p[0]}';
    final border = Theme.of(context).inputDecorationTheme.errorBorder;
    return Semantics(
      button: true,
      label: 'Birth date, ${shown ?? 'not set'}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InputDecorator(
          decoration: InputDecoration(
            suffixIcon: const Icon(Icons.calendar_today_outlined, size: 20, color: AppColors.textMuted),
            enabledBorder: invalid ? border : null,
          ),
          child: Text(
            shown ?? 'Choose your birth date',
            style: TextStyle(fontSize: 16, color: shown == null ? AppColors.textMuted : AppColors.text),
          ),
        ),
      ),
    );
  }
}
