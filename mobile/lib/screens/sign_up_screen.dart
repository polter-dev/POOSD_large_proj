import 'package:flutter/material.dart';

import '../services/api.dart';
import '../theme.dart';
import '../validators.dart';
import '../widgets/api_scope.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';
import 'check_email_screen.dart';

/// POST /auth/register. Register does not log the user in: on 201 it goes to Check your email.
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _username = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_first, _last, _username, _email, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading || !_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final email = normalizeLower(_email.text);
    try {
      await ApiScope.of(context).register(
        firstName: _first.text.trim(),
        lastName: _last.text.trim(),
        username: normalizeLower(_username.text),
        email: email,
        password: _password.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => CheckEmailScreen.verify(email: email)));
    } on ApiError catch (e) {
      setState(() => _error = e.message); // 409: email or username already taken
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Create account',
      showBack: true,
      children: [
        if (_error != null) ErrorBanner(message: _error!),
        Form(
          key: _form,
          child: AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: LabeledField(
                        label: 'First name',
                        controller: _first,
                        validator: validateFirstName,
                        autofillHints: const [AutofillHints.givenName],
                      ),
                    ),
                    const SizedBox(width: AppSpace.s3),
                    Expanded(
                      child: LabeledField(
                        label: 'Last name',
                        controller: _last,
                        validator: validateLastName,
                        autofillHints: const [AutofillHints.familyName],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.s4),
                LabeledField(
                  label: 'Username',
                  controller: _username,
                  validator: validateUsername,
                  autofillHints: const [AutofillHints.newUsername],
                  lowercase: true,
                ),
                const SizedBox(height: AppSpace.s4),
                LabeledField(
                  label: 'Email',
                  controller: _email,
                  validator: validateEmail,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  lowercase: true,
                ),
                const SizedBox(height: AppSpace.s4),
                LabeledField(
                  label: 'Password',
                  controller: _password,
                  validator: validatePassword,
                  obscure: true,
                  autofillHints: const [AutofillHints.newPassword],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
              ],
            ),
          ),
        ),
        PrimaryButton(label: 'Create account', loading: _loading, onPressed: _submit),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Have an account?', style: TextStyle(fontSize: 14, color: AppColors.textMuted)),
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Log in')),
          ],
        ),
      ],
    );
  }
}
