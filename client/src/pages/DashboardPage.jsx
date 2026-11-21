// The host's home: their MCQ quizzes and coding contests, with buttons to edit, host live or delete.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ListChecks, Code2, Plus, Sparkles, Play, Pencil, Trash2 } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null);
  const [contests, setContests] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  // Loads both lists when the page opens.
  useEffect(() => {
    api('/api/quizzes')
      .then((d) => setQuizzes(d.quizzes))
      .catch((e) => setError(e.message));
    api('/api/contests')
      .then((d) => setContests(d.contests))
      .catch(() => setContests([]));
  }, []);

  // Creates a live room for a quiz or contest and opens the host screen.
  async function hostLive(kind, id) {
    setStarting(id);
    setError('');
    try {
      const { code } = await api('/api/sessions', { method: 'POST', body: { kind, id } });
      navigate(`/host/${code}`);
    } catch (e) {
      setError(e.message);
      setStarting('');
    }
  }

  async function remove(kind, id, title) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/${kind === 'quiz' ? 'quizzes' : 'contests'}/${id}`, { method: 'DELETE' });
      if (kind === 'quiz') setQuizzes((list) => list.filter((q) => q.id !== id));
      else setContests((list) => list.filter((c) => c.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold">Hi {user?.name}</h1>
      <p className="text-slate-500">Create an event, then press Host live to get a room code for your students.</p>
      {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ListChecks size={20} className="text-brand-600" /> MCQ quizzes
            </h2>
            <div className="ml-auto flex gap-2">
              <Link to="/quizzes/new?ai=1" className="btn-primary">
                <Sparkles size={16} /> Generate with AI
              </Link>
              <Link to="/quizzes/new" className="btn-secondary">
                <Plus size={16} /> Write
              </Link>
            </div>
          </div>
          <EventList
            items={quizzes}
            empty="No quizzes yet."
            describe={(q) => `${q.questionCount} questions · ${q.difficulty}`}
            editPath={(q) => `/quizzes/${q.id}`}
            onHost={(q) => hostLive('quiz', q.id)}
            onDelete={(q) => remove('quiz', q.id, q.title)}
            starting={starting}
          />
        </section>

        <section className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Code2 size={20} className="text-brand-600" /> Coding contests
            </h2>
            <div className="ml-auto">
              <Link to="/contests/new" className="btn-primary">
                <Plus size={16} /> New contest
              </Link>
            </div>
          </div>
          <EventList
            items={contests}
            empty="No contests yet."
            describe={(c) =>
              `${c.problemCount} problem${c.problemCount === 1 ? '' : 's'} · ${c.durationMin} min${c.unverified ? ` · ${c.unverified} unverified` : ''}`
            }
            editPath={(c) => `/contests/${c.id}`}
            onHost={(c) => hostLive('contest', c.id)}
            onDelete={(c) => remove('contest', c.id, c.title)}
            starting={starting}
          />
        </section>
      </div>
    </Layout>
  );
}

// A list of quizzes or contests with Edit / Host live / Delete buttons.
function EventList({ items, empty, describe, editPath, onHost, onDelete, starting }) {
  if (items === null) return <p className="mt-4 text-sm text-slate-400">Loading…</p>;
  if (items.length === 0) return <p className="mt-4 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="mt-4 divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="text-xs text-slate-500">{describe(item)}</p>
          </div>
          <Link to={editPath(item)} className="btn-secondary px-3" title="Edit">
            <Pencil size={15} />
          </Link>
          <button className="btn-secondary px-3 text-rose-600" title="Delete" onClick={() => onDelete(item)}>
            <Trash2 size={15} />
          </button>
          <button className="btn-success" onClick={() => onHost(item)} disabled={starting === item.id}>
            <Play size={15} /> {starting === item.id ? 'Starting…' : 'Host live'}
          </button>
        </li>
      ))}
    </ul>
  );
}
