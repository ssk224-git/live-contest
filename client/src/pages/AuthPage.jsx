// Host log in / sign up (one page, two modes).
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setFields({ ...fields, [key]: e.target.value });

  // Sends the form, then goes to the page the host wanted (or the dashboard).
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = isRegister ? fields : { email: fields.email, password: fields.password };
      await authenticate(mode, body);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto mt-6 max-w-sm card">
        <h1 className="text-xl font-bold">{isRegister ? 'Create a host account' : 'Host log in'}</h1>
        <p className="mt-1 text-sm text-slate-500">Hosts create quizzes and contests. Students don't need an account.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {isRegister && (
            <div>
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input id="name" className="input" value={fields.name} onChange={set('name')} required maxLength={60} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" className="input" value={fields.email} onChange={set('email')} required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password {isRegister && <span className="font-normal text-slate-400">(8+ characters)</span>}
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={fields.password}
              onChange={set('password')}
              required
              minLength={isRegister ? 8 : 1}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login" className="font-medium text-brand-600">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register" className="font-medium text-brand-600">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </Layout>
  );
}
