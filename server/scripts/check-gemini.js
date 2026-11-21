// Times one tiny request to each model in GEMINI_MODEL, so we know which ones answer quickly
// on this API key before relying on them. Usage: npm run check:gemini
import { config } from '../src/config.js';
import { generateJson } from '../src/ai/gemini.js';

const schema = {
  type: 'object',
  properties: { answer: { type: 'integer' } },
  required: ['answer'],
};

console.log(`Thinking level: ${config.geminiThinkingLevel}, timeout ${config.geminiTimeoutMs} ms`);
for (const model of config.geminiModels) {
  const started = Date.now();
  try {
    const { data } = await generateJson('What is 17 + 25? Reply as JSON {"answer": number}.', { schema, models: [model], temperature: 0 });
    console.log(`${model.padEnd(24)} ${String(Date.now() - started).padStart(6)} ms  ->`, JSON.stringify(data));
  } catch (err) {
    console.log(`${model.padEnd(24)} ${String(Date.now() - started).padStart(6)} ms  FAILED: ${err.message}`);
  }
}
