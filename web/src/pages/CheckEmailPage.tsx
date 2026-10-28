import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { forgotPassword, resendVerification } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import { errorMessage } from '../errors';

// After sign up (verify) or forgot password (reset). The emailed link opens /verify-email or
// /reset-password (#22).
export type CheckEmailState =
  | { kind: 'verify'; email: string }
  | { kind: 'reset'; email: string; message: string }; // forgot-password's reply, the same whether or not the email exists

export default function CheckEmailPage() {
  const navigate = useNavigate();
  const state = useLocation().state as CheckEmailState | null;
  const [banner, setBanner] = useState<{ message: string; error: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  if (!state) return <Navigate to="/" replace />; // opened directly, nothing to show

  async function resend() {
    if (!state) return;
    setSending(true);
    try {
      const body = { email: state.email };
      const res = state.kind === 'reset' ? await forgotPassword(body) : await resendVerification(body);
      setBanner({ message: res.message, error: false });
    } catch (err) {
      setBanner({ message: errorMessage(err), error: true });
    } finally {
      setSending(false);
    }
  }

  const email = <strong className="font-bold text-text">{state.email}</strong>;
  const lead =
    state.kind === 'reset' ? (
      <p>
        {state.message}. Check {email} and open the link to choose a new password.
      </p>
    ) : (
      <p>We sent a verification link to {email}. Open it, then log in.</p>
    );

  return (
    <AuthLayout title="Check your email" lead={lead}>
      {banner && <Banner message={banner.message} info={!banner.error} />}
      <Button onClick={() => navigate('/', { replace: true })}>Back to log in</Button>
      <Button variant="secondary" onClick={resend} loading={sending}>
        Resend email
      </Button>
    </AuthLayout>
  );
}
