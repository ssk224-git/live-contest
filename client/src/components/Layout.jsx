// The top bar and page frame used by host pages and the home page.
import { Link, NavLink, useNavigate } from 'react-router';
import { Code2, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

export default function Layout({ children, wide = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const linkClass = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex h-14 items-center gap-4 px-4 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
          <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
              <Code2 size={18} />
            </span>
            Live Contest
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            {user ? (
              <>
                <NavLink to="/dashboard" className={linkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/history" className={linkClass}>
                  History
                </NavLink>
                <button
                  className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-500 hover:text-slate-900"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                  title={`Log out ${user.name}`}
                >
                  <LogOut size={16} /> <span className="hidden sm:inline">Log out</span>
                </button>
              </>
            ) : (
              <NavLink to="/login" className={linkClass}>
                Host log in
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>{children}</main>
    </div>
  );
}
