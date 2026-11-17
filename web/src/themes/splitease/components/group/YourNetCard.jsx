import { fmt } from '../../../../api.js';
import { initialsOf, pastelFor } from '../../../../components/Net.jsx';
import { ThemedIcon } from '../../../../components/ThemedIcon.jsx';
import { useT } from '../../../../prefs.jsx';

/**
 * "Your net" + peer balances (D27 left column) from GET /groups/:id/me, which the group
 * page already loads (raw pairwise debts, before the fewest-transfer plan). Read-only.
 */
export function YourNetCard({ me, currency }) {
  const t = useT();
  if (!me) return null;
  const net = Number(me.net_cents) || 0;
  const tone = net === 0 ? 'settled' : net > 0 ? 'owed' : 'owe';
  const peers = [
    ...(me.owed_to_me || []).map((r) => ({
      id: `in-${r.from_user_id}`, name: r.from_name, cents: r.amount_cents, dir: 'in', userId: r.from_user_id,
    })),
    ...(me.owes || []).map((r) => ({
      id: `out-${r.to_user_id}`, name: r.to_name, cents: r.amount_cents, dir: 'out', userId: r.to_user_id,
    })),
  ].filter((p) => p.cents > 0);
  return (
    <section className={`se-net-card is-${tone}`} aria-label={t('seGroup.yourNet')}>
      <div className="se-net-main">
        <div className="se-net-head">
          <span className="se-kicker">{t('seGroup.yourNet')}</span>
          <span className={`se-pill is-${tone}`}>
            {tone === 'settled' ? t('seGroup.allSquare') : tone === 'owed' ? t('seGroup.youAreOwed') : t('seGroup.youOwe')}
          </span>
        </div>
        <span className="se-net-value">
          {net > 0 ? '+' : net < 0 ? '−' : ''}
          {fmt(Math.abs(net), currency)}
        </span>
      </div>
      <div className="se-peer-list">
        <span className="se-kicker">
          <ThemedIcon ms="balance" size={16} />
          {t('seGroup.peerBalances')}
        </span>
        {peers.length === 0 ? (
          <span className="se-peer-empty">{t('seGroup.noPeerBalances')}</span>
        ) : peers.map((p) => {
          const pastel = pastelFor(p.name);
          return (
            <div key={p.id} className={`se-peer-row is-${p.dir}`}>
              <span className="se-avatar" style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }} aria-hidden>
                {initialsOf(p.name)}
              </span>
              <span className="se-peer-copy">
                <span className="se-peer-name">{p.name}</span>
                <span className="se-peer-sub">
                  {p.dir === 'in' ? t('seGroup.owesYou') : t('seGroup.youOweThem')}
                </span>
              </span>
              <span className={`se-pill is-${p.dir === 'in' ? 'owed' : 'owe'}`}>
                {p.dir === 'in' ? '+' : '−'}
                {fmt(p.cents, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
