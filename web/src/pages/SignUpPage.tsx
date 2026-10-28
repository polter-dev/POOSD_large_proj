import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../api';
import AuthLayout from '../components/AuthLayout';
import Banner from '../components/Banner';
import Button from '../components/Button';
import TextField from '../components/TextField';
import { errorMessage } from '../errors';
import {
  normalizeLower, validateEmail, validateFirstName, validateLastName, validatePassword, validateUsername,
} from '../validators';

const FIELDS = {
  firstName: { label: 'First name', validate: validateFirstName, autoComplete: 'given-name' },
  lastName: { label: 'Last name', validate: validateLastName, autoComplete: 'family-name' },
  username: { label: 'Username', validate: validateUsername, autoComplete: 'username', lowercase: true },
  email: { label: 'Email', validate: validateEmail, autoComplete: 'email', type: 'email', lowercase: true },
  password: { label: 'Password', validate: validatePassword, autoComplete: 'new-password', type: 'password' },
} as const;

type Field = keyof typeof FIELDS;
const EMPTY: Record<Field, string> = { firstName: '', lastName: '', username: '', email: '', password: '' };

// POST /auth/register. Register does not log the user in: on 201 it goes to Check your email.
export default function SignUpPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string | null>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = Object.fromEntries(
      (Object.keys(FIELDS) as Field[]).map((f) => [f, FIELDS[f].validate(values[f])]),
    ) as Record<Field, string | null>;
    setErrors(next);
    if (loading || Object.values(next).some(Boolean)) return;
    setLoading(true);
    setError(null);
    const email = normalizeLower(values.email);
    try {
      await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        username: normalizeLower(values.username),
        email,
        password: values.password,
      });
      navigate('/check-email', { replace: true, state: { kind: 'verify', email } });
    } catch (err) {
      setError(errorMessage(err)); // 409: email or username already taken
      setLoading(false);
    }
  }

  // Validate on blur and on submit; once a field shows an error, re-check it as they fix it.
  const field = (f: Field) => {
    const { validate, ...props } = FIELDS[f];
    return (
      <TextField
        {...props}
        value={values[f]}
        onChange={(v) => {
          setValues((x) => ({ ...x, [f]: v }));
          if (errors[f]) setErrors((x) => ({ ...x, [f]: validate(v) }));
        }}
        onBlur={() => setErrors((x) => ({ ...x, [f]: validate(values[f]) }))}
        error={errors[f]}
      />
    );
  };

  return (
    <AuthLayout title="Create account">
      {error && <Banner message={error} />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          {field('firstName')}
          {field('lastName')}
        </div>
        {field('username')}
        {field('email')}
        {field('password')}
        <Button type="submit" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-text-muted">
        Have an account?{' '}
        <Link to="/" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
