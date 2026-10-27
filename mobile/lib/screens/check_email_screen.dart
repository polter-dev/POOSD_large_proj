import 'package:flutter/material.dart';

import '../services/api.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';

/// After sign up (verify) or forgot password (reset). The emailed link opens the web site
/// (/verify-email or /reset-password), so the app doesn't handle deep links.
class CheckEmailScreen extends StatefulWidget {
  const CheckEmailScreen.verify({super.key, required this.email}) : forReset = false, message = null;

  /// [message] is forgot-password's reply. It's the same whether or not the email exists, so show it as-is.
  const CheckEmailScreen.reset({super.key, required this.email, required String this.message}) : forReset = true;

  final String email;
  final bool forReset;
  final String? message;

  @override
  State<CheckEmailScreen> createState() => _CheckEmailScreenState();
}

class _CheckEmailScreenState extends State<CheckEmailScreen> {
  String? _banner;
  bool _bannerIsError = false;
  bool _sending = false;

  Future<void> _resend() async {
    if (_sending) return;
    setState(() => _sending = true);
    final api = ApiScope.of(context);
    try {
      final msg = widget.forReset ? await api.forgotPassword(widget.email) : await api.resendVerification(widget.email);
      if (!mounted) return;
      setState(() {
        _banner = msg;
        _bannerIsError = false;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _banner = e.message;
        _bannerIsError = true;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const muted = TextStyle(fontSize: 16, color: AppColors.textMuted);
    final email = TextSpan(
      text: widget.email,
      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text),
    );
    return AuthScaffold(
      title: 'Check your email',
      lead: widget.forReset
          ? Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '${widget.message}. Check '),
                  email,
                  const TextSpan(text: ' and open the link to choose a new password.'),
                ],
              ),
              style: muted,
            )
          : Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'We sent a verification link to '),
                  email,
                  const TextSpan(text: '. Open it, then log in.'),
                ],
              ),
              style: muted,
            ),
      children: [
        if (_banner != null) ErrorBanner(message: _banner!, info: !_bannerIsError),
        PrimaryButton(label: 'Back to log in', onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst)),
        OutlinedButton(onPressed: _sending ? null : _resend, child: const Text('Resend email')),
      ],
    );
  }
}
