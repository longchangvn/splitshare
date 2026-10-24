import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Box, Button, Card, Collapse, CopyButton, Group, Indicator, Loader,
  Menu, Modal, Progress, SegmentedControl, Select, Skeleton, Stack, Tabs, Text, Textarea, TextInput, Title,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { ActivityKindThumb, displayNameOf, initialsOf, pastelFor } from '../components/Net.jsx';
import { RowMenu } from '../components/Mobile.jsx';
import { ExpenseForm, PaymentForm } from '../components/Forms.jsx';
import { ScanReceipts } from '../components/ScanReceipts.jsx';
import { AddExpenseFab } from '../components/QuickAddExpense.jsx';
import { categoryLabel, categoryLabelForKey, categorySelectData } from '../categories.js';
import { StatementPanel } from './Statement.jsx';
import { ReportPanel } from './Report.jsx';
import { useT } from '../prefs.jsx';

// Temporarily disabled: batch "Scan receipts" stays visible but cannot be used. Set to true to restore.
const SCAN_RECEIPTS_ENABLED = false;

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

export function formatGroupCreatedAt(createdAt, label, locale) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${label} · ${date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export function GroupDetail() {
  const t = useT();
  const { user } = useAuth();
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
  // Archive view: default scope is active (OPEN) entries; LOCKED = Archived.
  const [fStatus, setFStatus] = useState('OPEN');
  const [fCat, setFCat] = useState('');
  const [fMin, setFMin] = useState('');
  const [fMax, setFMax] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fSort, setFSort] = useState('newest');
  const [showF, setShowF] = useState(false);
  const activeFilters = [payer, fCat, fMin, fMax, fFrom, fTo]
    .filter((v) => v !== '').length + (fStatus && fStatus !== 'OPEN' ? 1 : 0) + (fSort === 'newest' ? 0 : 1);
  const [activity, setActivity] = useState([]);
  const [payHist, setPayHist] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catBusy, setCatBusy] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryTarget, setCategoryTarget] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renName, setRenName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [expFormKey, setExpFormKey] = useState(0); // bump to reset the form after "Save & new"
  const [scanOpen, setScanOpen] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editExisting, setEditExisting] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payPreset, setPayPreset] = useState(null);
  // Bumped after each recorded payment so Report/SettlementBox re-fetch their
  // own settlement plan + completed-payments copies.
  const [settleTick, setSettleTick] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [pendingGroupStatus, setPendingGroupStatus] = useState(null);
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
  const [activityLoading, setActivityLoading] = useState(false);
  const ledgerReq = useRef(0);
  const [e, setE] = useState(null);
  const isMobile = useMediaQuery('(max-width: 36em)');
  // Copy handoff from expense detail (task 4.1): opens the create form prefilled.
  const location = useLocation();
  const [copyFrom, setCopyFrom] = useState(() => location.state?.copyFrom ?? null);
  // Deep-link handoff from the mobile Activity tab: open on a given tab.
  const ALL_TABS = ['ledger', 'balances', 'statement', 'people', 'activity', 'recurring'];
  const [tab, setTab] = useState('ledger');
  useEffect(() => {
    let t = location.state?.tab;
    if (t === 'payments') t = 'activity';
    if (t === 'report') {
      setTimeout(() => {
        document.getElementById('group-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
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
    } else if (location.state?.addExpense) {
      // Quick "Add expense" handoff from the dashboard FAB.
      setShowExp(true);
      nav(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

  const loadCategories = async () => {
    if (!validId) return;
    try {
      const rows = await api.get(`/api/v1/groups/${id}/categories`);
      const list = Array.isArray(rows) ? rows : [];
      setCategories(list);
    } catch (err) { setE(err); }
  };
  const load = async () => {
    if (!validId) { setE({ message: t('errors.invalidGroupLink') }); return; }
    try {
      const [d, m, s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`),
        api.get(`/api/v1/groups/${id}/summary`),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setDetail(d); setMe(m); setSummary(s); setPlan(p); setE(null);
      loadCategories();
    } catch (err) { setE(err); }
  };
  const loadLedger = async (statusOverride) => {
    if (!validId) return;
    const req = ++ledgerReq.current;
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({ type, q, limit: '100' });
      if (payer) params.set('payer_id', payer);
      // Archive view: scope is always explicit (default OPEN). An override string
      // lets the "view archive" empty-state action reload without stale state.
      const st = typeof statusOverride === 'string' ? statusOverride : fStatus;
      if (st) params.set('status', st);
      if (fCat) params.set('category', fCat);
      if (fMin !== '') params.set('min_amount', String(Math.round(Number(fMin) * 100)));
      if (fMax !== '') params.set('max_amount', String(Math.round(Number(fMax) * 100)));
      if (fFrom) params.set('from_date', new Date(`${fFrom}T00:00:00Z`).toISOString());
      if (fTo) params.set('to_date', new Date(`${fTo}T23:59:59Z`).toISOString());
      if (fSort === 'oldest') params.set('sort', 'created_at');
      const res = await api.get(`/api/v1/groups/${id}/ledger?${params.toString()}`);
      const items = res?.items || [];
      // Older API builds omit ledger.category — fill from expense detail when missing.
      const missing = items.filter((it) => it.kind === 'expense' && !it.category);
      if (missing.length > 0) {
        const pairs = await Promise.all(missing.map(async (it) => {
          try {
            const d = await api.get(`/api/v1/expenses/${it.id}`);
            return [it.id, d?.expense?.category || null];
          } catch {
            return [it.id, null];
          }
        }));
        const byId = Object.fromEntries(pairs);
        res.items = items.map((it) => (
          byId[it.id] ? { ...it, category: byId[it.id] } : it
        ));
      }
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
      setSummary(s); setPlan(p);
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadLedger(); }, [id, type]);
  // Batch receipt scanning is offered only when the API has an OCR provider wired.
  useEffect(() => {
    if (!SCAN_RECEIPTS_ENABLED) return undefined;
    let cancelled = false;
    api.get('/api/v1/capabilities')
      .then((c) => { if (!cancelled) setOcrEnabled(!!c?.ocr_enabled); })
      .catch(() => { if (!cancelled) setOcrEnabled(false); });
    return () => { cancelled = true; };
  }, []);
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
  const groupLifecycle = detail?.status || 'opening';
  const canWriteGroup = groupLifecycle === 'opening'
    || (groupLifecycle === 'locked' && detail?.my_role === 'owner');
  const showScan = !SCAN_RECEIPTS_ENABLED || ocrEnabled;
  const scanDisabled = !SCAN_RECEIPTS_ENABLED || !canWriteGroup;
  const scanTitle = SCAN_RECEIPTS_ENABLED ? undefined : t('scan.unavailable');
  const lifecycleLabel = t(`groupStatus.${groupLifecycle}`);
  const groupCreatedSubtitle = formatGroupCreatedAt(detail?.created_at, t('report.createdOn'));

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

  // Creator, owner, or treasurer can edit OPEN expenses (matches API GuardAsync).
  const canEditExpense = (item) => {
    if (!item || item.kind !== 'expense') return false;
    if (!canWriteGroup) return false;
    if (String(item.status || '').toUpperCase() === 'LOCKED') return false;
    const role = detail?.my_role;
    if (role === 'owner' || role === 'treasurer') return true;
    const me = user?.user_id;
    return !!(me && item.created_by && item.created_by === me);
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
  const editExpense = async (item) => {
    if (!canEditExpense(item) || editBusy) return;
    setEditBusy(true);
    setE(null);
    try {
      const d = await api.get(`/api/v1/expenses/${item.id}`);
      setEditExisting(d.expense);
      setEditOpen(true);
    } catch (err) { setE(err); }
    finally { setEditBusy(false); }
  };
  const closeEdit = () => { setEditOpen(false); setEditExisting(null); };

  const nudge = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/nudges`, { user_ids: [uid] });
      notifications.show({ title: t('groupDetail.nudged', { name }), color: 'teal' });
      loadActivity();
    } catch (err) { setE(err); }
  };
  const reversePay = async (pid) => {
    try {
      await api.post(`/api/v1/payments/${pid}/reverse`, {});
      notifications.show({ title: t('groupDetail.paymentReversed'), color: 'teal' });
      load(); loadLedger(); loadSummary(); loadActivityFeed();
    } catch (err) { setE(err); }
  };
  const setRole = async (uid, role) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}`, { role });
      notifications.show({ title: t('groupDetail.roleUpdated', { role }), color: 'teal' });
      load();
    } catch (err) { setE(err); }
  };
  const setDeposit = async (uid, paid) => {
    try {
      await api.patch(`/api/v1/groups/${id}/members/${uid}/deposit`, { paid });
      load();
    } catch (err) { setE(err); }
  };
  const openAddCategory = () => {
    setCategoryTarget(null);
    setCategoryName('');
    setE(null);
    setCategoryModalOpen(true);
  };
  const openEditCategory = (category) => {
    setCategoryTarget(category);
    setCategoryName(category.name);
    setE(null);
    setCategoryModalOpen(true);
  };
  const saveCategory = async (ev) => {
    ev.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setCatBusy(true);
    setE(null);
    try {
      if (categoryTarget) {
        await api.patch(`/api/v1/groups/${id}/categories/${categoryTarget.category_id}`, { name });
      } else {
        await api.post(`/api/v1/groups/${id}/categories`, { name });
      }
      await loadCategories();
      setCategoryModalOpen(false);
      notifications.show({ message: t(categoryTarget ? 'groupDetail.categorySaved' : 'groupDetail.categoryAdded'), color: 'teal' });
    } catch (err) { setE(err); } finally { setCatBusy(false); }
  };
  const confirmDeleteCategory = async () => {
    if (!categoryDeleteTarget) return;
    setCatBusy(true);
    setE(null);
    try {
      await api.del(`/api/v1/groups/${id}/categories/${categoryDeleteTarget.category_id}`);
      await loadCategories();
      setCategoryDeleteTarget(null);
      notifications.show({ message: t('groupDetail.categoryDeleted'), color: 'teal' });
    } catch (err) { setE(err); } finally { setCatBusy(false); }
  };
  const exportPdf = () => {
    const prev = document.title;
    if (detail?.name) document.title = t('report.docTitle', { name: detail.name });
    document.getElementById('group-report-print')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      window.print();
      document.title = prev;
    }, 180);
  };
  const inviteByEmail = async (ev) => {
    ev.preventDefault();
    const list = inviteEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { setE({ message: t('errors.needEmail') }); return; }
    setInviteBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      notifications.show({
        title: t('invite.sent'),
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
      notifications.show({ title: t('invite.memberAdded', { name }), color: 'teal' });
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
        title: t('invite.rotated'),
        message: t('invite.rotatedHint'),
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
      notifications.show({ title: t('groupDetail.groupRenamed'), color: 'teal' });
      setE(null);
    } catch (err) { setE(err); } finally { setRenaming(false); }
  };
  const requestGroupStatusChange = (next) => {
    if (!next || next === groupLifecycle) return;
    setPendingGroupStatus(next);
    setStatusConfirmOpen(true);
    setE(null);
  };
  const updateGroupStatus = async () => {
    const next = pendingGroupStatus;
    if (!next || next === groupLifecycle) return;
    setStatusBusy(true);
    setE(null);
    try {
      await api.patch(`/api/v1/groups/${id}/status`, { status: next });
      await load();
      setStatusConfirmOpen(false);
      setPendingGroupStatus(null);
      notifications.show({ message: t('groupStatus.updated'), color: 'teal' });
    } catch (err) { setE(err); } finally { setStatusBusy(false); }
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

  // Activity tab: transfers (actionable) + other updates, {t('groupDetail.newestFirst')}.
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
  // Group-level settlement status (not personal net).
  const groupSettled = useMemo(() => {
    if (plan) return (plan.transfers || []).length === 0;
    if (summary) return summary.every((m) => (m.net_cents || 0) === 0);
    return null;
  }, [plan, summary]);
  const groupStatusTone = groupSettled == null ? null : groupSettled ? 'settled' : 'open';
  const groupStatusLabel = groupSettled == null
    ? null
    : groupSettled
      ? t('settlement.statusSettled')
      : t('settlement.statusOpen');
  const groupStatusHint = groupSettled == null
    ? undefined
    : groupSettled
      ? t('settlement.statusSettledHint')
      : t('settlement.statusOpenHint', {
        n: transfers.length || debtors.length || 0,
        saved: plan?.explanation?.saved ?? '—',
      });

  // Archive empty state: active scope has no entries.
  const ledgerItems = ledger?.items || [];
  const ledgerEmpty = !!ledger && !ledgerLoading && ledgerItems.length === 0;
  const hasLedgerHistory = (summary || []).some(
    (m) => (m.total_paid_cents || 0) > 0 || (m.total_share_cents || 0) > 0,
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
        <Anchor component={Link} to="/groups" size="sm" className="gd-back no-print">{t('common.backToGroups')}</Anchor>
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
              {detail.my_role === 'owner' && <span className="gd-tag is-owner">{t('common.owner')}</span>}
              {detail.my_role === 'treasurer' && <span className="gd-tag">{t('common.treasurer')}</span>}
              <span className="gd-tag">
                {t('groupDetail.membersCount', {
                  count: members.length,
                  unit: members.length === 1 ? t('common.person') : t('common.people'),
                })}
              </span>
              <span className="gd-tag">{detail.currency}</span>
              {detail.mode && detail.mode !== 'shared' && (
                <span className="gd-tag">{detail.mode}</span>
              )}
            </div>
          </div>
          <div className="gd-hero-main">
            <div className="gd-title-row">
              <Title order={2} className="gd-title" lineClamp={1}>{detail.name}</Title>
              {detail.my_role === 'owner' && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  title={t('groupDetail.rename')}
                  aria-label={t('groupDetail.rename')}
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
                title={t('groupDetail.inviteLink')}
                aria-label={t('groupDetail.inviteLink')}
                onClick={() => setShareOpen(true)}
                className="gd-rename"
              >
                <GdActionIcon name="share" />
              </ActionIcon>
            </div>
            {groupCreatedSubtitle && <Text className="gd-created-subtitle" size="xs">{groupCreatedSubtitle}</Text>}
            <div className="gd-net">
              {groupStatusTone && (
                <span className={`net-chip is-${groupStatusTone}`} title={groupStatusHint}>
                  {groupStatusLabel}
                </span>
              )}
              <span className={`gd-lifecycle is-${groupLifecycle}`}>{lifecycleLabel}</span>
              {plan?.version != null && (
                <span className="gd-settle-ver">
                  {t('report.settlementVer', { version: plan.version })}
                </span>
              )}
            </div>
          </div>
          {detail.my_role === 'owner' && (
            <div className="gd-lifecycle-control">
              <div className="gd-lifecycle-picker">
                <Select
                  aria-label={t('groupStatus.label')}
                  classNames={{ option: 'group-status-option' }}
                  data={[
                    { value: 'opening', label: t('groupStatus.opening') },
                    { value: 'locked', label: t('groupStatus.locked') },
                    { value: 'closed', label: t('groupStatus.closed') },
                  ]}
                  value={groupLifecycle}
                  onChange={requestGroupStatusChange}
                  disabled={statusBusy}
                  size="sm"
                  allowDeselect={false}
                  withCheckIcon={false}
                />
              </div>
            </div>
          )}
          {detail.budget && (
            <div className="gd-budget">
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  Budget {fmt(detail.budget.spent_cents, detail.currency)} / {fmt(detail.budget.budget_cents, detail.currency)}
                  {' · '}
                  {detail.budget.over
                    ? t('groupDetail.budgetOver')
                    : detail.budget.alert
                      ? t('groupDetail.budgetNear')
                      : t('groupDetail.budgetOnTrack')}
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

      <Stack gap="xl" mt="md">
        {isMobile ? (
          <div className="sticky-bar gd-actions is-calm">
            <div className="gd-action-direct">
              <button type="button" className="gd-action-cta" onClick={() => setShowExp(true)} disabled={!canWriteGroup}>
                <GdActionIcon name="expense" />
                <span>{t('groupDetail.addExpense')}</span>
              </button>
              <button type="button" className="gd-action-cta is-pay" onClick={() => { setPayPreset(null); setPayOpen(true); }} disabled={!canWriteGroup}>
                <GdActionIcon name="pay" />
                <span>{t('groupDetail.recordPayment')}</span>
              </button>
            </div>
            <div className="gd-action-quiet">
              {showScan && (
                <button type="button" className="gd-action-ghost" onClick={() => setScanOpen(true)} disabled={scanDisabled} title={scanTitle}>
                  <GdActionIcon name="scan" />
                  <span>{t('scan.open')}</span>
                </button>
              )}
              <button type="button" className="gd-action-ghost" onClick={() => openInvite('email')}>
                <GdActionIcon name="invite" />
                <span>{t('groupDetail.inviteMembers')}</span>
              </button>
              <button type="button" className="gd-action-ghost" onClick={exportPdf}>
                <GdActionIcon name="export" />
                <span>{t('groupDetail.exportPdf')}</span>
              </button>
            </div>
            <div className="gd-action-danger-opts is-direct">
              <button type="button" onClick={leave}>
                <GdActionIcon name="leave" />
                <span>{t('groupDetail.leaveGroup')}</span>
              </button>
              {detail.my_role === 'owner' && (
                <button type="button" onClick={delGroup}>
                  <GdActionIcon name="trash" />
                  <span>{t('groupDetail.deleteGroup')}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="gd-actions">
            <button
              type="button"
              className="gd-action-btn is-expense"
              onClick={() => setShowExp(true)} disabled={!canWriteGroup}
            >
              <GdActionIcon name="expense" />
              <span>{t('groupDetail.addExpense')}</span>
            </button>
            <button
              type="button"
              className="gd-action-btn is-pay"
              onClick={() => { setPayPreset(null); setPayOpen(true); }} disabled={!canWriteGroup}
            >
              <GdActionIcon name="pay" />
              <span>{t('groupDetail.recordPayment')}</span>
            </button>
            {showScan && (
              <button
                type="button"
                className="gd-action-btn"
                onClick={() => setScanOpen(true)}
                disabled={scanDisabled}
                title={scanTitle}
              >
                <GdActionIcon name="scan" />
                <span>{t('scan.open')}</span>
              </button>
            )}
            <button type="button" className="gd-action-btn" onClick={exportPdf}>
              <GdActionIcon name="export" />
              <span>{t('groupDetail.exportPdf')}</span>
            </button>
            <button type="button" className="gd-action-btn" onClick={() => openInvite('email')}>
              <GdActionIcon name="invite" />
              <span>{t('groupDetail.inviteMembers')}</span>
            </button>
            <button type="button" className="gd-action-btn is-danger" onClick={leave}>
              <GdActionIcon name="leave" />
              <span>{t('groupDetail.leaveGroup')}</span>
            </button>
            {detail.my_role === 'owner' && (
              <button type="button" className="gd-action-btn is-danger" onClick={delGroup}>
                <GdActionIcon name="trash" />
                <span>{t('groupDetail.delete')}</span>
              </button>
            )}
          </div>
        )}
        <div className="sticky-spacer" />

        <ReportPanel
          groupId={id}
          detail={detail}
          summary={summary}
          plan={plan}
          settleTick={settleTick}
          embedded
          onPay={(xfer) => { setPayPreset(xfer); setPayOpen(true); }}
          categoryManager={(
            <CategoryManager
              categories={categories}
              t={t}
              onAdd={openAddCategory}
              onEdit={openEditCategory}
              onDelete={setCategoryDeleteTarget}
            />
          )}
          afterMetrics={(
        <Card withBorder shadow="sm" padding="md" radius="md" className="gd-tabs">
          <Tabs value={tab} onChange={(v) => {
            let nv = v ?? 'ledger';
            if (nv === 'payments') nv = 'activity';
            if (nv === 'report') nv = 'ledger';
            setTab(nv);
            if (nv === 'activity') loadActivityFeed();
            if (nv === 'recurring' && rules.length === 0) loadRules();
          }}>
          <div className="tab-rail">
          <Tabs.List mb="sm">
              <Tabs.Tab value="ledger">
                {ledger?.total != null
                  ? t('groupDetail.tabExpensesCount', { count: ledger.total })
                  : t('groupDetail.tabExpenses')}
              </Tabs.Tab>
              <Tabs.Tab value="balances">{t('groupDetail.tabBalances')}</Tabs.Tab>
              <Tabs.Tab value="statement">{t('groupDetail.tabStatement')}</Tabs.Tab>
              <Tabs.Tab value="people">{t('groupDetail.tabPeople')} ({members.length})</Tabs.Tab>
              <Tabs.Tab value="activity">{t('groupDetail.tabActivity')}</Tabs.Tab>
              <Tabs.Tab value="recurring">{t('groupDetail.tabRecurring')}</Tabs.Tab>
          </Tabs.List>
          </div>

            <Tabs.Panel value="statement">
              <StatementPanel
                groupId={id}
                members={members}
                currency={detail.currency}
                embedded
              />
            </Tabs.Panel>

            <Tabs.Panel value="ledger">
          <Box visibleFrom="sm">
          <form className="ledger-toolbar" onSubmit={(ev) => { ev.preventDefault(); loadLedger(); }}>
            <div className="ledger-toolbar-main">
              <SegmentedControl
                size="xs"
                value={type}
                onChange={setType}
                data={[
                  { value: 'all', label: t('groupDetail.filterAll') },
                  { value: 'expense', label: t('groupDetail.filterExpenses') },
                  { value: 'payment', label: t('groupDetail.filterPayments') },
                ]}
              />
              <TextInput
                className="ledger-toolbar-search"
                size="xs"
                placeholder={t('groupDetail.searchItem')}
                value={q}
                onChange={(x) => setQ(x.target.value)}
              />
              <Select
                size="xs"
                value={fSort}
                onChange={setFSort}
                data={[
                  { value: 'newest', label: t('common.newest') },
                  { value: 'oldest', label: t('common.oldest') },
                ]}
                className="ledger-toolbar-sort"
              />
              <Button size="xs" variant="default" type="submit" loading={ledgerLoading}>{t('groupDetail.go')}</Button>
            </div>
            <div className="ledger-toolbar-more">
              <Select
                size="xs"
                placeholder={t('groupDetail.filterPayer')}
                clearable
                value={payer}
                onChange={(v) => setPayer(v || '')}
                data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
              />
              <Select
                size="xs"
                placeholder={t('common.status')}
                value={fStatus}
                onChange={(v) => setFStatus(v || 'OPEN')}
                data={[
                  { value: 'OPEN', label: t('groupDetail.statusOpen') },
                  { value: 'LOCKED', label: t('groupDetail.statusLocked') },
                ]}
              />
              <Select
                size="xs"
                placeholder={t('common.category')}
                clearable
                value={fCat}
                onChange={(v) => setFCat(v || '')}
                data={categorySelectData(categories, t)}
              />
              <TextInput size="xs" placeholder={t('groupDetail.minAmount')} inputMode="decimal" value={fMin} onChange={(x) => setFMin(x.target.value)} />
              <TextInput size="xs" placeholder={t('groupDetail.maxAmount')} inputMode="decimal" value={fMax} onChange={(x) => setFMax(x.target.value)} />
              <TextInput size="xs" type="date" aria-label={t('common.from')} value={fFrom} onChange={(x) => setFFrom(x.target.value)} />
              <TextInput size="xs" type="date" aria-label={t('common.to')} value={fTo} onChange={(x) => setFTo(x.target.value)} />
            </div>
          </form>
          </Box>
          <Box hiddenFrom="sm">
            <Group gap="xs" mb="sm" wrap="nowrap">
              <TextInput
                size="sm"
                placeholder={t('groupDetail.searchExpenses')}
                value={q}
                onChange={(x) => setQ(x.target.value)}
                style={{ flex: 1 }}
                aria-label={t('groupDetail.searchExpenses')}
              />
              <Indicator label={activeFilters > 0 ? activeFilters : ''} disabled={activeFilters === 0} size={16}>
                <ActionIcon
                  size="lg"
                  variant="default"
                  onClick={() => setShowF(!showF)}
                  title={t('common.filters')}
                  aria-label={activeFilters > 0 ? t('groupDetail.filtersActive', { count: activeFilters }) : t('common.filters')}
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
                    { value: 'all', label: t('groupDetail.filterAll') },
                    { value: 'expense', label: t('groupDetail.filterExpenses') },
                    { value: 'payment', label: t('groupDetail.filterPayments') },
                  ]}
                />
                <Select
                  size="sm"
                  label={t('groupDetail.payerParty')}
                  placeholder={t('common.anyone')}
                  clearable
                  value={payer}
                  onChange={(v) => setPayer(v || '')}
                  data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
                />
                <Group gap="xs" grow>
                  <Select
                    size="sm"
                    label={t('common.status')}
                    placeholder={t('common.any')}
                    value={fStatus}
                    onChange={(v) => setFStatus(v || 'OPEN')}
                    data={[
                      { value: 'OPEN', label: t('groupDetail.statusOpen') },
                      { value: 'LOCKED', label: t('groupDetail.statusLocked') },
                    ]}
                  />
                  <Select
                    size="sm"
                    label={t('common.category')}
                    placeholder={t('common.any')}
                    clearable
                    value={fCat}
                    onChange={(v) => setFCat(v || '')}
                    data={categorySelectData(categories, t)}
                  />
                </Group>
                <Group gap="xs" grow>
                  <TextInput size="sm" label={t('groupDetail.minAmount')} inputMode="decimal" value={fMin} onChange={(x) => setFMin(x.target.value)} />
                  <TextInput size="sm" label={t('groupDetail.maxAmount')} inputMode="decimal" value={fMax} onChange={(x) => setFMax(x.target.value)} />
                </Group>
                <Group gap="xs" grow>
                  <TextInput size="sm" label={t('common.from')} type="date" value={fFrom} onChange={(x) => setFFrom(x.target.value)} />
                  <TextInput size="sm" label={t('common.to')} type="date" value={fTo} onChange={(x) => setFTo(x.target.value)} />
                </Group>
                <Select
                  size="sm"
                  label={t('common.sort')}
                  value={fSort}
                  onChange={setFSort}
                  data={[
                    { value: 'newest', label: t('common.newest') },
                    { value: 'oldest', label: t('common.oldest') },
                  ]}
                />
                <Button size="sm" onClick={() => { setShowF(false); loadLedger(); }} loading={ledgerLoading}>{t('common.apply')}</Button>
              </Stack>
            </Collapse>
          </Box>
          <Box hiddenFrom="sm">
            <div className="ledger-list">
              {(ledger?.items || []).map((item) => (
                <div
                  key={item.id}
                  className={`ledger-row${item.kind === 'expense' ? ' is-link' : ''}${item.reversed ? ' is-reversed' : ''}`}
                  tabIndex={item.kind === 'expense' ? 0 : undefined}
                  role={item.kind === 'expense' ? 'link' : undefined}
                  aria-label={item.kind === 'expense' ? t('groupDetail.openItem', { title: item.title }) : undefined}
                  onClick={item.kind === 'expense' ? () => nav(`/groups/${id}/expenses/${item.id}`) : undefined}
                  onKeyDown={item.kind === 'expense' ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nav(`/groups/${id}/expenses/${item.id}`); }
                  } : undefined}
                >
                  <Avatar className="ledger-thumb" radius="md" size={40} style={{ background: tileFor(item)[1] }}>
                    {tileFor(item)[0]}
                  </Avatar>
                  <div className="ledger-copy">
                    <span className="ledger-title">
                      {item.title}
                      {item.has_image ? ' 🧾' : ''}
                      {item.reversed ? ` (${t('common.reversed')})` : ''}
                    </span>
                    <span className="ledger-meta">
                      {item.kind === 'expense'
                        ? [
                            item.category ? categoryLabelForKey(item.category, categories, t) : null,
                            item.payer_name || displayNameOf(members, item.payer_id),
                          ].filter(Boolean).join(' · ')
                        : `${item.from_name || item.from_user_id?.slice(0, 8)} → ${item.to_name || item.to_user_id?.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="ledger-amounts">
                    <span className="ledger-amount">{fmt(item.amount_cents, detail.currency)}</span>
                    <span className="ledger-meta">
                      {t('groupDetail.myShare')}{' '}
                      {item.my_share_cents != null ? fmt(item.my_share_cents, detail.currency) : '—'}
                    </span>
                    <span className={`ledger-status is-${String(item.status || '').toLowerCase()}`}>
                      {item.status === 'LOCKED' ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}
                    </span>
                  </div>
                  {item.kind === 'expense' && (
                    <div className="ledger-actions" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                      <ActionIcon className="ledger-action-btn is-copy" size="sm" variant="subtle" title={t('groupDetail.copyExpense')} aria-label={t('groupDetail.copyNamed', { title: item.title })} onClick={() => copyExpense(item)} disabled={!canWriteGroup}>⧉</ActionIcon>
                      {canEditExpense(item) && (
                        <ActionIcon className="ledger-action-btn is-edit" size="sm" variant="subtle" title={t('groupDetail.editExpense')} aria-label={t('groupDetail.editNamed', { title: item.title })} onClick={() => editExpense(item)} loading={editBusy}>✎</ActionIcon>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(ledger?.items || []).length > 0 && (
                <div className="ledger-row is-total">
                  <div className="ledger-copy">
                    <span className="ledger-title">{t('groupDetail.totalCount', { count: ledger.items.length })}</span>
                  </div>
                  <div className="ledger-amounts">
                    <span className="ledger-amount">{fmt(totals.amount, detail.currency)}</span>
                    <span className="ledger-meta">{t('groupDetail.mine')} {fmt(totals.mine, detail.currency)}</span>
                  </div>
                </div>
              )}
            </div>
          </Box>
          <Box visibleFrom="sm">
            <div className="ledger-list is-table">
              <div className="ledger-row is-head" role="row">
                <span>{t('groupDetail.colItem')}</span>
                <span>{t('groupDetail.colCategory')}</span>
                <span>{t('groupDetail.colParty')}</span>
                <span className="is-num">{t('groupDetail.colAmount')}</span>
                <span className="is-num">{t('groupDetail.colMyShare')}</span>
                <span className="is-status">{t('groupDetail.colStatus')}</span>
                <span className="is-actions" aria-hidden />
              </div>
              {(ledger?.items || []).map((item) => (
                <div key={item.id} className={`ledger-row is-desk${item.reversed ? ' is-reversed' : ''}`} role="row">
                  <span className="ledger-cell ledger-title">
                    {item.kind === 'expense' ? (
                      <Anchor component={Link} to={`/groups/${id}/expenses/${item.id}`}>{item.title}</Anchor>
                    ) : (
                      item.title
                    )}
                    {item.has_image ? ' 🧾' : ''}
                    {item.reversed ? ` (${t('common.reversed')})` : ''}
                  </span>
                  <span className="ledger-cell ledger-meta">
                    {item.kind === 'expense' && item.category
                      ? categoryLabelForKey(item.category, categories, t)
                      : '—'}
                  </span>
                  <span className="ledger-cell ledger-meta">
                    {item.kind === 'expense'
                      ? (item.payer_name || displayNameOf(members, item.payer_id))
                      : `${item.from_name || item.from_user_id?.slice(0, 8)} → ${item.to_name || item.to_user_id?.slice(0, 8)}`}
                  </span>
                  <span className="ledger-cell ledger-amount is-num">{fmt(item.amount_cents, detail.currency)}</span>
                  <span className="ledger-cell ledger-meta is-num">
                    {item.my_share_cents != null ? fmt(item.my_share_cents, detail.currency) : '—'}
                  </span>
                  <span className="ledger-cell is-status">
                    <span className={`ledger-status is-${String(item.status || '').toLowerCase()}`}>
                      {item.status === 'LOCKED' ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}
                    </span>
                  </span>
                  <span className="ledger-cell ledger-actions is-actions">
                    {item.kind === 'expense' ? (
                      <>
                        <ActionIcon className="ledger-action-btn is-copy" size="sm" variant="subtle" title={t('groupDetail.copyExpense')} aria-label={t('groupDetail.copyNamed', { title: item.title })} onClick={() => copyExpense(item)} disabled={!canWriteGroup}>⧉</ActionIcon>
                        {canEditExpense(item) && (
                          <ActionIcon className="ledger-action-btn is-edit" size="sm" variant="subtle" title={t('groupDetail.editExpense')} aria-label={t('groupDetail.editNamed', { title: item.title })} onClick={() => editExpense(item)} loading={editBusy}>✎</ActionIcon>
                        )}
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
              {(ledger?.items || []).length > 0 && (
                <div className="ledger-row is-desk is-total" role="row">
                  <span className="ledger-cell ledger-title">{t('groupDetail.totalRows', { count: ledger.items.length })}</span>
                  <span className="ledger-cell" />
                  <span className="ledger-cell" />
                  <span className="ledger-cell ledger-amount is-num">{fmt(totals.amount, detail.currency)}</span>
                  <span className="ledger-cell ledger-amount is-num">{fmt(totals.mine, detail.currency)}</span>
                  <span className="ledger-cell is-status" />
                  <span className="ledger-cell is-actions" />
                </div>
              )}
            </div>
          </Box>
          {ledgerEmpty && (
            <div className="ledger-empty" role="status">
              {fStatus === 'LOCKED' ? (
                <>
                  <Text size="sm" c="dimmed">{t('groupDetail.ledgerEmptyArchive')}</Text>
                  <Button
                    size="xs"
                    variant="light"
                    mt={4}
                    onClick={() => { setFStatus('OPEN'); loadLedger('OPEN'); }}
                  >
                    {t('groupDetail.viewActive')}
                  </Button>
                </>
              ) : groupSettled && hasLedgerHistory ? (
                <>
                  <Text size="sm" fw={600}>{t('groupDetail.ledgerAllSettled')}</Text>
                  <Text size="xs" c="dimmed">{t('groupDetail.ledgerAllSettledHint')}</Text>
                  <Button
                    size="xs"
                    variant="light"
                    mt={4}
                    onClick={() => { setFStatus('LOCKED'); loadLedger('LOCKED'); }}
                  >
                    {t('groupDetail.viewArchive')}
                  </Button>
                </>
              ) : (
                <Text size="sm" c="dimmed">{t('groupDetail.ledgerEmptyActive')}</Text>
              )}
            </div>
          )}
            </Tabs.Panel>

            <Tabs.Panel value="balances">
              <Text size="sm" fw={600} mb="sm">{t('groupDetail.whoOwes')}</Text>
              <BalancesPanel
                byDebtor={byDebtor}
                debtors={debtors}
                members={members}
                currency={detail.currency}
                t={t}
                onNudge={nudge}
                onPay={(item) => { setPayPreset(item); setPayOpen(true); }}
              />
              <Stack visibleFrom="sm" gap="sm">
                {debtors.length === 0 && transfers.length === 0 && (
                  <Text c="dimmed" size="sm">{t('groupDetail.allSettledNobody')}</Text>
                )}
                {byDebtor.map(([from, list]) => (
                  <Card key={from} withBorder radius="md" padding="sm">
                    <Group gap="sm" wrap="nowrap">
                      <Avatar color="gray" radius="xl" size="sm">{initialsOf(displayNameOf(members, from))}</Avatar>
                      <div style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>{displayNameOf(members, from)} owes</Text>
                          <Anchor size="xs" c="dimmed" onClick={() => nudge(from, displayNameOf(members, from))}>{t('groupDetail.nudge')}</Anchor>
                        </Group>
                        {list.map((item, i) => (
                          <Group key={i} gap="xs" mt={2}>
                            <Text size="sm">
                              → {displayNameOf(members, item.to_user_id)} <b>{fmt(item.amount_cents, detail.currency)}</b>
                            </Text>
                            <Button size="xs" variant="light" onClick={() => { setPayPreset(item); setPayOpen(true); }}>{t('groupDetail.pay')}</Button>
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
                      <Anchor size="xs" c="dimmed" onClick={() => nudge(m.user_id, m.display_name)}>{t('groupDetail.nudge')}</Anchor>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="activity">
              <Group justify="space-between" mb="sm" wrap="wrap">
                <div>
                  <Text size="sm" fw={600}>Activity</Text>
                  <Text size="xs" c="dimmed">{t('groupDetail.transfersUpdates')} · {t('groupDetail.newestFirst')}</Text>
                </div>
                <Button size="xs" variant="subtle" onClick={loadActivityFeed} loading={activityLoading}>{t('common.refresh')}</Button>
              </Group>
              {activityLoading && activityFeed.length === 0 && (
                <Stack gap="xs"><Skeleton height={52} radius="md" /><Skeleton height={52} radius="md" /></Stack>
              )}
              {!activityLoading && activityFeed.length === 0 && (
                <Text size="sm" c="dimmed">{t('groupDetail.activityEmpty')}</Text>
              )}
              {activityFeed.length > 0 && (
                <div className="activity-list">
                  {activityFeed.length > ACTIVITY_PAGE_SIZE && (
                    <div className="activity-pager">
                      <span className="activity-pager-range">
                        {t('activity.range', {
                          from: (activityPageSafe - 1) * ACTIVITY_PAGE_SIZE + 1,
                          to: Math.min(activityPageSafe * ACTIVITY_PAGE_SIZE, activityFeed.length),
                          total: activityFeed.length,
                        })}
                      </span>
                      <div className="activity-pager-controls">
                        <button
                          type="button"
                          className="activity-pager-btn"
                          disabled={activityPageSafe <= 1}
                          onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                        >
                          {t('common.prev')}
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
                          {t('common.next')}
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
                        p.status && p.status !== 'OPEN' ? t('groupDetail.statusLocked') : null,
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
                                <Menu.Item onClick={() => reversePay(p.id)}>{t('groupDetail.reverse')}</Menu.Item>
                              </RowMenu>
                            ) : (
                              <Button size="xs" variant="subtle" onClick={() => reversePay(p.id)}>{t('groupDetail.reverse')}</Button>
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
              <div className="recurring-panel-head">
                <Text size="sm" fw={600}>{t('groupDetail.recurringBills')}</Text>
                <Button size="xs" variant="subtle" onClick={loadRules}>{t('common.refresh')}</Button>
              </div>
              <RecurringForm groupId={id} members={members} currency={detail.currency} t={t} onDone={loadRules} />
              <Box hiddenFrom="sm">
                <RecurringRuleList
                  rules={rules}
                  currency={detail.currency}
                  onToggle={async (r) => {
                    await api.patch(`/api/v1/groups/${id}/recurring/${r.rule_id}`, { active: !r.active });
                    loadRules();
                  }}
                  onDelete={async (r) => {
                    await api.del(`/api/v1/groups/${id}/recurring/${r.rule_id}`);
                    loadRules();
                  }}
                  t={t}
                />
              </Box>
              <Stack visibleFrom="sm" gap="xs" mt="sm">
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
                {rules.length === 0 && <Text size="sm" c="dimmed">{t('groupDetail.noRecurring')}</Text>}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="people">
              <div className="gd-people">
                {members.map((m) => {
                  const pastel = pastelFor(m.display_name || m.username);
                  const roleLabel = m.role === 'owner'
                    ? t('common.owner')
                    : m.role === 'treasurer'
                      ? t('common.treasurer')
                      : t('common.member');
                  const roleClass = m.role === 'owner' ? 'is-owner' : m.role === 'treasurer' ? 'is-treasurer' : 'is-member';
                  const canAct = detail.mode === 'event' || detail.my_role === 'owner';
                  const depositLabel = m.deposit_paid ? t('groupDetail.unmarkDeposit') : t('groupDetail.markDeposit');
                  const treasurerLabel = m.role === 'treasurer' ? t('groupDetail.removeTreasurer') : t('groupDetail.makeTreasurer');
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
                          {detail.mode === 'event' && (
                            <span className={`gd-person-tag ${m.deposit_paid ? 'is-deposit' : 'is-deposit-due'}`}>
                              {m.deposit_paid ? t('groupDetail.depositPaid') : t('groupDetail.depositDue')}
                            </span>
                          )}
                        </div>
                        <Text className="gd-person-handle" truncate>@{m.username}</Text>
                      </div>
                      <span className={`gd-person-tag gd-person-role ${roleClass}`}>{roleLabel}</span>
                      {canAct && (
                        <div className="gd-person-actions">
                          {detail.mode === 'event' && (
                            <Tooltip label={depositLabel} withArrow openDelay={200}>
                              <button
                                type="button"
                                className={`gd-person-action${m.deposit_paid ? ' is-on' : ''}`}
                                aria-label={depositLabel}
                                onClick={() => setDeposit(m.user_id, !m.deposit_paid)}
                              >
                                <GdActionIcon name={m.deposit_paid ? 'deposit-on' : 'deposit'} />
                              </button>
                            </Tooltip>
                          )}
                          {detail.my_role === 'owner' && m.role !== 'owner' && (
                            <Tooltip label={treasurerLabel} withArrow openDelay={200}>
                              <button
                                type="button"
                                className={`gd-person-action${m.role === 'treasurer' ? ' is-on' : ''}`}
                                aria-label={treasurerLabel}
                                onClick={() => setRole(m.user_id, m.role === 'treasurer' ? 'member' : 'treasurer')}
                              >
                                <GdActionIcon name="treasurer" />
                              </button>
                            </Tooltip>
                          )}
                          {detail.my_role === 'owner' && m.role !== 'owner' && (
                            <Tooltip label={t('common.remove')} withArrow openDelay={200}>
                              <button
                                type="button"
                                className="gd-person-action is-danger"
                                aria-label={t('groupDetail.removeNamed', { name: m.display_name })}
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
          )}
        />
      </Stack>

      {/* Inside a group the FAB skips the picker and opens the normal expense form. */}
      <AddExpenseFab onClick={() => setShowExp(true)} disabled={!canWriteGroup} />

      <Modal
        opened={showExp}
        onClose={() => { setShowExp(false); setCopyFrom(null); }}
        closeOnClickOutside={false}
        title={(
          <span className="wizard-title-name">
            {copyFrom ? t('groupDetail.copyExpense') : t('groupDetail.newExpense')}
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
      >
        <ExpenseForm
          key={expFormKey}
          groupId={id}
          members={members}
          copyFrom={copyFrom}
          currency={detail.currency}
          onDone={() => { setShowExp(false); setCopyFrom(null); load(); loadLedger(); loadSummary(); }}
          onSaveNew={() => { setCopyFrom(null); setExpFormKey((k) => k + 1); load(); loadLedger(); loadSummary(); }}
          onCancel={() => { setShowExp(false); setCopyFrom(null); }}
        />
      </Modal>

      <ScanReceipts
        opened={scanOpen}
        onClose={() => setScanOpen(false)}
        groupId={id}
        members={members}
        meId={user?.user_id}
        currency={detail.currency}
        categories={categories}
        existingExpenses={ledger?.items || []}
        onCreated={() => { load(); loadLedger(); loadSummary(); }}
      />

      <Modal
        opened={editOpen}
        onClose={closeEdit}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">{t('groupDetail.editExpense')}</span>}
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
      >
        {editExisting && (
          <ExpenseForm
            key={editExisting.expense_id}
            groupId={id}
            members={members}
            existing={editExisting}
            currency={detail.currency}
            onDone={() => { closeEdit(); load(); loadLedger(); loadSummary(); }}
          />
        )}
      </Modal>

      <Modal
        opened={payOpen}
        onClose={() => setPayOpen(false)}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">{t('groupDetail.recordPayment')}</span>}
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
            setSettleTick((x) => x + 1);
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
        title={<span className="wizard-title-name">{t('groupDetail.inviteLink')}</span>}
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
                    {copied ? t('invite.linkCopied') : t('wizard.copyInviteLink')}
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
        opened={statusConfirmOpen}
        onClose={() => {
          if (statusBusy) return;
          setStatusConfirmOpen(false);
          setPendingGroupStatus(null);
        }}
        closeOnClickOutside={!statusBusy}
        title={<span className="wizard-title-name">{t('groupStatus.confirmTitle')}</span>}
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
        <div className="wizard-form confirm-dialog group-status-confirm">
          {pendingGroupStatus && (
            <>
              <div className={`group-status-confirm-next is-${pendingGroupStatus}`}>
                <span aria-hidden />
                <strong>{t(`groupStatus.${pendingGroupStatus}`)}</strong>
              </div>
              <Text className="confirm-dialog-text">
                {t('groupStatus.confirmBody', {
                  from: lifecycleLabel,
                  to: t(`groupStatus.${pendingGroupStatus}`),
                })}
              </Text>
              <Text size="sm" c="dimmed">{t(`groupStatus.${pendingGroupStatus}Hint`)}</Text>
            </>
          )}
          <Group gap="sm" grow>
            <Button
              className="wizard-back"
              onClick={() => {
                setStatusConfirmOpen(false);
                setPendingGroupStatus(null);
              }}
              disabled={statusBusy}
            >
              {t('common.cancel')}
            </Button>
            <Button className="wizard-primary" loading={statusBusy} onClick={updateGroupStatus}>
              {t('groupStatus.confirmAction')}
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>

      <Modal
        opened={removeOpen}
        onClose={() => !removeBusy && setRemoveOpen(false)}
        closeOnClickOutside={!removeBusy}
        title={<span className="wizard-title-name">{t('groupDetail.removeMember')}</span>}
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
        title={<span className="wizard-title-name">{t('groupDetail.leaveGroup')}</span>}
        classNames={{
          content: 'wizard-modal-content group-danger-confirm-modal',
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
        title={<span className="wizard-title-name">{t('groupDetail.deleteGroup')}</span>}
        classNames={{
          content: 'wizard-modal-content group-danger-confirm-modal',
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
        title={<span className="wizard-title-name">{t('invite.title')}</span>}
        classNames={{
          content: 'wizard-modal-content invite-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form invite-dialog">
          <Tabs
            value={inviteTab}
            onChange={(v) => setInviteTab(v || 'email')}
            className="invite-tabs"
            color="teal"
          >
            <Tabs.List grow>
              <Tabs.Tab value="email">{t('invite.byEmail')}</Tabs.Tab>
              <Tabs.Tab value="contacts">{t('invite.fromContacts')}</Tabs.Tab>
              <Tabs.Tab value="link">{t('invite.inviteLink')}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="email">
              <form className="wizard-form" onSubmit={inviteByEmail}>
                <div>
                  <Textarea
                    placeholder={t('wizard.emailsPh')}
                    minRows={4}
                    value={inviteEmails}
                    onChange={(x) => setInviteEmails(x.target.value)}
                    aria-label={t('invite.emails')}
                  />
                  <Text size="xs" c="dimmed" mt={6}>
                    {t('invite.emailsHint')}
                  </Text>
                </div>
                <Button className="wizard-primary" fullWidth type="submit" loading={inviteBusy}>
                  {t('invite.sendInvites')}
                </Button>
              </form>
            </Tabs.Panel>

            <Tabs.Panel value="contacts">
              <form className="wizard-form" onSubmit={searchContacts}>
                <Group gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label={t('wizard.searchContacts')}
                    placeholder={t('wizard.searchPh')}
                    value={contactQ}
                    onChange={(x) => setContactQ(x.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button className="wizard-search" type="submit" variant="default" loading={contactBusy}>
                    {t('common.search')}
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
                        {t('common.add')}
                      </button>
                    </div>
                  ))}
                  {!contactBusy && contacts.length === 0 && contactQ.trim() !== '' && (
                    <Text size="sm" c="dimmed">{t('invite.noContacts')}</Text>
                  )}
                  {!contactBusy && contacts.length === 0 && contactQ.trim() === '' && (
                    <Text size="sm" c="dimmed">{t('invite.searchYourContacts')}</Text>
                  )}
                </Stack>
              </form>
            </Tabs.Panel>

            <Tabs.Panel value="link">
              <div className="wizard-form">
                {inviteLinkLive || detail.invite_link ? (
                  <>
                    <Text className="invite-link-hint">
                      {t('invite.linkBody')}
                    </Text>
                    <Group gap="xs" align="flex-end" wrap="nowrap">
                      <TextInput
                        readOnly
                        value={inviteLinkLive || detail.invite_link}
                        style={{ flex: 1 }}
                        aria-label={t('invite.inviteLink')}
                      />
                      {detail.my_role === 'owner' && (
                        <Button
                          className="wizard-search"
                          variant="default"
                          loading={rotateBusy}
                          onClick={rotateInviteLink}
                        >
                          {t('invite.rotate')}
                        </Button>
                      )}
                    </Group>
                    <CopyButton value={inviteLinkLive || detail.invite_link}>
                      {({ copied, copy }) => (
                        <Button className="wizard-primary" fullWidth onClick={copy}>
                          {copied ? t('invite.linkCopied') : t('wizard.copyInviteLink')}
                        </Button>
                      )}
                    </CopyButton>
                  </>
                ) : (
                  <Text className="invite-link-hint">
                    {t('invite.ownerOnlyLink')}
                  </Text>
                )}
              </div>
            </Tabs.Panel>
          </Tabs>
          <Err e={e} />
        </div>
      </Modal>

      <Modal
        opened={categoryModalOpen}
        onClose={() => !catBusy && setCategoryModalOpen(false)}
        closeOnClickOutside={!catBusy}
        title={<span className="wizard-title-name">{t(categoryTarget ? 'groupDetail.categoryRename' : 'groupDetail.categoryAdd')}</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={440}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <form className="wizard-form" onSubmit={saveCategory}>
          <TextInput
            label={t('groupDetail.categoryName')}
            placeholder={t('forms.expense.addCategoryPh')}
            autoFocus
            required
            value={categoryName}
            onChange={(x) => setCategoryName(x.target.value)}
          />
          <Button className="wizard-primary" fullWidth type="submit" loading={catBusy} disabled={!categoryName.trim()}>
            {t(categoryTarget ? 'common.saveChanges' : 'groupDetail.categoryAdd')}
          </Button>
          <Err e={e} />
        </form>
      </Modal>

      <Modal
        opened={!!categoryDeleteTarget}
        onClose={() => !catBusy && setCategoryDeleteTarget(null)}
        closeOnClickOutside={!catBusy}
        title={<span className="wizard-title-name">{t('groupDetail.categoryDelete')}</span>}
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
            {t('groupDetail.categoryDeleteBody', { name: categoryLabel(categoryDeleteTarget, t) })}
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setCategoryDeleteTarget(null)} disabled={catBusy}>
              {t('common.cancel')}
            </Button>
            <Button className="wizard-primary is-danger" loading={catBusy} onClick={confirmDeleteCategory}>
              {t('common.delete')}
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title={t('groupDetail.rename')} centered size="sm">
        <form onSubmit={saveRename}>
          <Stack gap="sm">
            <TextInput
              label={t('wizard.groupName')}
              required
              autoFocus
              value={renName}
              onChange={(x) => setRenName(x.target.value)}
              data-autofocus
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={() => setRenameOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={renaming}>{t('groupDetail.renameSave')}</Button>
            </Group>
            <Err e={e} />
          </Stack>
        </form>
      </Modal>

    </Shell>
  );
}

export function CategoryManager({ categories, t, onAdd, onEdit, onDelete }) {
  return (
    <section className="category-manager" aria-label={t('groupDetail.tabCategories')}>
      <Group className="category-manager-head" justify="space-between" mb="sm" wrap="nowrap">
        <div className="category-manager-copy">
          <Text size="sm" fw={700}>{t('groupDetail.tabCategories')}</Text>
          <Text size="xs" c="dimmed">{t('groupDetail.categoriesHint')}</Text>
        </div>
        <button type="button" className="gd-action-btn settings-add-btn category-manager-add" aria-label={t('groupDetail.categoryAdd')} onClick={onAdd}>
          <GdActionIcon name="plus" />
          <span className="category-manager-add-label">{t('groupDetail.categoryAdd')}</span>
        </button>
      </Group>
      <div className="settings-list category-manager-list">
        {categories.map((category) => (
          <div key={category.category_id} className="settings-row">
            <div className="settings-row-body">
              <Text className="settings-row-title">{categoryLabel(category, t)}</Text>
              <Text className="settings-row-sub">
                {category.is_default ? t('groupDetail.categoryDefault') : category.key}
              </Text>
            </div>
            <div className="settings-row-actions">
              {!category.is_default && (
                <>
                  <Tooltip label={t('common.edit')} withArrow openDelay={200}>
                    <button type="button" className="gd-person-action" aria-label={`${t('common.edit')} ${categoryLabel(category, t)}`} onClick={() => onEdit(category)}>
                      <GdActionIcon name="edit" />
                    </button>
                  </Tooltip>
                  <Tooltip label={t('common.delete')} withArrow openDelay={200}>
                    <button type="button" className="gd-person-action is-danger" aria-label={`${t('common.delete')} ${categoryLabel(category, t)}`} onClick={() => onDelete(category)}>
                      <GdActionIcon name="trash" />
                    </button>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        ))}
        {categories.length === 0 && <Text size="sm" c="dimmed">{t('groupDetail.noCategories')}</Text>}
      </div>
    </section>
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
  if (name === 'scan') {
    return (
      <svg {...common}>
        <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg {...common} width={17} height={17}>
        <path d="M4.5 19.5h4.1L19.2 8.9a2.1 2.1 0 0 0 0-3l-1.1-1.1a2.1 2.1 0 0 0-3 0L4.5 15.4v4.1Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M13.4 6.6 17.4 10.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

export function BalancesPanel({ byDebtor = [], debtors = [], members = [], currency = '', t, onNudge, onPay }) {
  const hasBalances = byDebtor.length > 0 || debtors.length > 0;

  return (
    <Box hiddenFrom="sm">
      {!hasBalances ? (
        <Text c="dimmed" size="sm">{t('groupDetail.allSettledNobody')}</Text>
      ) : (
        <div className="balance-mobile-list">
          {byDebtor.map(([from, transfers]) => {
            const name = displayNameOf(members, from);
            return (
              <div key={from} className="balance-mobile-debtor">
                <div className="balance-mobile-debtor-head">
                  <Avatar className="balance-mobile-avatar" radius="xl" size="sm">{initialsOf(name)}</Avatar>
                  <span className="balance-mobile-name">{name} owes</span>
                  <button type="button" className="balance-mobile-nudge" onClick={() => onNudge(from, name)}>{t('groupDetail.nudge')}</button>
                </div>
                <div className="balance-mobile-transfers">
                  {transfers.map((item, i) => (
                    <div key={i} className="balance-mobile-transfer">
                      <span className="balance-mobile-route">→ {displayNameOf(members, item.to_user_id)}</span>
                      <span className="balance-mobile-amount">{fmt(item.amount_cents, currency)}</span>
                      <button type="button" className="balance-mobile-pay" onClick={() => onPay(item)}>{t('groupDetail.pay')}</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {byDebtor.length === 0 && debtors.map((member) => {
            const name = member.display_name || displayNameOf(members, member.user_id);
            return (
              <div key={member.user_id} className="balance-mobile-debtor">
                <div className="balance-mobile-debtor-head">
                  <Avatar className="balance-mobile-avatar" radius="xl" size="sm">{initialsOf(name)}</Avatar>
                  <span className="balance-mobile-name">{name} owes</span>
                  <span className="balance-mobile-amount">{fmt(member.owe_cents, currency)}</span>
                  <button type="button" className="balance-mobile-nudge" onClick={() => onNudge(member.user_id, name)}>{t('groupDetail.nudge')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Box>
  );
}

const RECURRING_CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', VND: '₫' };

export function formatRecurringAmount(value, currency = 'USD') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const number = Number(raw);
  if (!Number.isFinite(number)) return '';
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
  const code = String(currency || 'USD').toUpperCase();
  return RECURRING_CURRENCY_SYMBOLS[code] ? `${RECURRING_CURRENCY_SYMBOLS[code]}${amount}` : `${code} ${amount}`;
}

function normalizeRecurringAmount(value) {
  const [whole = '', ...fraction] = String(value).replace(/[^0-9.]/g, '').split('.');
  return fraction.length > 0 ? `${whole}.${fraction.join('')}` : whole;
}

export function RecurringForm({ groupId, members, currency = 'USD', t, onDone }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(members[0]?.user_id || '');
  const [freq, setFreq] = useState('monthly');
  const [amountFocused, setAmountFocused] = useState(false);
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
    <form className="recurring-form" onSubmit={go}>
      <TextInput className="recurring-form-title" label={t('groupDetail.recurringTitle')} required placeholder={t('groupDetail.rentPh')} value={title} onChange={(x) => setTitle(x.target.value)} />
      <TextInput
        className="recurring-form-amount"
        label="Amount"
        required
        inputMode="decimal"
        placeholder="0.00"
        value={amountFocused ? amount : formatRecurringAmount(amount, currency)}
        onFocus={() => setAmountFocused(true)}
        onBlur={() => setAmountFocused(false)}
        onChange={(x) => setAmount(normalizeRecurringAmount(x.target.value))}
      />
      <Select className="recurring-form-payer" label={t('groupDetail.recurringPayer')} value={payer} onChange={setPayer} data={members.map((m) => ({ value: m.user_id, label: m.display_name }))} />
      <Select className="recurring-form-frequency" label={t('groupDetail.every')} value={freq} onChange={setFreq} data={['weekly', 'monthly']} />
      <Button className="recurring-form-submit" type="submit" loading={busy}>Add</Button>
      {e && <Err e={e} />}
    </form>
  );
}

export function RecurringRuleList({ rules = [], currency = '', t, onToggle, onDelete }) {

  if (rules.length === 0) {
    return <Text className="recurring-rule-empty" size="sm" c="dimmed">{t('groupDetail.noRecurring')}</Text>;
  }

  return (
    <div className="recurring-rule-list">
      {rules.map((r) => (
        <div key={r.rule_id} className="recurring-rule-row">
          <div className="recurring-rule-copy">
            <div className="recurring-rule-title-line">
              <Text className="recurring-rule-title" size="sm" fw={700} truncate>{r.title}</Text>
              <span className="recurring-rule-frequency">{r.frequency}</span>
            </div>
            <span className="recurring-rule-next">Next run {new Date(r.next_run_at).toLocaleDateString()}</span>
          </div>
          <div className="recurring-rule-side">
            <span className="recurring-rule-amount">{fmt(r.amount_cents, currency)}</span>
            <span className={`recurring-rule-status ${r.active ? 'is-active' : 'is-paused'}`}>{r.active ? 'Active' : 'Paused'}</span>
            <div className="recurring-rule-actions">
              <Button size="xs" variant="subtle" onClick={() => onToggle(r)}>{r.active ? 'Pause' : 'Resume'}</Button>
              <Button size="xs" variant="subtle" color="red" onClick={() => onDelete(r)}>Delete</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
