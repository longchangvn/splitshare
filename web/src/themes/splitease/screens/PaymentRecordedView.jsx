import { Button } from '@mantine/core';
import { fmt } from '../../../api.js';
import { displayNameOf, initialsOf, pastelFor } from '../../../components/Net.jsx';
import { ThemedIcon } from '../../../components/ThemedIcon.jsx';
import { useT } from '../../../prefs.jsx';

const METHOD_KEY = { cash: 'forms.payment.cash', transfer: 'forms.payment.bank', other: 'forms.payment.other' };

function Party({ name, role }) {
  const pastel = pastelFor(name);
  return (
    <div className="se-route-party">
      <span className="se-avatar is-lg" style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }} aria-hidden>
        {initialsOf(name)}
      </span>
      <span className="se-route-name">{name}</span>
      <span className="se-route-role">{role}</span>
    </div>
  );
}

/**
 * Success state after PaymentForm resolved (D21 / M31). Reads only the POST response and the
 * settlement plan the group page re-fetched afterwards; it never calls the API itself.
 */
export function PaymentRecordedView({ result, members = [], currency, plan, planFresh, onDone, onAnother }) {
  const t = useT();
  const p = result?.payment || {};
  const from = displayNameOf(members, p.from_user_id || '');
  const to = displayNameOf(members, p.to_user_id || '');
  const at = p.created_at ? new Date(p.created_at) : new Date();
  const pair = (plan?.transfers || []).filter((x) => (
    (x.from_user_id === p.from_user_id && x.to_user_id === p.to_user_id)
    || (x.from_user_id === p.to_user_id && x.to_user_id === p.from_user_id)
  ));
  let balance;
  if (!planFresh) balance = <span className="se-muted">{t('seGroup.balanceUpdating')}</span>;
  else if (result?.fully_settled) balance = <strong className="is-settled">{t('seGroup.groupFullySettled')}</strong>;
  else if (pair.length === 0) balance = <strong className="is-settled">{t('seGroup.pairSettled')}</strong>;
  else {
    balance = pair.map((x) => (
      <strong key={`${x.from_user_id}-${x.to_user_id}`} className="is-open">
        {t('seGroup.pairRemaining', {
          from: displayNameOf(members, x.from_user_id),
          to: displayNameOf(members, x.to_user_id),
          amount: fmt(x.amount_cents, currency),
        })}
      </strong>
    ));
  }
  return (
    <div className="wizard-form se-pay-done" role="status" aria-live="polite">
      <div className="se-pay-done-hero">
        <span className="se-pay-done-check" aria-hidden>
          <ThemedIcon ms="check" size={34}>✓</ThemedIcon>
        </span>
        <h3 className="se-pay-done-title">
          {result?.fully_settled ? t('seGroup.fullySettledTitle') : t('seGroup.paymentRecorded')}
        </h3>
        <span className="se-pay-done-when">
          {at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      <div className="se-pay-done-amount">
        <span className="se-money">{fmt(p.amount_cents, currency)}</span>
      </div>
      <div className="se-route">
        <Party name={from} role={t('seGroup.payer')} />
        <span className="se-route-arrow" aria-hidden><ThemedIcon ms="arrow_forward" size={18}>→</ThemedIcon></span>
        <Party name={to} role={t('seGroup.recipient')} />
      </div>
      <dl className="se-pay-done-facts">
        <div>
          <dt>{t('forms.payment.method')}</dt>
          <dd>{t(METHOD_KEY[p.method] || 'forms.payment.other')}</dd>
        </div>
        <div>
          <dt>{t('common.date')}</dt>
          <dd>{at.toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
        </div>
        {p.note && (
          <div>
            <dt>{t('forms.payment.note')}</dt>
            <dd>{p.note}</dd>
          </div>
        )}
        <div className="is-balance">
          <dt>{t('seGroup.pairBalance')}</dt>
          <dd>{balance}</dd>
        </div>
      </dl>
      <div className="se-pay-done-actions">
        <Button className="wizard-back" onClick={onAnother}>{t('seGroup.recordAnother')}</Button>
        <Button className="wizard-primary" onClick={onDone}>{t('seGroup.done')}</Button>
      </div>
    </div>
  );
}
