import { fmt } from '../../../api.js';
import { initialsOf, pastelFor } from '../../../components/Net.jsx';
import { ThemedIcon } from '../../../components/ThemedIcon.jsx';
import { useT } from '../../../prefs.jsx';

/** Closed (read-only) group banner (M39 / M46): ledger locked + per-member settled list. */
export function ClosedGroupBanner({ summary = [], currency }) {
  const t = useT();
  const rows = [...(summary || [])].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
  const total = rows.reduce((a, m) => a + (Number(m.total_paid_cents) || 0), 0);
  const allSettled = rows.every((m) => (Number(m.net_cents) || 0) === 0);
  return (
    <section className="se-closed-banner" aria-label={t('seGroup.closedTitle')}>
      <div className="se-closed-head">
        <span className="se-closed-icon" aria-hidden><ThemedIcon ms="verified" size={26} filled>✓</ThemedIcon></span>
        <div className="se-closed-copy">
          <span className="se-pill is-closed">
            <ThemedIcon ms="lock" size={14} />
            {t('seGroup.ledgerLocked')}
          </span>
          <h3>{allSettled ? t('seGroup.closedTitle') : t('seGroup.closedTitleOpen')}</h3>
          <p>{t('seGroup.closedSub', { amount: fmt(total, currency), count: rows.length })}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="se-closed-members">
          <span className="se-kicker">{t('seGroup.memberStatus')}</span>
          {rows.map((m) => {
            const net = Number(m.net_cents) || 0;
            const pastel = pastelFor(m.display_name);
            return (
              <div key={m.user_id} className="se-closed-row">
                <span className="se-avatar" style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }} aria-hidden>
                  {initialsOf(m.display_name)}
                </span>
                <span className="se-peer-copy">
                  <span className="se-peer-name">{m.display_name}</span>
                  <span className="se-peer-sub">{t('seGroup.paidTotal', { amount: fmt(m.total_paid_cents, currency) })}</span>
                </span>
                {net === 0 ? (
                  <span className="se-pill is-settled">
                    <ThemedIcon ms="check_circle" size={14} />
                    {t('common.settled')}
                  </span>
                ) : (
                  <span className={`se-pill is-${net > 0 ? 'owed' : 'owe'}`}>{fmt(net, currency)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
