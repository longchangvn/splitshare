import { fmt } from '../api.js';
import { useT } from '../prefs.jsx';

const PALETTE = [
  '#2dd4bf', '#38bdf8', '#fb7185', '#a78bfa', '#fbbf24',
  '#4ade80', '#60a5fa', '#f472b6', '#34d399', '#22d3ee',
];
const MEMBER_PALETTE = [
  '#2dd4bf', '#38bdf8', '#fbbf24', '#a78bfa', '#fb7185',
  '#4ade80', '#60a5fa', '#f472b6', '#34d399', '#22d3ee',
];
const CATEGORY_COLORS = {
  activity: '#4ade80',
  food: '#fbbf24',
  health: '#fb7185',
  other: '#a78bfa',
  shopping: '#f472b6',
  stay: '#22d3ee',
  transport: '#60a5fa',
};
const CATEGORY_PALETTE = ['#22d3ee', '#fbbf24', '#4ade80', '#a78bfa', '#fb7185', '#60a5fa', '#2dd4bf', '#f472b6'];

function colorAt(i) {
  return PALETTE[i % PALETTE.length];
}

function memberColorAt(i) {
  return MEMBER_PALETTE[i % MEMBER_PALETTE.length];
}

export function chartColorsFor(keys, colorMode = 'key') {
  const uniqueKeys = [...new Set((keys || []).map((key) => String(key)))].sort();
  if (colorMode === 'key') {
    return new Map(uniqueKeys.map((key) => [key, chartColorFor(key)]));
  }

  if (colorMode === 'member') {
    return new Map(uniqueKeys.map((key, i) => [key, memberColorAt(i)]));
  }

  const colors = new Map();
  const used = new Set();
  uniqueKeys.forEach((key) => {
    if (CATEGORY_COLORS[key]) {
      colors.set(key, CATEGORY_COLORS[key]);
      used.add(CATEGORY_COLORS[key]);
    }
  });
  let colorIndex = 0;
  uniqueKeys.forEach((key) => {
    if (colors.has(key)) return;
    while (used.has(CATEGORY_PALETTE[colorIndex % CATEGORY_PALETTE.length])) colorIndex += 1;
    const color = CATEGORY_PALETTE[colorIndex % CATEGORY_PALETTE.length];
    colors.set(key, color);
    used.add(color);
    colorIndex += 1;
  });
  return colors;
}

/** Stable chart color for a member / category key (matches donut legend). */
export function chartColorFor(key) {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return colorAt(h);
}

/** Donut distribution for a single metric (paid or share). */
export function MoneyDonut({
  rows, valueKey, currency, emptyLabel, hideLegend = false, size = 168, colorMode = 'key',
}) {
  const t = useT();
  const empty = emptyLabel ?? t('charts.noData');
  const keyedRows = (rows || [])
    .map((r, i) => {
      const key = r.key || r.user_id || i;
      return {
        key,
        label: r.label || r.display_name || '—',
        value: Math.max(0, Number(r[valueKey] ?? r.value) || 0),
      };
    });
  const seriesColors = colorMode === 'key'
    ? null
    : chartColorsFor(keyedRows.map((row) => row.key), colorMode);
  const data = keyedRows
    .filter((row) => row.value > 0)
    .map((row) => ({
      ...row,
      color: seriesColors?.get(String(row.key)) || chartColorFor(row.key),
    }));
  const total = data.reduce((a, r) => a + r.value, 0);
  if (total <= 0) {
    return (
      <div className={`money-donut is-empty${hideLegend ? ' is-solo' : ''}`}>
        <span className="money-donut-empty">{empty}</span>
      </div>
    );
  }

  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={`money-donut${hideLegend ? ' is-solo' : ''}`}>
      <svg className="money-donut-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle className="money-donut-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
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
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x="50%" y="47%" textAnchor="middle" className="money-donut-total-label">{t('charts.total')}</text>
        <text x="50%" y="58%" textAnchor="middle" className="money-donut-total-value">{fmt(total, currency)}</text>
      </svg>
      {!hideLegend && (
        <ul className="money-donut-legend">
          {data.map((seg) => (
            <li key={seg.key}>
              <span className="money-swatch" style={{ background: seg.color }} />
              <span className="money-leg-label">{seg.label}</span>
              <span className="money-leg-value">{fmt(seg.value, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Grouped column chart with axes: paid vs share per person. */
export function PaidShareBars({ summary, currency }) {
  const t = useT();
  const rows = [...(summary || [])].sort((a, b) => (
    Math.max(b.total_paid_cents, b.total_share_cents) - Math.max(a.total_paid_cents, a.total_share_cents)
  ));
  const rawMax = Math.max(1, ...rows.flatMap((m) => [m.total_paid_cents || 0, m.total_share_cents || 0]));
  // Nice Y ceiling so ticks land on round amounts.
  const niceStep = (() => {
    const rough = rawMax / 4;
    const pow = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
    const n = rough / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  })();
  const max = Math.max(niceStep * 4, Math.ceil(rawMax / niceStep) * niceStep);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max * i) / 4));

  if (rows.length === 0) {
    return <div className="money-bars is-empty">{t('charts.noMemberTotals')}</div>;
  }

  const shortName = (name) => {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 12);
    return `${parts[0].slice(0, 10)} ${parts[parts.length - 1][0] || ''}`.trim();
  };

  return (
    <div className="money-bars" role="img" aria-label={t('charts.paidVsShareAria')}>
      <div className="money-bars-legend">
        <span><i className="money-swatch is-paid" /> {t('charts.paid')}</span>
        <span><i className="money-swatch is-share" /> {t('charts.share')}</span>
      </div>
      <div className="money-bars-frame">
        <div className="money-bars-yaxis" aria-hidden>
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{fmt(tick, currency)}</span>
          ))}
        </div>
        <div className="money-bars-main">
          <div className="money-bars-scroll">
            <div className="money-bars-plot">
              <div className="money-bars-grid" aria-hidden>
                {ticks.map((tick) => (
                  <span key={tick} className="money-bars-gridline" />
                ))}
              </div>
              <div className="money-bars-chart">
                {rows.map((m, idx) => {
                  const paid = m.total_paid_cents || 0;
                  const share = m.total_share_cents || 0;
                  const paidTip = t('charts.paidTip', { amount: fmt(paid, currency) });
                  const shareTip = t('charts.shareTip', { amount: fmt(share, currency) });
                  const edge = idx === 0 ? ' is-first' : idx === rows.length - 1 ? ' is-last' : '';
                  return (
                    <div key={m.user_id} className={`money-bars-col${edge}`}>
                      <div className="money-bars-pair">
                        <div
                          className="money-bars-vfill is-paid"
                          style={{ height: `${(paid / max) * 100}%` }}
                          tabIndex={0}
                          role="img"
                          aria-label={`${m.display_name}: ${paidTip}`}
                        >
                          <span className="money-bar-tip">{paidTip}</span>
                        </div>
                        <div
                          className="money-bars-vfill is-share"
                          style={{ height: `${(share / max) * 100}%` }}
                          tabIndex={0}
                          role="img"
                          aria-label={`${m.display_name}: ${shareTip}`}
                        >
                          <span className="money-bar-tip">{shareTip}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="money-bars-xlabels">
              {rows.map((m) => (
                <div key={m.user_id} className="money-bars-name" title={m.display_name}>
                  <span>{shortName(m.display_name)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
