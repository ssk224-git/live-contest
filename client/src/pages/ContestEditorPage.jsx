// Create or edit a coding contest: settings + up to 4 problems. Each problem has a statement,
// examples (shown to students), hidden tests, and a reference solution used by "Verify".
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Plus, Trash2, Save, Sparkles, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import LazyCodeEditor from '../components/LazyCodeEditor.jsx';
import VerifyBadge from '../components/VerifyBadge.jsx';
import { api } from '../lib/api.js';
import { LANGUAGES, LANGUAGE_KEYS } from '../lib/languages.js';

const MAX_PROBLEMS = 4;
const MAX_EXAMPLES = 3;
const MAX_TESTS = 15;
const LETTER = (i) => String.fromCharCode(65 + i);

const blankProblem = () => ({
  title: '',
  statement: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  examples: [{ input: '', output: '', explanation: '' }],
  tests: [{ input: '', output: '' }],
  referenceSolution: { language: 'python', code: '' },
  timeLimitSec: 2,
  verification: { status: 'unverified', notes: [] },
});

// Only the fields the server expects (drops Mongo's _id etc.).
const cleanProblem = (p) => ({
  title: p.title,
  statement: p.statement,
  inputFormat: p.inputFormat || '',
  outputFormat: p.outputFormat || '',
  constraints: p.constraints || '',
  examples: p.examples.map((e) => ({ input: e.input, output: e.output, explanation: e.explanation || '' })),
  tests: p.tests.map((t) => ({ input: t.input, output: t.output })),
  referenceSolution: { language: p.referenceSolution?.language || 'python', code: p.referenceSolution?.code || '' },
  timeLimitSec: Number(p.timeLimitSec) || 2,
  verification: p.verification
    ? { status: p.verification.status, notes: p.verification.notes || [], fingerprint: p.verification.fingerprint, checkedAt: p.verification.checkedAt }
    : undefined,
});

export default function ContestEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState({ title: '', durationMin: 60, penaltyMin: 5, languages: [...LANGUAGE_KEYS], problems: [] });
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(Boolean(id));
  const [problems, setProblems] = useState([]); // error messages
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [checks, setChecks] = useState({}); // problem index -> last Verify / AI report
  const [showAi, setShowAi] = useState(false);

  useEffect(() => {
    if (!id) return;
    api(`/api/contests/${id}`)
      .then(({ contest: c }) => setContest({ title: c.title, durationMin: c.durationMin, penaltyMin: c.penaltyMin, languages: c.languages, problems: c.problems }))
      .catch((e) => setProblems([e.message]))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key, value) => setContest((c) => ({ ...c, [key]: value }));
  const setProblem = (index, patch) => setContest((c) => ({ ...c, problems: c.problems.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));

  // Adds a problem (blank, or an AI draft) and opens it.
  function addProblem(problem = blankProblem(), report = null) {
    setContest((c) => ({ ...c, problems: [...c.problems, problem] }));
    setActive(contest.problems.length);
    if (report) setChecks((all) => ({ ...all, [contest.problems.length]: report }));
  }

  function removeProblem(index) {
    if (!window.confirm(`Remove problem ${LETTER(index)}?`)) return;
    setContest((c) => ({ ...c, problems: c.problems.filter((_, i) => i !== index) }));
    setChecks({});
    setActive(0);
  }

  async function save() {
    setSaving(true);
    setProblems([]);
    try {
      const body = { ...contest, problems: contest.problems.map(cleanProblem) };
      if (id) {
        const { contest: saved } = await api(`/api/contests/${id}`, { method: 'PUT', body });
        setContest((c) => ({ ...c, problems: saved.problems }));
      } else {
        const { contest: saved } = await api('/api/contests', { method: 'POST', body });
        navigate(`/contests/${saved._id}`, { replace: true });
      }
      setSavedAt(new Date());
    } catch (err) {
      setProblems(err.data?.problems?.length ? err.data.problems : [err.message]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout>Loading…</Layout>;
  const current = contest.problems[active];

  return (
    <Layout wide>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{id ? 'Edit contest' : 'New contest'}</h1>
        <button className="btn-primary ml-auto" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save contest'}
        </button>
      </div>
      {savedAt && (
        <p className="mt-2 flex items-center gap-1 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Saved at {savedAt.toLocaleTimeString()}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-4 list-inside list-disc rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {/* Contest settings */}
      <div className="card mt-4 grid gap-4 md:grid-cols-[2fr_1fr_1fr_2fr]">
        <div>
          <label className="label" htmlFor="c-title">
            Contest title
          </label>
          <input id="c-title" className="input" value={contest.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="c-dur">
            Duration (minutes)
          </label>
          <input id="c-dur" type="number" min={5} max={300} className="input" value={contest.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="c-pen" title="Added to a student's finish time for each wrong submission on a problem they later solve">
            Penalty per wrong (min)
          </label>
          <input id="c-pen" type="number" min={0} max={60} className="input" value={contest.penaltyMin} onChange={(e) => set('penaltyMin', Number(e.target.value))} />
        </div>
        <div>
          <span className="label">Languages allowed</span>
          <div className="flex flex-wrap gap-3 pt-1.5">
            {LANGUAGE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={contest.languages.includes(key)}
                  onChange={(e) => set('languages', e.target.checked ? [...contest.languages, key] : contest.languages.filter((l) => l !== key))}
                />
                {LANGUAGES[key].label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Problem tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {contest.problems.map((p, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${i === active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'}`}
          >
            <span className="font-bold">{LETTER(i)}</span> <span className="max-w-40 truncate">{p.title || 'Untitled'}</span>
            <VerifyBadge status={p.verification?.status} />
          </button>
        ))}
        {contest.problems.length < MAX_PROBLEMS && (
          <>
            <button className="btn-secondary" onClick={() => addProblem()}>
              <Plus size={16} /> Write a problem
            </button>
            <button className="btn-secondary" onClick={() => setShowAi(true)}>
              <Sparkles size={16} /> Draft a problem with AI
            </button>
          </>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {contest.problems.length} / {MAX_PROBLEMS} problems
        </span>
      </div>

      {showAi && <AiProblemPanel onClose={() => setShowAi(false)} onDraft={(problem, report) => { addProblem(problem, report); setShowAi(false); }} />}

      {current ? (
        <ProblemForm
          key={active}
          letter={LETTER(active)}
          problem={current}
          check={checks[active]}
          onChange={(patch) => setProblem(active, patch)}
          onChecked={(report) => setChecks((all) => ({ ...all, [active]: report }))}
          onRemove={() => removeProblem(active)}
        />
      ) : (
        <p className="card mt-4 text-slate-500">No problems yet. Write one, or let the AI draft one (it is checked by running its own reference solution).</p>
      )}
    </Layout>
  );
}

// The form for one problem, with the Verify button and its report.
function ProblemForm({ letter, problem: p, check, onChange, onChecked, onRemove }) {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const setList = (key, index, patch) => onChange({ [key]: p[key].map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const removeFrom = (key, index) => onChange({ [key]: p[key].filter((_, i) => i !== index) });

  // Sends the problem to the server, which runs the reference solution on every example and test.
  async function verify() {
    setVerifying(true);
    setError('');
    try {
      const result = await api('/api/contests/verify-problem', { method: 'POST', body: { problem: cleanProblem(p) } });
      onChange({ tests: result.problem.tests, verification: result.verification });
      onChecked({ dropped: result.dropped, notes: result.verification.notes, status: result.verification.status, source: 'verify' });
    } catch (err) {
      setError(err.data?.problems?.[0] || err.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Problem {letter}</h2>
          <VerifyBadge status={p.verification?.status} />
          <button className="btn-secondary ml-auto px-3 text-rose-600" onClick={onRemove} title="Remove problem">
            <Trash2 size={15} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label className="label">Title</label>
            <input className="input" value={p.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={100} aria-label="Problem title" />
          </div>
          <div>
            <label className="label" title="For C++. Java gets 2x+0.5 s, JavaScript 2x+1.5 s, Python 3x+1.5 s.">
              Time limit (s)
            </label>
            <input type="number" min={1} max={5} step={0.5} className="input" value={p.timeLimitSec} onChange={(e) => onChange({ timeLimitSec: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="label">Statement</label>
          <textarea className="input font-normal" rows={5} value={p.statement} onChange={(e) => onChange({ statement: e.target.value })} aria-label="Statement" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Input format</label>
            <textarea className="input" rows={3} value={p.inputFormat} onChange={(e) => onChange({ inputFormat: e.target.value })} />
          </div>
          <div>
            <label className="label">Output format</label>
            <textarea className="input" rows={3} value={p.outputFormat} onChange={(e) => onChange({ outputFormat: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Constraints</label>
          <textarea className="input font-mono text-xs" rows={2} value={p.constraints} onChange={(e) => onChange({ constraints: e.target.value })} />
        </div>

        <div>
          <div className="flex items-center">
            <h3 className="font-semibold">Examples (students see these)</h3>
            <button className="btn-secondary ml-auto px-2 py-1 text-xs" onClick={() => onChange({ examples: [...p.examples, { input: '', output: '', explanation: '' }] })} disabled={p.examples.length >= MAX_EXAMPLES}>
              <Plus size={13} /> Example
            </button>
          </div>
          {p.examples.map((ex, i) => (
            <div key={i} className="mt-2 rounded-lg border border-slate-200 p-2">
              <div className="mb-1 flex items-center text-xs font-semibold text-slate-500">
                Example {i + 1}
                <button className="ml-auto text-rose-500" onClick={() => removeFrom('examples', i)} disabled={p.examples.length === 1} title="Remove example">
                  <X size={14} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <textarea className="input font-mono text-xs" rows={3} placeholder="Input" value={ex.input} onChange={(e) => setList('examples', i, { input: e.target.value })} aria-label={`Example ${i + 1} input`} />
                <textarea className="input font-mono text-xs" rows={3} placeholder="Expected output" value={ex.output} onChange={(e) => setList('examples', i, { output: e.target.value })} aria-label={`Example ${i + 1} output`} />
              </div>
              <input className="input mt-2 text-xs" placeholder="Explanation (optional)" value={ex.explanation || ''} onChange={(e) => setList('examples', i, { explanation: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center">
            <h3 className="font-semibold">Hidden tests ({p.tests.length})</h3>
            <button className="btn-secondary ml-auto px-2 py-1 text-xs" onClick={() => onChange({ tests: [...p.tests, { input: '', output: '' }] })} disabled={p.tests.length >= MAX_TESTS}>
              <Plus size={13} /> Test
            </button>
          </div>
          <p className="text-xs text-slate-500">Students never see these. Submit runs every one of them.</p>
          <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
            {p.tests.map((t, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-start gap-2">
                <span className="pt-2 text-xs font-semibold text-slate-500">#{i + 1}</span>
                <textarea className="input font-mono text-xs" rows={2} placeholder="Input" value={t.input} onChange={(e) => setList('tests', i, { input: e.target.value })} aria-label={`Test ${i + 1} input`} />
                <textarea className="input font-mono text-xs" rows={2} placeholder="Expected output" value={t.output} onChange={(e) => setList('tests', i, { output: e.target.value })} aria-label={`Test ${i + 1} output`} />
                <button className="pt-2 text-rose-500" onClick={() => removeFrom('tests', i)} disabled={p.tests.length === 1} title="Remove test">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Reference solution</h3>
            <select
              className="input w-auto py-1"
              value={p.referenceSolution.language}
              onChange={(e) => onChange({ referenceSolution: { ...p.referenceSolution, language: e.target.value } })}
              aria-label="Reference solution language"
            >
              {LANGUAGE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {LANGUAGES[k].label}
                </option>
              ))}
            </select>
            <button className="btn-primary ml-auto" onClick={verify} disabled={verifying}>
              <ShieldCheck size={16} /> {verifying ? 'Running on Judge0…' : 'Verify tests'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Only you see this. Verify runs it on every example and hidden test, and drops hidden tests it fails.</p>
          <div className="mt-2">
            <LazyCodeEditor
              language={p.referenceSolution.language}
              value={p.referenceSolution.code}
              onChange={(code) => onChange({ referenceSolution: { ...p.referenceSolution, code } })}
              height="220px"
            />
          </div>
          {error && <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <CheckReport problem={p} check={check} />
        </div>
      </div>
    </div>
  );
}

// What the last Verify (or the AI's own check) found.
function CheckReport({ problem, check }) {
  const notes = check?.notes || problem.verification?.notes || [];
  if (!notes.length && !check) return null;
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm" data-testid="check-report">
      <div className="flex items-center gap-2">
        <VerifyBadge status={problem.verification?.status} />
        <span className="text-xs text-slate-500">{check?.source === 'ai' ? 'AI draft checked by its own reference solution' : 'Last check'}</span>
      </div>
      {notes.length === 0 && <p className="text-emerald-700">The reference solution passes every example and hidden test.</p>}
      <ul className="list-inside list-disc space-y-1 text-slate-700">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {check?.dropped?.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1">Test</th>
              <th>Input</th>
              <th>Expected</th>
              <th>Solution printed</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {check.dropped.map((d, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td className="py-1">
                  #{d.test} {d.attempt ? `(try ${d.attempt})` : ''}
                </td>
                <td>{d.input}</td>
                <td>{d.expected}</td>
                <td className="text-rose-700">{d.got || d.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Asks the AI for a problem draft (statement + tests + reference solution, cross-checked on Judge0).
function AiProblemPanel({ onClose, onDraft }) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { problem, verification, dropped, meta } = await api('/api/contests/generate-problem', { method: 'POST', body: { topic, difficulty } });
      const notes = [...verification.notes, `Drafted in ${(meta.ms / 1000).toFixed(1)} s (${meta.attempts} attempt${meta.attempts > 1 ? 's' : ''}, ${meta.model}). Review everything before using it.`];
      onDraft({ ...problem, verification }, { dropped, notes, status: verification.status, source: 'ai' });
    } catch (err) {
      setError(err.data?.problems?.[0] || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={generate} className="card mt-4 border-brand-100 bg-brand-50/40">
      <div className="flex items-center">
        <h2 className="flex items-center gap-2 font-bold">
          <Sparkles size={18} className="text-brand-600" /> Draft a problem with AI
        </h2>
        <button type="button" className="ml-auto text-slate-500" onClick={onClose} title="Close">
          <X size={18} />
        </button>
      </div>
      <p className="text-sm text-slate-500">
        The AI writes the statement, examples, hidden tests and a reference solution. The server runs that solution on every test with Judge0 and drops the
        tests it fails. Takes up to a minute.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="ai-p-topic">
            What should the problem be about?
          </label>
          <input id="ai-p-topic" className="input" placeholder="e.g. count vowels in a string" value={topic} onChange={(e) => setTopic(e.target.value)} required minLength={2} maxLength={300} />
        </div>
        <div>
          <label className="label" htmlFor="ai-p-diff">
            Difficulty
          </label>
          <select id="ai-p-diff" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Drafting + checking…' : 'Generate'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </form>
  );
}
