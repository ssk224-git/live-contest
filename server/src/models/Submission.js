// Every judged contest submission (written as each one finishes judging, so the host can review code later).
import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    sessionCode: { type: String, index: true },
    contest: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // the host
    publicId: String, // the student's shareable id (never the secret playerId)
    nickname: String,
    problemIndex: Number,
    language: String,
    code: String,
    verdict: String,
    passed: Number,
    total: Number,
    failedTest: Number,
    timeMs: Number,
    atMs: Number, // ms since the contest started
  },
  { timestamps: true },
);

export const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);
