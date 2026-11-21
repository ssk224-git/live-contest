// Sample programs for "read two numbers, print their sum", in every language.
// Used by the check-judge script and the tests; the client has its own starter templates.
const NL = '\n';

export const SUM_SOLUTIONS = {
  cpp: ['#include <bits/stdc++.h>', 'using namespace std;', 'int main() {', '  long long a, b;', '  cin >> a >> b;', '  cout << a + b << endl;', '}'].join(NL),
  python: ['a, b = map(int, input().split())', 'print(a + b)'].join(NL),
  javascript: ['const [a, b] = require("fs").readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);', 'console.log(a + b);'].join(NL),
  java: [
    'import java.util.*;',
    'public class Main {',
    '  public static void main(String[] args) {',
    '    Scanner sc = new Scanner(System.in);',
    '    long a = sc.nextLong(), b = sc.nextLong();',
    '    System.out.println(a + b);',
    '  }',
    '}',
  ].join(NL),
};

// A wrong answer (prints a - b), an infinite loop, a crash and a syntax error in each language.
export const BROKEN = {
  cpp: {
    WA: SUM_SOLUTIONS.cpp.replace('a + b', 'a - b'),
    TLE: 'int main() { volatile long long x = 0; while (true) x++; }',
    RE: ['#include <cstdlib>', 'int main() { int* p = nullptr; *p = 42; return 0; }'].join(NL),
    CE: 'int main() { this is not c++ }',
  },
  python: {
    WA: SUM_SOLUTIONS.python.replace('a + b', 'a - b'),
    TLE: ['x = 0', 'while True:', '    x += 1'].join(NL),
    RE: 'raise ValueError("boom")',
    CE: 'def broken(:\n    pass',
  },
  javascript: {
    WA: SUM_SOLUTIONS.javascript.replace('a + b', 'a - b'),
    TLE: 'let x = 0; while (true) { x++; }',
    RE: 'null.boom();',
    CE: 'function ( {',
  },
  java: {
    WA: SUM_SOLUTIONS.java.replace('a + b', 'a - b'),
    TLE: 'public class Main { public static void main(String[] a) { long x = 0; while (true) x++; } }',
    RE: 'public class Main { public static void main(String[] a) { int[] x = new int[1]; x[5] = 1; } }',
    CE: 'public class Main { public static void main(String[] a) { int x = "text"; } }',
  },
};

export const SUM_TESTS = [
  { input: '2 3', output: '5' },
  { input: '-7 10', output: '3' },
  { input: '1000000000 1000000000', output: '2000000000' },
];
