import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Button, CopyButton, Group, Modal, Select, Skeleton, Stack, Text,
  TextInput, Textarea, Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { ActivityKindThumb, ChevronRight, pastelFor } from '../components/Net.jsx';
import { getCurrencies, getTemplates, subscribeCatalogs } from '../settingsStore.js';

export function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [e, setE] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [cur, setCur] = useState('USD');
  const [tpl, setTpl] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState([]);
  const [emails, setEmails] = useState('');
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const [currencies, setCurrencies] = useState(() => getCurrencies());
  const [templates, setTemplates] = useState(() => getTemplates());
  const isMobile = useMediaQuery('(max-width: 36em)');

  const load = () => api.get('/api/v1/me/balances').then(setData).catch(setE);
  useEffect(() => { load(); }, []);
  useEffect(() => subscribeCatalogs(() => {
    setCurrencies(getCurrencies());
    setTemplates(getTemplates());
  }), []);

  const location = useLocation();
  const view = location.pathname === '/groups' ? 'groups'
    : location.pathname === '/activity' ? 'activity' : 'home';
  useEffect(() => {
    document.querySelector('.app-stage-scroll')?.scrollTo({ top: 0 });
  }, [view]);

  const openWizard = () => {
    const codes = getCurrencies().map((c) => c.code);
    setName('');
    setCur(codes.includes('USD') ? 'USD' : (codes[0] || 'USD'));
    setTpl(''); setCq(''); setContacts([]);
    setPicked([]); setEmails(''); setCreated(null); setE(null);
    setStep(1); setOpen(true);
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
      let g;
      let link = null;
      if (tpl) {
        g = await api.post('/api/v1/groups/from-template', { name, currency: cur, template: tpl });
        const gid0 = g.group_id ?? g.group?.id;
        if (!gid0) { setE({ message: 'Server did not return a group id.' }); return; }
        if (memberIds.length > 0) await api.post(`/api/v1/groups/${gid0}/members`, { user_ids: memberIds });
        if (emailList.length > 0) await api.post(`/api/v1/groups/${gid0}/invites`, { emails: emailList });
        try {
          const s = await api.post(`/api/v1/groups/${gid0}/share-link`, {});
          link = s.invite_link || s.link || null;
        } catch { link = null; }
      } else {
        g = await api.post('/api/v1/groups', {
          name, currency: cur, member_ids: memberIds, invite_emails: emailList,
        });
        link = g.invite_link || null;
      }
      const gid = g.group_id ?? g.group?.id; // create returns nested {group:{id}}
      if (!gid) {
        setE({ message: 'Server did not return a group id.' });
        return;
      }
      setCreated({
        gid,
        link,
        name: g.group?.name || name,
        currency: cur,
        template: templates.find((t) => t.key === tpl)?.label || '',
        people: [...picked.map((p) => p.display_name), ...emailList],
      });
      load();
    } catch (err) { setE(err); } finally { setCreating(false); }
  };

  const totals = data ? Object.entries(data.totals) : [];
  const groups = data?.groups || [];
  const settledCount = groups.filter((g) => g.net_cents === 0).length;
  const settledPct = groups.length ? Math.round((settledCount / groups.length) * 100) : 0;
  const topOwe = [...totals].sort((a, b) => b[1].owe_cents - a[1].owe_cents)[0];
  const topOwed = [...totals].sort((a, b) => b[1].owed_cents - a[1].owed_cents)[0];
  const oweBars = groups.filter((g) => g.net_cents < 0).slice(0, 6).map((g) => -g.net_cents);
  const owedBars = groups.filter((g) => g.net_cents > 0).slice(0, 6).map((g) => g.net_cents);

  const wizard = (
    <GroupWizard
      step={step} setStep={setStep}
      name={name} setName={setName} cur={cur} setCur={setCur}
      tpl={tpl} setTpl={setTpl} create={create} cq={cq} setCq={setCq} searchContacts={searchContacts}
      searching={searching} contacts={contacts} picked={picked} setPicked={setPicked}
      emails={emails} setEmails={setEmails} creating={creating} created={created}
      currencies={currencies}
      templates={templates}
      onOpenGroup={() => { setOpen(false); nav(`/groups/${created?.gid}`); }}
    />
  );

  return (
    <Shell>
      {view === 'home' && <>
      <div className="dash-head">
        <div>
          <Title order={2}>Dashboard</Title>
        </div>
        <Button className="dash-cta" onClick={openWizard} leftSection={<NewGroupIcon />}>New group</Button>
      </div>
      <Err e={e} />

      <div className="dash-grid">
        <section className="dash-card dash-stat dash-owe">
          <div className="dash-card-top">
            <div>
              <div className="dash-kicker">You owe</div>
              {!data && !e && <Skeleton height={36} mt={8} radius="md" />}
              {data && (
                <div className="dash-value">{topOwe && topOwe[1].owe_cents > 0 ? fmt(topOwe[1].owe_cents, topOwe[0]) : fmt(0, topOwe?.[0] || 'USD')}</div>
              )}
              <div className={`dash-delta ${topOwe && topOwe[1].owe_cents > 0 ? 'down' : 'up'}`}>
                {totals.length > 1 ? `${totals.length} currencies, shown separately` : (topOwe ? topOwe[0] : 'Nothing outstanding')}
              </div>
            </div>
            <Bars values={oweBars.length ? oweBars : [8, 14, 10, 18]} color="#fb7185" />
          </div>
        </section>

        <section className="dash-card dash-stat dash-owed">
          <div className="dash-card-top">
            <div>
              <div className="dash-kicker">Owed to you</div>
              {!data && !e && <Skeleton height={36} mt={8} radius="md" />}
              {data && (
                <div className="dash-value">{topOwed && topOwed[1].owed_cents > 0 ? fmt(topOwed[1].owed_cents, topOwed[0]) : fmt(0, topOwed?.[0] || 'USD')}</div>
              )}
              <div className="dash-delta up">
                {totals.length > 1 ? 'Never summed across currencies' : (topOwed ? topOwed[0] : 'All clear')}
              </div>
            </div>
            <Bars values={owedBars.length ? owedBars : [12, 18, 14, 22]} color="#34d399" />
          </div>
        </section>

        <section className="dash-card dash-stat dash-count">
          <div className="dash-card-top">
            <div>
              <div className="dash-kicker">Active groups</div>
              {!data && !e && <Skeleton height={36} mt={8} radius="md" />}
              {data && <div className="dash-value">{groups.length}</div>}
              <div className="dash-delta">{settledCount} settled · {groups.length - settledCount} open</div>
            </div>
            <Bars values={groups.slice(0, 6).map((g) => Math.abs(g.net_cents) || 4)} color="#6ee7b7" />
          </div>
        </section>

        <section className="dash-card dash-gauge">
          <div className="dash-kicker">Settlement</div>
          <div className="dash-gauge-chart">
            <div
              className="ring-wrap"
              style={{ background: `conic-gradient(#22c55e ${settledPct * 3.6}deg, #e7eeea 0deg)` }}
            >
              <div className="ring-hole">
                <Text fw={800} size="xl">{data ? `${settledPct}%` : '…'}</Text>
              </div>
            </div>
            <Text size="xs" c="dimmed" ta="center">Settled groups / all groups</Text>
          </div>
        </section>

        <HistoryCard groups={groups} ready={!!data && !e} />

        <section className="dash-card dash-groups" id="groups" style={{ scrollMarginTop: 72 }}>
          <Group justify="space-between" mb="sm" align="center">
            <div className="dash-kicker">Groups</div>
            <button type="button" className="splits-view-all" onClick={() => nav('/groups')}>View all</button>
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
                <Text c="dimmed" ta="center">No groups yet — create one to get started.</Text>
                <Button variant="light" onClick={openWizard}>Create a group</Button>
              </Stack>
            )}
            {data && [...groups]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .slice(0, 5)
              .map((g) => {
                const tone = g.net_cents < 0 ? 'owe' : g.net_cents > 0 ? 'owed' : 'settled';
                const detail = tone === 'owe'
                  ? `You owe ${fmt(-g.net_cents, g.currency)}`
                  : tone === 'owed'
                    ? `You're owed ${fmt(g.net_cents, g.currency)}`
                    : 'Settled up';
                return (
                  <Link
                    key={g.group_id}
                    to={`/groups/${g.group_id}`}
                    className="history-row"
                    aria-label={`View details for ${g.name}`}
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
            <Text fw={800}>Settle-up index</Text>
            <Text size="sm" c="teal.1" mt={4}>
              {groups.length === 0
                ? 'Create a group and add an expense to start splitting.'
                : `${settledCount} of ${groups.length} groups are settled. Open a group to pay the rest.`}
            </Text>
          </div>
        </section>

        <section className="dash-promo">
          <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.06em', opacity: 0.8 }}>SplitShare</Text>
          <div>
            <Title order={3} c="white">Start a group</Title>
            <Text size="sm" mt={4} c="teal.0">Invite people, split a receipt, and settle with the fewest transfers.</Text>
          </div>
          <Button variant="white" color="dark" radius="xl" onClick={openWizard} leftSection={<NewGroupIcon />}>New group</Button>
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
          ? <span className="wizard-sr">Group created</span>
          : <span className="wizard-title-name">New group</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: created ? 'wizard-modal-header is-done' : 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={created ? 420 : 520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
        fullScreen={isMobile && !created}
      >
        {wizard}
        <Err e={e} />
      </Modal>
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

function GroupsPage({ groups, ready, error, onCreate, nav }) {
  return (
    <>
      <div className="dash-head">
        <div>
          <Title order={2}>Groups</Title>
          <Text size="sm" c="dimmed">{ready ? `${groups.length} group${groups.length === 1 ? '' : 's'}` : '…'}</Text>
        </div>
        <Button className="dash-cta" onClick={onCreate} leftSection={<NewGroupIcon />}>New group</Button>
      </div>
      <Err e={error} />
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
          <Text c="dimmed">No groups yet — create one to get started.</Text>
          <Button variant="light" onClick={onCreate}>Create a group</Button>
        </div>
      )}
      {ready && groups.length > 0 && (
        <div className="groups-board">
          {groups.map((g) => (
            <GroupTile key={g.group_id} group={g} onOpen={() => nav(`/groups/${g.group_id}`)} />
          ))}
        </div>
      )}
    </>
  );
}

function GroupTile({ group, onOpen }) {
  const tone = group.net_cents < 0 ? 'owe' : group.net_cents > 0 ? 'owed' : 'settled';
  const label = tone === 'owe' ? 'You owe' : tone === 'owed' ? "You're owed" : 'All settled';
  const amount = tone === 'settled'
    ? '0.00'
    : (Math.abs(group.net_cents) / 100).toFixed(2);
  const cover = group.cover_url || group.background_url || group.cover || null;
  const pastel = pastelFor(group.name);
  const members = Number(group.member_count) || 0;
  const isOwner = group.my_role === 'owner';
  return (
    <button
      type="button"
      className={`group-tile is-${tone}${cover ? ' has-cover' : ''}`}
      style={{
        '--gt-from': pastel.from,
        '--gt-to': pastel.to,
        ...(cover ? { '--gt-cover': `url(${JSON.stringify(cover)})` } : {}),
      }}
      aria-label={`View details for ${group.name}`}
      onClick={onOpen}
    >
      <span className="group-hero">
        <span className="group-hero-bg" aria-hidden />
        <span className="group-hero-scrim" aria-hidden />
        <span className="group-hero-top">
          <span className="group-meta">
            {isOwner && <span className="group-owner">Owner</span>}
            <span className="group-members">
              {members} {members === 1 ? 'person' : 'people'}
            </span>
            <span className="group-currency">{group.currency}</span>
            {group.delinquent && <span className="group-flag">30d+</span>}
          </span>
        </span>
        <span className="group-hero-copy">
          <span className="group-name">{group.name}</span>
          <span className={`group-status is-${tone}`}>{label}</span>
        </span>
      </span>
      <span className="group-foot">
        <span className="group-balance">
          <span className="group-balance-currency">{group.currency}</span>
          <span className="group-balance-value">{amount}</span>
        </span>
        <span className="group-go" aria-hidden>
          <ChevronRight size={16} label="" />
        </span>
      </span>
    </button>
  );
}

function HistoryCard({ groups, ready }) {
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
        <div className="dash-kicker">Activity</div>
        <button type="button" className="splits-view-all" onClick={() => nav('/activity')}>View all</button>
      </Group>
      <div className="dash-history-list activity-list">
        {!items && <Skeleton height={88} radius="md" />}
        {items && items.length === 0 && <Text size="sm" c="dimmed">No activity yet.</Text>}
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
          <Title order={2}>Activity</Title>
          <Text size="sm" c="dimmed">
            {items
              ? (total === 0
                ? 'Latest updates across your groups'
                : `${total} update${total === 1 ? '' : 's'} · ${ACTIVITY_PAGE_SIZE} per page`)
              : 'Latest updates across your groups'}
          </Text>
        </div>
      </div>
      <div className="activity-panel">
        {!items && <Skeleton height={72} radius="md" />}
        {items && items.length === 0 && (
          <Text c="dimmed" p="sm">Nothing yet. Add an expense in a group to see it here.</Text>
        )}
        {items && items.length > 0 && (
          <>
            <div className="activity-pager" role="navigation" aria-label="Activity pages">
              <span className="activity-pager-range">{from}–{to} of {total}</span>
              <div className="activity-pager-controls">
                <button
                  type="button"
                  className="activity-pager-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="activity-pager-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, Math.max(1, p) + 1))}
                >
                  Next
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

function GroupWizard({
  step, setStep,
  name, setName, cur, setCur, tpl, setTpl, create, cq, setCq, searchContacts,
  searching, contacts, picked, setPicked, emails, setEmails, creating, created, onOpenGroup,
  currencies = [], templates = [],
}) {
  if (created) return <GroupCreated created={created} onOpenGroup={onOpenGroup} />;
  const nameOk = name.trim().length >= 3 && name.trim().length <= 50;
  const currencyList = currencies.length ? currencies : [{ code: 'USD', name: 'US Dollar' }];
  const templateOptions = templates.map((t) => ({ value: t.key, label: t.label }));

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
        <section className="wizard-section">
          <h3 className="wizard-section-title">Group details</h3>
          <TextInput
            label="Group name"
            placeholder="Trip to Alps"
            required
            maxLength={50}
            value={name}
            onChange={(x) => setName(x.target.value)}
          />
          <div className="wizard-field">
            <span className="wizard-label">Currency</span>
            <div className="wizard-chips" role="radiogroup" aria-label="Currency">
              {currencyList.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  className={cur === c.code ? 'wizard-chip is-on' : 'wizard-chip'}
                  aria-checked={cur === c.code}
                  onClick={() => setCur(c.code)}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Template"
            placeholder="None"
            clearable
            value={tpl || null}
            onChange={(v) => setTpl(v || '')}
            data={templateOptions}
            comboboxProps={{ withinPortal: true }}
          />
        </section>
      )}
      {step === 2 && (
        <section className="wizard-section">
          <h3 className="wizard-section-title">Invite member</h3>
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput label="Search contacts" placeholder="Name, username or email" value={cq} onChange={(x) => setCq(x.target.value)} style={{ flex: 1 }} />
            <Button className="wizard-search" type="button" variant="default" onClick={searchContacts} loading={searching}>Search</Button>
          </Group>
          {contacts.length > 0 && (
            <Stack gap={8}>
              {contacts.map((c) => {
                const on = picked.some((p) => p.user_id === c.user_id);
                return (
                  <div className="wizard-person" key={c.user_id}>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{c.display_name}</Text>
                      <Text size="xs" c="dimmed" truncate>@{c.username}</Text>
                    </div>
                    <button
                      type="button"
                      className={on ? 'wizard-chip is-on' : 'wizard-chip'}
                      onClick={() => setPicked(on ? picked.filter((p) => p.user_id !== c.user_id) : [...picked, c])}
                    >
                      {on ? 'Added' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </Stack>
          )}
          <Textarea label="Invite by email" placeholder="a@example.com, b@example.com" minRows={2} value={emails} onChange={(x) => setEmails(x.target.value)} />
        </section>
      )}
      {step === 1 ? (
        <Button className="wizard-primary" fullWidth type="submit" disabled={!nameOk}>Continue</Button>
      ) : (
        <Group gap="sm" grow>
          <Button className="wizard-back" type="button" onClick={() => setStep(1)} disabled={creating}>Back</Button>
          <Button className="wizard-primary" type="submit" loading={creating} disabled={!nameOk}>Create group</Button>
        </Group>
      )}
    </form>
  );
}

function GroupCreated({ created, onOpenGroup }) {
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
            <Button className="wizard-back" fullWidth onClick={copy}>{copied ? 'Copied' : 'Copy invite link'}</Button>
          )}
        </CopyButton>
      )}
      <Button className="wizard-primary" fullWidth onClick={onOpenGroup}>Open group</Button>
    </div>
  );
}

function Bars({ values, color }) {
  const nums = (values || []).filter((n) => n > 0);
  const src = nums.length ? nums : [6, 10, 8, 14];
  const max = Math.max(...src, 1);
  return (
    <div className="mini-bars" aria-hidden>
      {src.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(18, (v / max) * 100)}%`, background: color }} />
      ))}
    </div>
  );
}
