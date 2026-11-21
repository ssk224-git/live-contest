// Builds the CSV export for a finished session: one row per student.

// Wraps a value in quotes if it contains a comma, quote or newline (quotes are doubled), as CSV requires.
// Also stops "formula injection": a cell starting with = + - @ would run as a formula in Excel.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (cells) => cells.map(csvCell).join(',');

// Formats milliseconds as m:ss (e.g. 754000 -> "12:34").
export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// session: a plain Session object from MongoDB. Returns the CSV text (with a BOM so Excel reads UTF-8).
export function sessionCsv(session) {
  const lines = [];
  if (session.kind === 'quiz') {
    const qs = session.questions || [];
    lines.push(csvLine(['Rank', 'Nickname', 'Score', 'Correct', ...qs.map((_, i) => `Q${i + 1}`)]));
    for (const p of session.players) {
      const answers = qs.map((_, i) => {
        const a = p.answers?.[i];
        if (!a || a.optionIndex === null || a.optionIndex === undefined) return 'no answer';
        return a.correct ? 'correct' : 'wrong';
      });
      lines.push(csvLine([p.rank, p.nickname, p.score, answers.filter((a) => a === 'correct').length, ...answers]));
    }
  } else {
    const probs = session.problems || [];
    lines.push(
      csvLine(['Rank', 'Nickname', 'Solved', 'Finish time (m:ss)', 'Penalty (m:ss)', ...probs.map((p, i) => `${String.fromCharCode(65 + i)}: ${p.title}`)]),
    );
    for (const p of session.players) {
      const cells = probs.map((_, i) => {
        const r = p.problems?.[i];
        if (!r || !r.attempts) return 'not tried';
        if (r.solved) return `solved at ${formatDuration(r.solvedAtMs)}${r.wrong ? ` (+${r.wrong} wrong)` : ''}`;
        return `${r.wrong} wrong`;
      });
      lines.push(csvLine([p.rank, p.nickname, p.score, p.score ? formatDuration(p.finishMs) : '', formatDuration(p.penaltyMs || 0), ...cells]));
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
