// The host's (projector) screen for a live MCQ quiz: lobby -> question -> reveal -> ... -> podium.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Users, Play, SkipForward, ChevronRight, Square, Download, LayoutDashboard } from 'lucide-react';
import { socket, emitAck } from '../lib/socket.js';
import { downloadFile } from '../lib/api.js';
import { syncClock, useCountdown } from '../lib/useCountdown.js';
import { OPTION_STYLES, CountdownBadge, AnswerBars, Leaderboard, Podium } from '../components/QuizParts.jsx';
import JoinBanner from '../components/JoinBanner.jsx';

export default function HostQuiz({ snapshot }) {
  const [s, setS] = useState(snapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A fresh snapshot (first join or after a reconnect) replaces everything.
  useEffect(() => setS(snapshot), [snapshot]);

  // Live events from the server.
  useEffect(() => {
    const on = {
      'lobby:update': (d) => setS((p) => ({ ...p, count: d.count, recent: d.recent })),
      'answers:progress': (d) => setS((p) => ({ ...p, answered: d.answered, count: d.total })),
      'question:start': (q) => {
        syncClock(q.serverNow);
        setS((p) => ({ ...p, phase: 'question', question: q, answered: 0, reveal: null }));
      },
      'question:end': (r) => setS((p) => ({ ...p, phase: 'reveal', reveal: r })),
      'game:over': (g) => setS((p) => ({ ...p, phase: 'finished', gameOver: g })),
      'session:saved': (d) => (d.sessionId ? setS((p) => ({ ...p, sessionId: d.sessionId })) : setError(d.error)),
    };
    Object.entries(on).forEach(([event, fn]) => socket.on(event, fn));
    return () => Object.entries(on).forEach(([event, fn]) => socket.off(event, fn));
  }, []);

  // Sends a host command (start / next / skip / end) and shows any error.
  async function command(event) {
    setBusy(true);
    setError('');
    const reply = await emitAck(event);
    if (!reply?.ok && reply?.error) setError(reply.error);
    setBusy(false);
  }

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
        {s.phase !== 'finished' && s.phase !== 'lobby' && (
          <button className="btn-secondary" onClick={() => window.confirm('End the quiz now for everyone?') && command('quiz:end')} disabled={busy}>
            <Square size={14} /> End quiz
          </button>
        )}
      </header>
      {error && <p className="mx-auto mt-3 max-w-4xl rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {s.phase === 'lobby' && <Lobby s={s} busy={busy} onStart={() => command('quiz:start')} />}
        {s.phase === 'question' && s.question && <HostQuestion s={s} busy={busy} onSkip={() => command('quiz:skip')} />}
        {s.phase === 'reveal' && s.reveal && <HostReveal s={s} busy={busy} onNext={() => command('quiz:next')} />}
        {s.phase === 'finished' && s.gameOver && <HostFinished s={s} />}
      </main>
    </div>
  );
}

// Waiting room: the big join code, who has joined, and the Start button.
function Lobby({ s, busy, onStart }) {
  return (
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
      <button className="btn-primary px-8 py-3 text-lg" onClick={onStart} disabled={busy || s.count === 0}>
        <Play size={20} /> Start quiz ({s.totalQuestions} questions)
      </button>
    </div>
  );
}

// The current question as the class sees it on the projector (no answer shown yet).
function HostQuestion({ s, busy, onSkip }) {
  const left = useCountdown(s.question.endsAt);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-slate-500">
          Question {s.question.index + 1} of {s.question.total}
        </span>
        <span className="ml-auto text-sm text-slate-600" data-testid="answered">
          {s.answered} / {s.count} answered
        </span>
        <CountdownBadge msLeft={left} />
      </div>
      <h2 className="rounded-xl bg-white p-6 text-center text-2xl font-bold shadow-sm sm:text-3xl">{s.question.text}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {s.question.options.map((opt, i) => {
          const { bg, Icon } = OPTION_STYLES[i];
          return (
            <div key={i} className={`${bg} flex items-center gap-3 rounded-xl p-5 text-lg font-semibold text-white shadow`}>
              <Icon size={22} fill="currentColor" /> {opt}
            </div>
          );
        })}
      </div>
      <div className="text-right">
        <button className="btn-secondary" onClick={onSkip} disabled={busy}>
          <SkipForward size={16} /> Close question now
        </button>
      </div>
    </div>
  );
}

// After a question: the right answer, what the class chose, and the top 10.
function HostReveal({ s, busy, onNext }) {
  const { reveal, question } = s;
  return (
    <div className="space-y-6">
      <h2 className="text-center text-xl font-bold sm:text-2xl">{question?.text}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {question?.options.map((opt, i) => {
          const { bg, Icon } = OPTION_STYLES[i];
          const correct = i === reveal.correctIndex;
          return (
            <div
              key={i}
              className={`${bg} flex items-center gap-3 rounded-xl p-4 font-semibold text-white ${correct ? 'ring-4 ring-emerald-300' : 'opacity-35'}`}
              data-testid={correct ? 'correct-option' : undefined}
            >
              <Icon size={20} fill="currentColor" /> {opt} {correct && <span className="ml-auto">✓</span>}
            </div>
          );
        })}
      </div>
      {reveal.explanation && <p className="rounded-lg bg-emerald-50 p-3 text-center text-emerald-900">{reveal.explanation}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 font-bold">
            Answers ({reveal.answered} of {s.count})
          </h3>
          <AnswerBars options={question?.options} counts={reveal.counts} correctIndex={reveal.correctIndex} />
        </div>
        <div className="card">
          <Leaderboard rows={reveal.top10} />
        </div>
      </div>
      <div className="text-right">
        <button className="btn-primary px-6 py-3" onClick={onNext} disabled={busy}>
          {reveal.isLast ? 'Show final results' : 'Next question'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

// The end: podium, top 10 and the CSV download.
function HostFinished({ s }) {
  const [error, setError] = useState('');
  return (
    <div className="space-y-8 text-center">
      <h2 className="text-3xl font-extrabold">Final results</h2>
      <Podium podium={s.gameOver.podium} />
      <div className="mx-auto max-w-md text-left">
        <Leaderboard rows={s.gameOver.top10} />
      </div>
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
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
