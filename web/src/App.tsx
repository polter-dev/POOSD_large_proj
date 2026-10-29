import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import CheckEmailPage from './pages/CheckEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ProfilePage from './pages/ProfilePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SignUpPage from './pages/SignUpPage';
import TargetsPage from './pages/TargetsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

// Logged-in users skip the auth pages; logged-out users can't reach the app pages.
function LoggedOut({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.profile ? '/home' : '/onboarding'} replace />;
  return children;
}

function LoggedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/" replace />;
}

// Pages that need a profile (targets, editing it) send a user without one to set it up first.
function WithProfile({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return user.profile ? children : <Navigate to="/onboarding" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoggedOut><LoginPage /></LoggedOut>} />
          <Route path="/signup" element={<LoggedOut><SignUpPage /></LoggedOut>} />
          <Route path="/forgot-password" element={<LoggedOut><ForgotPasswordPage /></LoggedOut>} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          {/* Emailed links (backend services/email.js). Open whether or not someone is logged in. */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<LoggedIn><ProfilePage mode="setup" /></LoggedIn>} />
          <Route path="/profile" element={<WithProfile><ProfilePage mode="edit" /></WithProfile>} />
          <Route path="/targets" element={<WithProfile><TargetsPage /></WithProfile>} />
          <Route path="/home" element={<LoggedIn><PlaceholderPage /></LoggedIn>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
