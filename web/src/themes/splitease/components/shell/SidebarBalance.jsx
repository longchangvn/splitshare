// SplitEase-only: net-balance card at the foot of the sidebar (design D-series shell).
// Same netting as the dashboard "My balance" card (buildBalance: per currency, never mixed).
import { Link } from 'react-router-dom';
import { fmt } from '../../../../api.js';
import { buildBalance, signPrefix } from '../../../../balance.js';
import { useT } from '../../../../prefs.jsx';
import { ThemedIcon } from '../../../../components/ThemedIcon.jsx';
import { useMyBalances } from './useMyBalances.js';

export function SidebarBalance({ collapsed = false }) {
  const t = useT();
  const { data, error } = useMyBalances();
  if (error) return null; // non-essential chrome: the dashboard shows the error
  const balance = data ? buildBalance(data.groups, data.balance) : null;
  const others = balance ? balance.currencyCount - 1 : 0;
  const caption = !balance ? '…'
    : balance.direction === 'owe' ? t('dashboard.balanceOwe')
      : balance.direction === 'owed' ? t('dashboard.balanceOwed') : t('net.settledUp');
  return (
    <Link
      to="/balances"
      className={`se-side-balance is-${balance?.direction || 'loading'}${collapsed ? ' is-collapsed' : ''}`}
      aria-label={`${t('se.shell.netBalance')}: ${caption}`}
    >
      <span className="se-side-balance-head">
        <span className="se-side-balance-kicker">{t('se.shell.netBalance')}</span>
        <ThemedIcon ms={balance?.direction === 'owe' ? 'trending_down' : 'trending_up'} size={18} />
      </span>
      <span className="se-side-balance-value">
        {balance
          ? `${signPrefix(balance.primaryNetCents)}${fmt(Math.abs(balance.primaryNetCents), balance.primaryCurrency || 'USD')}`
          : <span className="se-side-balance-shimmer" aria-hidden />}
      </span>
      <span className="se-side-balance-caption">{caption}</span>
      {others > 0 && (
        <span className="se-side-balance-caption">{t('se.shell.otherCurrencies', { count: others })}</span>
      )}
    </Link>
  );
}
