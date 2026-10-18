import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Badge, Box, Button, Card, Collapse, CopyButton, Group, Indicator, Loader,
  Menu, Modal, Progress, ScrollArea, SegmentedControl, Select, Skeleton, Stack, Table, Tabs, Text, Textarea, TextInput, Title,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api, apiBlob, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { ActivityKindThumb, Net, displayNameOf, initialsOf, pastelFor } from '../components/Net.jsx';
import { RowMenu } from '../components/Mobile.jsx';
import { SettlementBox } from '../components/SettlementBox.jsx';
import { ExpenseForm, PaymentForm } from '../components/Forms.jsx';
import { StatementPanel } from './Statement.jsx';
import { ReportPanel } from './Report.jsx';

// Mockup receipt thumbnails (docs/mobile-design.html screen 3): category →
// emoji tile so ledger cards scan like receipts. Pure presentation.
const CAT_TILE = {
  food: ['🍜', '#0ea5e9'],
  transport: ['🚕', '#8b5cf6'],
  stay: ['🏠', '#f59e0b'],
  activity: ['🎟', '#ec4899'],
  shopping: ['🛍', '#10b981'],
  health: ['💊', '#ef4444'],
  bills: ['💡', '#f59e0b'],
  other: ['🧾', '#0d9488'],
};
function tileFor(t) {
  if (t.kind === 'payment') return ['💸', '#0f172a'];
  const hit = CAT_TILE[t.category] || CAT_TILE.other;
  if (t.has_image) return ['🧾', hit[1]];
  return hit;
}

export function GroupDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [detail, setDetail] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [me, setMe] = useState(null);
  const [plan, setPlan] = useState(null);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [payer, setPayer] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCat, setFCat] = useState('');
  const [fMin, setFMin] = useState('');
  const [fMax, setFMax] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fSort, setFSort] = useState('newest');
  const [showF, setShowF] = useState(false);
  const activeFilters = [payer, fStatus, fCat, fMin, fMax, fFrom, fTo]
    .filter((v) => v !== '').length + (fSort === 'newest' ? 0 : 1);
  const [activity, setActivity] = useState([]);
  const [payHist, setPayHist] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [rules, setRules] = useState([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renName, setRenName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreset, setPayPreset] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTab, setInviteTab] = useState('email');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLinkLive, setInviteLinkLive] = useState('');
  const [rotateBusy, setRotateBusy] = useState(false);
  const [contactQ, setContactQ] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactBusy, setContactBusy] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const ledgerReq = useRef(0);
  const [e, setE] = useState(null);
  const isMobile = useMediaQuery('(max-width: 36em)');
  // Copy handoff from expense detail (task 4.1): opens the create form prefilled.
  const location = useLocation();
  const [copyFrom, setCopyFrom] = useState(() => location.state?.copyFrom ?? null);
  // Deep-link handoff from the mobile Activity tab: open on a given tab.
  const ALL_TABS = ['ledger', 'balances', 'statement', 'people', 'report', 'activity', 'recurring'];
  const [tab, setTab] = useState('ledger');
  useEffect(() => {
    let t = location.state?.tab;
    if (t === 'payments') t = 'activity';
    if (t && ALL_TABS.includes(t)) {
      setTab(t);
      if (t === 'activity') { loadActivityFeed(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  useEffect(() => {
    if (location.state?.copyFrom) {
      setCopyFrom(location.state.copyFrom);
      setShowExp(true);
      nav(location.pathname, { replace: true }); // consume: no stale copy on reload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

  const load = async () => {
    if (!validId) { setE({ message: 'Invalid group link.' }); return; }
    try {
      const [d, m, s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setDetail(d); setMe(m); setSummary(s); if (p) setPlan(p); setE(null);
    } catch (err) { setE(err); }
  };
  const loadLedger = async () => {
    if (!validId) return;
    const req = ++ledgerReq.current;
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ type, q, limit: '100' });
      if (payer) params.set('payer_id', payer);
      if (fStatus) params.set('status', fStatus);
      if (fCat) params.set('category', fCat);
      if (fMin !== '') params.set('min_amount', String(Math.round(Number(fMin) * 100)));
      if (fMax !== '') params.set('max_amount', String(Math.round(Number(fMax) * 100)));
      if (fFrom) params.set('from_date', new Date(`${fFrom}T00:00:00Z`).toISOString());
      if (fTo) params.set('to_date', new Date(`${fTo}T23:59:59Z`).toISOString());
      if (fSort === 'oldest') params.set('sort', 'created_at');
      const res = await api.get(`/api/v1/groups/${id}/ledger?${params.toString()}`);
      if (req === ledgerReq.current) setLedger(res);
    } catch (err) { setE(err); } finally {
      if (req === ledgerReq.current) setLedgerLoading(false);
    }
  };
  const loadActivity = async () => {
    setActivityLoading(true);
    try { setActivity(await api.get(`/api/v1/groups/${id}/activity?limit=50`)); }
    catch (err) { setE(err); } finally { setActivityLoading(false); }
  };
  const loadPayHist = async () => {
    try {
      const r = await api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`);
      setPayHist(r.items || []);
    } catch { /* keep prior */ }
  };
  const loadActivityFeed = async () => {
    setActivityPage(1);
    await Promise.all([loadActivity(), loadPayHist(), loadRules()]);
  };
  const loadRules = async () => {
    try { setRules(await api.get(`/api/v1/groups/${id}/recurring`)); }
    catch (err) { setE(err); }
  };
  const loadSummary = async () => {
    if (!validId) return;
    try {
      const [s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setSummary(s); if (p) setPlan(p);
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);
  // Mobile-simplify: debounced search replaces the Go button under sm.
  // Desktop keeps explicit Go (unchanged). Ledger GETs are idempotent;
  // the request counter in loadLedger drops stale responses.
  const qTimer = useRef(null);
  useEffect(() => {
    if (!isMobile) return;
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => { loadLedger(); }, 600);
    return () => { if (qTimer.current) clearTimeout(qTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const members = detail?.members || [];

  const remove = (uid, name) => {
    setRemoveTarget({ uid, name });
    setE(null);
    setRemoveOpen(true);
  };
  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/v1/groups/${id}/members/${removeTarget.uid}`);
      setRemoveOpen(false);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setRemoveOpen(false);
      setRemoveTarget(null);
      setE(err);
    } finally {
      setRemoveBusy(false);
    }
  };
  const leave = () => setLeaveOpen(true);
  const delGroup = () => setDeleteOpen(true);
  const confirmLeave = async () => {
    setLeaveBusy(true);
    try {
      await api.post(`/api/v1/groups/${id}/leave`, {});
      setLeaveOpen(false);
      nav('/');
    } catch (err) {
      setLeaveOpen(false);
      setE(err);
    } finally {
      setLeaveBusy(false);
    }
  };
  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.del(`/api/v1/groups/${id}`);
      setDeleteOpen(false);
      nav('/');
    } catch (err) {
      setDeleteOpen(false);
      setE(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  // Per-row copy / edit for expenses.
  const copyExpense = async (item) => {
    try {
      const d = await api.get(`/api/v1/expenses/${item.id}`);
      nav(`/groups/${id}`, { state: { copyFrom: d.expense } });
      setCopyFrom(d.expense);
      setShowExp(true);
    } catch (err) { setE(err); }
  };
  const editExpense = (item) => nav(`/groups/${id}/expenses/${item.id}`, { state: { openEdit: true } });

  const nudge = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/nudges`, { user_ids: [uid] });
      notifications.show({ title: `Nudged ${name}`, color: 'teal' });
      loadActivity();
    } catch (err) { setE(err); }
  };
  const reversePay = async (pid) => {
    try {
      await api.post(`/api/v1/payments/${pid}/reverse`, {});
      notifications.show({ title: 'Payment reversed', color: 'teal' });
      load(); loadLedger(); loadSummary(); loadActivityFeed();
    } catch (err) { setE(err); }
  };
  const setRole = async (uid, role) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}`, { role });
      notifications.show({ title: `Role → ${role}`, color: 'teal' });
      load();
    } catch (err) { setE(err); }
  };
  const setDeposit = async (uid, paid) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}/deposit`, { paid });
      load();
    } catch (err) { setE(err); }
  };
  const exportCsv = async () => {
    try {
      const r = await apiBlob(`/api/v1/groups/${id}/export.csv`);
      if (!r.ok) throw new Error(`export ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${detail?.name || 'group'}-export.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setE(err); }
  };
  const inviteByEmail = async (ev) => {
    ev.preventDefault();
    const list = inviteEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { setE({ message: 'Enter at least one email.' }); return; }
    setInviteBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      notifications.show({
        title: 'Invites sent',
        message: `added: ${(r.added || []).join(', ') || '—'} · pending: ${(r.pending || []).join(', ') || '—'}`,
        color: 'teal',
      });
      setInviteEmails('');
      setE(null);
      load();
    } catch (err) { setE(err); } finally { setInviteBusy(false); }
  };
  const searchContacts = async (ev) => {
    ev?.preventDefault?.();
    setContactBusy(true);
    try {
      setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(contactQ)}`));
      setE(null);
    } catch (err) { setE(err); } finally { setContactBusy(false); }
  };
  const addFromContact = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      notifications.show({ title: `${name} added`, color: 'teal' });
      setContacts((prev) => prev.filter((c) => c.user_id !== uid));
      load();
    } catch (err) { setE(err); }
  };
  const rotateInviteLink = async () => {
    setRotateBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      const next = r.invite_link || '';
      setInviteLinkLive(next);
      await load();
      notifications.show({
        title: 'Invite link rotated',
        message: 'The old link no longer works.',
        color: 'teal',
      });
      setE(null);
    } catch (err) { setE(err); } finally { setRotateBusy(false); }
  };
  const openInvite = (tab = 'email') => {
    setInviteTab(tab);
    setInviteLinkLive(detail?.invite_link || '');
    setInviteOpen(true);
  };
  const openRename = () => {
    setRenName(detail?.name || '');
    setRenameOpen(true);
  };
  const saveRename = async (ev) => {
    ev.preventDefault();
    const next = renName.trim();
    if (!next || next === detail?.name) { setRenameOpen(false); return; }
    setRenaming(true);
    try {
      await api.patch(`/api/v1/groups/${id}`, { name: next });
      setRenameOpen(false);
      await load();
      notifications.show({ title: 'Group renamed', color: 'teal' });
      setE(null);
    } catch (err) { setE(err); } finally { setRenaming(false); }
  };
  // Ledger totals over the loaded page.
  const totals = useMemo(() => {
    const items = ledger?.items || [];
    return {
      amount: items.reduce((a, t) => a + (t.amount_cents || 0), 0),
      mine: items.reduce((a, t) => a + (t.my_share_cents || 0), 0),
    };
  }, [ledger]);

  const payments = useMemo(
    () => (ledger?.items || []).filter((t) => t.kind === 'payment'),
    [ledger],
  );

  // Activity tab: transfers (actionable) + other updates, newest first.
  // Skip activity kind=payment to avoid duplicating payHist rows.
  const activityFeed = useMemo(() => {
    const payRows = (payHist.length > 0 ? payHist : payments).map((p) => ({
      key: `pay-${p.id}`,
      sortAt: p.created_at,
      kind: 'payment',
      payment: p,
    }));
    const actRows = (activity || [])
      .filter((a) => a.kind !== 'payment')
      .map((a, i) => ({
        key: `act-${a.kind}-${a.at}-${i}`,
        sortAt: a.at,
        kind: a.kind,
        activity: a,
      }));
    return [...payRows, ...actRows].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));
  }, [payHist, payments, activity]);

  const activityPageCount = Math.max(1, Math.ceil(activityFeed.length / ACTIVITY_PAGE_SIZE));
  const activityPageSafe = Math.min(activityPage, activityPageCount);
  const activitySlice = useMemo(() => {
    const start = (activityPageSafe - 1) * ACTIVITY_PAGE_SIZE;
    return activityFeed.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [activityFeed, activityPageSafe]);
  useEffect(() => {
    if (activityPage > activityPageCount) setActivityPage(activityPageCount);
  }, [activityPage, activityPageCount]);

  // Elegant balances: only debtors + who they transfer to (from settlement plan).
  const transfers = plan?.transfers || [];
  const byDebtor = useMemo(() => {
    const m = new Map();
    for (const t of transfers) {
      if (!m.has(t.from_user_id)) m.set(t.from_user_id, []);
      m.get(t.from_user_id).push(t);
    }
    return [...m.entries()];
  }, [transfers]);
  const debtors = useMemo(
    () => (summary || []).filter((x) => x.owe_cents > 0),
    [summary],
  );

  if (!detail) {
    return (
      <Shell>
        <Skeleton height={32} width="60%" radius="md" />
        <Stack gap="md" mt="md">
          <Skeleton height={52} radius="md" />
          <Skeleton height={180} radius="md" />
          <Skeleton height={120} radius="md" />
        </Stack>
        <Err e={e} />
      </Shell>
    );
  }

  const heroPastel = pastelFor(detail.name);

  return (
    <Shell>
      <div className="gd-chrome">
        <Anchor component={Link} to="/groups" size="sm" className="gd-back">← Groups</Anchor>
        <div
          className="gd-hero"
          style={{
            '--gt-from': heroPastel.from,
            '--gt-to': heroPastel.to,
          }}
        >
          <span className="gd-hero-bg" aria-hidden />
          <span className="gd-hero-scrim" aria-hidden />
          <div className="gd-hero-bar">
            <div className="gd-tags">
              {detail.my_role === 'owner' && <span className="gd-tag is-owner">Owner</span>}
              {detail.my_role === 'treasurer' && <span className="gd-tag">Treasurer</span>}
              <span className="gd-tag">
                {members.length} {members.length === 1 ? 'person' : 'people'}
              </span>
              <span className="gd-tag">{detail.currency}</span>
              {detail.mode && detail.mode !== 'shared' && (
                <span className="gd-tag">{detail.mode}</span>
              )}
            </div>
          </div>
          <div className="gd-hero-main">
            <div className="gd-title-row">
              <Title order={2} className="gd-title" truncate>{detail.name}</Title>
              {detail.my_role === 'owner' && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  title="Rename group"
                  aria-label="Rename group"
                  onClick={openRename}
                  className="gd-rename"
                >
                  ✎
                </ActionIcon>
              )}
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Invite link"
                aria-label="Invite link"
                onClick={() => setShareOpen(true)}
                className="gd-rename"
              >
                <GdActionIcon name="share" />
              </ActionIcon>
            </div>
            {me && (
              <div className="gd-net">
                <Net v={me.net_cents} c={detail.currency} />
              </div>
            )}
          </div>
          {detail.budget && (
            <div className="gd-budget">
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  Budget {fmt(detail.budget.spent_cents, detail.currency)} / {fmt(detail.budget.budget_cents, detail.currency)}
                  {' · '}
                  {detail.budget.over ? 'over' : detail.budget.alert ? 'near limit' : 'on track'}
                </Text>
                <Text size="xs" c="dimmed">{detail.budget.pct}%</Text>
              </Group>
              <Progress
                value={Math.min(100, detail.budget.pct)}
                color={detail.budget.over ? 'red' : detail.budget.alert ? 'orange' : 'teal'}
                size="sm"
                radius="xl"
                mt={4}
                aria-label={`Budget ${detail.budget.pct} percent`}
              />
            </div>
          )}
        </div>
        <Err e={e} />
      </div>

      <Stack gap="md" mt="md">
        <SettlementBox
          groupId={id}
          currency={detail.currency}
          members={members}
          onPay={(t) => { setPayPreset(t); setPayOpen(true); }}
        />

        {isMobile ? (
          <div className="sticky-bar gd-actions is-calm">
            <button type="button" className="gd-action-cta" onClick={() => setNewSheetOpen(true)}>
              <GdActionIcon name="plus" />
              <span>New expense / payment</span>
            </button>
            <div className="gd-action-quiet">
              <button type="button" className="gd-action-ghost" onClick={() => openInvite('email')}>
                <GdActionIcon name="invite" />
                <span>Invite</span>
              </button>
              <button type="button" className="gd-action-ghost" onClick={exportCsv}>
                <GdActionIcon name="export" />
                <span>Export CSV</span>
              </button>
            </div>
            <details className="gd-action-danger">
              <summary>Group settings ···</summary>
              <div className="gd-action-danger-opts">
                <button type="button" onClick={leave}>
                  <GdActionIcon name="leave" />
                  <span>Leave group</span>
                </button>
                {detail.my_role === 'owner' && (
                  <button type="button" onClick={delGroup}>
                    <GdActionIcon name="trash" />
                    <span>Delete group</span>
                    <span className="gd-action-owner">owner</span>
                  </button>
                )}
              </div>
            </details>
          </div>
        ) : (
          <div className="sticky-bar gd-actions">
            <button type="button" className="gd-action-btn" onClick={() => { setPayPreset(null); setPayOpen(true); }}>
              <GdActionIcon name="pay" />
              <span>Record payment</span>
            </button>
            <button
              type="button"
              className="gd-action-btn"
              onClick={() => setShowExp(true)}
            >
              <GdActionIcon name="expense" />
              <span>Expense</span>
            </button>
            <button type="button" className="gd-action-btn" onClick={exportCsv}>
              <GdActionIcon name="export" />
              <span>Export CSV</span>
            </button>
            <button type="button" className="gd-action-btn" onClick={() => openInvite('email')}>
              <GdActionIcon name="invite" />
              <span>Invite</span>
            </button>
            <button type="button" className="gd-action-btn is-danger" onClick={leave}>
              <GdActionIcon name="leave" />
              <span>Leave</span>
            </button>
            {detail.my_role === 'owner' && (
              <button type="button" className="gd-action-btn is-danger" onClick={delGroup}>
                <GdActionIcon name="trash" />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}
        <div className="sticky-spacer" />

        <Card withBorder shadow="sm" padding="md" radius="md" className="gd-tabs">
          <Tabs value={tab} onChange={(v) => {
            let nv = v ?? 'ledger';
            if (nv === 'payments') nv = 'activity';
            setTab(nv);
            if (nv === 'activity') loadActivityFeed();
            if (nv === 'recurring' && rules.length === 0) loadRules();
          }}>
          <div className="tab-rail">
          <Tabs.List mb="sm">
              <Tabs.Tab value="ledger">Expenses</Tabs.Tab>
              <Tabs.Tab value="balances">Balances</Tabs.Tab>
              <Tabs.Tab value="statement">Statement</Tabs.Tab>
              <Tabs.Tab value="people">People({members.length})</Tabs.Tab>
              <Tabs.Tab value="report">Report</Tabs.Tab>
              <Tabs.Tab value="activity">Activity</Tabs.Tab>
              <Tabs.Tab value="recurring">Recurring</Tabs.Tab>
          </Tabs.List>
          </div>

            <Tabs.Panel value="report">
              <ReportPanel
                groupId={id}
                detail={detail}
                summary={summary}
                embedded
              />
            </Tabs.Panel>

            <Tabs.Panel value="statement">
              <StatementPanel
                groupId={id}
                members={members}
                currency={detail.currency}
                embedded
              />
            </Tabs.Panel>

            <Tabs.Panel value="ledger">
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={600}>Expenses</Text>
            <Group gap="xs">
              {ledgerLoading && <Loader size="sm" />}
              {ledger && <Text size="sm" c="dimmed">{ledger.total} total</Text>}
            </Group>
          </Group>
          <Box visibleFrom="sm">
          <form onSubmit={(ev) => { ev.preventDefault(); loadLedger(); }}>
            <Group gap="xs" mb="sm">
              <SegmentedControl
                size="xs"
                value={type}
                onChange={setType}
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'expense', label: 'Expenses' },
                  { value: 'payment', label: 'Payments' },
                ]}
              />
              <Select
                size="xs"
                placeholder="Filter by payer / party"
                clearable
                value={payer}
                onChange={(v) => setPayer(v || '')}
                data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
                style={{ minWidth: 170 }}
              />
              <TextInput
                size="xs"
                placeholder="Search item or payer"
                value={q}
                onChange={(x) => setQ(x.target.value)}
                style={{ flex: 1 }}
              />
              <Button size="xs" variant="default" onClick={loadLedger} loading={ledgerLoading}>Go</Button>
            </Group>
            <Group gap="xs" mb="sm">
              <Select size="xs" placeholder="Status" clearable value={fStatus} onChange={(v) => setFStatus(v || '')} data={['OPEN', 'LOCKED']} style={{ width: 110 }} />
              <Select size="xs" placeholder="Category" clearable value={fCat} onChange={(v) => setFCat(v || '')}
                data={['food', 'transport', 'stay', 'activity', 'shopping', 'health', 'bills', 'other']} style={{ width: 130 }} />
              <TextInput size="xs" placeholder="Min $" inputMode="decimal" value={fMin} onChange={(x) => setFMin(x.target.value)} style={{ width: 80 }} />
              <TextInput size="xs" placeholder="Max $" inputMode="decimal" value={fMax} onChange={(x) => setFMax(x.target.value)} style={{ width: 80 }} />
              <TextInput size="xs" type="date" value={fFrom} onChange={(x) => setFFrom(x.target.value)} style={{ width: 135 }} />
              <TextInput size="xs" type="date" value={fTo} onChange={(x) => setFTo(x.target.value)} style={{ width: 135 }} />
              <Select size="xs" value={fSort} onChange={setFSort} data={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }]} style={{ width: 100 }} />
            </Group>
          </form>
          </Box>
          <Box hiddenFrom="sm">
            <Group gap="xs" mb="sm" wrap="nowrap">
              <TextInput
                size="sm"
                placeholder="Search expenses…"
                value={q}
                onChange={(x) => setQ(x.target.value)}
                style={{ flex: 1 }}
                aria-label="Search expenses"
              />
              <Indicator label={activeFilters > 0 ? activeFilters : ''} disabled={activeFilters === 0} size={16}>
                <ActionIcon
                  size="lg"
                  variant="default"
                  onClick={() => setShowF(!showF)}
                  title="Filters"
                  aria-label={`Filters${activeFilters > 0 ? `, ${activeFilters} active` : ''}`}
                  aria-expanded={showF}
                >
                  ⧩
                </ActionIcon>
              </Indicator>
            </Group>
            <Collapse in={showF}>
              <Stack gap="xs" mb="sm">
                <SegmentedControl
                  size="xs"
                  value={type}
                  onChange={setType}
                  data={[
                    { value: 'all', label: 'All' },
                    { value: 'expense', label: 'Expenses' },
                    { value: 'payment', label: 'Payments' },
                  ]}
                />
                <Select size="sm" label="Payer / party" placeholder="Anyone" clearable value={payer} onChange={(v) => setPayer(v || '')}
                  data={members.map((m) => ({ value: m.user_id, label: m.display_name }))} />
                <Group gap="xs" grow>
                  <Select size="sm" label="Status" placeholder="Any" clearable value={fStatus} onChange={(v) => setFStatus(v || '')} data={['OPEN', 'LOCKED']} />
                  <Select size="sm" label="Category" placeholder="Any" clearable value={fCat} onChange={(v) => setFCat(v || '')}
                    data={['food', 'transport', 'stay', 'activity', 'shopping', 'health', 'bills', 'other']} />
                </Group>
                <Group gap="xs" grow>
                  <TextInput size="sm" label="Min $" inputMode="decimal" value={fMin} onChange={(x) => setFMin(x.target.value)} />
                  <TextInput size="sm" label="Max $" inputMode="decimal" value={fMax} onChange={(x) => setFMax(x.target.value)} />
                </Group>
                <Group gap="xs" grow>
                  <TextInput size="sm" label="From" type="date" value={fFrom} onChange={(x) => setFFrom(x.target.value)} />
                  <TextInput size="sm" label="To" type="date" value={fTo} onChange={(x) => setFTo(x.target.value)} />
                </Group>
                <Select size="sm" label="Sort" value={fSort} onChange={setFSort} data={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }]} />
                <Button size="sm" onClick={() => { setShowF(false); loadLedger(); }} loading={ledgerLoading}>Apply filters</Button>
              </Stack>
            </Collapse>
          </Box>
          <Box hiddenFrom="sm">
            <Stack gap="xs">
              {(ledger?.items || []).map((t) => (
                <Card key={t.id} withBorder radius="md" padding="sm" className="tap-card"
                  tabIndex={t.kind === 'expense' ? 0 : undefined}
                  role={t.kind === 'expense' ? 'link' : undefined}
                  aria-label={t.kind === 'expense' ? `Open ${t.title}` : undefined}
                  onClick={t.kind === 'expense' ? () => nav(`/groups/${id}/expenses/${t.id}`) : undefined}
                  onKeyDown={t.kind === 'expense' ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nav(`/groups/${id}/expenses/${t.id}`); }
                  } : undefined}
                >
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Avatar radius="md" size="md" style={{ background: tileFor(t)[1], flex: 'none' }}>
                      {tileFor(t)[0]}
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {t.title}
                        {t.has_image && <Text span size="sm"> 🧾</Text>}
                        {t.reversed && <Text span size="xs" c="dimmed"> (reversed)</Text>}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {t.kind === 'expense'
                          ? (t.payer_name || displayNameOf(members, t.payer_id))
                          : `${t.from_name || t.from_user_id?.slice(0, 8)} → ${t.to_name || t.to_user_id?.slice(0, 8)}`}
                      </Text>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <Text size="sm" fw={600}>{fmt(t.amount_cents, detail.currency)}</Text>
                      <Text size="xs" c="dimmed">my share {t.my_share_cents != null ? fmt(t.my_share_cents, detail.currency) : '—'}</Text>
                    </div>
                  </Group>
                  <Group justify="space-between" mt={4}>
                    <Badge size="sm" color={t.status === 'LOCKED' ? 'gray' : 'teal'} variant="light">
                      {t.status}
                    </Badge>
                    {t.kind === 'expense' && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon size="sm" variant="subtle" title="Copy expense" aria-label={`Copy ${t.title}`} onClick={(ev) => { ev.stopPropagation(); copyExpense(t); }}>⧉</ActionIcon>
                        <ActionIcon size="sm" variant="subtle" title="Edit expense" aria-label={`Edit ${t.title}`} onClick={(ev) => { ev.stopPropagation(); editExpense(t); }}>✎</ActionIcon>
                      </Group>
                    )}
                  </Group>
                </Card>
              ))}
              {(ledger?.items || []).length > 0 && (
                <Card withBorder radius="md" padding="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>Total ({ledger.items.length})</Text>
                    <Text size="sm" fw={600}>{fmt(totals.amount, detail.currency)} · mine {fmt(totals.mine, detail.currency)}</Text>
                  </Group>
                </Card>
              )}
            </Stack>
          </Box>
          <Box visibleFrom="sm">
          <ScrollArea>
          <Table striped highlightOnHover withTableBorder miw={640}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Payer / Parties</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>My share</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ledger?.items.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>
                    {t.kind === 'expense' ? (
                      <Anchor component={Link} to={`/groups/${id}/expenses/${t.id}`}>{t.title}</Anchor>
                    ) : (
                      t.title
                    )}
                    {t.has_image && <Text span size="sm"> 🧾</Text>}
                    {t.reversed && <Text span size="xs" c="dimmed"> (reversed)</Text>}
                  </Table.Td>
                  <Table.Td>
                    {t.kind === 'expense'
                      ? (t.payer_name || displayNameOf(members, t.payer_id))
                      : `${t.from_name || t.from_user_id?.slice(0, 8)} → ${t.to_name || t.to_user_id?.slice(0, 8)}`}
                  </Table.Td>
                  <Table.Td>{fmt(t.amount_cents, detail.currency)}</Table.Td>
                  <Table.Td>{t.my_share_cents != null ? fmt(t.my_share_cents, detail.currency) : '—'}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={t.status === 'LOCKED' ? 'gray' : 'teal'} variant="light">
                      {t.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {t.kind === 'expense' && (
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon size="sm" variant="subtle" title="Copy expense" aria-label={`Copy ${t.title}`} onClick={() => copyExpense(t)}>⧉</ActionIcon>
                        <ActionIcon size="sm" variant="subtle" title="Edit expense" aria-label={`Edit ${t.title}`} onClick={() => editExpense(t)}>✎</ActionIcon>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td><Text size="sm" fw={600}>Total ({ledger?.items.length || 0} rows)</Text></Table.Td>
                <Table.Td />
                <Table.Td><Text size="sm" fw={600}>{fmt(totals.amount, detail.currency)}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={600}>{fmt(totals.mine, detail.currency)}</Text></Table.Td>
                <Table.Td />
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
          </ScrollArea>
          </Box>
            </Tabs.Panel>

            <Tabs.Panel value="balances">
              <Text size="sm" fw={600} mb="sm">Who owes</Text>
              {debtors.length === 0 && transfers.length === 0 && (
                <Text c="dimmed" size="sm">All settled — nobody owes anything.</Text>
              )}
              <Stack gap="sm">
                {byDebtor.map(([from, list]) => (
                  <Card key={from} withBorder radius="md" padding="sm">
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="gray" radius="xl" size="sm">{initialsOf(displayNameOf(members, from))}</Avatar>
                      <div style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>{displayNameOf(members, from)} owes</Text>
                          <Anchor size="xs" c="dimmed" onClick={() => nudge(from, displayNameOf(members, from))}>Nudge</Anchor>
                        </Group>
                        {list.map((t, i) => (
                          <Group key={i} gap="xs" mt={2}>
                            <Text size="sm">
                              → {displayNameOf(members, t.to_user_id)} <b>{fmt(t.amount_cents, detail.currency)}</b>
                            </Text>
                            <Button size="xs" variant="light" onClick={() => { setPayPreset(t); setPayOpen(true); }}>Pay</Button>
                          </Group>
                        ))}
                      </div>
                    </Group>
                  </Card>
                ))}
                {byDebtor.length === 0 && debtors.map((m) => (
                  <Card key={m.user_id} withBorder radius="md" padding="sm">
                    <Group gap="xs">
                      <Text size="sm"><b>{m.display_name}</b> owes <b>{fmt(m.owe_cents, detail.currency)}</b></Text>
                      <Anchor size="xs" c="dimmed" onClick={() => nudge(m.user_id, m.display_name)}>Nudge</Anchor>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="activity">
              <Group justify="space-between" mb="sm" wrap="wrap">
                <div>
                  <Text size="sm" fw={600}>Activity</Text>
                  <Text size="xs" c="dimmed">Transfers & updates · newest first</Text>
                </div>
                <Button size="xs" variant="subtle" onClick={loadActivityFeed} loading={activityLoading}>Refresh</Button>
              </Group>
              {activityLoading && activityFeed.length === 0 && (
                <Stack gap="xs"><Skeleton height={52} radius="md" /><Skeleton height={52} radius="md" /></Stack>
              )}
              {!activityLoading && activityFeed.length === 0 && (
                <Text size="sm" c="dimmed">Nothing yet — record a payment or expense to see it here.</Text>
              )}
              {activityFeed.length > 0 && (
                <div className="activity-list">
                  {activityFeed.length > ACTIVITY_PAGE_SIZE && (
                    <div className="activity-pager">
                      <span className="activity-pager-range">
                        {(activityPageSafe - 1) * ACTIVITY_PAGE_SIZE + 1}–
                        {Math.min(activityPageSafe * ACTIVITY_PAGE_SIZE, activityFeed.length)} of {activityFeed.length}
                      </span>
                      <div className="activity-pager-controls">
                        <button
                          type="button"
                          className="activity-pager-btn"
                          disabled={activityPageSafe <= 1}
                          onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                        >
                          Prev
                        </button>
                        <div className="activity-pager-pages">
                          {Array.from({ length: activityPageCount }, (_, i) => i + 1)
                            .filter((n) => n === 1 || n === activityPageCount || Math.abs(n - activityPageSafe) <= 1)
                            .reduce((acc, n, idx, arr) => {
                              if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…');
                              acc.push(n);
                              return acc;
                            }, [])
                            .map((n, i) => (
                              n === '…' ? (
                                <span key={`e${i}`} className="activity-pager-ellipsis">…</span>
                              ) : (
                                <button
                                  key={n}
                                  type="button"
                                  className={`activity-pager-page${n === activityPageSafe ? ' is-active' : ''}`}
                                  onClick={() => setActivityPage(n)}
                                >
                                  {n}
                                </button>
                              )
                            ))}
                        </div>
                        <button
                          type="button"
                          className="activity-pager-btn"
                          disabled={activityPageSafe >= activityPageCount}
                          onClick={() => setActivityPage((p) => Math.min(activityPageCount, p + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                  {activitySlice.map((row) => {
                    if (row.payment) {
                      const p = row.payment;
                      const from = p.from_name || (p.from_user_id ? displayNameOf(members, p.from_user_id) : 'Someone');
                      const to = p.to_name || (p.to_user_id ? displayNameOf(members, p.to_user_id) : 'Someone');
                      const title = `${from} → ${to}`;
                      const meta = [
                        fmt(p.amount_cents, detail.currency),
                        new Date(p.created_at).toLocaleString(),
                        p.reversed ? 'reversed' : null,
                        p.status && p.status !== 'OPEN' ? p.status.toLowerCase() : null,
                      ].filter(Boolean).join(' · ');
                      return (
                        <div key={row.key} className={`activity-row is-static${p.reversed ? ' is-reversed' : ''}`}>
                          <ActivityKindThumb kind="payment" />
                          <span className="activity-copy">
                            <span className="activity-text">{title}</span>
                            <span className="activity-meta">{meta}</span>
                          </span>
                          {!p.reversed && String(p.status).toUpperCase() === 'OPEN' && (
                            isMobile ? (
                              <RowMenu label={`Actions for transfer ${fmt(p.amount_cents, detail.currency)}`}>
                                <Menu.Item onClick={() => reversePay(p.id)}>Reverse</Menu.Item>
                              </RowMenu>
                            ) : (
                              <Button size="xs" variant="subtle" onClick={() => reversePay(p.id)}>Reverse</Button>
                            )
                          )}
                        </div>
                      );
                    }
                    const a = row.activity;
                    return (
                      <div key={row.key} className="activity-row is-static">
                        <ActivityKindThumb kind={a.kind} />
                        <span className="activity-copy">
                          <span className="activity-text">{a.text}</span>
                          <span className="activity-meta">{new Date(a.at).toLocaleString()}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="recurring">
              <Group justify="space-between" mb="sm">
                <Text size="sm" fw={600}>Recurring bills</Text>
                <Button size="xs" variant="subtle" onClick={loadRules}>Refresh</Button>
              </Group>
              <RecurringForm groupId={id} members={members} onDone={loadRules} />
              <Stack gap="xs" mt="sm">
                {rules.map((r) => (
                  <Card key={r.rule_id} withBorder radius="md" padding="sm">
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Text size="sm" fw={600}>{r.title} <Text span c="dimmed">· {r.frequency} · next {new Date(r.next_run_at).toLocaleDateString()}</Text></Text>
                        <Text size="xs" c="dimmed">{fmt(r.amount_cents, detail.currency)} · {r.active ? 'active' : 'paused'}</Text>
                      </div>
                      <Group gap="xs">
                        <Button size="xs" variant="subtle" onClick={async () => { await api.patch(`/api/v1/groups/${id}/recurring/${r.rule_id}`, { active: !r.active }); loadRules(); }}>
                          {r.active ? 'Pause' : 'Resume'}
                        </Button>
                        <Button size="xs" variant="subtle" color="red" onClick={async () => { await api.del(`/api/v1/groups/${id}/recurring/${r.rule_id}`); loadRules(); }}>Delete</Button>
                      </Group>
                    </Group>
                  </Card>
                ))}
                {rules.length === 0 && <Text size="sm" c="dimmed">No rules — add rent, wifi, subscriptions.</Text>}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="people">
              <div className="gd-people">
                {members.map((m) => {
                  const pastel = pastelFor(m.display_name || m.username);
                  const roleLabel = m.role === 'owner' ? 'Owner' : m.role === 'treasurer' ? 'Treasurer' : 'Member';
                  const roleClass = m.role === 'owner' ? 'is-owner' : m.role === 'treasurer' ? 'is-treasurer' : 'is-member';
                  const canAct = detail.mode === 'event' || detail.my_role === 'owner';
                  return (
                    <div key={m.user_id} className="gd-person">
                      <span
                        className="gd-person-avatar"
                        style={{ '--gt-from': pastel.from, '--gt-to': pastel.to }}
                        aria-hidden
                      >
                        {initialsOf(m.display_name)}
                      </span>
                      <div className="gd-person-body">
                        <div className="gd-person-top">
                          <Text className="gd-person-name" truncate>{m.display_name}</Text>
                          <span className={`gd-person-tag ${roleClass}`}>{roleLabel}</span>
                          {detail.mode === 'event' && (
                            <span className={`gd-person-tag ${m.deposit_paid ? 'is-deposit' : 'is-deposit-due'}`}>
                              {m.deposit_paid ? 'Deposit paid' : 'Deposit due'}
                            </span>
                          )}
                        </div>
                        <Text className="gd-person-handle" truncate>@{m.username}</Text>
                      </div>
                      {canAct && (
                        <div className="gd-person-actions">
                          {detail.mode === 'event' && (
                            <Tooltip
                              label={m.deposit_paid ? 'Unmark deposit' : 'Mark deposit paid'}
                              withArrow
                              openDelay={200}
                            >
                              <button
                                type="button"
                                className={`gd-person-action${m.deposit_paid ? ' is-on' : ''}`}
                                aria-label={m.deposit_paid ? 'Unmark deposit' : 'Mark deposit paid'}
                                onClick={() => setDeposit(m.user_id, !m.deposit_paid)}
                              >
                                <GdActionIcon name={m.deposit_paid ? 'deposit-on' : 'deposit'} />
                              </button>
                            </Tooltip>
                          )}
                          {detail.my_role === 'owner' && m.role !== 'owner' && (
                            <Tooltip
                              label={m.role === 'treasurer' ? 'Remove treasurer' : 'Make treasurer'}
                              withArrow
                              openDelay={200}
                            >
                              <button
                                type="button"
                                className={`gd-person-action${m.role === 'treasurer' ? ' is-on' : ''}`}
                                aria-label={m.role === 'treasurer' ? 'Remove treasurer' : 'Make treasurer'}
                                onClick={() => setRole(m.user_id, m.role === 'treasurer' ? 'member' : 'treasurer')}
                              >
                                <GdActionIcon name="treasurer" />
                              </button>
                            </Tooltip>
                          )}
                          {detail.my_role === 'owner' && m.role !== 'owner' && (
                            <Tooltip label="Remove" withArrow openDelay={200}>
                              <button
                                type="button"
                                className="gd-person-action is-danger"
                                aria-label={`Remove ${m.display_name}`}
                                onClick={() => remove(m.user_id, m.display_name)}
                              >
                                <GdActionIcon name="trash" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>

      <Modal
        opened={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        title="+ New"
        centered={!isMobile}
        fullScreen={false}
        size="sm"
        styles={isMobile ? { content: { marginTop: 'auto', marginBottom: 0, borderRadius: '16px 16px 0 0' } } : undefined}
      >
        <Stack gap="sm">
          <Button
            size="md"
            fullWidth
            onClick={() => { setNewSheetOpen(false); setShowExp(true); }}
          >
            🧾&nbsp; New expense
          </Button>
          <Button
            size="md"
            fullWidth
            variant="light"
            onClick={() => { setNewSheetOpen(false); setPayPreset(null); setPayOpen(true); }}
          >
            💸&nbsp; Record payment
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={showExp}
        onClose={() => { setShowExp(false); setCopyFrom(null); }}
        closeOnClickOutside={false}
        title={(
          <span className="wizard-title-name">
            {copyFrom ? 'Copy expense' : 'New expense'}
          </span>
        )}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={560}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
        fullScreen={isMobile}
      >
        <ExpenseForm
          groupId={id}
          members={members}
          copyFrom={copyFrom}
          currency={detail.currency}
          onDone={() => { setShowExp(false); setCopyFrom(null); load(); loadLedger(); loadSummary(); }}
        />
      </Modal>

      <Modal
        opened={payOpen}
        onClose={() => setPayOpen(false)}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">Record payment</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
        fullScreen={isMobile}
      >
        <PaymentForm
          groupId={id}
          members={members}
          preset={payPreset}
          onDone={(r) => {
            setPayOpen(false);
            setPayPreset(null);
            load();
            loadLedger();
            loadSummary();
            loadActivityFeed();
            notifications.show({
              title: r.fully_settled ? 'Fully settled' : 'Payment recorded',
              color: 'teal',
            });
          }}
        />
      </Modal>

      <Modal
        opened={shareOpen}
        onClose={() => setShareOpen(false)}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">Invite link</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={480}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
        fullScreen={isMobile}
      >
        <div className="wizard-form confirm-dialog">
          {detail.invite_link ? (
            <>
              <Text className="confirm-dialog-text">
                Anyone with this link can join the group.
              </Text>
              <TextInput readOnly value={detail.invite_link} />
              <CopyButton value={detail.invite_link}>
                {({ copied, copy }) => (
                  <Button className="wizard-primary" fullWidth onClick={copy}>
                    {copied ? 'Link copied' : 'Copy invite link'}
                  </Button>
                )}
              </CopyButton>
            </>
          ) : (
            <Text className="confirm-dialog-text">
              Only the owner or treasurer can share an invite link.
            </Text>
          )}
        </div>
      </Modal>

      <Modal
        opened={removeOpen}
        onClose={() => !removeBusy && setRemoveOpen(false)}
        closeOnClickOutside={!removeBusy}
        title={<span className="wizard-title-name">Remove member</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={420}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form confirm-dialog">
          <Text className="confirm-dialog-text">
            Remove <b>{removeTarget?.name}</b>? Blocked while they hold a balance. History is kept.
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setRemoveOpen(false)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button className="wizard-primary is-danger" loading={removeBusy} onClick={confirmRemove}>
              Remove
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>

      <Modal
        opened={leaveOpen}
        onClose={() => !leaveBusy && setLeaveOpen(false)}
        closeOnClickOutside={!leaveBusy}
        title={<span className="wizard-title-name">Leave group</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={420}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form confirm-dialog">
          <Text className="confirm-dialog-text">
            Leave <b>{detail?.name}</b>? You’ll lose access until someone invites you again.
            Blocked while you hold a balance.
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setLeaveOpen(false)} disabled={leaveBusy}>
              Cancel
            </Button>
            <Button className="wizard-primary is-danger" loading={leaveBusy} onClick={confirmLeave}>
              Leave
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>

      <Modal
        opened={deleteOpen}
        onClose={() => !deleteBusy && setDeleteOpen(false)}
        closeOnClickOutside={!deleteBusy}
        title={<span className="wizard-title-name">Delete group</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={420}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form confirm-dialog">
          <Text className="confirm-dialog-text">
            Delete <b>{detail?.name}</b>? This can’t be undone. Only possible when there are no
            expenses or everything is fully settled.
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button className="wizard-primary is-danger" loading={deleteBusy} onClick={confirmDelete}>
              Delete
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>

      <Modal
        opened={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteEmails('');
          setContactQ('');
          setContacts([]);
          setE(null);
        }}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">Invite</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
        fullScreen={isMobile}
      >
        <div className="wizard-form">
          <Tabs
            value={inviteTab}
            onChange={(v) => setInviteTab(v || 'email')}
            className="invite-tabs"
          >
            <Tabs.List grow>
              <Tabs.Tab value="email">By email</Tabs.Tab>
              <Tabs.Tab value="contacts">From contacts</Tabs.Tab>
              <Tabs.Tab value="link">Invite link</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="email">
              <form className="wizard-form" onSubmit={inviteByEmail}>
                <div>
                  <Textarea
                    placeholder="a@example.com, b@example.com"
                    minRows={4}
                    value={inviteEmails}
                    onChange={(x) => setInviteEmails(x.target.value)}
                    aria-label="Emails"
                  />
                  <Text size="xs" c="dimmed" mt={6}>
                    Separate with commas, spaces or new lines
                  </Text>
                </div>
                <Button className="wizard-primary" fullWidth type="submit" loading={inviteBusy}>
                  Send invites
                </Button>
              </form>
            </Tabs.Panel>

            <Tabs.Panel value="contacts">
              <form className="wizard-form" onSubmit={searchContacts}>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label="Search contacts"
                    placeholder="Name, username or email"
                    value={contactQ}
                    onChange={(x) => setContactQ(x.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button className="wizard-search" type="submit" variant="default" loading={contactBusy}>
                    Search
                  </Button>
                </Group>
                <Stack gap={8}>
                  {contacts.map((c) => (
                    <div className="wizard-person" key={c.user_id}>
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                        <span
                          className="gd-person-avatar"
                          style={{
                            '--gt-from': pastelFor(c.display_name).from,
                            '--gt-to': pastelFor(c.display_name).to,
                            width: 36,
                            height: 36,
                            fontSize: 11,
                          }}
                          aria-hidden
                        >
                          {initialsOf(c.display_name)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>{c.display_name}</Text>
                          <Text size="xs" c="dimmed" truncate>@{c.username}</Text>
                        </div>
                      </Group>
                      <button
                        type="button"
                        className="wizard-chip"
                        onClick={() => addFromContact(c.user_id, c.display_name)}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                  {!contactBusy && contacts.length === 0 && contactQ.trim() !== '' && (
                    <Text size="sm" c="dimmed">No contacts matched.</Text>
                  )}
                  {!contactBusy && contacts.length === 0 && contactQ.trim() === '' && (
                    <Text size="sm" c="dimmed">Search your contacts to add them.</Text>
                  )}
                </Stack>
              </form>
            </Tabs.Panel>

            <Tabs.Panel value="link">
              <div className="wizard-form">
                {inviteLinkLive || detail.invite_link ? (
                  <>
                    <Text className="confirm-dialog-text" style={{ padding: 0 }}>
                      Anyone with this link can join the group. Rotating creates a new link and the old one stops working.
                    </Text>
                    <Group gap="xs" align="flex-end" wrap="nowrap">
                      <TextInput
                        readOnly
                        value={inviteLinkLive || detail.invite_link}
                        style={{ flex: 1 }}
                        aria-label="Invite link"
                      />
                      {detail.my_role === 'owner' && (
                        <Button
                          className="wizard-search"
                          variant="default"
                          loading={rotateBusy}
                          onClick={rotateInviteLink}
                        >
                          Rotate
                        </Button>
                      )}
                    </Group>
                    <CopyButton value={inviteLinkLive || detail.invite_link}>
                      {({ copied, copy }) => (
                        <Button className="wizard-primary" fullWidth onClick={copy}>
                          {copied ? 'Link copied' : 'Copy invite link'}
                        </Button>
                      )}
                    </CopyButton>
                  </>
                ) : (
                  <Text className="confirm-dialog-text" style={{ padding: 0 }}>
                    Only the owner or treasurer can share an invite link.
                  </Text>
                )}
              </div>
            </Tabs.Panel>
          </Tabs>
          <Err e={e} />
        </div>
      </Modal>

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title="Rename group" centered size="sm">
        <form onSubmit={saveRename}>
          <Stack gap="sm">
            <TextInput
              label="Group name"
              required
              autoFocus
              value={renName}
              onChange={(x) => setRenName(x.target.value)}
              data-autofocus
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button type="submit" loading={renaming}>Save</Button>
            </Group>
            <Err e={e} />
          </Stack>
        </form>
      </Modal>

    </Shell>
  );
}

function GdActionIcon({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'pay') {
    return (
      <svg {...common}>
        <path d="M4 9h16M4 15h16M7 9V7.8A1.8 1.8 0 0 1 8.8 6h6.4A1.8 1.8 0 0 1 17 7.8V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="3" y="9" width="18" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === 'expense') {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 3.5h12A2.5 2.5 0 0 1 20.5 6v14.2l-2.8-1.6-2.7 1.6-2.8-1.6-2.7 1.6-2.8-1.6-2.7 1.6V6A2.5 2.5 0 0 1 6 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'export') {
    return (
      <svg {...common}>
        <path d="M12 4v10M8.5 8.5 12 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'invite') {
    return (
      <svg {...common}>
        <path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 14.5c3.2.2 5.5 1.6 5.5 4v1H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.5 12.5v6M5.5 15.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'leave') {
    return (
      <svg {...common}>
        <path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 8l4 4-4 4M9.5 12H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'trash') {
    return (
      <svg {...common} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16" stroke="currentColor" strokeWidth="1.75" />
        <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" stroke="currentColor" strokeWidth="1.75" />
        <path d="M6.5 7v11.2A1.8 1.8 0 0 0 8.3 20h7.4a1.8 1.8 0 0 0 1.8-1.8V7" stroke="currentColor" strokeWidth="1.75" />
        <path d="M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (name === 'deposit' || name === 'deposit-on') {
    return (
      <svg {...common}>
        <rect x="3.25" y="6.25" width="17.5" height="11.5" rx="2.75" stroke="currentColor" strokeWidth="1.75" />
        <path d="M3.25 10h17.5" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="16.25" cy="14" r="1.15" fill="currentColor" />
        {name === 'deposit-on' && (
          <path d="M7.75 14.1 9.35 15.6 12.5 12.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }
  if (name === 'treasurer') {
    return (
      <svg {...common}>
        <path d="M12 4.2 13.85 9l5.15.4-3.95 3.25 1.25 5.05L12 15.1 7.7 17.7l1.25-5.05L5 9.4 10.15 9 12 4.2Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'share') {
    return (
      <svg {...common} width={14} height={14}>
        <circle cx="18" cy="5" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="18" cy="19" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.2 10.9 15.8 6.2M8.2 13.1 15.8 17.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'copy') {
    return (
      <svg {...common} width={14} height={14}>
        <rect x="8" y="8" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'close') {
    return (
      <svg {...common}>
        <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RecurringForm({ groupId, members, onDone }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(members[0]?.user_id || '');
  const [freq, setFreq] = useState('monthly');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/v1/groups/${groupId}/recurring`, {
        title, amount: Number(amount), split_type: 'EQUAL', payer_id: payer,
        participant_ids: members.map((m) => m.user_id), frequency: freq,
      });
      setTitle(''); setAmount('');
      onDone();
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go}>
      <Group gap="xs" align="flex-end">
        <TextInput label="Title" required placeholder="Rent" value={title} onChange={(x) => setTitle(x.target.value)} style={{ flex: 2 }} />
        <TextInput label="Amount" required inputMode="decimal" value={amount} onChange={(x) => setAmount(x.target.value)} style={{ flex: 1 }} />
        <Select label="Payer" value={payer} onChange={setPayer} data={members.map((m) => ({ value: m.user_id, label: m.display_name }))} style={{ flex: 2 }} />
        <Select label="Every" value={freq} onChange={setFreq} data={['weekly', 'monthly']} style={{ width: 110 }} />
        <Button type="submit" loading={busy}>Add</Button>
      </Group>
      <Err e={e} />
    </form>
  );
}
