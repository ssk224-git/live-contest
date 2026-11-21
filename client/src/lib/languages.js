// The 4 contest languages: names and the starter code a student sees first.
// (The server has the matching Judge0 ids in server/src/judge/languages.js.)

export const LANGUAGES = {
  cpp: {
    label: 'C++',
    starter: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // Read the input with cin and print the answer with cout.

    return 0;
}
`,
  },
  python: {
    label: 'Python',
    starter: `# Read the input with input() and print the answer with print().
`,
  },
  javascript: {
    label: 'JavaScript',
    starter: `// The whole input as lines. Print the answer with console.log().
const lines = require('fs').readFileSync(0, 'utf8').trim().split('\\n');

`,
  },
  java: {
    label: 'Java',
    starter: `import java.util.*;

// The class must be called Main.
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read the input with sc.nextInt() / sc.nextLine() and print with System.out.println().
    }
}
`,
  },
};

export const LANGUAGE_KEYS = Object.keys(LANGUAGES);
