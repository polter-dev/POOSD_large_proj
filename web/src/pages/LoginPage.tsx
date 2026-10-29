import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, resendVerification } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import { normalizeLower, validateLogin } from '../validators';

const validatePassword = (v: string) => (v ? null : 'Password is required'); // the server says if it's wrong

// First page of the site (course requirement). Log in with an email or a username:
// POST /auth/login takes { login, password }.
export default function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string | null; password?: string | null }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false); // 403: offer "Resend verification email"
  const [resending, setResending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { login: validateLogin(loginId), password: validatePassword(password) };
    setErrors(next);
    if (loading || next.login || next.password) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    setNotVerified(false);
    try {
      const user = await login({ login: normalizeLower(loginId), password });
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
      const res = await resendVerification({ login: normalizeLower(loginId) });
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
      {sessionExpired && !error && !info && <Banner message="Your session expired. Log in again." info />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email or username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          lowercase
          value={loginId}
          onChange={(v) => {
            setLoginId(v);
            if (errors.login) setErrors((x) => ({ ...x, login: validateLogin(v) }));
          }}
          onBlur={() => setErrors((x) => ({ ...x, login: validateLogin(loginId) }))}
          error={errors.login}
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
