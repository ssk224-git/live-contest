// An MCQ quiz owned by one host. The correct answer (correctIndex) is stored here
// and only ever sent to the host who owns the quiz, never to students.
import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [String], required: true }, // always exactly 4
  correctIndex: { type: Number, required: true, min: 0, max: 3 },
  explanation: { type: String, default: '' },
  timeLimitSec: { type: Number, default: 20 },
});

const quizSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    topic: { type: String, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true },
);

export const Quiz = mongoose.models.Quiz || mongoose.model('Quiz', quizSchema);
