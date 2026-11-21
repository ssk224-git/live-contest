// A finished live event (quiz or contest), written ONCE when it ends. Used for history and CSV export.
import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  { optionIndex: Number, correct: Boolean, timeMs: Number, points: Number },
  { _id: false },
);

// One coding problem's result for one student.
const problemResultSchema = new mongoose.Schema(
  { solved: Boolean, wrong: Number, solvedAtMs: Number, attempts: Number },
  { _id: false },
);

const playerSchema = new mongoose.Schema(
  {
    nickname: String,
    rank: Number,
    score: Number, // quiz points, or problems solved for a contest
    answers: { type: [answerSchema], default: undefined }, // quiz only
    problems: { type: [problemResultSchema], default: undefined }, // contest only
    finishMs: Number, // contest: last accepted time + penalties
    penaltyMs: Number,
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['quiz', 'contest'], required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: String,
    code: String,
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    contest: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest' },
    startedAt: Date,
    endedAt: Date,
    // Snapshots, so the CSV still makes sense if the quiz/contest is edited later.
    questions: { type: [{ text: String, options: [String], correctIndex: Number, _id: false }], default: undefined },
    problems: { type: [{ title: String, _id: false }], default: undefined },
    penaltyMin: Number,
    players: { type: [playerSchema], default: [] },
  },
  { timestamps: true },
);

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
