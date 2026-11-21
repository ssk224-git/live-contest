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

// A small two-problem contest with reference solutions (Python) and hidden tests.
export const sampleContestData = () => ({
  title: 'Warm-up contest',
  durationMin: 30,
  penaltyMin: 5,
  languages: ['cpp', 'python', 'javascript', 'java'],
  problems: [
    {
      title: 'Add Two Numbers',
      statement: 'You are given two integers a and b. Print their sum.',
      inputFormat: 'One line with two integers a and b separated by a space.',
      outputFormat: 'Print a single integer: a + b.',
      constraints: '-10^9 <= a, b <= 10^9',
      examples: [
        { input: '2 3', output: '5', explanation: '2 + 3 = 5' },
        { input: '-4 10', output: '6', explanation: '' },
      ],
      tests: [
        { input: '0 0', output: '0' },
        { input: '1 -1', output: '0' },
        { input: '1000000000 1000000000', output: '2000000000' },
        { input: '-1000000000 -1000000000', output: '-2000000000' },
        { input: '123456 654321', output: '777777' },
        { input: '-5 3', output: '-2' },
      ],
      referenceSolution: { language: 'python', code: 'a, b = map(int, input().split())\nprint(a + b)\n' },
      timeLimitSec: 2,
    },
    {
      title: 'Largest Number',
      statement: 'Given a list of n integers, print the largest one.',
      inputFormat: 'The first line has n. The second line has n integers separated by spaces.',
      outputFormat: 'Print the largest of the n integers.',
      constraints: '1 <= n <= 10^5\n-10^9 <= each number <= 10^9',
      examples: [
        { input: '5\n3 9 2 7 4', output: '9', explanation: '9 is the largest of the five numbers.' },
        { input: '3\n-5 -2 -9', output: '-2', explanation: 'All numbers are negative; -2 is the largest.' },
      ],
      tests: [
        { input: '1\n42', output: '42' },
        { input: '4\n1 1 1 1', output: '1' },
        { input: '6\n-1000000000 5 1000000000 3 2 1', output: '1000000000' },
        { input: '3\n-7 -8 -9', output: '-7' },
        { input: '5\n10 20 30 40 50', output: '50' },
        { input: '5\n50 40 30 20 10', output: '50' },
      ],
      referenceSolution: { language: 'python', code: 'n = int(input())\nnums = list(map(int, input().split()))\nprint(max(nums))\n' },
      timeLimitSec: 2,
    },
  ],
});
