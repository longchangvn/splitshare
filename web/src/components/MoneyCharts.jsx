import { fmt } from '../api.js';

const PALETTE = [
  '#0f9f6e', '#0369a1', '#b45309', '#be123c', '#4a5568',
  '#0d9488', '#1d4ed8', '#c2410c', '#7c3aed', '#065f46',
];

function colorAt(i) {
  return PALETTE[i % PALETTE.length];
}

/** Donut distribution for a single metric (paid or share). */
export function MoneyDonut({ rows, valueKey, currency, emptyLabel = 'No data yet' }) {
  const data = (rows || [])
    .map((r, i) => ({
      key: r.key || r.user_id || i,
      label: r.label || r.display_name || '—',
      value: Math.max(0, Number(r[valueKey] ?? r.value) || 0),
      color: colorAt(i),
    }))
    .filter((r) => r.value > 0);
  const total = data.reduce((a, r) => a + r.value, 0);
  if (total <= 0) {
    return (
      <div className="money-donut is-empty">
        <span className="money-donut-empty">{emptyLabel}</span>
      </div>
    );
  }

  const size = 148;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="money-donut">
      <svg className="money-donut-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f0" strokeWidth={stroke} />
        {data.map((seg) => {
          const len = (seg.value / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="money-donut-total-label">Total</text>
        <text x="50%" y="58%" textAnchor="middle" className="money-donut-total-value">{fmt(total, currency)}</text>
      </svg>
      <ul className="money-donut-legend">
        {data.map((seg) => (
          <li key={seg.key}>
            <span className="money-swatch" style={{ background: seg.color }} />
            <span className="money-leg-label">{seg.label}</span>
            <span className="money-leg-value">{fmt(seg.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grouped horizontal bars: paid vs share per person. */
export function PaidShareBars({ summary, currency }) {
  const rows = [...(summary || [])].sort((a, b) => (
    Math.max(b.total_paid_cents, b.total_share_cents) - Math.max(a.total_paid_cents, a.total_share_cents)
  ));
  const max = Math.max(1, ...rows.flatMap((m) => [m.total_paid_cents || 0, m.total_share_cents || 0]));
  if (rows.length === 0) {
    return <div className="money-bars is-empty">No member totals yet.</div>;
  }

  return (
    <div className="money-bars" role="img" aria-label="Paid versus share by member">
      <div className="money-bars-legend">
        <span><i className="money-swatch is-paid" /> Paid</span>
        <span><i className="money-swatch is-share" /> Share</span>
      </div>
      {rows.map((m) => (
        <div key={m.user_id} className="money-bars-row">
          <div className="money-bars-name" title={m.display_name}>{m.display_name}</div>
          <div className="money-bars-tracks">
            <div className="money-bars-track">
              <div
                className="money-bars-fill is-paid"
                style={{ width: `${((m.total_paid_cents || 0) / max) * 100}%` }}
              />
              <span className="money-bars-amt">{fmt(m.total_paid_cents || 0, currency)}</span>
            </div>
            <div className="money-bars-track">
              <div
                className="money-bars-fill is-share"
                style={{ width: `${((m.total_share_cents || 0) / max) * 100}%` }}
              />
              <span className="money-bars-amt">{fmt(m.total_share_cents || 0, currency)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
