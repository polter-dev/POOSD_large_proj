import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { verifyEmail } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import { errorMessage } from '../errors';

// Landing page for the emailed link: /verify-email?token= (backend services/email.js).
// GET /auth/verify-email answers 200 "Email verified", or 400 "Token is required" / "Invalid or expired token".
export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    // Tokens are single use, so call once even when StrictMode runs effects twice.
    if (sent.current) return;
    sent.current = true;
    verifyEmail(token)
      .then((res) => setResult({ ok: true, message: res.message }))
      .catch((err) => setResult({ ok: false, message: errorMessage(err) }));
  }, [token]);

  const toLogin = () => navigate('/', { replace: true });

  if (!result) {
    return (
      <AuthLayout title="Verifying your email">
        <Button loading disabled>
          Verifying
        </Button>
      </AuthLayout>
    );
  }

  if (result.ok) {
    return (
      <AuthLayout title="Email verified" lead={<p>Your account is ready. Log in to get started.</p>}>
        <Button onClick={toLogin}>Log in</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="This link didn't work"
      lead={<p>Links expire after 24 hours and work once. Log in with your email to get a new one.</p>}
    >
      <Banner message={result.message} />
      <Button onClick={toLogin}>Back to log in</Button>
    </AuthLayout>
  );
}
