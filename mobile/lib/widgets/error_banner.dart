import 'package:flutter/material.dart';

import '../theme.dart';

/// Server errors at the top of a form (design spec: ErrorBanner). Shows the API's message as-is,
/// with an optional action button. The info variant is for "link sent" confirmations.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message, this.actionLabel, this.onAction, this.info = false});

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool info;

  @override
  Widget build(BuildContext context) {
    final fg = info ? AppColors.fitGreatText : AppColors.error;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4, vertical: AppSpace.s3),
        decoration: BoxDecoration(
          color: info ? AppColors.fitGreatBg : AppColors.errorBg,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(info ? Icons.check_circle_outline : Icons.error_outline, size: 18, color: fg),
            ),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    message,
                    style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  if (actionLabel != null) ...[
                    const SizedBox(height: AppSpace.s2),
                    OutlinedButton(
                      onPressed: onAction,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: fg,
                        side: BorderSide(color: fg),
                        minimumSize: const Size(0, 36),
                        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3),
                        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                      child: Text(actionLabel!),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
