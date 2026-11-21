// Landing page: students join with a room code + nickname; hosts go to log in.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListChecks, Code2, Users } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { saveNickname, loadNickname } from '../lib/player.js';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState(loadNickname());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Checks the room exists, remembers the nickname for this tab, then opens the play page.
  async function join(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    setError('');
    setBusy(true);
    try {
      const info = await api(`/api/sessions/${encodeURIComponent(clean)}/exists`);
      if (!info.exists) throw new Error('No live event with that code. Check it with your host.');
      if (info.phase === 'finished') throw new Error('That event has already finished.');
      saveNickname(nickname.trim());
      navigate(`/play/${clean}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <section className="grid gap-8 py-6 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Live quizzes and coding contests for your class
          </h1>
          <p className="mt-3 text-slate-600">
            A host builds an MCQ quiz (AI drafts the questions) or a coding contest with up to 4 problems. Students join with a room
            code and a nickname. The server keeps the timer, the answers and the hidden tests.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <ListChecks size={18} className="text-brand-600" /> MCQ quiz: faster correct answers score more
            </li>
            <li className="flex items-center gap-2">
              <Code2 size={18} className="text-brand-600" /> Coding contest: C++, Python, JavaScript, Java with real verdicts
            </li>
            <li className="flex items-center gap-2">
              <Users size={18} className="text-brand-600" /> Live leaderboard, podium and CSV export
            </li>
          </ul>
          <p className="mt-6 text-sm">
            {user ? (
              <Link to="/dashboard" className="btn-secondary">
                Go to your dashboard
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-secondary">
                  I'm a host: create an account
                </Link>
              </>
            )}
          </p>
        </div>

        {/* order-first: on phones (where students join) the join box comes before the description */}
        <form onSubmit={join} className="card order-first space-y-4 md:order-none">
          <h2 className="text-lg font-bold">Join an event</h2>
          <div>
            <label className="label" htmlFor="code">
              Room code
            </label>
            <input
              id="code"
              className="input text-center font-mono text-2xl tracking-[0.3em] uppercase"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
              required
              minLength={6}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="nickname">
              Nickname
            </label>
            <input
              id="nickname"
              className="input"
              placeholder="e.g. Riya"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              required
              maxLength={20}
            />
          </div>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button className="btn-primary w-full py-3 text-base" disabled={busy || code.length !== 6 || !nickname.trim()}>
            {busy ? 'Checking…' : 'Join'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
