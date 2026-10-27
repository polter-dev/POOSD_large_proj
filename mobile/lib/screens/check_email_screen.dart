import 'package:flutter/material.dart';

import '../services/api.dart';
import '../theme.dart';
import '../widgets/api_scope.dart';
import '../widgets/error_banner.dart';
import '../widgets/form_parts.dart';

/// After sign up (verify) or forgot password (reset). The emailed link opens the web site
/// (/verify-email or /reset-password), so the app doesn't handle deep links.
class CheckEmailScreen extends StatefulWidget {
  const CheckEmailScreen.verify({super.key, required this.email}) : forReset = false;
  const CheckEmailScreen.reset({super.key, required this.email}) : forReset = true;

  final String email;
  final bool forReset;

  @override
  State<CheckEmailScreen> createState() => _CheckEmailScreenState();
}

class _CheckEmailScreenState extends State<CheckEmailScreen> {
  String? _banner;
  bool _bannerIsError = false;
  bool _sending = false;

  Future<void> _resend() async {
    setState(() => _sending = true);
    final api = ApiScope.of(context);
    try {
      final msg = widget.forReset ? await api.forgotPassword(widget.email) : await api.resendVerification(widget.email);
      setState(() {
        _banner = msg;
        _bannerIsError = false;
      });
    } on ApiError catch (e) {
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
    final what = widget.forReset ? 'a password reset link' : 'a verification link';
    final then = widget.forReset ? 'Open it to choose a new password.' : 'Open it, then log in.';
    return AuthScaffold(
      title: 'Check your email',
      lead: Text.rich(
        TextSpan(
          children: [
            TextSpan(text: 'We sent $what to '),
            TextSpan(
              text: widget.email,
              style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text),
            ),
            TextSpan(text: '. $then'),
          ],
        ),
        style: const TextStyle(fontSize: 16, color: AppColors.textMuted),
      ),
      children: [
        if (_banner != null) ErrorBanner(message: _banner!, info: !_bannerIsError),
        PrimaryButton(label: 'Back to log in', onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst)),
        OutlinedButton(onPressed: _sending ? null : _resend, child: const Text('Resend email')),
      ],
    );
  }
}
