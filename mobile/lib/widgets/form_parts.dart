import 'package:flutter/material.dart';

import '../theme.dart';

/// Screen frame for the logged-out screens: app name, title, optional lead, then the form.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, this.lead, required this.children, this.showBack = false});

  final String title;
  final Widget? lead;
  final List<Widget> children;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: showBack ? AppBar(backgroundColor: AppColors.bg, elevation: 0, scrolledUnderElevation: 0) : null,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s8, AppSpace.s4, AppSpace.s6),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'MENU MACRO FITTER',
                    style: t.labelSmall?.copyWith(
                      color: AppColors.primary,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpace.s2),
                  Text(title, style: t.headlineMedium),
                  if (lead != null) ...[const SizedBox(height: AppSpace.s2), lead!],
                  const SizedBox(height: AppSpace.s6),
                  ..._spaced(children),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static List<Widget> _spaced(List<Widget> items) => [
    for (var i = 0; i < items.length; i++) ...[if (i > 0) const SizedBox(height: AppSpace.s4), items[i]],
  ];
}

/// Label above the field (never placeholder-only), per the design spec's TextInput.
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.keyboardType,
    this.obscure = false,
    this.autofillHints,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
    this.lowercase = false,
  });

  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final TextInputType? keyboardType;
  final bool obscure;
  final Iterable<String>? autofillHints;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool lowercase;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpace.s2),
        obscure
            ? _PasswordInput(field: this)
            : TextFormField(
                controller: controller,
                validator: validator,
                keyboardType: keyboardType,
                autofillHints: autofillHints,
                textInputAction: textInputAction,
                onFieldSubmitted: onSubmitted,
                autocorrect: !lowercase,
                textCapitalization: lowercase ? TextCapitalization.none : TextCapitalization.words,
                onChanged: lowercase ? (v) => _lowercase(controller, v) : null,
                // Validate on blur and on submit, not every keystroke (design spec).
                autovalidateMode: AutovalidateMode.onUnfocus,
                decoration: const InputDecoration(),
              ),
      ],
    );
  }

  // Username and email are stored lowercase, so lowercase as the user types, keeping the cursor.
  static void _lowercase(TextEditingController c, String v) {
    final lower = v.toLowerCase();
    if (lower != v) c.value = c.value.copyWith(text: lower);
  }
}

class _PasswordInput extends StatefulWidget {
  const _PasswordInput({required this.field});

  final LabeledField field;

  @override
  State<_PasswordInput> createState() => _PasswordInputState();
}

class _PasswordInputState extends State<_PasswordInput> {
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    final f = widget.field;
    return TextFormField(
      controller: f.controller,
      validator: f.validator,
      obscureText: _hidden,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: f.autofillHints,
      textInputAction: f.textInputAction,
      onFieldSubmitted: f.onSubmitted,
      autovalidateMode: AutovalidateMode.onUnfocus,
      decoration: InputDecoration(
        suffixIcon: TextButton(
          onPressed: () => setState(() => _hidden = !_hidden),
          child: Text(_hidden ? 'Show' : 'Hide'),
        ),
      ),
    );
  }
}

/// Primary button that swaps its label for a spinner while a request runs (design spec: Button).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.loading = false});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? Semantics(
              label: '$label in progress',
              child: const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.onPrimary),
              ),
            )
          : Text(label),
    );
  }
}
