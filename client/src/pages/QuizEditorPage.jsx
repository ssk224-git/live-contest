// Create or edit an MCQ quiz. The AI can draft the questions; the host reviews and edits before saving.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Sparkles, Plus, Trash2, ArrowUp, ArrowDown, Save, CheckCircle2 } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import { api } from '../lib/api.js';

const blankQuestion = () => ({ text: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', timeLimitSec: 20 });
const LETTERS = ['A', 'B', 'C', 'D'];

export default function QuizEditorPage() {
  const { id } = useParams(); // undefined for a new quiz
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState({ title: '', topic: '', difficulty: 'medium', questions: [blankQuestion()] });
  const [loading, setLoading] = useState(Boolean(id));
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // AI panel state.
  const [showAi, setShowAi] = useState(!id && search.get('ai') === '1');
  const [ai, setAi] = useState({ topic: '', count: 5, difficulty: 'medium' });
  const [generating, setGenerating] = useState(false);
  const [aiNote, setAiNote] = useState('');

  // Load an existing quiz.
  useEffect(() => {
    if (!id) return;
    api(`/api/quizzes/${id}`)
      .then(({ quiz: q }) => setQuiz({ title: q.title, topic: q.topic, difficulty: q.difficulty, questions: q.questions }))
      .catch((e) => setProblems([e.message]))
      .finally(() => setLoading(false));
  }, [id]);

  const setField = (key, value) => setQuiz((q) => ({ ...q, [key]: value }));
  const setQuestion = (index, patch) =>
    setQuiz((q) => ({ ...q, questions: q.questions.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const setOption = (qi, oi, value) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((item, i) => (i === qi ? { ...item, options: item.options.map((o, j) => (j === oi ? value : o)) } : item)),
    }));

  // Swaps question i with its neighbour (dir = -1 up, +1 down).
  function move(i, dir) {
    setQuiz((q) => {
      const list = [...q.questions];
      const j = i + dir;
      if (j < 0 || j >= list.length) return q;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...q, questions: list };
    });
  }

  // Asks the server for an AI draft and puts it in the editor (not saved yet).
  async function generate(e) {
    e.preventDefault();
    setGenerating(true);
    setAiNote('');
    setProblems([]);
    try {
      const { draft, meta } = await api('/api/quizzes/generate', { method: 'POST', body: ai });
      setQuiz({ title: draft.title, topic: ai.topic, difficulty: ai.difficulty, questions: draft.questions });
      const dropped = meta.dropped ? ` ${meta.dropped} question(s) failed the checks and were dropped.` : '';
      setAiNote(
        `Drafted ${draft.questions.length} questions in ${(meta.ms / 1000).toFixed(1)} s (${meta.attempts} attempt${meta.attempts > 1 ? 's' : ''}, ${meta.model}).${dropped} Review them, then Save.`,
      );
      setShowAi(false);
    } catch (err) {
      setProblems(err.data?.problems?.length ? err.data.problems : [err.message]);
    } finally {
      setGenerating(false);
    }
  }

  // Saves (POST for new, PUT for existing). The server validates everything again.
  async function save() {
    setSaving(true);
    setProblems([]);
    try {
      const body = { ...quiz, questions: quiz.questions.map((q) => ({ ...q, timeLimitSec: Number(q.timeLimitSec) })) };
      if (id) {
        await api(`/api/quizzes/${id}`, { method: 'PUT', body });
        setSavedAt(new Date());
      } else {
        const { quiz: saved } = await api('/api/quizzes', { method: 'POST', body });
        navigate(`/quizzes/${saved._id}`, { replace: true });
        setSavedAt(new Date());
      }
    } catch (err) {
      setProblems(err.data?.problems?.length ? err.data.problems : [err.message]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout>Loading…</Layout>;

  return (
    <Layout>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{id ? 'Edit quiz' : 'New quiz'}</h1>
        <button className="btn-secondary ml-auto" onClick={() => setShowAi((s) => !s)}>
          <Sparkles size={16} /> {showAi ? 'Hide AI' : 'Draft with AI'}
        </button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save quiz'}
        </button>
      </div>
      {savedAt && (
        <p className="mt-2 flex items-center gap-1 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Saved at {savedAt.toLocaleTimeString()}
        </p>
      )}

      {showAi && (
        <form onSubmit={generate} className="card mt-4 border-brand-100 bg-brand-50/40">
          <h2 className="flex items-center gap-2 font-bold">
            <Sparkles size={18} className="text-brand-600" /> Draft questions with AI
          </h2>
          <p className="text-sm text-slate-500">Every AI answer is checked (4 different options, one correct answer…) and retried once if it breaks the rules.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="ai-topic">
                Topic
              </label>
              <input
                id="ai-topic"
                className="input"
                placeholder="e.g. Photosynthesis, class 10"
                value={ai.topic}
                onChange={(e) => setAi({ ...ai, topic: e.target.value })}
                required
                minLength={2}
                maxLength={200}
              />
            </div>
            <div>
              <label className="label" htmlFor="ai-count">
                Questions
              </label>
              <input
                id="ai-count"
                type="number"
                min={3}
                max={15}
                className="input"
                value={ai.count}
                onChange={(e) => setAi({ ...ai, count: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label" htmlFor="ai-diff">
                Difficulty
              </label>
              <select id="ai-diff" className="input" value={ai.difficulty} onChange={(e) => setAi({ ...ai, difficulty: e.target.value })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <button className="btn-primary" disabled={generating}>
              {generating ? 'Generating… (up to 30 s)' : 'Generate'}
            </button>
          </div>
        </form>
      )}

      {aiNote && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aiNote}</p>}
      {problems.length > 0 && (
        <ul className="mt-4 list-inside list-disc rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="card mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" className="input" value={quiz.title} onChange={(e) => setField('title', e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="topic">
            Topic
          </label>
          <input id="topic" className="input" value={quiz.topic} onChange={(e) => setField('topic', e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className="label" htmlFor="difficulty">
            Difficulty
          </label>
          <select id="difficulty" className="input" value={quiz.difficulty} onChange={(e) => setField('difficulty', e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <ol className="mt-4 space-y-4">
        {quiz.questions.map((q, qi) => (
          <li key={qi} className="card" data-testid={`question-${qi}`}>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Q{qi + 1}</span>
              <div className="ml-auto flex gap-1">
                <button className="btn-secondary px-2 py-1" onClick={() => move(qi, -1)} disabled={qi === 0} title="Move up">
                  <ArrowUp size={14} />
                </button>
                <button className="btn-secondary px-2 py-1" onClick={() => move(qi, 1)} disabled={qi === quiz.questions.length - 1} title="Move down">
                  <ArrowDown size={14} />
                </button>
                <button
                  className="btn-secondary px-2 py-1 text-rose-600"
                  onClick={() => setField('questions', quiz.questions.filter((_, i) => i !== qi))}
                  disabled={quiz.questions.length === 1}
                  title="Delete question"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <textarea
              className="input mt-3"
              rows={2}
              placeholder="Question text"
              value={q.text}
              onChange={(e) => setQuestion(qi, { text: e.target.value })}
              maxLength={300}
              aria-label={`Question ${qi + 1} text`}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${q.correctIndex === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    checked={q.correctIndex === oi}
                    onChange={() => setQuestion(qi, { correctIndex: oi })}
                    title="Mark as the correct answer"
                  />
                  <span className="w-4 text-xs font-bold text-slate-500">{LETTERS[oi]}</span>
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder={`Option ${LETTERS[oi]}`}
                    value={opt}
                    onChange={(e) => setOption(qi, oi, e.target.value)}
                    maxLength={120}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
              <input
                className="input"
                placeholder="Explanation shown after the question (optional)"
                value={q.explanation}
                onChange={(e) => setQuestion(qi, { explanation: e.target.value })}
                maxLength={400}
              />
              <select className="input" value={q.timeLimitSec} onChange={(e) => setQuestion(qi, { timeLimitSec: Number(e.target.value) })} title="Time limit">
                {[10, 15, 20, 30, 45, 60, 90, 120].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ol>
      <button
        className="btn-secondary mt-4"
        onClick={() => setField('questions', [...quiz.questions, blankQuestion()])}
        disabled={quiz.questions.length >= 15}
      >
        <Plus size={16} /> Add question
      </button>
    </Layout>
  );
}
