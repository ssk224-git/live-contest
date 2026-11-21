// Generates real AI coding problems (Gemini + Judge0 cross-check) and prints what happened.
// Usage: node scripts/try-problem.js ["topic|difficulty" ...]
import { config } from '../src/config.js';
import { generateProblem } from '../src/ai/problemGenerator.js';

const topics = process.argv.slice(2).length
  ? process.argv.slice(2).map((t) => t.split('|'))
  : [
      ['count the vowels in a string', 'easy'],
      ['second largest distinct number in an array', 'easy'],
      ['check if a string is a palindrome ignoring case', 'easy'],
      ['number of days between two dates in the same year', 'medium'],
      ['longest run of equal consecutive elements', 'medium'],
    ];

console.log(`Models: ${config.geminiModels.join(', ')}\n`);
let verified = 0;
let droppedTotal = 0;
for (const [topic, difficulty = 'easy'] of topics) {
  try {
    const { problem, verification, dropped, meta } = await generateProblem({ topic, difficulty });
    if (verification.status === 'verified') verified += 1;
    droppedTotal += dropped.length;
    console.log(
      `${verification.status.toUpperCase().padEnd(9)} ${topic.padEnd(52)} ${String(meta.ms).padStart(6)} ms  attempts=${meta.attempts} model=${meta.model} tests=${problem.tests.length} dropped=${dropped.length}`,
    );
    console.log(`          "${problem.title}"`);
    for (const d of dropped) console.log(`          dropped test ${d.test}: input "${d.input}" expected "${d.expected}" solution printed "${d.got}"`);
    for (const n of verification.notes) console.log(`          note: ${n}`);
  } catch (err) {
    console.log(`FAILED    ${topic.padEnd(52)} ${err.message}`);
  }
}
console.log(`\n${verified}/${topics.length} verified, ${droppedTotal} AI-written tests dropped by the cross-check`);
