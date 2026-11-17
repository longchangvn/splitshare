// SplitEase-only dashboard home (design D15 / M32): four stat tiles, group cards and the
// recent-activity list. Rendered by pages/Dashboard.jsx when features.dashboardTiles is on;
// all data comes from the same GET /me/balances payload the classic dashboard uses.
import { Link } from 'react-router-dom';
import { Button, Skeleton, Text, Title } from '@mantine/core';
import { fmt } from '../../../../api.js';
import { signPrefix, toneForNet } from '../../../../balance.js';
import { useT } from '../../../../prefs.jsx';
import { ThemedIcon } from '../../../../components/ThemedIcon.jsx';
import { initialsOf, pastelFor } from '../../../../components/Net.jsx';
import { needsSettlement } from './useMyBalances.js';

const DEFAULT_CURRENCY = 'USD';
const CARD_LIMIT = 4;

/** Sum of what I owe / am owed per currency, from each group's personal net. */
export function oweOwedFor(groups, currency) {
  let owe = 0;
  let owed = 0;
  let oweGroups = 0;
  let owedGroups = 0;
  for (const g of groups) {
    if (String(g.currency || DEFAULT_CURRENCY).toUpperCase() !== currency) continue;
    const n = Number(g.net_cents) || 0;
    if (n < 0) { owe -= n; oweGroups += 1; }
    if (n > 0) { owed += n; owedGroups += 1; }
  }
  return { owe, owed, oweGroups, owedGroups };
}

function StatTile({ kicker, icon, tone, value, caption, loading, onClick, className = '', children, ...rest }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`se-stat is-${tone}${onClick ? ' is-clickable' : ''} ${className}`.trim()}
      onClick={onClick}
      {...rest}
    >
      <span className="se-stat-head">
        <span className="se-stat-kicker">{kicker}</span>
        <span className="se-stat-icon" aria-hidden><ThemedIcon ms={icon} size={20} /></span>
      </span>
      {loading ? <Skeleton height={34} width="70%" radius="md" mt={6} /> : <span className="se-stat-value">{value}</span>}
      <span className="se-stat-caption">{caption}</span>
      {children}
    </Tag>
  );
}

function groupsCaption(t, count) {
  return t(count === 1 ? 'se.dash.acrossGroupsOne' : 'se.dash.acrossGroups', { count });
}

export function DashboardHome({
  data, error, groups, balance, settledPct, activeGroups,
  breakdownOpen, onToggleBreakdown, onOpenGroups, breakdown, history, onCreate, errorSlot, newGroupIcon,
}) {
  const t = useT();
  const ready = !!data;
  const loading = !data && !error;
  const currency = balance.primaryCurrency || DEFAULT_CURRENCY;
  const totals = oweOwedFor(groups, currency);
  const multi = balance.currencyCount > 1;

  // Group cards: active groups first (newest), then the rest, capped.
  const cards = [...groups]
    .sort((a, b) => ((a.status || 'opening') === 'opening' ? 0 : 1) - ((b.status || 'opening') === 'opening' ? 0 : 1)
      || new Date(b.created_at) - new Date(a.created_at))
    .slice(0, CARD_LIMIT);
  const spendByCurrency = new Map();
  for (const g of groups) {
    const c = String(g.currency || DEFAULT_CURRENCY).toUpperCase();
    spendByCurrency.set(c, (spendByCurrency.get(c) || 0) + (Number(g.spent_cents) || 0));
  }

  return (
    <>
      <div className="dash-head se-dash-head">
        <div>
          <Title order={2}>{t('dashboard.title')}</Title>
          <Text size="sm" c="dimmed" mt={4}>{t('se.dash.subtitle')}</Text>
        </div>
        <Button className="dash-cta" onClick={onCreate} leftSection={newGroupIcon}>{t('dashboard.newGroup')}</Button>
      </div>
      {errorSlot}

      <div className="se-stats">
        <StatTile
          kicker={t('se.dash.netBalance')}
          icon="account_balance_wallet"
          tone={balance.tone}
          loading={loading}
          value={ready ? `${signPrefix(balance.primaryNetCents)}${fmt(Math.abs(balance.primaryNetCents), currency)}` : '—'}
          caption={!ready ? (error ? '—' : '…') : balance.direction === 'owe'
            ? t('dashboard.balanceOwe')
            : balance.direction === 'owed' ? t('dashboard.balanceOwed') : t('net.settledUp')}
          onClick={onToggleBreakdown}
          aria-expanded={breakdownOpen}
          className="is-net"
        >
          {ready && multi && (
            <span className="se-stat-chips">
              {balance.byCurrency.filter((c) => c.currency !== balance.primaryCurrency).map((c) => (
                <span key={c.currency} className={`dash-balance-chip is-${toneForNet(c.net_cents)}`}>
                  {signPrefix(c.net_cents)}{fmt(Math.abs(c.net_cents), c.currency)}
                </span>
              ))}
            </span>
          )}
        </StatTile>
        <StatTile
          kicker={t('se.dash.youOwe')}
          icon="north_east"
          tone="open"
          loading={loading}
          value={ready ? fmt(totals.owe, currency) : '—'}
          caption={ready ? (multi ? t('se.dash.perCurrency', { currency }) : groupsCaption(t, totals.oweGroups)) : '…'}
        />
        <StatTile
          kicker={t('se.dash.youAreOwed')}
          icon="south_west"
          tone="owed"
          loading={loading}
          value={ready ? fmt(totals.owed, currency) : '—'}
          caption={ready ? (multi ? t('se.dash.perCurrency', { currency }) : groupsCaption(t, totals.owedGroups)) : '…'}
        />
        <StatTile
          kicker={t('se.dash.groups')}
          icon="groups"
          tone="neutral"
          loading={loading}
          value={ready ? activeGroups.length : '—'}
          caption={ready ? t('se.dash.groupsSettled', { pct: settledPct }) : '…'}
          onClick={onOpenGroups}
        >
          {ready && (
            <span className="se-progress" aria-hidden><span style={{ width: `${settledPct}%` }} /></span>
          )}
        </StatTile>
      </div>

      {breakdown}

      <div className="se-dash-grid">
        <section className="se-dash-groups" aria-labelledby="se-dash-groups-title">
          <div className="se-section-head">
            <h3 id="se-dash-groups-title" className="se-section-title">
              {t('dashboard.groups')}
              {ready && <span className="se-count-pill">{t('se.dash.activeCount', { count: activeGroups.length })}</span>}
            </h3>
            <Link to="/groups" className="se-link">
              {t('common.viewAll')} <ThemedIcon ms="chevron_right" size={18} />
            </Link>
          </div>
          {loading && (
            <div className="se-group-cards">
              <Skeleton height={168} radius={16} />
              <Skeleton height={168} radius={16} />
            </div>
          )}
          {ready && groups.length === 0 && (
            <div className="se-empty">
              <Text c="dimmed" ta="center">{t('dashboard.noGroups')}</Text>
              <Button variant="light" onClick={onCreate}>{t('dashboard.createGroup')}</Button>
            </div>
          )}
          {ready && cards.length > 0 && (
            <div className="se-group-cards">
              {cards.map((g) => {
                const cur = String(g.currency || DEFAULT_CURRENCY).toUpperCase();
                const spent = Number(g.spent_cents) || 0;
                const total = spendByCurrency.get(cur) || 0;
                const pct = total > 0 ? Math.round((spent / total) * 100) : 0;
                const net = Number(g.net_cents) || 0;
                const tone = net < 0 ? 'open' : net > 0 ? 'owed' : 'settled';
                const status = g.status || 'opening';
                const members = Number(g.member_count) || 0;
                const open = needsSettlement(g);
                const pastel = pastelFor(g.name);
                return (
                  <Link
                    key={g.group_id}
                    to={`/groups/${g.group_id}`}
                    className={`se-group-card is-${status}`}
                    aria-label={t('common.viewDetailsFor', { name: g.name })}
                  >
                    <span className="se-group-card-top">
                      <span className="se-group-avatar" style={{ background: pastel.from }} aria-hidden>
                        {initialsOf(g.name)}
                      </span>
                      <span className="se-group-card-copy">
                        <span className="se-group-card-name">{g.name}</span>
                        <span className="se-group-card-meta">
                          {t('groupDetail.membersCount', { count: members, unit: members === 1 ? t('common.person') : t('common.people') })}
                          {status !== 'opening' && ` · ${t(`groupStatus.${status}`)}`}
                        </span>
                      </span>
                      <span className={`se-chip is-${tone}`}>
                        {tone === 'open' ? t('se.dash.owe', { amount: fmt(-net, cur) })
                          : tone === 'owed' ? t('se.dash.owed', { amount: fmt(net, cur) })
                            : t('se.dash.settled')}
                      </span>
                    </span>
                    <span className="se-group-card-foot">
                      <span className="se-group-card-row">
                        <span>{t('groups.totalSpend')}: <b>{fmt(spent, cur)}</b></span>
                        <span className="se-group-card-pct">{t('se.dash.spendShare', { pct, currency: cur })}</span>
                      </span>
                      <span className="se-progress"><span style={{ width: `${pct}%` }} /></span>
                      <span className="se-group-card-row">
                        <span className={`se-group-card-state is-${open ? 'open' : 'settled'}`}>
                          <ThemedIcon ms={open ? 'pending' : 'check_circle'} size={16} />
                          {open ? t('settlement.statusOpen') : t('settlement.statusSettled')}
                        </span>
                        <span className="se-link">{t('se.dash.openGroup')} <ThemedIcon ms="arrow_forward" size={16} /></span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="se-dash-activity">{history}</div>
      </div>
    </>
  );
}
