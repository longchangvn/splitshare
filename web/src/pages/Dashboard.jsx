import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Autocomplete, Button, CopyButton, Group, Modal, Skeleton, Stack, Text,
  TextInput, Textarea, Title,
} from '@mantine/core';
import { api, fmt } from '../api.js';
import { buildBalance, signPrefix, toneForNet } from '../balance.js';
import { resolveTemplateKey } from '../wizardUtils.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { QuickAddExpense } from '../components/QuickAddExpense.jsx';
import { ADD_EXPENSE_STATE } from '../quickAdd.js';
import { ActivityKindThumb, ChevronRight, initialsOf, pastelFor } from '../components/Net.jsx';
import { getTemplates, subscribeCatalogs } from '../settingsStore.js';
import { useT } from '../prefs.jsx';

const DEFAULT_CURRENCY = 'USD';

export function Dashboard() {
  const t = useT();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [e, setE] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [myContacts, setMyContacts] = useState([]); // top 20 by display name
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState([]);
  const [emails, setEmails] = useState('');
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [forExpense, setForExpense] = useState(false); // quick-add Flow 1: create → New expense
  const [templates, setTemplates] = useState(() => getTemplates());
  const [openPanel, setOpenPanel] = useState(false); // My balance breakdown

  const load = () => api.get('/api/v1/me/balances').then(setData).catch(setE);
  useEffect(() => { load(); }, []);
  useEffect(() => subscribeCatalogs(() => {
    setTemplates(getTemplates());
  }), []);

  const location = useLocation();
  const view = location.pathname === '/groups' ? 'groups'
    : location.pathname === '/activity' ? 'activity' : 'home';
  useEffect(() => {
    document.querySelector('.app-stage-scroll')?.scrollTo({ top: 0 });
  }, [view]);

  const loadMyContacts = () => api.get('/api/v1/contacts?limit=20')
    .then((list) => setMyContacts([...(list || [])]
      .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)))))
    .catch(() => {}); // non-fatal: the box just keeps whatever it had

  const openWizard = () => {
    setName('');
    setTpl(''); setCq(''); setContacts([]);
    setPicked([]); setEmails(''); setCreated(null); setE(null);
    setStep(1); setOpen(true); setForExpense(false);
    loadMyContacts(); // refresh the "Your contacts" box
  };

  // Quick-add Flow 1: reuse the wizard pre-filled with the chosen people + group members.
  const openWizardForExpense = (members) => {
    openWizard();
    setPicked(members);
    setForExpense(true);
  };

  const searchContacts = async () => {
    setSearching(true);
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}&limit=20`)); setE(null); }
    catch (err) { setE(err); } finally { setSearching(false); }
  };

  const create = async (ev) => {
    ev.preventDefault();
    setCreating(true);
    try {
      const emailList = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const memberIds = picked.map((p) => p.user_id);
      // Free-text combobox: catalog labels resolve to their key; "None"/empty
      // means no template (plain create). Unknown text passes through as-is.
      const tplKey = resolveTemplateKey(templates, tpl, t('common.none'));
      const tplLabel = tplKey ? (templates.find((x) => x.key === tplKey)?.label || tplKey) : '';
      let g;
      let link = null;
      if (tplKey) {
        g = await api.post('/api/v1/groups/from-template', {
          name, currency: DEFAULT_CURRENCY, template: tplKey,
        });
        const gid0 = g.group_id ?? g.group?.id;
        if (!gid0) { setE({ message: t('errors.noGroupId') }); return; }
        if (memberIds.length > 0) await api.post(`/api/v1/groups/${gid0}/members`, { user_ids: memberIds });
        if (emailList.length > 0) await api.post(`/api/v1/groups/${gid0}/invites`, { emails: emailList });
        try {
          const s = await api.post(`/api/v1/groups/${gid0}/share-link`, {});
          link = s.invite_link || s.link || null;
        } catch { link = null; }
      } else {
        g = await api.post('/api/v1/groups', {
          name,
          currency: DEFAULT_CURRENCY,
          member_ids: memberIds,
          invite_emails: emailList,
        });
        link = g.invite_link || null;
      }
      const gid = g.group_id ?? g.group?.id; // create returns nested {group:{id}}
      if (!gid) {
        setE({ message: t('errors.noGroupId') });
        return;
      }
      if (forExpense) {
        setOpen(false);
        nav(`/groups/${gid}`, { state: ADD_EXPENSE_STATE });
        return;
      }
      setCreated({
        gid,
        link,
        name: g.group?.name || name,
        currency: DEFAULT_CURRENCY,
        template: tplLabel,
        people: [...picked.map((p) => p.display_name), ...emailList],
      });
      load();
    } catch (err) { setE(err); } finally { setCreating(false); }
  };

  const groups = data?.groups || [];
  // Group settled = no open balances among members (not personal net).
  const settledCount = groups.filter((g) => !groupNeedsSettlement(g)).length;
  const settledPct = groups.length ? Math.round((settledCount / groups.length) * 100) : 0;
  const activeGroups = groups.filter((g) => (g.status || 'opening') === 'opening');
  const activeSettled = activeGroups.filter((g) => !groupNeedsSettlement(g)).length;

  // Netted "My balance": server nets per currency (never across currencies);
  // the panel lists each open group with its optimized (fewest) transfers.
  const balance = buildBalance(groups, data?.balance);

  const wizard = (
    <GroupWizard
      step={step} setStep={setStep}
      name={name} setName={setName}
      tpl={tpl} setTpl={setTpl} create={create} cq={cq} setCq={setCq} searchContacts={searchContacts}
      searching={searching} contacts={contacts} myContacts={myContacts} picked={picked} setPicked={setPicked}
      emails={emails} setEmails={setEmails} creating={creating} created={created}
      templates={templates} forExpense={forExpense}
      onOpenGroup={() => { setOpen(false); nav(`/groups/${created?.gid}`); }}
    />
  );

  return (
    <Shell>
      {view === 'home' && <>
      <div className="dash-head">
        <div>
          <Title order={2}>{t('dashboard.title')}</Title>
        </div>
        <Button className="dash-cta" onClick={openWizard} leftSection={<NewGroupIcon />}>{t('dashboard.newGroup')}</Button>
      </div>
      <Err e={e} />

      <div className="dash-grid">
        <button
          type="button"
          className={`dash-card dash-stat dash-stat-btn dash-balance is-clickable is-${balance.tone}`}
          aria-expanded={openPanel}
          aria-controls="dash-breakdown"
          onClick={() => setOpenPanel(!openPanel)}
        >
          <div className="dash-card-top">
            <div>
              <div className="dash-kicker">{t('dashboard.myBalance')}</div>
              {!data && !e && <MoneyShimmer />}
              {data && (
                <div className="dash-value">
                  {signPrefix(balance.primaryNetCents)}
                  {fmt(Math.abs(balance.primaryNetCents), balance.primaryCurrency || DEFAULT_CURRENCY)}
                </div>
              )}
              <div className="dash-delta">
                {!data && e ? '—' : data && (balance.direction === 'owe'
                  ? t('dashboard.balanceOwe')
                  : balance.direction === 'owed'
                    ? t('dashboard.balanceOwed')
                    : t('net.settledUp'))}
              </div>
              {data && balance.currencyCount > 1 && (
                <div className="dash-balance-others">
                  {balance.byCurrency
                    .filter((c) => c.currency !== balance.primaryCurrency)
                    .map((c) => (
                      <span key={c.currency} className={`dash-balance-chip is-${toneForNet(c.net_cents)}`}>
                        {signPrefix(c.net_cents)}{fmt(Math.abs(c.net_cents), c.currency)}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <span className="dash-stat-icon" aria-hidden>
              {balance.direction === 'owe' ? <StatIconOwe /> : <StatIconOwed />}
            </span>
          </div>
          <DashChevron open={openPanel} />
        </button>

        {/* Panel renders immediately after the card that opened it. */}
        {openPanel && (
          <BalancePanel groups={balance.groups} onClose={() => setOpenPanel(false)} />
        )}

        <button
          type="button"
          className="dash-card dash-stat dash-stat-btn dash-count is-groups is-clickable"
          onClick={() => nav('/groups')}
        >
          <div className="dash-card-top">
            <div>
              <div className="dash-kicker">{t('dashboard.activeGroups')}</div>
              {!data && !e && <Skeleton height={36} mt={8} radius="md" />}
              {data && <div className="dash-value">{activeGroups.length}</div>}
              <div className="dash-delta">
                {!data ? '…' : t('dashboard.settledOpen', { settled: activeSettled, open: activeGroups.length - activeSettled })}
              </div>
            </div>
            <span className="dash-stat-icon" aria-hidden><StatIconGroups /></span>
          </div>
          <span className="dash-chevron" aria-hidden><ChevronRight size={18} /></span>
        </button>

        <section className="dash-card dash-gauge">
          <div className="dash-kicker">{t('dashboard.settlement')}</div>
          <div className="dash-gauge-chart">
            <div
              className="ring-wrap"
              style={{
                background: `conic-gradient(var(--ss-ring-fill, #22c55e) ${settledPct * 3.6}deg, var(--ss-ring-track, #e7eeea) 0deg)`,
              }}
            >
              <div className="ring-hole">
                <Text className="ring-pct" fw={800} size="xl">{data ? `${settledPct}%` : '…'}</Text>
              </div>
            </div>
            <Text size="xs" c="dimmed" ta="center">{t('dashboard.settledGroupsRatio')}</Text>
          </div>
        </section>

        <HistoryCard groups={groups} ready={!!data && !e} />

        <section className="dash-card dash-groups" id="groups" style={{ scrollMarginTop: 72 }}>
          <Group justify="space-between" mb="sm" align="center">
            <div className="dash-kicker">{t('dashboard.groups')}</div>
            <button type="button" className="splits-view-all" onClick={() => nav('/groups')}>{t('common.viewAll')}</button>
          </Group>
          <div className="dash-groups-list">
            {!data && !e && (
              <Stack gap="sm" py={4}>
                <Skeleton height={48} radius="md" />
                <Skeleton height={48} radius="md" />
                <Skeleton height={48} radius="md" />
              </Stack>
            )}
            {data && groups.length === 0 && (
              <Stack align="center" gap="sm" py="md">
                <Text c="dimmed" ta="center">{t('dashboard.noGroups')}</Text>
                <Button variant="light" onClick={openWizard}>{t('dashboard.createGroup')}</Button>
              </Stack>
            )}
            {data && [...groups]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .slice(0, 5)
              .map((g) => {
                const tone = g.net_cents < 0 ? 'owe' : g.net_cents > 0 ? 'owed' : 'settled';
                const detail = tone === 'owe'
                  ? t('net.youOwe', { amount: fmt(-g.net_cents, g.currency) })
                  : tone === 'owed'
                    ? t('net.youAreOwed', { amount: fmt(g.net_cents, g.currency) })
                    : t('net.settledUp');
                return (
                  <Link
                    key={g.group_id}
                    to={`/groups/${g.group_id}`}
                    className="history-row"
                    aria-label={t('common.viewDetailsFor', { name: g.name })}
                  >
                    <span className="history-copy">
                      <span className="history-group">{g.name}</span>
                      <span className="history-text">{detail}</span>
                    </span>
                    <span className="history-when">{g.currency}</span>
                  </Link>
                );
              })}
          </div>
        </section>

        <section className="dash-banner">
          <div className="dash-banner-index">{data ? settledPct : '—'}</div>
          <div>
            <Text fw={800}>{t('dashboard.settleIndex')}</Text>
            <Text size="sm" c="teal.1" mt={4}>
              {groups.length === 0
                ? t('dashboard.settleHint')
                : settledCount === groups.length
                  ? t('dashboard.settleProgressAll', { total: groups.length })
                  : t('dashboard.settleProgress', { settled: settledCount, total: groups.length })}
            </Text>
          </div>
        </section>

        <section className="dash-promo">
          <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.06em', opacity: 0.8 }}>SplitShare</Text>
          <div>
            <Title order={3} c="white">{t('dashboard.promoTitle')}</Title>
            <Text size="sm" mt={4} c="teal.0">{t('dashboard.promoBody')}</Text>
          </div>
          <Button variant="white" color="dark" radius="xl" onClick={openWizard} leftSection={<NewGroupIcon />}>{t('dashboard.newGroup')}</Button>
        </section>
      </div>
      </>}

      {view === 'groups' && (
        <GroupsPage groups={groups} ready={!!data} error={e} onCreate={openWizard} nav={nav} />
      )}
      {view === 'activity' && (
        <ActivityFeed groups={data?.groups || []} ready={!!data} />
      )}

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        closeOnClickOutside={false}
        title={created
          ? <span className="wizard-sr">{t('wizard.groupCreated')}</span>
          : <span className="wizard-title-name">{t('wizard.newGroup')}</span>}
        classNames={{
          content: 'wizard-modal-content new-group-modal-content',
          header: created ? 'wizard-modal-header is-done' : 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={created ? 420 : 520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        {wizard}
        <Err e={e} />
      </Modal>

      <QuickAddExpense onCreateGroup={openWizardForExpense} />
    </Shell>
  );
}

function NewGroupIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const GROUP_STATUSES = ['opening', 'locked', 'closed'];

function GroupsPage({ groups, ready, error, onCreate, nav }) {
  const t = useT();
  const [statuses, setStatuses] = useState(['opening']);
  const statusOf = (g) => g.status || 'opening';
  const shown = groups.filter((g) => statuses.includes(statusOf(g)));
  const toggleStatus = (s) => setStatuses((cur) => (
    cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
  ));
  return (
    <>
      <div className="dash-head">
        <div>
          <Title order={2}>{t('groups.title')}</Title>
          <Text size="sm" c="dimmed">
            {ready ? t('groups.shownOf', { shown: shown.length, total: groups.length }) : '…'}
          </Text>
        </div>
        <Button className="dash-cta" onClick={onCreate} leftSection={<NewGroupIcon />}>{t('dashboard.newGroup')}</Button>
      </div>
      <Err e={error} />
      {ready && groups.length > 0 && (
        <div className="groups-filter" role="group" aria-label={t('groups.filterLabel')}>
          {GROUP_STATUSES.map((s) => {
            const on = statuses.includes(s);
            const count = groups.filter((g) => statusOf(g) === s).length;
            return (
              <button
                key={s}
                type="button"
                className={`groups-filter-chip is-${s}${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
              >
                <span className="groups-filter-dot" aria-hidden />
                {t(`groupStatus.${s}`)}
                <span className="groups-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {!ready && !error && (
        <div className="groups-board" aria-hidden>
          <Skeleton className="group-skel" radius={22} />
          <Skeleton className="group-skel" radius={22} />
          <Skeleton className="group-skel" radius={22} />
          <Skeleton className="group-skel" radius={22} />
        </div>
      )}
      {ready && groups.length === 0 && (
        <div className="groups-empty">
          <Text c="dimmed">{t('dashboard.noGroups')}</Text>
          <Button variant="light" onClick={onCreate}>{t('dashboard.createGroup')}</Button>
        </div>
      )}
      {ready && groups.length > 0 && shown.length === 0 && (
        <div className="groups-empty">
          <Text c="dimmed">{statuses.length === 0 ? t('groups.filterNone') : t('groups.filterEmpty')}</Text>
        </div>
      )}
      {ready && shown.length > 0 && (
        <div className="groups-board">
          {shown.map((g) => (
            <GroupTile key={g.group_id} group={g} onOpen={() => nav(`/groups/${g.group_id}`)} />
          ))}
        </div>
      )}
    </>
  );
}

/** True when the group still has open member balances (not personal net). */
function groupNeedsSettlement(group) {
  if (group?.needs_settlement != null) return !!group.needs_settlement;
  // Older API builds: oldest_unsettled_at is set iff any member net ≠ 0.
  if (group?.oldest_unsettled_at != null) return true;
  return false;
}

function GroupTile({ group, onOpen }) {
  const t = useT();
  const needsSettlement = groupNeedsSettlement(group);
  const tone = needsSettlement ? 'open' : 'settled';
  const label = needsSettlement
    ? t('settlement.statusOpen')
    : t('settlement.statusSettled');
  const personalTone = group.net_cents < 0 ? 'owe' : group.net_cents > 0 ? 'owed' : null;
  const personalLabel = personalTone === 'owe'
    ? t('net.youOwe', { amount: fmt(-group.net_cents, group.currency) })
    : personalTone === 'owed'
      ? t('net.youAreOwed', { amount: fmt(group.net_cents, group.currency) })
      : null;
  const cover = group.cover_url || group.background_url || group.cover || null;
  const pastel = pastelFor(group.name);
  const members = Number(group.member_count) || 0;
  const isOwner = group.my_role === 'owner';
  const lifecycle = group.status || 'opening';
  const spentCents = Number(group.spent_cents) || 0;
  return (
    <button
      type="button"
      className={`group-tile is-${tone}${cover ? ' has-cover' : ''}`}
      style={{
        '--gt-from': pastel.from,
        '--gt-to': pastel.to,
        ...(cover ? { '--gt-cover': `url(${JSON.stringify(cover)})` } : {}),
      }}
      aria-label={t('common.viewDetailsFor', { name: group.name })}
      onClick={onOpen}
    >
      <span className="group-hero">
        <span className="group-hero-bg" aria-hidden />
        <span className="group-hero-scrim" aria-hidden />
        <span className="group-hero-top">
          <span className="group-meta">
            {isOwner && <span className="group-owner">{t('common.owner')}</span>}
            <span className={`group-lifecycle is-${lifecycle}`}>{t(`groupStatus.${lifecycle}`)}</span>
            <span className="group-members">
              {t('groupDetail.membersCount', {
                count: members,
                unit: members === 1 ? t('common.person') : t('common.people'),
              })}
            </span>
            {group.delinquent && <span className="group-flag">30d+</span>}
          </span>
        </span>
        <span className="group-hero-copy">
          <span className="group-name">{group.name}</span>
          <span className={`net-chip is-${tone}`}>{label}</span>
          {personalLabel && (
            <span className={`group-personal is-${personalTone}`}>{personalLabel}</span>
          )}
        </span>
      </span>
      <span className="group-foot">
        <span className="group-balance">
          <span className="group-balance-currency">{t('groups.totalSpend')}</span>
          <span className="group-balance-value">{fmt(spentCents, group.currency)}</span>
        </span>
        <span className="group-go" aria-hidden>
          <ChevronRight size={16} label="" />
        </span>
      </span>
    </button>
  );
}

function HistoryCard({ groups, ready }) {
  const t = useT();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const key = groups.map((g) => g.group_id).join(',');
  useEffect(() => {
    if (!ready) return;
    if (groups.length === 0) { setItems([]); return; }
    let cancel = false;
    Promise.all(groups.map(async (g) => {
      try {
        const rows = await api.get(`/api/v1/groups/${g.group_id}/activity?limit=10`);
        return (rows || []).map((r) => ({ ...r, group_name: g.name, group_id: g.group_id }));
      } catch { return []; }
    })).then((lists) => {
      if (cancel) return;
      setItems(lists.flat().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5));
    });
    return () => { cancel = true; };
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="dash-card dash-history">
      <Group justify="space-between" mb="sm" align="center">
        <div className="dash-kicker">{t('dashboard.activity')}</div>
        <button type="button" className="splits-view-all" onClick={() => nav('/activity')}>{t('common.viewAll')}</button>
      </Group>
      <div className="dash-history-list activity-list">
        {!items && <Skeleton height={88} radius="md" />}
        {items && items.length === 0 && <Text size="sm" c="dimmed">{t('dashboard.noActivity')}</Text>}
        {items && items.map((a, i) => (
          <Link
            key={`${a.group_id}-${a.kind}-${a.at}-${i}`}
            to={`/groups/${a.group_id}`}
            className="activity-row"
          >
            <ActivityKindThumb kind={a.kind} />
            <span className="activity-copy">
              <span className="activity-text">{a.text}</span>
              <span className="activity-meta">{a.group_name} · {historyWhen(a.at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function historyWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ACTIVITY_PAGE_SIZE = 10;

function activityPageTokens(current, total) {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const marks = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => marks.add(n));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => marks.add(n));
  const nums = [...marks].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const tokens = [];
  for (let i = 0; i < nums.length; i += 1) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) tokens.push('…');
    tokens.push(nums[i]);
  }
  return tokens;
}

function ActivityFeed({ groups, ready }) {
  const t = useT();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const key = groups.map((g) => g.group_id).join(',');
  useEffect(() => {
    if (!ready) return;
    if (groups.length === 0) { setItems([]); setPage(1); return; }
    let cancel = false;
    Promise.all(groups.map(async (g) => {
      try {
        const rows = await api.get(`/api/v1/groups/${g.group_id}/activity?limit=50`);
        return (rows || []).map((r) => ({ ...r, group_name: g.name, group_id: g.group_id }));
      } catch { return []; }
    })).then((lists) => {
      if (cancel) return;
      setItems(lists.flat().sort((a, b) => new Date(b.at) - new Date(a.at)));
      setPage(1);
    });
    return () => { cancel = true; };
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * ACTIVITY_PAGE_SIZE + 1;
  const to = Math.min(safePage * ACTIVITY_PAGE_SIZE, total);
  const pageItems = (items || []).slice(
    (safePage - 1) * ACTIVITY_PAGE_SIZE,
    safePage * ACTIVITY_PAGE_SIZE,
  );

  return (
    <>
      <div className="dash-head">
        <div>
          <Title order={2}>{t('activity.title')}</Title>
          <Text size="sm" c="dimmed">
            {items && total > 0
              ? t('activity.updatesPage', { count: total, size: ACTIVITY_PAGE_SIZE })
              : t('activity.subtitle')}
          </Text>
        </div>
      </div>
      <div className="activity-panel">
        {!items && <Skeleton height={72} radius="md" />}
        {items && items.length === 0 && (
          <Text c="dimmed" p="sm">{t('activity.empty')}</Text>
        )}
        {items && items.length > 0 && (
          <>
            <div className="activity-pager" role="navigation" aria-label={t('activity.pages')}>
              <span className="activity-pager-range">{t('activity.range', { from, to, total })}</span>
              <div className="activity-pager-controls">
                <button
                  type="button"
                  className="activity-pager-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
                >
                  {t('common.prev')}
                </button>
                <button
                  type="button"
                  className="activity-pager-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, Math.max(1, p) + 1))}
                >
                  {t('common.next')}
                </button>
                <div className="activity-pager-pages">
                  {activityPageTokens(safePage, totalPages).map((token, i) => (
                    token === '…' ? (
                      <span key={`e-${i}`} className="activity-pager-ellipsis" aria-hidden>…</span>
                    ) : (
                      <button
                        key={token}
                        type="button"
                        className={`activity-pager-page${token === safePage ? ' is-active' : ''}`}
                        aria-current={token === safePage ? 'page' : undefined}
                        onClick={() => setPage(token)}
                      >
                        {token}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
            <div className="activity-list">
              {pageItems.map((a, i) => (
                <button
                  key={`${a.group_id}-${a.kind}-${a.at}-${i}`}
                  type="button"
                  className="activity-row"
                  onClick={() => nav(`/groups/${a.group_id}`, { state: { tab: 'activity' } })}
                >
                  <ActivityKindThumb kind={a.kind} />
                  <span className="activity-copy">
                    <span className="activity-text">{a.text}</span>
                    <span className="activity-meta">
                      {a.group_name} · {new Date(a.at).toLocaleString()}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function MoneyShimmer() {
  return (
    <span className="dash-money-loading" aria-label="Loading balance">
      <span className="dash-value-shimmer" />
      <span className="dash-delta-shimmer" />
    </span>
  );
}

function DashChevron({ open }) {
  return (
    <span className={`dash-chevron${open ? ' is-open' : ''}`} aria-hidden>
      <ChevronRight size={18} />
    </span>
  );
}

/**
 * My balance breakdown: one section per open group (from ./balance.js), each
 * listing the settlement optimizer's transfers that involve me. Amounts stay
 * in their group's currency and are never summed across groups here.
 */
function BalancePanel({ groups, onClose }) {
  const t = useT();
  const isEmpty = groups.length === 0;
  return (
    <section id="dash-breakdown" className="dash-card dash-breakdown" aria-live="polite">
      <div className="dash-breakdown-head">
        <div className="dash-kicker">{t('dashboard.balanceByGroup')}</div>
        <button type="button" className="dash-breakdown-close" onClick={onClose}>
          {t('dashboard.collapseBreakdown')}
        </button>
      </div>
      {isEmpty && <Text c="dimmed" size="sm">{t('net.allSettled')}</Text>}
      {!isEmpty && groups.map((g) => (
        <div key={g.group_id} className="dash-breakdown-section">
          <div className="dash-breakdown-group">
            <Link className="dash-group-link" to={`/groups/${g.group_id}`}>
              {g.name}
            </Link>
            <span className={`dash-breakdown-net is-${toneForNet(g.net_cents)}`}>
              {signPrefix(g.net_cents)}{fmt(Math.abs(g.net_cents), g.currency)}
            </span>
          </div>
          {g.transfers.map((x) => {
            const other = x.from_me ? x.to_name : x.from_name;
            return (
              <div key={`${x.from_user_id}-${x.to_user_id}`} className={`dash-person-row is-${x.from_me ? 'open' : 'owed'}`}>
                <span className="dash-person-avatar" style={{ background: pastelFor(other).from }} aria-hidden>
                  {initialsOf(other)}
                </span>
                <span className="dash-person-name">
                  {x.from_me
                    ? t('dashboard.transferPay', { name: other })
                    : t('dashboard.transferReceive', { name: other })}
                </span>
                <span className="dash-person-amount">{fmt(x.amount_cents, g.currency)}</span>
              </div>
            );
          })}
        </div>
      ))}
      {!isEmpty && <div className="dash-breakdown-note">{t('dashboard.optimizedNote')}</div>}
    </section>
  );
}

function GroupWizard({
  step, setStep,
  name, setName, tpl, setTpl, create, cq, setCq, searchContacts,
  searching, contacts, myContacts = [], picked, setPicked, emails, setEmails, creating, created, onOpenGroup,
  templates = [], forExpense = false,
}) {
  const t = useT();
  if (created) return <GroupCreated created={created} onOpenGroup={onOpenGroup} />;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 50;
  // Free-input combobox: suggestions are the localized "None" plus catalog labels.
  const templateOptions = [t('common.none'), ...templates.map((item) => item.label)];
  // Pre-picked people (quick-add) stay visible even when outside the top 20.
  const boxContacts = [
    ...picked.filter((p) => !myContacts.some((c) => c.user_id === p.user_id)),
    ...myContacts,
  ];

  const onSubmit = (ev) => {
    ev.preventDefault();
    if (step === 1) {
      if (nameOk) setStep(2);
      return;
    }
    if (!nameOk) return;
    create(ev);
  };

  return (
    <form className="wizard-form" onSubmit={onSubmit}>
      {step === 1 && (
        <div className="wizard-fields">
          <TextInput
            label={t('wizard.groupName')}
            placeholder={t('wizard.groupNamePh')}
            required
            maxLength={50}
            value={name}
            onChange={(x) => setName(x.target.value)}
          />
          <Autocomplete
            label={t('wizard.template')}
            placeholder={t('common.none')}
            value={tpl}
            onChange={setTpl}
            data={templateOptions}
            comboboxProps={{ withinPortal: true }}
          />
        </div>
      )}
      {step === 2 && (
        <div className="wizard-fields">
          <Textarea
            label={t('wizard.inviteByEmail')}
            placeholder={t('wizard.emailsPh')}
            minRows={2}
            value={emails}
            onChange={(x) => setEmails(x.target.value)}
          />
          <Group gap="xs" align="flex-end" wrap="nowrap" className="wizard-search-row">
            <TextInput
              label={t('wizard.searchContacts')}
              placeholder={t('wizard.searchPh')}
              value={cq}
              onChange={(x) => setCq(x.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button className="wizard-search" type="button" variant="default" onClick={searchContacts} loading={searching}>
              {t('common.search')}
            </Button>
          </Group>
          {contacts.length > 0 && (
            <Stack gap={8}>
              {contacts.map((c) => (
                <WizardPersonRow key={c.user_id} c={c} picked={picked} setPicked={setPicked} />
              ))}
            </Stack>
          )}
          <div className="wizard-contacts-box">
            <div className="wizard-contacts-title">{t('wizard.yourContacts')}</div>
            {boxContacts.length === 0 ? (
              <Text size="xs" c="dimmed">{t('wizard.noContacts')}</Text>
            ) : (
              <Stack gap={8}>
                {boxContacts.map((c) => (
                  <WizardPersonRow key={c.user_id} c={c} picked={picked} setPicked={setPicked} />
                ))}
              </Stack>
            )}
          </div>
        </div>
      )}
      {step === 1 ? (
        <Button className="wizard-primary" fullWidth type="submit" disabled={!nameOk}>{t('common.continue')}</Button>
      ) : (
        <Group gap="sm" grow className="wizard-actions">
          <Button className="wizard-back" type="button" onClick={() => setStep(1)} disabled={creating}>{t('common.back')}</Button>
          <Button className="wizard-primary" type="submit" loading={creating} disabled={!nameOk}>{forExpense ? t('common.next') : t('wizard.createGroup')}</Button>
        </Group>
      )}
    </form>
  );
}

/** Shared pick/unpick row used by the search results and the contacts box. */
function WizardPersonRow({ c, picked, setPicked }) {
  const t = useT();
  const on = picked.some((p) => p.user_id === c.user_id);
  return (
    <div className="wizard-person">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>{c.display_name}</Text>
        <Text size="xs" c="dimmed" truncate>@{c.username}</Text>
      </div>
      <button
        type="button"
        className={on ? 'wizard-chip is-on' : 'wizard-chip'}
        onClick={() => setPicked(on ? picked.filter((p) => p.user_id !== c.user_id) : [...picked, c])}
      >
        {on ? t('common.added') : t('common.add')}
      </button>
    </div>
  );
}

function GroupCreated({ created, onOpenGroup }) {
  const t = useT();
  return (
    <div className="wizard-success">
      <div className="wizard-happy" aria-hidden>
        <svg width="76" height="76" viewBox="0 0 76 76" fill="none">
          <circle cx="38" cy="38" r="38" fill="#e7f6ee" />
          <circle cx="38" cy="38" r="22" fill="#161618" />
          <circle cx="30" cy="35" r="2.2" fill="#fff" />
          <circle cx="46" cy="35" r="2.2" fill="#fff" />
          <path d="M29 43c2.4 3.4 5.2 5 9 5s6.6-1.6 9-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M58 16l2.2 4.4L65 22.6l-4.8 2.2L58 29.2l-2.2-4.4L51 22.6l4.8-2.2L58 16z" fill="#22c55e" />
        </svg>
      </div>
      <div className="wizard-success-card">
        <div className="wizard-done-name">{created.name}</div>
        <div className="wizard-success-pills">
          <span>{created.currency}</span>
          {created.template && <span>{created.template}</span>}
        </div>
        {created.people?.length > 0 && (
          <div className="wizard-success-people">{created.people.join(', ')}</div>
        )}
      </div>
      {created.link && (
        <CopyButton value={created.link}>
          {({ copied, copy }) => (
            <Button className="wizard-back" fullWidth onClick={copy}>{copied ? t('common.copied') : t('wizard.copyInviteLink')}</Button>
          )}
        </CopyButton>
      )}
      <Button className="wizard-primary" fullWidth onClick={onOpenGroup}>{t('wizard.openGroup')}</Button>
    </div>
  );
}

function StatIconOwe() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7v7m0 0l-3.2-3.2M12 14l3.2-3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatIconOwed() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 17V10m0 0l-3.2 3.2M12 10l3.2 3.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatIconGroups() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.75 18.25c.7-2.4 2.7-3.75 5.25-3.75s4.55 1.35 5.25 3.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M14.4 14.7c1.05-.55 2.3-.8 3.6-.55 1.7.35 2.95 1.45 3.5 3.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
