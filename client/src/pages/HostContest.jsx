// The host's screen for a live coding contest: lobby -> live leaderboard + submissions feed -> final results.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Users, Play, Square, Download, LayoutDashboard, Clock, X, Code2 } from 'lucide-react';
import { socket, emitAck } from '../lib/socket.js';
import { downloadFile } from '../lib/api.js';
import { syncClock, useCountdown, formatClock } from '../lib/useCountdown.js';
import JoinBanner from '../components/JoinBanner.jsx';
import LazyCodeEditor from '../components/LazyCodeEditor.jsx';
import { LETTER, VerdictBadge, ContestBoard, ContestPodium, formatMs, languageLabel } from '../components/ContestParts.jsx';

export default function HostContest({ snapshot }) {
  const [s, setS] = useState(snapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null); // a submission's code in the modal

  useEffect(() => setS(snapshot), [snapshot]);

  useEffect(() => {
    const on = {
      'lobby:update': (d) => setS((p) => ({ ...p, count: d.count, recent: d.recent })),
      'contest:started': (d) => {
        syncClock(d.serverNow);
        setS((p) => ({ ...p, phase: 'running', endsAt: d.endsAt, board: d.board }));
      },
      leaderboard: (board) => setS((p) => ({ ...p, board })),
      'submission:new': (sub) => setS((p) => ({ ...p, feed: [...p.feed, sub].slice(-200) })),
      'submission:update': (sub) => setS((p) => ({ ...p, feed: p.feed.map((f) => (f.id === sub.id ? sub : f)) })),
      'contest:ended': () => setS((p) => ({ ...p, phase: 'finished' })),
      'contest:over': (f) => setS((p) => ({ ...p, phase: 'finished', final: f, board: f.board })),
      'session:saved': (d) => (d.sessionId ? setS((p) => ({ ...p, sessionId: d.sessionId })) : setError(d.error)),
    };
    Object.entries(on).forEach(([event, fn]) => socket.on(event, fn));
    return () => Object.entries(on).forEach(([event, fn]) => socket.off(event, fn));
  }, []);

  async function command(event) {
    setBusy(true);
    setError('');
    const reply = await emitAck(event);
    if (!reply?.ok && reply?.error) setError(reply.error);
    setBusy(false);
  }

  // Asks the server for one submission's code (only the host may do this).
  async function openCode(id) {
    const reply = await emitAck('host:submission-code', { id });
    if (!reply?.ok) return setError(reply?.error || 'Could not load the code');
    setViewing(reply);
  }

  const left = useCountdown(s.endsAt);
  const problemCount = s.problems.length;

  return (
    <div className="min-h-full bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/dashboard" className="text-slate-500 hover:text-slate-900" title="Dashboard">
          <LayoutDashboard size={20} />
        </Link>
        <h1 className="truncate text-lg font-bold">{s.title}</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold tracking-widest">{s.code}</span>
        <span className="ml-auto flex items-center gap-1 text-sm text-slate-600" data-testid="player-count">
          <Users size={16} /> {s.count} online
        </span>
        {s.phase === 'running' && (
          <>
            <span className={`flex items-center gap-1 rounded-full px-3 py-1 font-mono text-sm font-bold text-white ${left < 5 * 60_000 ? 'bg-rose-600' : 'bg-slate-800'}`} data-testid="contest-clock">
              <Clock size={14} /> {formatClock(left)}
            </span>
            <button className="btn-secondary" onClick={() => window.confirm('End the contest now for everyone?') && command('contest:end')} disabled={busy}>
              <Square size={14} /> End contest
            </button>
          </>
        )}
      </header>
      {error && <p className="mx-auto mt-3 max-w-5xl rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {s.phase === 'lobby' && (
          <div className="space-y-6 text-center">
            <JoinBanner code={s.code} />
            <p className="text-2xl font-bold" data-testid="lobby-count">
              {s.count} {s.count === 1 ? 'student' : 'students'} joined
            </p>
            <div className="flex min-h-10 flex-wrap justify-center gap-2">
              {s.recent.map((name, i) => (
                <span key={`${name}-${i}`} className="rounded-full bg-white px-3 py-1 text-sm font-medium shadow-sm">
                  {name}
                </span>
              ))}
            </div>
            <div className="mx-auto max-w-lg text-left card">
              <p className="text-sm text-slate-500">
                {problemCount} problem{problemCount > 1 ? 's' : ''} · {s.durationMin} minutes · {s.penaltyMin} min penalty per wrong submission ·{' '}
                {s.languages.map(languageLabel).join(', ')}
              </p>
              <ol className="mt-2 space-y-1">
                {s.problems.map((p, i) => (
                  <li key={i} className="text-sm">
                    <b>{LETTER(i)}.</b> {p.title} <span className="text-slate-400">({p.testCount} hidden tests)</span>
                  </li>
                ))}
              </ol>
            </div>
            <button className="btn-primary px-8 py-3 text-lg" onClick={() => command('contest:start')} disabled={busy}>
              <Play size={20} /> Start contest
            </button>
          </div>
        )}

        {s.phase !== 'lobby' && (
          <div className="space-y-6">
            {s.phase === 'finished' && (
              <div className="space-y-4 text-center">
                <h2 className="text-3xl font-extrabold">{s.final ? 'Final results' : 'Time is up: finishing the last submissions…'}</h2>
                {s.final && <ContestPodium podium={s.final.podium} />}
                {s.final && (
                  <div className="flex justify-center gap-3">
                    <button
                      className="btn-primary"
                      disabled={!s.sessionId}
                      onClick={() => downloadFile(`/api/sessions/${s.sessionId}/export.csv`, `${s.code}-results.csv`).catch((e) => setError(e.message))}
                    >
                      <Download size={16} /> {s.sessionId ? 'Download CSV' : 'Saving results…'}
                    </button>
                    <Link to="/dashboard" className="btn-secondary">
                      Back to dashboard
                    </Link>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <section>
                <h2 className="mb-2 font-bold">Leaderboard</h2>
                <ContestBoard board={s.board} problemCount={problemCount} />
              </section>
              <SubmissionFeed feed={s.feed} onOpen={openCode} />
            </div>
          </div>
        )}
      </main>

      {viewing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={() => setViewing(null)}>
          <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Code2 size={18} />
              <b>{viewing.nickname}</b> · {LETTER(viewing.problemIndex)} · {languageLabel(viewing.language)} <VerdictBadge verdict={viewing.verdict} />
              <button className="ml-auto text-slate-500" onClick={() => setViewing(null)} title="Close">
                <X size={18} />
              </button>
            </div>
            <LazyCodeEditor language={viewing.language} value={viewing.code} readOnly height="420px" />
          </div>
        </div>
      )}
    </div>
  );
}

// Every submission as it happens, newest first. Click one to read the code.
function SubmissionFeed({ feed, onOpen }) {
  const items = [...feed].reverse();
  return (
    <section>
      <h2 className="mb-2 font-bold">Submissions ({feed.length})</h2>
      <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white" data-testid="submission-feed">
        {items.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">No submissions yet</li>}
        {items.map((sub) => (
          <li key={sub.id}>
            <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onOpen(sub.id)} title="View code">
              <span className="w-12 font-mono text-xs text-slate-400">{formatMs(sub.atMs)}</span>
              <span className="max-w-32 truncate font-medium">{sub.nickname}</span>
              <span className="rounded bg-slate-100 px-1.5 text-xs font-bold">{LETTER(sub.problemIndex)}</span>
              <span className="text-xs text-slate-500">{languageLabel(sub.language)}</span>
              <span className="ml-auto flex items-center gap-2">
                {sub.verdict !== 'Judging' && sub.total ? (
                  <span className="text-xs text-slate-500">
                    {sub.passed}/{sub.total}
                  </span>
                ) : null}
                <VerdictBadge verdict={sub.verdict} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
