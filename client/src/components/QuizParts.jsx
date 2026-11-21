// Small building blocks shared by the host and student quiz screens.
import { Triangle, Diamond, Circle, Square, Trophy, Medal } from 'lucide-react';

// Each option has a colour AND a shape, so colour-blind students can tell them apart.
export const OPTION_STYLES = [
  { bg: 'bg-rose-500', bar: 'bg-rose-500', Icon: Triangle, letter: 'A' },
  { bg: 'bg-sky-500', bar: 'bg-sky-500', Icon: Diamond, letter: 'B' },
  { bg: 'bg-amber-500', bar: 'bg-amber-500', Icon: Circle, letter: 'C' },
  { bg: 'bg-emerald-500', bar: 'bg-emerald-500', Icon: Square, letter: 'D' },
];

// A round countdown badge: number of seconds left, red in the last 5 seconds.
export function CountdownBadge({ msLeft, size = 'lg' }) {
  const seconds = Math.ceil(msLeft / 1000);
  const big = size === 'lg';
  return (
    <div
      className={`grid place-items-center rounded-full font-bold tabular-nums text-white shadow ${seconds <= 5 ? 'bg-rose-600' : 'bg-slate-800'} ${big ? 'h-20 w-20 text-3xl' : 'h-12 w-12 text-lg'}`}
      aria-label={`${seconds} seconds left`}
      data-testid="countdown"
    >
      {seconds}
    </div>
  );
}

// Bar chart of how many students picked each option. The correct one is marked.
export function AnswerBars({ options, counts, correctIndex }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="grid grid-cols-4 items-end gap-3" style={{ height: 180 }}>
      {counts.map((count, i) => {
        const { bar, Icon } = OPTION_STYLES[i];
        const correct = i === correctIndex;
        return (
          <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
            <span className="text-lg font-bold tabular-nums">{count}</span>
            <div
              className={`w-full rounded-t-md ${bar} ${correct ? '' : 'opacity-40'} transition-all duration-700`}
              style={{ height: `${Math.max(4, (count / max) * 120)}px` }}
            />
            <span className={`flex items-center gap-1 text-xs ${correct ? 'font-bold text-emerald-700' : 'text-slate-500'}`} title={options?.[i]}>
              <Icon size={12} /> {correct ? '✓ correct' : OPTION_STYLES[i].letter}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Top 10 table. The current student's row (matched by publicId) is highlighted.
export function Leaderboard({ rows, meId, valueLabel = 'pts', title = 'Top 10' }) {
  if (!rows?.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-bold">{title}</h3>
      <ol className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.publicId} className={`flex items-center gap-3 px-3 py-2 text-sm ${r.publicId === meId ? 'bg-brand-50 font-semibold' : ''}`}>
            <span className="w-6 text-right tabular-nums text-slate-500">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate">
              {r.nickname}
              {r.publicId === meId && <span className="ml-1 text-xs text-brand-600">(you)</span>}
            </span>
            <span className="tabular-nums">
              {r.score} {valueLabel}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The final podium: 2nd, 1st, 3rd side by side.
export function Podium({ podium, meId, valueLabel = 'pts' }) {
  const order = [podium[1], podium[0], podium[2]];
  const heights = ['h-24', 'h-32', 'h-16'];
  const places = [2, 1, 3];
  return (
    <div className="mx-auto grid max-w-md grid-cols-3 items-end gap-3" data-testid="podium">
      {order.map((p, i) =>
        p ? (
          <div key={p.publicId} className="flex flex-col items-center gap-1 text-center">
            {places[i] === 1 ? <Trophy className="text-amber-500" size={28} /> : <Medal className="text-slate-400" size={22} />}
            <span className={`max-w-full truncate font-semibold ${p.publicId === meId ? 'text-brand-700' : ''}`}>{p.nickname}</span>
            <span className="text-xs text-slate-500 tabular-nums">
              {p.score} {valueLabel}
            </span>
            <div className={`w-full rounded-t-lg ${heights[i]} grid place-items-center text-2xl font-black text-white ${places[i] === 1 ? 'bg-amber-400' : places[i] === 2 ? 'bg-slate-400' : 'bg-orange-400'}`}>
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
