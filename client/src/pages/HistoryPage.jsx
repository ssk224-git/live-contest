// Past (finished) quizzes and contests, with a CSV download for each.
import { useEffect, useState } from 'react';
import { ListChecks, Code2, Download, Trophy } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { api, downloadFile } from '../lib/api.js';

export default function HistoryPage() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/sessions')
      .then((d) => setSessions(d.sessions))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-bold">History</h1>
      <p className="text-slate-500">Every finished event is saved here. Download the results as a CSV (opens in Excel or Google Sheets).</p>
      {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {sessions === null && !error && <p className="mt-6 text-slate-400">Loading…</p>}
      {sessions?.length === 0 && <p className="mt-6 text-slate-500">Nothing yet. Host a quiz or contest and it will show up here.</p>}
      {sessions?.length > 0 && (
        <ul className="card mt-6 divide-y divide-slate-100 p-0">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-testid="history-row">
              {s.kind === 'quiz' ? <ListChecks size={20} className="text-brand-600" /> : <Code2 size={20} className="text-emerald-600" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-xs text-slate-500">
                  {s.kind === 'quiz' ? 'MCQ quiz' : 'Coding contest'} · {new Date(s.endedAt).toLocaleString()} · code {s.code} · {s.playerCount}{' '}
                  {s.playerCount === 1 ? 'student' : 'students'}
                </p>
              </div>
              {s.winner && (
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Trophy size={14} className="text-amber-500" /> {s.winner}
                </span>
              )}
              <button
                className="btn-secondary"
                onClick={() => downloadFile(`/api/sessions/${s.id}/export.csv`, `${s.code}-results.csv`).catch((e) => setError(e.message))}
              >
                <Download size={15} /> CSV
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
