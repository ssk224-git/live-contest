// A student's coding contest screen: problem statement on the left, code editor on the right,
// Run (public examples) and Submit (hidden tests), verdicts, and the live leaderboard.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Play, Send, Loader2, CheckCircle2, Clock, ListOrdered, FileText, Copy } from 'lucide-react';
import { socket, emitAck } from '../lib/socket.js';
import { syncClock, useCountdown, formatClock } from '../lib/useCountdown.js';
import { LANGUAGES } from '../lib/languages.js';
import LazyCodeEditor from '../components/LazyCodeEditor.jsx';
import { LETTER, VerdictBadge, ContestBoard, ContestPodium, formatMs, languageLabel } from '../components/ContestParts.jsx';

// Code drafts are kept per tab (sessionStorage), so a refresh never loses your code.
const draftKey = (code, problem, lang) => `lc-code-${code}-${problem}-${lang}`;
const loadDraft = (code, problem, lang) => sessionStorage.getItem(draftKey(code, problem, lang)) ?? LANGUAGES[lang].starter;

export default function PlayContest({ joined }) {
  const { code: roomCode } = useParams();
  const st = joined.state;
  const [phase, setPhase] = useState(st.phase);
  const [problems, setProblems] = useState(st.problems);
  const [endsAt, setEndsAt] = useState(st.endsAt);
  const [me, setMe] = useState(st.me);
  const [board, setBoard] = useState(st.board);
  const [final, setFinal] = useState(st.final);
  const [submissions, setSubmissions] = useState(st.submissions || []);

  // A rejoin brings a fresh snapshot.
  useEffect(() => {
    const s = joined.state;
    setPhase(s.phase);
    setProblems(s.problems);
    setEndsAt(s.endsAt);
    setMe(s.me);
    setBoard(s.board);
    setFinal(s.final);
    setSubmissions(s.submissions || []);
  }, [joined]);

  // Live events from the server.
  useEffect(() => {
    const on = {
      'contest:started': (d) => {
        syncClock(d.serverNow);
        setPhase('running');
        setProblems(d.problems);
        setEndsAt(d.endsAt);
        setBoard(d.board);
      },
      leaderboard: setBoard,
      'submission:result': (r) => {
        setMe(r.me);
        setSubmissions((list) => [r, ...list.filter((s) => s.id !== r.id)].slice(0, 30));
      },
      'contest:ended': () => setPhase('finished'),
      'contest:over': (f) => {
        setPhase('finished');
        setFinal(f);
        setBoard(f.board);
      },
    };
    Object.entries(on).forEach(([event, fn]) => socket.on(event, fn));
    return () => Object.entries(on).forEach(([event, fn]) => socket.off(event, fn));
  }, []);

  if (phase === 'lobby') {
    return (
      <div className="mx-auto mt-16 max-w-md p-4 text-center">
        <Loader2 className="mx-auto animate-spin text-brand-600" size={40} />
        <p className="mt-4 text-xl font-bold">You're in, {joined.nickname}!</p>
        <p className="mt-1 text-slate-600">
          {st.title}: {st.problemCount} problem{st.problemCount > 1 ? 's' : ''}, {st.durationMin} minutes.
        </p>
        <p className="text-sm text-slate-500">Languages: {st.languages.map(languageLabel).join(', ')}</p>
        <p className="mt-4 text-slate-500">The problems appear when the host starts the contest.</p>
      </div>
    );
  }

  return (
    <ContestWorkspace
      roomCode={roomCode}
      joined={joined}
      title={st.title}
      languages={st.languages}
      penaltyMin={st.penaltyMin}
      phase={phase}
      problems={problems || []}
      endsAt={endsAt}
      me={me}
      board={board}
      final={final}
      submissions={submissions}
      setSubmissions={setSubmissions}
    />
  );
}

function ContestWorkspace({ roomCode, joined, title, languages, penaltyMin, phase, problems, endsAt, me, board, final, submissions, setSubmissions }) {
  const [active, setActive] = useState(0);
  const [view, setView] = useState('problem'); // 'problem' | 'board'
  const [language, setLanguage] = useState(() => sessionStorage.getItem('lc-lang') || languages[0]);
  const [code, setCode] = useState(() => loadDraft(roomCode, 0, language));
  const [busy, setBusy] = useState(''); // 'run' | 'submit' | ''
  const [queue, setQueue] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState('');
  const left = useCountdown(endsAt);
  const over = phase === 'finished';
  const lastSubmitId = useRef(null);

  // Switching problem or language loads that draft.
  useEffect(() => {
    setCode(loadDraft(roomCode, active, language));
    setRunResult(null);
  }, [roomCode, active, language]);

  useEffect(() => {
    const onQueued = (d) => setQueue(d.position);
    socket.on('judge:queued', onQueued);
    return () => socket.off('judge:queued', onQueued);
  }, []);

  // When our submission's verdict arrives, stop the spinner.
  useEffect(() => {
    if (busy === 'submit' && submissions[0]?.id === lastSubmitId.current && submissions[0]?.verdict !== 'Judging') {
      setBusy('');
      setQueue(0);
    }
  }, [submissions, busy]);

  function editCode(value) {
    setCode(value);
    sessionStorage.setItem(draftKey(roomCode, active, language), value);
  }

  function pickLanguage(lang) {
    sessionStorage.setItem('lc-lang', lang);
    setLanguage(lang);
  }

  // Runs on the public examples: shows input, expected and actual output.
  async function run() {
    setBusy('run');
    setError('');
    setRunResult(null);
    const reply = await emitAck('code:run', { problemIndex: active, language, code }, 90_000);
    setBusy('');
    setQueue(0);
    if (!reply?.ok) return setError(reply?.error || 'Run failed');
    setRunResult(reply.result);
  }

  // Submits for judging on the hidden tests. The verdict arrives as "submission:result".
  async function submit() {
    setBusy('submit');
    setError('');
    const reply = await emitAck('code:submit', { problemIndex: active, language, code }, 15_000);
    if (!reply?.ok) {
      setBusy('');
      return setError(reply?.error || 'Submit failed');
    }
    lastSubmitId.current = reply.submissionId;
    setSubmissions((list) => [{ id: reply.submissionId, problemIndex: active, language, verdict: 'Judging', atMs: null }, ...list]);
  }

  const problem = problems[active];
  const status = me?.problems?.[active];
  const mySubs = submissions.filter((s) => s.problemIndex === active);

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 bg-white px-4 py-2 shadow-sm">
        <span className="font-bold">{title}</span>
        <span className="text-sm text-slate-500">{joined.nickname}</span>
        <span className="ml-auto text-sm" data-testid="my-standing">
          Solved <b>{me?.solved ?? 0}</b>/{problems.length}
          {me?.rank ? (
            <>
              {' '}
              · Rank <b>#{me.rank}</b>
            </>
          ) : null}
          {me?.penaltyMs ? <span className="text-rose-600"> · +{formatMs(me.penaltyMs)} penalty</span> : null}
        </span>
        <span className={`flex items-center gap-1 rounded-full px-3 py-1 font-mono text-sm font-bold text-white ${over ? 'bg-slate-500' : left < 5 * 60_000 ? 'bg-rose-600' : 'bg-slate-800'}`} data-testid="contest-clock">
          <Clock size={14} /> {over ? 'Ended' : formatClock(left)}
        </span>
      </header>

      {over && (
        <div className="bg-slate-800 px-4 py-2 text-center text-sm text-white">
          {final ? 'The contest is over. Final standings below.' : 'Time is up! Finishing the last submissions…'}
        </div>
      )}

      <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
        {problems.map((p, i) => {
          const s = me?.problems?.[i];
          return (
            <button
              key={i}
              onClick={() => {
                setActive(i);
                setView('problem');
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === 'problem' && active === i ? 'bg-brand-600 text-white' : 'hover:bg-slate-100'}`}
              data-testid={`problem-tab-${i}`}
            >
              {s?.solved ? <CheckCircle2 size={14} className={view === 'problem' && active === i ? '' : 'text-emerald-600'} /> : null}
              {LETTER(i)}. <span className="max-w-32 truncate">{p.title}</span>
              {!s?.solved && s?.wrong > 0 && <span className="text-xs text-rose-400">({s.wrong}✗)</span>}
            </button>
          );
        })}
        <button
          onClick={() => setView('board')}
          className={`ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === 'board' ? 'bg-brand-600 text-white' : 'hover:bg-slate-100'}`}
        >
          <ListOrdered size={15} /> Leaderboard
        </button>
      </nav>

      {view === 'board' || (over && final) ? (
        <main className="mx-auto w-full max-w-5xl space-y-6 p-4">
          {over && final && <ContestPodium podium={final.podium} meId={joined.publicId} />}
          <ContestBoard board={board} problemCount={problems.length} meId={joined.publicId} />
          <p className="text-xs text-slate-500">
            Ranked by problems solved, then finish time (last accepted time + {penaltyMin} min per wrong submission on solved problems).
          </p>
          {over && final && (
            <button className="btn-secondary" onClick={() => setView('problem')}>
              <FileText size={15} /> Back to the problems
            </button>
          )}
        </main>
      ) : (
        problem && (
          <main className="grid flex-1 gap-4 p-4 lg:grid-cols-2">
            <ProblemStatement problem={problem} letter={LETTER(active)} language={language} />

            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-1.5" value={language} onChange={(e) => pickLanguage(e.target.value)} aria-label="Language" disabled={over}>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {languageLabel(l)}
                    </option>
                  ))}
                </select>
                {status?.solved && (
                  <span className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 size={16} /> Solved at {formatMs(status.solvedAtMs)}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button className="btn-secondary" onClick={run} disabled={Boolean(busy) || over}>
                    {busy === 'run' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run examples
                  </button>
                  <button className="btn-success" onClick={submit} disabled={Boolean(busy) || over}>
                    {busy === 'submit' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit
                  </button>
                </div>
              </div>
              <LazyCodeEditor language={language} value={code} onChange={editCode} height="380px" readOnly={over} />
              {busy && (
                <p className="text-sm text-sky-700" data-testid="judging-status">
                  {queue > 0 ? `Waiting for the code runner… ${queue} ahead of you` : busy === 'run' ? 'Running on the examples…' : 'Judging on the hidden tests…'}
                </p>
              )}
              {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              {runResult && <RunResult result={runResult} />}
              <SubmissionList subs={mySubs} />
            </section>
          </main>
        )
      )}
    </div>
  );
}

// The problem as students see it (no hidden tests, ever).
function ProblemStatement({ problem, letter, language }) {
  return (
    <article className="card space-y-4 overflow-y-auto lg:max-h-[calc(100vh-150px)]">
      <div>
        <h2 className="text-xl font-bold">
          {letter}. {problem.title}
        </h2>
        <p className="text-xs text-slate-500">
          Time limit: {problem.timeLimits?.[language]} s ({languageLabel(language)}) · {problem.testCount} hidden tests
        </p>
      </div>
      <p className="whitespace-pre-wrap text-slate-800">{problem.statement}</p>
      {problem.inputFormat && (
        <section>
          <h3 className="font-semibold">Input</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{problem.inputFormat}</p>
        </section>
      )}
      {problem.outputFormat && (
        <section>
          <h3 className="font-semibold">Output</h3>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{problem.outputFormat}</p>
        </section>
      )}
      {problem.constraints && (
        <section>
          <h3 className="font-semibold">Constraints</h3>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-700">{problem.constraints}</pre>
        </section>
      )}
      {problem.examples.map((ex, i) => (
        <section key={i}>
          <h3 className="font-semibold">Example {i + 1}</h3>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <IoBox label="Input" text={ex.input} />
            <IoBox label="Output" text={ex.output} />
          </div>
          {ex.explanation && <p className="mt-1 text-sm text-slate-600">{ex.explanation}</p>}
        </section>
      ))}
    </article>
  );
}

function IoBox({ label, text }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center text-xs text-slate-500">
        {label}
        <button className="ml-auto hover:text-slate-800" onClick={() => navigator.clipboard?.writeText(text)} title="Copy">
          <Copy size={12} />
        </button>
      </div>
      <pre className="pre">{text || ' '}</pre>
    </div>
  );
}

// Results of "Run examples": one row per example with expected vs actual output.
function RunResult({ result }) {
  return (
    <div className="card space-y-2 p-3" data-testid="run-result">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Run on examples:</span>
        <VerdictBadge verdict={result.verdict} />
        <span className="text-xs text-slate-500">
          {result.passed}/{result.total} passed · {result.timeMs} ms
        </span>
      </div>
      {result.verdict === 'Compile Error' && <pre className="pre max-h-48 text-rose-200">{result.message}</pre>}
      {result.verdict !== 'Compile Error' &&
        result.tests?.map((t, i) => (
          <details key={i} open={t.verdict !== 'Accepted'} className="rounded-md border border-slate-200 p-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2">
              Example {i + 1} <VerdictBadge verdict={t.verdict} />
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <IoBox label="Input" text={t.input} />
              <IoBox label="Expected" text={t.expected} />
              <IoBox label="Your output" text={t.stdout} />
            </div>
            {t.stderr && <pre className="pre mt-2 max-h-40 text-rose-200">{t.stderr}</pre>}
          </details>
        ))}
    </div>
  );
}

// This student's submissions for the open problem, newest first.
function SubmissionList({ subs }) {
  if (!subs.length) return null;
  return (
    <div className="card p-3">
      <h3 className="mb-2 text-sm font-semibold">Your submissions</h3>
      <ul className="space-y-2" data-testid="my-submissions">
        {subs.map((s) => (
          <li key={s.id} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={s.verdict} />
              {s.verdict !== 'Judging' && s.total ? (
                <span className="text-xs text-slate-600">
                  {s.passed}/{s.total} tests passed
                  {s.failedTest ? ` · failed on test ${s.failedTest}` : ''}
                  {s.timeMs !== null && s.timeMs !== undefined ? ` · ${s.timeMs} ms` : ''}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-slate-400">
                {languageLabel(s.language)}
                {s.atMs !== null && s.atMs !== undefined ? ` · at ${formatMs(s.atMs)}` : ''}
              </span>
            </div>
            {s.message && s.verdict !== 'Accepted' && <pre className="pre mt-1 max-h-40 text-xs">{s.message}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
