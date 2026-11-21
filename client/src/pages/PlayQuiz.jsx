// A student's phone screen for a live MCQ quiz: waiting -> question buttons -> result -> ... -> final rank.
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { socket, emitAck } from '../lib/socket.js';
import { syncClock, useCountdown } from '../lib/useCountdown.js';
import { OPTION_STYLES, CountdownBadge, Leaderboard, Podium } from '../components/QuizParts.jsx';

// Turns a snapshot from the server (join/rejoin) into this screen's state.
const fromSnapshot = (st) => ({
  phase: st.phase,
  question: st.question || null,
  myAnswer: st.myAnswer ?? null,
  reveal: st.reveal || null,
  result: st.result || null,
  gameOver: st.gameOver || null,
  final: st.final || null,
  score: st.score || 0,
});

export default function PlayQuiz({ joined }) {
  const [s, setS] = useState(() => fromSnapshot(joined.state));
  const [note, setNote] = useState('');

  // A rejoin brings a fresh snapshot.
  useEffect(() => setS(fromSnapshot(joined.state)), [joined]);

  useEffect(() => {
    const on = {
      'question:start': (q) => {
        syncClock(q.serverNow);
        setNote('');
        setS((p) => ({ ...p, phase: 'question', question: q, myAnswer: null, reveal: null, result: null }));
      },
      'question:end': (r) => setS((p) => ({ ...p, phase: 'reveal', reveal: r })),
      'player:result': (r) => setS((p) => ({ ...p, result: r, score: r.score })),
      'game:over': (g) => setS((p) => ({ ...p, phase: 'finished', gameOver: g })),
      'player:final': (f) => setS((p) => ({ ...p, final: f, score: f.score })),
    };
    Object.entries(on).forEach(([event, fn]) => socket.on(event, fn));
    return () => Object.entries(on).forEach(([event, fn]) => socket.off(event, fn));
  }, []);

  // Sends an answer. The server decides if it counts (and when it arrived).
  async function answer(optionIndex) {
    if (s.myAnswer !== null) return;
    setS((p) => ({ ...p, myAnswer: optionIndex })); // show it right away
    const reply = await emitAck('answer:submit', { index: s.question.index, optionIndex });
    if (!reply?.accepted) {
      const reasons = { 'too-late': "Too late: time's up.", 'already-answered': 'You already answered.', 'not-open': 'This question is closed.' };
      setNote(reasons[reply?.reason] || reply?.error || 'Your answer was not accepted.');
      if (reply?.reason !== 'already-answered') setS((p) => ({ ...p, myAnswer: null }));
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="flex items-center gap-2 bg-white px-4 py-3 shadow-sm">
        <span className="truncate font-semibold">{joined.nickname}</span>
        <span className="ml-auto rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-white tabular-nums" data-testid="my-score">
          {s.score} pts
        </span>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 p-4">
        {s.phase === 'lobby' && (
          <div className="mt-20 text-center">
            <Loader2 className="mx-auto animate-spin text-brand-600" size={40} />
            <p className="mt-4 text-xl font-bold">You're in, {joined.nickname}!</p>
            <p className="text-slate-500">Waiting for the host to start…</p>
          </div>
        )}
        {s.phase === 'question' && s.question && <PlayQuestion s={s} note={note} onAnswer={answer} />}
        {s.phase === 'reveal' && <PlayReveal s={s} meId={joined.publicId} />}
        {s.phase === 'finished' && s.gameOver && <PlayFinished s={s} meId={joined.publicId} />}
      </main>
    </div>
  );
}

// Four big buttons and the synced countdown.
function PlayQuestion({ s, note, onAnswer }) {
  const left = useCountdown(s.question.endsAt);
  const locked = s.myAnswer !== null;
  const timeUp = left <= 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-500">
          {s.question.index + 1} / {s.question.total}
        </span>
        <span className="ml-auto">
          <CountdownBadge msLeft={left} size="sm" />
        </span>
      </div>
      <h2 className="rounded-xl bg-white p-4 text-center text-lg font-bold shadow-sm">{s.question.text}</h2>
      <div className="grid grid-cols-2 gap-3">
        {s.question.options.map((opt, i) => {
          const { bg, Icon } = OPTION_STYLES[i];
          const chosen = s.myAnswer === i;
          return (
            <button
              key={i}
              className={`${bg} flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl p-3 text-center font-semibold text-white shadow transition active:scale-95 disabled:cursor-default ${locked && !chosen ? 'opacity-30' : ''} ${chosen ? 'ring-4 ring-slate-900' : ''}`}
              onClick={() => onAnswer(i)}
              disabled={locked || timeUp}
              data-testid={`option-${i}`}
            >
              <Icon size={24} fill="currentColor" />
              <span className="text-sm leading-tight">{opt}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm font-medium text-slate-600" data-testid="answer-status">
        {note || (locked ? 'Answer locked in. Waiting for the others…' : timeUp ? "Time's up!" : 'Tap your answer')}
      </p>
    </div>
  );
}

// Right or wrong, points, and rank after each question.
function PlayReveal({ s, meId }) {
  const r = s.result;
  const correctText = s.question?.options?.[s.reveal?.correctIndex];
  return (
    <div className="mt-6 space-y-5 text-center">
      {!r ? (
        <p className="text-slate-500">Waiting for results…</p>
      ) : r.correct ? (
        <div className="rounded-2xl bg-emerald-500 p-6 text-white">
          <CheckCircle2 className="mx-auto" size={48} />
          <p className="mt-2 text-2xl font-extrabold">Correct!</p>
          <p className="text-lg">+{r.points} points</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-rose-500 p-6 text-white">
          {r.answered ? <XCircle className="mx-auto" size={48} /> : <Clock className="mx-auto" size={48} />}
          <p className="mt-2 text-2xl font-extrabold">{r.answered ? 'Not quite' : 'No answer'}</p>
          <p>The answer was: {correctText}</p>
        </div>
      )}
      {r && (
        <p className="text-lg" data-testid="my-rank">
          You are <b>#{r.rank}</b> of {r.of} with {r.score} points
        </p>
      )}
      {s.reveal?.explanation && <p className="rounded-lg bg-white p-3 text-sm text-slate-600">{s.reveal.explanation}</p>}
      <div className="text-left">
        <Leaderboard rows={s.reveal?.top10} meId={meId} />
      </div>
    </div>
  );
}

// The final podium and the student's own place.
function PlayFinished({ s, meId }) {
  return (
    <div className="mt-6 space-y-6 text-center">
      <h2 className="text-2xl font-extrabold">Game over</h2>
      <Podium podium={s.gameOver.podium} meId={meId} />
      {s.final && (
        <p className="text-lg" data-testid="final-rank">
          You finished <b>#{s.final.rank}</b> of {s.final.of} with {s.final.score} points
        </p>
      )}
      <div className="text-left">
        <Leaderboard rows={s.gameOver.top10} meId={meId} />
      </div>
    </div>
  );
}
