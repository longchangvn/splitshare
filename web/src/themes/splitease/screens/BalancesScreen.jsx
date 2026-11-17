// SplitEase-only /balances hub (design D1): cross-group "People who owe you" / "People you owe"
// from each group's fewest-transfer plan (GET /me/balances → groups[].my_transfers), plus recent
// payments from the group activity feeds. Actions hand off to the group's Balances tab, where
// payments are recorded — no new API.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton, Text, Title } from '@mantine/core';
import { fmt } from '../../../api.js';
import { Err } from '../../../auth.jsx';
import { buildBalance, signPrefix } from '../../../balance.js';
import { useT } from '../../../prefs.jsx';
import { Shell } from '../../../components/Shell.jsx';
import { ThemedIcon } from '../../../components/ThemedIcon.jsx';
import { initialsOf, pastelFor } from '../../../components/Net.jsx';
import { useMyBalances, fetchGroupActivity, needsSettlement } from '../components/shell/useMyBalances.js';
import { oweOwedFor } from '../components/shell/DashboardHome.jsx';

const RECENT_LIMIT = 6;

/** Flatten every group's optimized transfers that involve me into person rows. */
export function personRows(groups) {
  const owedToMe = [];
  const iOwe = [];
  for (const g of groups) {
    for (const x of g.transfers) {
      const row = {
        key: `${g.group_id}-${x.from_user_id}-${x.to_user_id}`,
        group_id: g.group_id,
        group_name: g.name,
        currency: g.currency,
        amount_cents: x.amount_cents,
        name: x.from_me ? x.to_name : x.from_name,
      };
      (x.from_me ? iOwe : owedToMe).push(row);
    }
  }
  const byAmount = (a, b) => b.amount_cents - a.amount_cents || a.name.localeCompare(b.name);
  return { owedToMe: owedToMe.sort(byAmount), iOwe: iOwe.sort(byAmount) };
}

function PersonCard({ row, direction, onRecord, onOpen }) {
  const t = useT();
  const pastel = pastelFor(row.name);
  return (
    <div className={`se-person-card is-${direction}`}>
      <div className="se-person-main">
        <span className="se-person-avatar" style={{ background: pastel.from }} aria-hidden>{initialsOf(row.name)}</span>
        <div className="se-person-copy">
          <div className="se-person-name">
            {row.name}
            <span className="se-tag">{row.group_name}</span>
          </div>
        </div>
        <div className="se-person-amount">
          <span className="se-person-amount-label">
            {direction === 'owed' ? t('se.balances.owesYou') : t('se.balances.youOweLabel')}
          </span>
          <span className="se-person-amount-value">{fmt(row.amount_cents, row.currency)}</span>
        </div>
      </div>
      <div className="se-person-actions">
        <Button size="xs" variant="default" className="se-btn-soft" onClick={onOpen}
          leftSection={<ThemedIcon ms="open_in_new" size={16} />}>
          {t('se.balances.openGroup')}
        </Button>
        <Button size="xs" className={direction === 'owed' ? 'se-btn-mint' : undefined} onClick={onRecord}
          leftSection={<ThemedIcon ms="payments" size={16} />}>
          {t('se.balances.recordPayment')}
        </Button>
      </div>
    </div>
  );
}

function PeopleSection({ title, tone, rows, empty, ready, direction, nav }) {
  const t = useT();
  const toBalances = (gid) => nav(`/groups/${gid}`, { state: { tab: 'balances' } });
  return (
    <section className="se-people-section">
      <h3 className={`se-section-title is-bar is-${tone}`}>
        {title}
        {ready && rows.length > 0 && (
          <span className={`se-count-pill is-${tone}`}>{t('se.balances.openCount', { count: rows.length })}</span>
        )}
      </h3>
      {!ready && <Skeleton height={112} radius={16} />}
      {ready && rows.length === 0 && <div className="se-empty is-inline"><Text c="dimmed" size="sm">{empty}</Text></div>}
      {ready && rows.map((r) => (
        <PersonCard
          key={r.key}
          row={r}
          direction={direction}
          onOpen={() => nav(`/groups/${r.group_id}`)}
          onRecord={() => toBalances(r.group_id)}
        />
      ))}
    </section>
  );
}

function RecentSettlements({ groups, ready }) {
  const t = useT();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const key = groups.map((g) => g.group_id).join(',');
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    fetchGroupActivity(groups, 20).then((rows) => {
      if (live) setItems(rows.filter((r) => String(r.kind).toLowerCase() === 'payment').slice(0, RECENT_LIMIT));
    });
    return () => { live = false; };
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="se-card se-recent">
      <h3 className="se-section-title">{t('se.balances.recent')}</h3>
      {!items && <Skeleton height={120} radius={12} />}
      {items && items.length === 0 && <Text c="dimmed" size="sm">{t('se.balances.recentNone')}</Text>}
      {items && items.length > 0 && (
        <div className="se-recent-list">
          {items.map((a, i) => (
            <button
              key={`${a.group_id}-${a.at}-${i}`}
              type="button"
              className="se-recent-row"
              onClick={() => nav(`/groups/${a.group_id}`, { state: { tab: 'activity' } })}
            >
              <span className="se-icon-tile is-mint" aria-hidden><ThemedIcon ms="payments" size={20} /></span>
              <span className="se-recent-copy">
                <span className="se-recent-text">{a.text}</span>
                <span className="se-recent-meta">
                  {a.group_name} · {new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function BalancesScreen() {
  const t = useT();
  const nav = useNavigate();
  const { data, error } = useMyBalances();
  const ready = !!data;
  const groups = data?.groups || [];
  const balance = buildBalance(groups, data?.balance);
  const { owedToMe, iOwe } = personRows(balance.groups);
  const currency = balance.primaryCurrency || 'USD';
  const totals = oweOwedFor(groups, currency);
  const settled = groups.filter((g) => !needsSettlement(g)).length;
  const settledPct = groups.length ? Math.round((settled / groups.length) * 100) : 0;

  const tiles = [
    { id: 'net', kicker: t('se.balances.netPosition'), icon: 'account_balance_wallet', tone: balance.tone,
      value: `${signPrefix(balance.primaryNetCents)}${fmt(Math.abs(balance.primaryNetCents), currency)}`,
      caption: balance.direction === 'owe' ? t('dashboard.balanceOwe')
        : balance.direction === 'owed' ? t('dashboard.balanceOwed') : t('net.settledUp') },
    { id: 'owe', kicker: t('se.dash.youOwe'), icon: 'north_east', tone: 'open', value: fmt(totals.owe, currency),
      caption: t(totals.oweGroups === 1 ? 'se.dash.acrossGroupsOne' : 'se.dash.acrossGroups', { count: totals.oweGroups }) },
    { id: 'owed', kicker: t('se.dash.youAreOwed'), icon: 'south_west', tone: 'owed', value: fmt(totals.owed, currency),
      caption: t(totals.owedGroups === 1 ? 'se.dash.acrossGroupsOne' : 'se.dash.acrossGroups', { count: totals.owedGroups }) },
    { id: 'rate', kicker: t('se.balances.settlementRate'), icon: 'task_alt', tone: 'neutral', value: `${settledPct}%`,
      caption: t('dashboard.settledOpen', { settled, open: groups.length - settled }) },
  ];

  return (
    <Shell>
      <div className="dash-head se-dash-head">
        <div>
          <Title order={2}>{t('se.balances.title')}</Title>
          <Text size="sm" c="dimmed" mt={4}>{t('se.balances.subtitle')}</Text>
        </div>
      </div>
      <Err e={error} />

      <div className="se-stats">
        {tiles.map((x) => (
          <div key={x.id} className={`se-stat is-${x.tone}`}>
            <span className="se-stat-head">
              <span className="se-stat-kicker">{x.kicker}</span>
              <span className="se-stat-icon" aria-hidden><ThemedIcon ms={x.icon} size={20} /></span>
            </span>
            {ready ? <span className="se-stat-value">{x.value}</span> : <Skeleton height={34} width="70%" radius="md" mt={6} />}
            <span className="se-stat-caption">{ready ? x.caption : (error ? '—' : '…')}</span>
          </div>
        ))}
      </div>

      <div className="se-balances-grid">
        <div className="se-balances-main">
          <PeopleSection
            title={t('se.balances.owedToYou')}
            tone="owed"
            direction="owed"
            rows={owedToMe}
            empty={t('se.balances.noneOwed')}
            ready={ready}
            nav={nav}
          />
          <PeopleSection
            title={t('se.balances.youOwe')}
            tone="open"
            direction="owe"
            rows={iOwe}
            empty={t('se.balances.noneOwe')}
            ready={ready}
            nav={nav}
          />
          {ready && <Text size="xs" c="dimmed">{t('dashboard.optimizedNote')}</Text>}
        </div>
        <aside className="se-balances-side">
          <RecentSettlements groups={groups} ready={ready} />
        </aside>
      </div>
    </Shell>
  );
}
