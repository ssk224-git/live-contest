// Generates real AI quiz drafts for a few topics and prints how long each took.
// Usage: node scripts/try-quiz.js [count] [model,model...]
import { config } from '../src/config.js';
import { generateQuiz } from '../src/ai/quizGenerator.js';

const count = Number(process.argv[2]) || 8;
if (process.argv[3]) config.geminiQuizModels = process.argv[3].split(',');

const topics = [
  ['Photosynthesis, class 10', 'medium'],
  ['Binary search trees', 'medium'],
  ['World War 2', 'easy'],
  ['SQL joins', 'hard'],
  ['Indian constitution', 'easy'],
];

console.log(`Models: ${config.geminiQuizModels.join(', ')} | ${count} questions each`);
for (const [topic, difficulty] of topics) {
  try {
    const { draft, meta } = await generateQuiz({ topic, count, difficulty });
    const correctSpots = draft.questions.map((q) => 'ABCD'[q.correctIndex]).join('');
    console.log(
      `OK   ${topic.padEnd(28)} ${String(meta.ms).padStart(6)} ms  attempts=${meta.attempts} model=${meta.model} kept=${draft.questions.length} answers=${correctSpots}`,
    );
    console.log(`     e.g. "${draft.questions[0].text}"`);
  } catch (err) {
    console.log(`FAIL ${topic.padEnd(28)} ${err.message} ${JSON.stringify(err.extra || {})}`);
  }
}
