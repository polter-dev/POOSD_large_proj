import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { resetPassword } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { errorMessage } from '../errors';
import { validatePassword } from '../validators';

// Landing page for the emailed link: /reset-password?token= (backend services/email.js).
// POST /auth/reset-password { token, password } answers 200 "Password updated", or 400 "Token is required",
// "Invalid or expired token" or "Password: at least 8 characters".
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validatePassword(password);
    setFieldError(invalid);
    if (loading || invalid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await resetPassword({ token, password });
      setDone(res.message);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" lead={<p>Log in with your new password.</p>}>
        <Button onClick={() => navigate('/', { replace: true })}>Log in</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      {error && <Banner message={error} />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (fieldError) setFieldError(validatePassword(v));
          }}
          onBlur={() => setFieldError(validatePassword(password))}
          error={fieldError}
        />
        <Button type="submit" loading={loading}>
          Update password
        </Button>
      </form>
      {/* An expired or used link can't be fixed here: send a fresh one. */}
      <Link to="/forgot-password" className="self-start text-sm font-semibold text-primary hover:underline">
        Need a new link?
      </Link>
    </AuthLayout>
  );
}
