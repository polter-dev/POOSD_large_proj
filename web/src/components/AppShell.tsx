import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

// Prototype screens 06-08: top bar with the app's sections, initials on the right. #34 adds
// Best picks and Search here as those pages land.
const NAV = [
  { to: '/home', label: 'Nearby' },
  { to: '/targets', label: 'Profile', also: ['/profile'] },
];

// The logged-in layout. `nav={false}` is for first-time setup, which comes before the app's sections.
export default function AppShell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initials = `${user?.firstName[0] ?? ''}${user?.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        {/* Phone width: brand and log out on the first row, the sections on a second row below. */}
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-x-8 px-4 sm:h-16 sm:flex-nowrap sm:px-6">
          <p className="py-4 text-lg font-bold whitespace-nowrap sm:py-0">Menu Macro Fitter</p>
          {nav && (
            <nav aria-label="Main" className="order-last flex h-12 w-full gap-6 sm:order-none sm:h-full sm:w-auto">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => {
                    const on = isActive || item.also?.includes(pathname);
                    return `flex h-full items-center border-b-2 text-base ${
                      on ? 'border-primary font-semibold text-text' : 'border-transparent text-text-muted hover:text-text'
                    }`;
                  }}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span
              className="hidden size-10 items-center justify-center rounded-full bg-surface text-sm font-semibold sm:flex"
              aria-label={`Logged in as ${user?.firstName} ${user?.lastName}`}
              role="img"
            >
              {initials}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/', { replace: true });
              }}
              className="rounded-(--radius-input) px-3 py-2 text-sm font-semibold whitespace-nowrap text-primary hover:underline"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1040px] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
