import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { forgotPassword } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { errorMessage } from '../errors';
import { normalizeLower, validateEmail } from '../validators';

// POST /auth/forgot-password, then the reset version of Check your email.
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateEmail(email);
    setFieldError(invalid);
    if (loading || invalid) return;
    setLoading(true);
    setError(null);
    const normalized = normalizeLower(email);
    try {
      const res = await forgotPassword({ email: normalized });
      navigate('/check-email', { replace: true, state: { kind: 'reset', email: normalized, message: res.message } });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {error && <Banner message={error} />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          lowercase
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (fieldError) setFieldError(validateEmail(v));
          }}
          onBlur={() => setFieldError(validateEmail(email))}
          error={fieldError}
        />
        <Button type="submit" loading={loading}>
          Send reset link
        </Button>
      </form>
      <Link to="/" className="self-center text-sm font-semibold text-primary hover:underline">
        Back to log in
      </Link>
    </AuthLayout>
  );
}
