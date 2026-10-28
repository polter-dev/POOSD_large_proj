import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, resendVerification } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import { normalizeLower, validateEmail } from '../validators';

const validatePassword = (v: string) => (v ? null : 'Password is required'); // the server says if it's wrong

// First page of the site (course requirement). Login is by email only: POST /auth/login takes { email, password }.
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false); // 403: offer "Resend verification email"
  const [resending, setResending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    if (loading || next.email || next.password) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    setNotVerified(false);
    try {
      const user = await login({ email: normalizeLower(email), password });
      navigate(user.profile ? '/home' : '/onboarding', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setNotVerified(err instanceof ApiError && err.status === 403);
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      const res = await resendVerification({ email: normalizeLower(email) });
      setError(null);
      setNotVerified(false);
      setInfo(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout title="Log in">
      {error && (
        <Banner
          message={error}
          actionLabel={notVerified ? 'Resend verification email' : undefined}
          onAction={resend}
          actionDisabled={resending}
        />
      )}
      {info && <Banner message={info} info />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          lowercase
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (errors.email) setErrors((x) => ({ ...x, email: validateEmail(v) }));
          }}
          onBlur={() => setErrors((x) => ({ ...x, email: validateEmail(email) }))}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors((x) => ({ ...x, password: validatePassword(v) }));
          }}
          onBlur={() => setErrors((x) => ({ ...x, password: validatePassword(password) }))}
          error={errors.password}
        />
        <Button type="submit" loading={loading}>
          Log in
        </Button>
      </form>
      <Link to="/forgot-password" className="self-start text-sm font-semibold text-primary hover:underline">
        Forgot password?
      </Link>
      <p className="text-center text-sm text-text-muted">
        No account?{' '}
        <Link to="/signup" className="font-semibold text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
