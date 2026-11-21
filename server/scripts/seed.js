// Creates a demo host account plus a sample quiz and contest, for local testing.
// Uses DEMO_HOST_EMAIL and DEMO_HOST_PASSWORD from server/.env. Safe to run more than once.
// Usage: npm run seed
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Quiz } from '../src/models/Quiz.js';
import { sampleQuizData, sampleContestData } from './sampleData.js';

const email = process.env.DEMO_HOST_EMAIL;
const password = process.env.DEMO_HOST_PASSWORD;
if (!email || !password || !config.mongoUri) {
  console.error('Set MONGODB_URI, DEMO_HOST_EMAIL and DEMO_HOST_PASSWORD in server/.env first.');
  process.exit(1);
}

await mongoose.connect(config.mongoUri);

let user = await User.findOne({ email });
if (!user) {
  user = await User.create({ name: 'Demo Host', email, passwordHash: await bcrypt.hash(password, 10) });
  console.log(`Created host ${email}`);
} else {
  console.log(`Host ${email} already exists`);
}

if (!(await Quiz.exists({ owner: user._id, title: sampleQuizData.title }))) {
  await Quiz.create({ ...sampleQuizData, owner: user._id });
  console.log(`Added quiz "${sampleQuizData.title}"`);
}

// Contests exist from milestone M6 on; skip quietly if the model is not there yet.
try {
  const { Contest } = await import('../src/models/Contest.js');
  const contest = sampleContestData();
  if (contest && !(await Contest.exists({ owner: user._id, title: contest.title }))) {
    await Contest.create({ ...contest, owner: user._id });
    console.log(`Added contest "${contest.title}"`);
  }
} catch (err) {
  if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

await mongoose.disconnect();
