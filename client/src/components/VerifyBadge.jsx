// Shows whether a problem's tests were checked by running its reference solution.
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

const STYLES = {
  verified: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: ShieldCheck, label: 'Verified' },
  flagged: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: ShieldAlert, label: 'Flagged' },
  unverified: { cls: 'bg-slate-50 text-slate-600 border-slate-200', Icon: ShieldQuestion, label: 'Not verified' },
};

export default function VerifyBadge({ status = 'unverified' }) {
  const { cls, Icon, label } = STYLES[status] || STYLES.unverified;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`} data-testid="verify-badge">
      <Icon size={13} /> {label}
    </span>
  );
}
