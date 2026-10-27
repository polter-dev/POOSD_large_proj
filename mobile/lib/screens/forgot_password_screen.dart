import 'package:flutter/material.dart';

import '../services/api.dart';
import '../validators.dart';
import '../widgets/api_scope.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';
import 'check_email_screen.dart';

/// POST /auth/forgot-password. The reset itself happens on the web page /reset-password (#22).
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
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
      await ApiScope.of(context).forgotPassword(email);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => CheckEmailScreen.reset(email: email)));
    } on ApiError catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Reset your password',
      showBack: true,
      lead: const Text("Enter your account's email and we'll send you a reset link."),
      children: [
        if (_error != null) ErrorBanner(message: _error!),
        Form(
          key: _form,
          child: LabeledField(
            label: 'Email',
            controller: _email,
            validator: validateEmail,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            lowercase: true,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
          ),
        ),
        PrimaryButton(label: 'Send reset link', loading: _loading, onPressed: _submit),
      ],
    );
  }
}
