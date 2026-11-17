import { initialsOf, pastelFor } from '../../../../components/Net.jsx';
import { ThemedIcon } from '../../../../components/ThemedIcon.jsx';
import { useT } from '../../../../prefs.jsx';

function Party({ name, role }) {
  const t = useT();
  const pastel = pastelFor(name || '');
  return (
    <div className={`se-route-party${name ? '' : ' is-empty'}`}>
      <span className="se-avatar is-lg" style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }} aria-hidden>
        {name ? initialsOf(name) : <ThemedIcon ms="person" size={20}>?</ThemedIcon>}
      </span>
      <span className="se-route-name">{name || t('seGroup.chooseMember')}</span>
      <span className="se-route-role">{role}</span>
    </div>
  );
}

/** Payer → recipient header of the record-payment form (D43). Mirrors the two selects below it. */
export function PayRouteCard({ fromName, toName }) {
  const t = useT();
  return (
    <div className="se-route is-form" aria-hidden>
      <Party name={fromName} role={t('seGroup.payer')} />
      <span className="se-route-arrow">
        <ThemedIcon ms="arrow_forward" size={18}>→</ThemedIcon>
        <span className="se-route-pays">{t('seGroup.pays')}</span>
      </span>
      <Party name={toName} role={t('seGroup.recipient')} />
    </div>
  );
}
