import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from '../api';
import type { LoginBody, User } from '../types/api';

interface AuthState {
  user: User | null;
  loading: boolean; // true while a stored token is being checked on first load
  login: (body: LoginBody) => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void; // after a /users/me update, which returns the new User
  sessionExpired: boolean; // a request got 401 mid-session; the login page says so
}

const AuthContext = createContext<AuthState | null>(null);

// Holds the logged-in user. The token itself lives in localStorage (see api/client.ts).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => localStorage.getItem('token') !== null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Any 401 on a request with a token (expired or bad JWT) logs out; the route guards then show the
  // login page. Registered before the first-load check below, which can hit it too.
  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      api.logout();
      setUser(null);
      setSessionExpired(true);
    });
    return () => api.setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (!loading) return;
    // Any failure shows the login page, but only a 401 (expired or bad token) forgets the token, so a
    // server that's briefly down, or GET /users/me not built yet (#23), doesn't log anyone out for good.
    api.getMe()
      .then(setUser)
      .catch((err) => {
        if (err instanceof api.ApiError && err.status === 401) api.logout();
      })
      .finally(() => setLoading(false));
  }, [loading]);

  async function login(body: LoginBody) {
    const res = await api.login(body);
    setUser(res.user);
    setSessionExpired(false);
    return res.user;
  }

  function logout() {
    api.logout();
    setUser(null);
    setSessionExpired(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, sessionExpired }}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
