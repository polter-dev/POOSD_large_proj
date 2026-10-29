import { Link } from 'react-router';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';

// Stand-in for /home until the nearby feed lands (#34). Shows who is logged in and the way to their targets.
export default function PlaceholderPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className="text-[28px] leading-[1.2] font-bold">Hi, {user?.firstName}</h1>
      <p className="mt-2 text-base text-text-muted">Next: the best picks near you.</p>
      <Link to={user?.profile ? '/targets' : '/onboarding'} className="mt-4 inline-block font-semibold text-primary hover:underline">
        {user?.profile ? 'See your targets' : 'Set up your profile'}
      </Link>
    </AppShell>
  );
}
