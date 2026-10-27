import 'package:flutter/material.dart';

import '../services/api.dart';
import '../theme.dart';
import '../validators.dart';
import '../widgets/api_scope.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';
import 'forgot_password_screen.dart';
import 'home_screen.dart';
import 'sign_up_screen.dart';

/// First screen of the app (course requirement). Login is by email only: POST /auth/login takes { email, password }.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _notVerified = false; // 403: offer "Resend verification email"
  String? _info;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading || !_form.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
      _info = null;
      _notVerified = false;
    });
    try {
      final res = await ApiScope.of(context).login(email: normalizeLower(_email.text), password: _password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(user: res.user)));
    } on ApiError catch (e) {
      setState(() {
        _error = e.message;
        _notVerified = e.status == 403 && e.fromApi; // not some other server's 403
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    try {
      final msg = await ApiScope.of(context).resendVerification(normalizeLower(_email.text));
      setState(() {
        _error = null;
        _notVerified = false;
        _info = msg;
      });
    } on ApiError catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Log in',
      children: [
        if (_error != null)
          ErrorBanner(
            message: _error!,
            actionLabel: _notVerified ? 'Resend verification email' : null,
            onAction: _notVerified ? _resend : null,
          ),
        if (_info != null) ErrorBanner(message: _info!, info: true),
        Form(
          key: _form,
          child: AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
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
                  // Login only checks that something was typed; the server says if it's wrong.
                  validator: (v) => (v ?? '').isEmpty ? 'Password is required' : null,
                  obscure: true,
                  autofillHints: const [AutofillHints.password],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
              ],
            ),
          ),
        ),
        PrimaryButton(label: 'Log in', loading: _loading, onPressed: _submit),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            // No side padding, so the link lines up with the fields above it.
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 44)),
            onPressed: () =>
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
            child: const Text('Forgot password?'),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('No account?', style: TextStyle(fontSize: 14, color: AppColors.textMuted)),
            TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SignUpScreen())),
              child: const Text('Sign up'),
            ),
          ],
        ),
      ],
    );
  }
}
