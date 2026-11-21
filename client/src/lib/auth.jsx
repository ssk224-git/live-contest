// Keeps track of the logged-in host for the whole app (React context).
import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  // On page load, check whether the saved token still works.
  useEffect(() => {
    if (!getToken()) return;
    api('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  // Logs in (or registers) and remembers the token.
  async function authenticate(mode, fields) {
    const data = await api(`/api/auth/${mode}`, { method: 'POST', body: fields });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, checking, authenticate, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Wrap host-only pages in this: sends visitors who are not logged in to the login page.
export function RequireHost({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
