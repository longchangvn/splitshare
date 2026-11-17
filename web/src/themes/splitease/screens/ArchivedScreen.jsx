// SplitEase-only /archived screen (design D13 / M26 look): groups whose lifecycle status is
// closed (optionally locked too), from the same GET /me/balances rows as the dashboard.
// The API exposes no closed-at timestamp, so cards show the creation date instead.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton, Switch, Text, Title } from '@mantine/core';
import { fmt } from '../../../api.js';
import { Err } from '../../../auth.jsx';
import { signPrefix, toneForNet } from '../../../balance.js';
import { useT } from '../../../prefs.jsx';
import { Shell } from '../../../components/Shell.jsx';
import { ThemedIcon } from '../../../components/ThemedIcon.jsx';
import { useMyBalances } from '../components/shell/useMyBalances.js';

export function archivedGroups(groups, includeLocked = false) {
  return (groups || [])
    .filter((g) => g.status === 'closed' || (includeLocked && g.status === 'locked'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function ArchivedCard({ group, onOpen }) {
  const t = useT();
  const status = group.status || 'closed';
  const cur = String(group.currency || 'USD').toUpperCase();
  const net = Number(group.net_cents) || 0;
  const members = Number(group.member_count) || 0;
  const created = group.created_at ? new Date(group.created_at) : null;
  return (
    <article className={`se-archived-card is-${status}`}>
      <div className="se-archived-top">
        <span className="se-icon-tile is-mint" aria-hidden>
          <ThemedIcon ms={status === 'locked' ? 'lock' : 'inventory_2'} size={22} />
        </span>
        <div className="se-archived-copy">
          <div className="se-archived-name">
            {group.name}
            <span className={`se-chip is-${status === 'locked' ? 'locked' : 'closed'}`}>{t(`groupStatus.${status}`)}</span>
          </div>
          {created && !Number.isNaN(created.getTime()) && (
            <div className="se-archived-meta">
              {t('se.archived.created', { date: created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) })}
              {' · '}{cur}
            </div>
          )}
        </div>
        <div className="se-archived-total">
          <span className="se-archived-total-value">{fmt(Number(group.spent_cents) || 0, cur)}</span>
          <span className="se-archived-total-label">{t('se.archived.lifetimeSpend')}</span>
        </div>
      </div>
      <div className="se-archived-stats">
        <div>
          <span className="se-archived-stat-label">{t('common.members')}</span>
          <span className="se-archived-stat-value">{members}</span>
        </div>
        <div>
          <span className="se-archived-stat-label">{t('se.archived.yourNet')}</span>
          <span className={`se-archived-stat-value is-${toneForNet(net)}`}>
            {net === 0 ? t('net.settledUp') : `${signPrefix(net)}${fmt(Math.abs(net), cur)}`}
          </span>
        </div>
        <div>
          <span className="se-archived-stat-label">{t('common.status')}</span>
          <span className="se-archived-stat-value">{t(`groupStatus.${status}`)}</span>
        </div>
      </div>
      <div className="se-archived-actions">
        <Button size="xs" variant="default" className="se-btn-soft" onClick={onOpen}
          leftSection={<ThemedIcon ms="visibility" size={16} />}>
          {t('se.archived.viewLedger')}
        </Button>
      </div>
    </article>
  );
}

export function ArchivedScreen() {
  const t = useT();
  const nav = useNavigate();
  const { data, error } = useMyBalances();
  const [withLocked, setWithLocked] = useState(false);
  const ready = !!data;
  const list = archivedGroups(data?.groups, withLocked);

  return (
    <Shell>
      <div className="dash-head se-dash-head">
        <div>
          <Title order={2}>{t('se.archived.title')}</Title>
          <Text size="sm" c="dimmed" mt={4}>{t('se.archived.subtitle')}</Text>
        </div>
        <Switch
          checked={withLocked}
          onChange={(ev) => setWithLocked(ev.currentTarget.checked)}
          label={t('se.archived.includeLocked')}
          className="se-archived-switch"
        />
      </div>
      <Err e={error} />

      <h3 className="se-section-title">
        {t('se.archived.count')}
        {ready && <span className="se-count-pill">{list.length}</span>}
      </h3>
      {!ready && !error && (
        <div className="se-archived-list">
          <Skeleton height={150} radius={16} />
          <Skeleton height={150} radius={16} />
        </div>
      )}
      {ready && list.length === 0 && (
        <div className="se-empty">
          <span className="se-icon-tile" aria-hidden><ThemedIcon ms="inventory_2" size={24} /></span>
          <Text c="dimmed" ta="center" size="sm">{t('se.archived.empty')}</Text>
        </div>
      )}
      {ready && list.length > 0 && (
        <div className="se-archived-list">
          {list.map((g) => (
            <ArchivedCard key={g.group_id} group={g} onOpen={() => nav(`/groups/${g.group_id}`)} />
          ))}
        </div>
      )}
    </Shell>
  );
}
