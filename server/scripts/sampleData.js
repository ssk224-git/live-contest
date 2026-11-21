// Sample content used by the seed script and by tests.

export const sampleQuizData = {
  title: 'JavaScript basics',
  topic: 'JavaScript',
  difficulty: 'easy',
  questions: [
    {
      text: 'Which keyword declares a variable that cannot be reassigned?',
      options: ['let', 'var', 'const', 'static'],
      correctIndex: 2,
      explanation: 'const creates a binding that cannot be reassigned.',
      timeLimitSec: 20,
    },
    {
      text: 'What does typeof null return in JavaScript?',
      options: ['"null"', '"object"', '"undefined"', '"number"'],
      correctIndex: 1,
      explanation: 'A historical quirk: typeof null is "object".',
      timeLimitSec: 20,
    },
    {
      text: 'Which array method returns a new array with every element transformed?',
      options: ['forEach', 'filter', 'reduce', 'map'],
      correctIndex: 3,
      explanation: 'map calls a function on each element and collects the results.',
      timeLimitSec: 20,
    },
  ],
};

// Filled in at milestone M6 (coding contests).
export const sampleContestData = () => null;
