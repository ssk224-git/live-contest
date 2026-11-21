// Unit tests for the AI quiz validator and the retry loop (with a fake model, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuizDraft, shuffleOptions, generateQuiz } from '../src/ai/quizGenerator.js';
import { aiLogSettings } from '../src/ai/aiLog.js';

aiLogSettings.enabled = false;

const goodQuestion = (n = 1) => ({
  text: `Which planet is number ${n} from the sun in our solar system?`,
  options: ['Mercury', 'Venus', 'Earth', 'Mars'],
  correctIndex: 0,
  explanation: 'Mercury is the closest planet to the sun.',
});
const goodDraft = (count = 3) => ({ title: 'Planets', questions: Array.from({ length: count }, (_, i) => goodQuestion(i + 1)) });

test('a good draft passes with no problems', () => {
  const result = validateQuizDraft(goodDraft(3), 3);
  assert.deepEqual(result.problems, []);
  assert.equal(result.questions.length, 3);
});

test('the 6 bad drafts from the spec are all rejected', () => {
  const cases = {
    'only 3 options': (d) => (d.questions[0].options = ['A', 'B', 'C']),
    'duplicate options': (d) => (d.questions[0].options = ['Mars', 'mars ', 'Venus', 'Earth']),
    'correctIndex 4': (d) => (d.questions[0].correctIndex = 4),
    'missing text': (d) => delete d.questions[0].text,
    'wrong count': (d) => d.questions.pop(),
    'All of the above': (d) => (d.questions[0].options[3] = 'All of the above'),
  };
  for (const [name, breakIt] of Object.entries(cases)) {
    const draft = goodDraft(3);
    breakIt(draft);
    const result = validateQuizDraft(draft, 3);
    assert.ok(result.problems.length > 0, `${name} should be rejected`);
  }
});

test('non-JSON and duplicate questions are reported', () => {
  assert.deepEqual(validateQuizDraft({ __notJson: 'hello' }, 3).problems, ['The response was not valid JSON']);
  const draft = goodDraft(3);
  draft.questions[2] = { ...draft.questions[0] };
  const result = validateQuizDraft(draft, 3);
  assert.ok(result.problems.some((p) => /duplicate/.test(p)));
  assert.equal(result.questions.length, 2);
});

test('shuffleOptions keeps the correct answer pointing at the same text', () => {
  const q = goodQuestion();
  for (let i = 0; i < 20; i += 1) {
    const s = shuffleOptions(q);
    assert.equal(s.options[s.correctIndex], 'Mercury');
    assert.deepEqual([...s.options].sort(), [...q.options].sort());
  }
});

test('generateQuiz retries once with the list of problems, then succeeds', async () => {
  const prompts = [];
  const fakeAi = async (prompt) => {
    prompts.push(prompt);
    const bad = goodDraft(3);
    bad.questions[1].correctIndex = 7;
    return { data: prompts.length === 1 ? bad : goodDraft(3), model: 'fake', ms: 1 };
  };
  const { draft, meta } = await generateQuiz({ topic: 'Planets', count: 3, difficulty: 'easy' }, { ai: fakeAi });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Your last answer had these problems: question 2: correctIndex/);
  assert.equal(draft.questions.length, 3);
  assert.equal(meta.attempts, 2);
  assert.equal(meta.dropped, 0);
});

test('generateQuiz keeps valid questions after 2 bad attempts if at least 3 survive, else fails', async () => {
  // 5 asked, 4 valid each time -> keep 4, 1 dropped.
  const fourOfFive = async () => {
    const d = goodDraft(5);
    d.questions[4].options = ['x', 'x', 'y', 'z'];
    return { data: d, model: 'fake', ms: 1 };
  };
  const ok = await generateQuiz({ topic: 'Planets', count: 5, difficulty: 'easy' }, { ai: fourOfFive });
  assert.equal(ok.draft.questions.length, 4);
  assert.equal(ok.meta.dropped, 1);

  const garbage = async () => ({ data: { __notJson: 'nope' }, model: 'fake', ms: 1 });
  await assert.rejects(generateQuiz({ topic: 'Planets', count: 5, difficulty: 'easy' }, { ai: garbage }), (err) => err.extra.code === 'GENERATION_FAILED');
});
