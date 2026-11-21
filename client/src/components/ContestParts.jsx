// Building blocks shared by the host and student contest screens.
import { Trophy, Medal } from 'lucide-react';
import { LANGUAGES } from '../lib/languages.js';

export const LETTER = (i) => String.fromCharCode(65 + i);

// 754000 -> "12:34", 3_725_000 -> "1:02:05".
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const VERDICT_STYLES = {
  Accepted: 'bg-emerald-100 text-emerald-800',
  'Wrong Answer': 'bg-rose-100 text-rose-800',
  'Time Limit Exceeded': 'bg-amber-100 text-amber-800',
  'Runtime Error': 'bg-orange-100 text-orange-800',
  'Compile Error': 'bg-slate-200 text-slate-700',
  'Judge Error': 'bg-slate-100 text-slate-500',
  Judging: 'bg-sky-100 text-sky-800 animate-pulse',
};

// A coloured pill like "Accepted" or "Wrong Answer".
export function VerdictBadge({ verdict }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${VERDICT_STYLES[verdict] || 'bg-slate-100'}`} data-testid="verdict">
      {verdict}
    </span>
  );
}

export const languageLabel = (key) => LANGUAGES[key]?.label || key;

// The contest leaderboard: rank, name, solved, finish time and one cell per problem.
export function ContestBoard({ board, problemCount, meId, compact = false }) {
  if (!board) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm" data-testid="contest-board">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-2 py-2 text-right">#</th>
            <th className="px-2 py-2 text-left">Name</th>
            <th className="px-2 py-2 text-center" title="Problems solved">Solved</th>
            <th className="px-2 py-2 text-center" title="Last accepted time + penalties">Finish</th>
            {Array.from({ length: problemCount }, (_, i) => (
              <th key={i} className="px-2 py-2 text-center" title={board.stats ? `${board.stats[i]?.solved ?? 0} solved / ${board.stats[i]?.tried ?? 0} tried` : ''}>
                {LETTER(i)}
                {!compact && board.stats && <div className="font-normal text-slate-400">{board.stats[i]?.solved ?? 0}/{board.stats[i]?.tried ?? 0}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {board.rows.length === 0 && (
            <tr>
              <td colSpan={4 + problemCount} className="px-3 py-4 text-center text-slate-400">
                No students yet
              </td>
            </tr>
          )}
          {board.rows.map((r) => (
            <tr key={r.publicId} className={r.publicId === meId ? 'bg-brand-50 font-semibold' : ''}>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{r.rank}</td>
              <td className="max-w-40 truncate px-2 py-1.5">
                {r.nickname}
                {r.publicId === meId && <span className="ml-1 text-xs text-brand-600">(you)</span>}
              </td>
              <td className="px-2 py-1.5 text-center font-bold tabular-nums">{r.solved}</td>
              <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{r.solved ? formatMs(r.finishMs) : '–'}</td>
              {r.problems.map((p, i) => (
                <td key={i} className="px-2 py-1.5 text-center text-xs tabular-nums">
                  {p.solved ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800" title={`Solved at ${formatMs(p.solvedAtMs)}`}>
                      {formatMs(p.solvedAtMs)}
                      {p.wrong > 0 && <span className="text-rose-600"> (+{p.wrong})</span>}
                    </span>
                  ) : p.tried ? (
                    <span className="text-rose-600">−{p.wrong || ''}</span>
                  ) : (
                    <span className="text-slate-300">·</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {board.total > board.rows.length && <p className="px-3 py-2 text-xs text-slate-500">Showing the top {board.rows.length} of {board.total}.</p>}
    </div>
  );
}

// Top 3 after the contest.
export function ContestPodium({ podium, meId }) {
  const order = [podium[1], podium[0], podium[2]];
  const heights = ['h-20', 'h-28', 'h-14'];
  const places = [2, 1, 3];
  return (
    <div className="mx-auto grid max-w-md grid-cols-3 items-end gap-3" data-testid="podium">
      {order.map((p, i) =>
        p ? (
          <div key={p.publicId} className="flex flex-col items-center gap-1 text-center">
            {places[i] === 1 ? <Trophy className="text-amber-500" size={28} /> : <Medal className="text-slate-400" size={22} />}
            <span className={`max-w-full truncate font-semibold ${p.publicId === meId ? 'text-brand-700' : ''}`}>{p.nickname}</span>
            <span className="text-xs text-slate-500">
              {p.solved} solved{p.solved ? ` · ${formatMs(p.finishMs)}` : ''}
            </span>
            <div className={`grid w-full place-items-center rounded-t-lg text-2xl font-black text-white ${heights[i]} ${places[i] === 1 ? 'bg-amber-400' : places[i] === 2 ? 'bg-slate-400' : 'bg-orange-400'}`}>
              {places[i]}
            </div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}
