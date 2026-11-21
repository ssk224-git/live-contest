// A coding contest (1 to 4 problems) owned by one host.
// Hidden tests and the reference solution are only ever sent to the owner, never to students.
import mongoose from 'mongoose';

const ioSchema = new mongoose.Schema({ input: String, output: String, explanation: String }, { _id: false });

const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  statement: { type: String, default: '' },
  inputFormat: { type: String, default: '' },
  outputFormat: { type: String, default: '' },
  constraints: { type: String, default: '' },
  examples: { type: [ioSchema], default: [] }, // shown to students
  tests: { type: [ioSchema], default: [] }, // hidden
  referenceSolution: {
    language: { type: String, default: 'python' },
    code: { type: String, default: '' },
  },
  timeLimitSec: { type: Number, default: 2 }, // base limit (C++); other languages get more
  verification: {
    status: { type: String, enum: ['unverified', 'verified', 'flagged'], default: 'unverified' },
    checkedAt: Date,
    fingerprint: String, // hash of examples + tests + solution; if they change, the check is stale
    notes: { type: [String], default: [] },
  },
});

const contestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    durationMin: { type: Number, default: 60 },
    penaltyMin: { type: Number, default: 5 },
    languages: { type: [String], default: ['cpp', 'python', 'javascript', 'java'] },
    problems: { type: [problemSchema], default: [] },
  },
  { timestamps: true },
);

export const Contest = mongoose.models.Contest || mongoose.model('Contest', contestSchema);
