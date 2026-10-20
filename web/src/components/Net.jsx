import { fmt } from '../api.js';
import { useT } from '../prefs.jsx';

const GROUP_PASTELS = [
  ['#dcefe6', '#b7d9c8'],
  ['#e3eef5', '#c2d6e6'],
  ['#efe8dc', '#ddd0bc'],
  ['#e7f0ea', '#c5d8ce'],
  ['#efe6e4', '#dfcbc7'],
  ['#e6ebe8', '#cdd6d1'],
  ['#e8edf2', '#c8d2dc'],
  ['#ebe8e2', '#d4cfc4'],
];

export function pastelFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [from, to] = GROUP_PASTELS[h % GROUP_PASTELS.length];
  return { from, to };
}

export function Net({ v, c }) {
  const t = useT();
  if (v === 0) {
    return <span className="net-chip is-settled">{t('net.settledUp')}</span>;
  }
  if (v < 0) {
    return <span className="net-chip is-owe">{t('net.youOwe', { amount: fmt(-v, c) })}</span>;
  }
  return <span className="net-chip is-owed">{t('net.youAreOwed', { amount: fmt(v, c) })}</span>;
}

export function displayNameOf(members, userId) {
  const m = (members || []).find((x) => x.user_id === userId);
  return m?.display_name || userId.slice(0, 8);
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ACTIVITY_KIND_KEYS = ['join', 'expense', 'payment', 'comment', 'nudge'];

/** Kind mark — soft tile with accent dot + short uppercase label. */
export function ActivityKindThumb({ kind, className = '' }) {
  const t = useT();
  const key = String(kind || 'other').toLowerCase();
  const known = ACTIVITY_KIND_KEYS.includes(key);
  const label = known ? t(`activity.kindShort.${key}`) : key.slice(0, 4).toUpperCase();
  const full = known ? t(`activity.kind.${key}`) : key;
  return (
    <span
      className={`activity-kind-thumb is-${key} ${className}`.trim()}
      aria-label={full}
      title={full}
    >
      <span className="activity-kind-label">{label}</span>
    </span>
  );
}

export function ActivityKindTag({ kind }) {
  const t = useT();
  if (!kind) return null;
  const key = String(kind).toLowerCase();
  const label = ACTIVITY_KIND_KEYS.includes(key) ? t(`activity.kind.${key}`) : key;
  return <span className={`activity-kind is-${key}`}>{label}</span>;
}

/** Square group cover thumb — pastel gradient + title initials until upload exists. */
export function GroupThumb({ name, size = 44, className = '' }) {
  const pastel = pastelFor(name);
  return (
    <span
      className={`group-thumb ${className}`.trim()}
      style={{
        '--gt-from': pastel.from,
        '--gt-to': pastel.to,
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.28)),
      }}
      aria-hidden
    >
      <span className="group-thumb-initials">{initialsOf(name)}</span>
    </span>
  );
}

export function ChevronRight({ size = 20, label }) {
  const t = useT();
  const aria = label || t('common.viewDetails');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={aria}
      style={{ flex: 'none', opacity: 0.55 }}
    >
      <path d="m 9 6 6 6 -6 6" />
    </svg>
  );
}
