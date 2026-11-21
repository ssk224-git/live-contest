// Compares a program's output with the expected output.
// Like most judges, extra spaces, tabs, blank lines and Windows line endings do not matter:
// both outputs are split into words ("tokens") and compared word by word.

export const tokens = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);

export function outputsMatch(expected, actual) {
  const a = tokens(expected);
  const b = tokens(actual);
  return a.length === b.length && a.every((word, i) => word === b[i]);
}
