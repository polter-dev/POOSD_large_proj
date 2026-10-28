import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

// Stand-in for after login until the real screens land: onboarding is the profile screen (#25),
// home is the feed (#34). Same as mobile's HomeScreen: shows who is logged in and lets them log out.
export default function PlaceholderPage({ next }: { next: 'onboarding' | 'home' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1040px] items-center justify-between px-6">
          <p className="text-lg font-bold">Menu Macro Fitter</p>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/', { replace: true });
            }}
            className="rounded-(--radius-input) px-3 py-2 text-sm font-semibold text-primary hover:underline"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1040px] px-6 py-8">
        <h1 className="text-[28px] leading-[1.2] font-bold">Hi, {user?.firstName}</h1>
        <p className="mt-2 text-base text-text-muted">
          {next === 'onboarding'
            ? 'Next: set up your profile (height, weight, birth date, sex, activity level, goal).'
            : 'Next: your daily target and the best picks near you.'}
        </p>
      </main>
    </div>
  );
}
