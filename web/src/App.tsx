import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import CheckEmailPage from './pages/CheckEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import PlaceholderPage from './pages/PlaceholderPage';
import SignUpPage from './pages/SignUpPage';

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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoggedOut><LoginPage /></LoggedOut>} />
          <Route path="/signup" element={<LoggedOut><SignUpPage /></LoggedOut>} />
          <Route path="/forgot-password" element={<LoggedOut><ForgotPasswordPage /></LoggedOut>} />
          <Route path="/check-email" element={<CheckEmailPage />} />
          <Route path="/onboarding" element={<LoggedIn><PlaceholderPage next="onboarding" /></LoggedIn>} />
          <Route path="/home" element={<LoggedIn><PlaceholderPage next="home" /></LoggedIn>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
