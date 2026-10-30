// Group detail — web parity with web/src/pages/GroupDetail.jsx (mobile layout).
// Hero + my-net card, direct actions (Add expense / Record payment), quiet actions
// (Scan receipts, Invite, Group settings sheet ···), settlement summary card, Report / Statement links,
// (the old in-screen InviteSheet moved to screens/InviteScreen.js → navigate('Invite')),
// tabs: Ledger · Balances · People · Activity · Recurring. Refreshes on focus (returning from
// Pay / AddExpense re-fetches plan + ledger — web settleTick behaviour) and after mutations.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt, getCapabilities } from '../api/client';
import { fetchRemovalPreview, isStaleRemoval, removalPath } from '../shared/memberRemoval';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import {
  Screen, Card, Button, ChipRow, Row, GroupThumb, SkeletonCard, ErrText, Sheet, toast,
} from '../ui';
import LedgerTab from '../components/group/LedgerTab';
import BalancesTab from '../components/group/BalancesTab';
import PeopleTab from '../components/group/PeopleTab';
import ActivityTab from '../components/group/ActivityTab';
import RecurringTab from '../components/group/RecurringTab';
import GroupSettingsSheet from '../components/group/GroupSettingsSheet';
import { Bar, MenuRow, useDateFmt } from '../components/group/parts';
import {
  DEFAULT_FILTERS, buildLedgerQuery, canWriteGroup as canWriteOf, canEditExpense, groupSettledOf,
  hasLedgerHistory, ledgerEmptyKind, groupByDebtor, mergeActivityFeed,
} from '../components/group/helpers';

const LIFECYCLE_TONE = {
  opening: ['#e8f7ef', '#0c7a4b'],
  locked: ['#fff7ed', '#c2410c'],
  closed: ['#eef2f0', '#4a5651'],
};

export default function GroupDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const d = useDateFmt();
  const { user } = useAuth();
  const meId = user?.user_id;

  const [detail, setDetail] = useState(null);
  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState(null);
  const [plan, setPlan] = useState(null);
  const [categories, setCategories] = useState([]);
  const [e, setE] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ocr, setOcr] = useState(false);

  const [tab, setTab] = useState('ledger');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  // Archive view: default scope is active (OPEN); LOCKED = Archived.
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, status: 'OPEN' });
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerReq = useRef(0);

  const [activity, setActivity] = useState([]);
  const [payHist, setPayHist] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [nudging, setNudging] = useState(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemSheet, setItemSheet] = useState(null);
  const [itemBusy, setItemBusy] = useState(false);

  // Latest query inputs for loaders called from focus/debounce callbacks (no stale closures).
  const live = useRef({});
  live.current = { kind, q, filters, tab };

  const loadCategories = useCallback(async () => {
    try {
      const rows = await api.get(`/api/v1/groups/${id}/categories`);
      setCategories(Array.isArray(rows) ? rows : []);
    } catch { /* keep prior */ }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const [g, m, s, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`).catch(() => null),
        api.get(`/api/v1/groups/${id}/summary`).catch(() => null),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setDetail(g?.group || g); setMe(m); setSummary(Array.isArray(s) ? s : null); setPlan(p); setE(null);
      loadCategories();
    } catch (err) { setE(err); }
  }, [id, loadCategories]);

  const loadLedger = useCallback(async (override) => {
    const req = ++ledgerReq.current;
    const { kind: k, q: qq, filters: f } = live.current;
    setLedgerLoading(true);
    try {
      const res = await api.get(`/api/v1/groups/${id}/ledger?${buildLedgerQuery({ type: k, q: qq }, override || f)}`);
      let items = res?.items || [];
      // Older API builds omit ledger.category — fill from expense detail when missing (web parity).
      const missing = items.filter((it) => it.kind === 'expense' && !it.category);
      if (missing.length > 0 && missing.length <= 25) {
        const pairs = await Promise.all(missing.map(async (it) => {
          try { const x = await api.get(`/api/v1/expenses/${it.id}`); return [it.id, x?.expense?.category || null]; }
          catch { return [it.id, null]; }
        }));
        const byId = Object.fromEntries(pairs);
        items = items.map((it) => (byId[it.id] ? { ...it, category: byId[it.id] } : it));
      }
      if (req === ledgerReq.current) setLedger({ ...res, items });
    } catch (err) {
      if (req === ledgerReq.current) setE(err);
    } finally {
      if (req === ledgerReq.current) setLedgerLoading(false);
    }
  }, [id]);

  const loadRules = useCallback(async () => {
    try { const r = await api.get(`/api/v1/groups/${id}/recurring`); setRules(Array.isArray(r) ? r : []); }
    catch (err) { setE(err); }
  }, [id]);

  const loadActivityFeed = useCallback(async () => {
    setActivityLoading(true);
    try {
      const [a, ph] = await Promise.all([
        api.get(`/api/v1/groups/${id}/activity?limit=50`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`).catch(() => null),
      ]);
      if (a) setActivity(Array.isArray(a) ? a : []);
      if (ph) setPayHist(ph.items || []);
    } finally { setActivityLoading(false); }
  }, [id]);

  const refreshAll = useCallback(async () => {
    const tb = live.current.tab;
    await Promise.all([
      load(),
      loadLedger(),
      tb === 'activity' ? loadActivityFeed() : null,
      tb === 'recurring' ? loadRules() : null,
    ]);
  }, [load, loadLedger, loadActivityFeed, loadRules]);

  useFocusEffect(useCallback(() => { refreshAll(); }, [refreshAll]));

  useEffect(() => {
    let live2 = true;
    getCapabilities().then((c) => { if (live2) setOcr(!!c?.ocr_enabled); });
    return () => { live2 = false; };
  }, []);

  // Type change reloads immediately; search is debounced (600ms like web mobile).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) return;
    loadLedger();
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return undefined; }
    const h = setTimeout(() => loadLedger(), 600);
    return () => clearTimeout(h);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (detail?.name) navigation.setOptions({ title: detail.name });
  }, [detail?.name, navigation]);
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('m.group.settings')} style={{ paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 22, color: colors.text, fontWeight: '700' }}>⋯</Text>
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const members = detail?.members || [];
  const currency = detail?.currency || 'USD';
  const canWrite = canWriteOf(detail);
  const lifecycle = detail?.status || 'opening';
  const transfers = plan?.transfers || [];
  const byDebtor = useMemo(() => groupByDebtor(transfers), [transfers]);
  const debtors = useMemo(() => (summary || []).filter((x) => x.owe_cents > 0), [summary]);
  const settled = groupSettledOf(plan, summary);
  const feed = useMemo(() => mergeActivityFeed(payHist, activity), [payHist, activity]);
  const ledgerItems = ledger?.items || [];

  const changeTab = (v) => {
    setTab(v);
    if (v === 'activity') loadActivityFeed();
    if (v === 'recurring') loadRules();
  };

  const applyFilters = (f) => { setFilters(f); loadLedger(f); };

  const pay = (x) => navigation.navigate('Pay', {
    id, from: x?.from_user_id, to: x?.to_user_id, amount: x?.amount_cents,
  });

  const nudge = async (uid, name) => {
    setNudging(uid);
    try {
      await api.post(`/api/v1/groups/${id}/nudges`, { user_ids: [uid] });
      toast({ title: t('groupDetail.nudged', { name }), color: 'teal' });
      if (tab === 'activity') loadActivityFeed();
    } catch (err) { toast({ title: t('m.error.failed'), message: err.message, color: 'red' }); }
    finally { setNudging(null); }
  };

  const reversePay = async (pid) => {
    try {
      await api.post(`/api/v1/payments/${pid}/reverse`, {});
      toast({ title: t('groupDetail.paymentReversed'), color: 'teal' });
      await Promise.all([load(), loadLedger(), loadActivityFeed()]);
    } catch (err) { toast({ title: t('m.error.failed'), message: err.message, color: 'red' }); }
  };

  const setRole = async (uid, role) => {
    await api.patch(`/api/v1/groups/${id}/members/${uid}`, { role });
    toast({ title: t('groupDetail.roleUpdated', { role: role === 'treasurer' ? t('common.treasurer') : t('common.member') }), color: 'teal' });
    await load();
  };
  const setDeposit = async (uid, paid) => {
    await api.patch(`/api/v1/groups/${id}/members/${uid}/deposit`, { paid });
    await load();
  };
  const removalPreview = (m) => fetchRemovalPreview(api.get, id, m.user_id);
  const removeMember = async (m, preview) => {
    try {
      await api.del(removalPath(id, m.user_id, preview));
      await refreshAll(); // removal can re-split open expenses: ledger shares change too
    } catch (err) {
      if (isStaleRemoval(err)) throw err; // PeopleTab keeps the sheet open and reloads the preview
      toast({
        title: t('groupDetail.removeMember'),
        message: err.code === 'HAS_OPEN_BALANCE' ? err.message || t('m.group.removeBlocked', { name: m.display_name }) : err.message,
        color: 'red',
      });
    }
  };

  const copyExpense = async (item) => {
    setItemBusy(true);
    try {
      const x = await api.get(`/api/v1/expenses/${item.id}`);
      setItemSheet(null);
      navigation.navigate('AddExpense', { id, copyFrom: x.expense });
    } catch (err) { toast({ title: t('m.error.failed'), message: err.message, color: 'red' }); }
    finally { setItemBusy(false); }
  };

  if (!detail) {
    return (
      <Screen>
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
        <ErrText e={e} />
        {e ? <Button variant="ghost" title={t('m.retry')} onPress={refreshAll} /> : null}
      </Screen>
    );
  }

  const [lbg, lfg] = LIFECYCLE_TONE[lifecycle] || LIFECYCLE_TONE.opening;
  const net = me?.net_cents ?? null;
  const netTone = net == null ? null : net === 0 ? 'settled' : net < 0 ? 'open' : 'owed';
  const tabs = [
    { value: 'ledger', label: ledger?.total != null ? t('groupDetail.tabExpensesCount', { count: ledger.total }) : t('groupDetail.tabExpenses') },
    { value: 'balances', label: t('groupDetail.tabBalances') },
    { value: 'people', label: `${t('groupDetail.tabPeople')} (${members.length})` },
    { value: 'activity', label: t('groupDetail.tabActivity') },
    { value: 'recurring', label: t('groupDetail.tabRecurring') },
  ];

  return (
    <Screen
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); try { await refreshAll(); } finally { setRefreshing(false); } }}
          tintColor={colors.primary}
        />
      )}
    >
      {/* Hero */}
      <Card>
        <Row gap={12}>
          <GroupThumb name={detail.name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.h1} numberOfLines={2}>{detail.name}</Text>
            <Text style={type.small} numberOfLines={1}>
              {[
                t('groupDetail.membersCount', { count: members.length, unit: members.length === 1 ? t('common.person') : t('common.people') }),
                detail.currency,
                detail.my_role === 'owner' ? t('common.owner') : detail.my_role === 'treasurer' ? t('common.treasurer') : null,
                detail.mode && detail.mode !== 'shared' ? detail.mode : null,
              ].filter(Boolean).join(' · ')}
            </Text>
            {detail.created_at ? <Text style={[type.small, { color: colors.muted }]}>{t('report.createdOn')} · {d.dateTime(detail.created_at)}</Text> : null}
          </View>
        </Row>
        <Row gap={6} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {settled != null ? (
            <Text style={[st.chip, settled ? { backgroundColor: colors.kind.settled[0], color: colors.kind.settled[1] } : { backgroundColor: colors.openBg, color: colors.openText }]}>
              {settled ? t('settlement.statusSettled') : t('settlement.statusOpen')}
            </Text>
          ) : null}
          <Text style={[st.chip, { backgroundColor: lbg, color: lfg }]}>{t(`groupStatus.${lifecycle}`)}</Text>
          {plan?.version != null ? <Text style={[st.chip, { backgroundColor: colors.chipBg, color: colors.secondary }]}>{t('report.settlementVer', { version: plan.version })}</Text> : null}
        </Row>
        {detail.budget ? (
          <View style={{ marginTop: 12, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={type.small}>
                {t('groupDetail.budget')} {fmt(detail.budget.spent_cents, currency)} / {fmt(detail.budget.budget_cents, currency)} · {detail.budget.over ? t('groupDetail.budgetOver') : detail.budget.alert ? t('groupDetail.budgetNear') : t('groupDetail.budgetOnTrack')}
              </Text>
              <Text style={type.small}>{detail.budget.pct}%</Text>
            </Row>
            <Bar value={detail.budget.pct} color={detail.budget.over ? colors.danger : detail.budget.alert ? '#f59e0b' : colors.primary} />
          </View>
        ) : null}
      </Card>

      {/* My net */}
      {net != null ? (
        <Card tone={netTone} onPress={() => navigation.navigate('Settlement', { id })} accessibilityLabel={t('settlement.viewDetails')}>
          <Text style={type.kicker}>{net === 0 ? t('net.allClear') : net < 0 ? t('net.youOweShort') : t('net.youreOwed')}</Text>
          <Text style={[type.title, { color: colors.tones[netTone].value, marginTop: 2 }]}>
            {net === 0 ? t('net.settledUp') : fmt(Math.abs(net), currency)}
          </Text>
        </Card>
      ) : null}

      <ErrText e={e} />

      {/* Direct actions */}
      <Row>
        <Button style={{ flex: 1 }} icon="＋" title={t('groupDetail.addExpense')} disabled={!canWrite} onPress={() => navigation.navigate('AddExpense', { id })} />
        <Button style={{ flex: 1 }} variant="pay" title={t('groupDetail.recordPayment')} disabled={!canWrite} onPress={() => pay(null)} />
      </Row>
      <Row>
        {ocr ? <Button small style={{ flex: 1 }} variant="ghost" title={t('scan.open')} disabled={!canWrite} onPress={() => navigation.navigate('ScanReceipts', { id })} /> : null}
        <Button small style={{ flex: 1 }} variant="ghost" title={t('groupDetail.inviteMembers')} onPress={() => navigation.navigate('Invite', { id })} />
        <Button small style={{ flex: ocr ? 0 : 1, paddingHorizontal: 16 }} variant="ghost" title={ocr ? '⋯' : t('m.group.settings')} accessibilityLabel={t('m.group.settings')} onPress={() => setSettingsOpen(true)} />
      </Row>

      {/* Settlement summary */}
      <Card onPress={() => navigation.navigate('Settlement', { id })} accessibilityLabel={t('settlement.viewDetails')}>
        <Row>
          <View style={[st.glyph, { backgroundColor: settled ? colors.kind.settled[0] : colors.openBg }]}>
            <Text style={{ fontSize: 16, color: settled ? colors.kind.settled[1] : colors.openText, fontWeight: '900' }}>{settled ? '✓' : '!'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{settled ? t('settlement.statusSettled') : t('settlement.statusOpen')}</Text>
            <Text style={type.small}>
              {settled ? t('settlement.statusSettledHint') : t('settlement.statusOpenHint', { n: transfers.length || debtors.length || 0 })}
            </Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
        </Row>
      </Card>
      <Row>
        <Button small style={{ flex: 1 }} variant="soft" title={t('report.title')} onPress={() => navigation.navigate('Report', { id })} />
        <Button small style={{ flex: 1 }} variant="soft" title={t('groupDetail.tabStatement')} onPress={() => navigation.navigate('Statement', { id, userId: meId })} />
      </Row>

      {/* Tabs */}
      <View style={{ marginTop: 4 }}>
        <ChipRow scroll options={tabs} value={tab} onChange={changeTab} />
      </View>

      {tab === 'ledger' ? (
        <LedgerTab
          items={ledgerItems}
          loading={ledgerLoading}
          loaded={!!ledger}
          currency={currency}
          members={members}
          categories={categories}
          type={kind}
          onType={setKind}
          q={q}
          onQ={setQ}
          filters={filters}
          onApplyFilters={applyFilters}
          emptyKind={ledgerEmptyKind(filters.status, settled, hasLedgerHistory(summary))}
          onOpen={(it) => navigation.navigate('ExpenseDetail', { groupId: id, expenseId: it.id })}
          onItemActions={(it) => setItemSheet(it)}
        />
      ) : null}
      {tab === 'balances' ? (
        <BalancesTab
          byDebtor={byDebtor}
          debtors={debtors}
          members={members}
          currency={currency}
          meId={meId}
          canWrite={canWrite}
          nudging={nudging}
          onNudge={nudge}
          onPay={pay}
        />
      ) : null}
      {tab === 'people' ? (
        <PeopleTab detail={detail} members={members} meId={meId} onSetRole={setRole} onSetDeposit={setDeposit} onRemove={removeMember} onRemovalPreview={removalPreview} />
      ) : null}
      {tab === 'activity' ? (
        <ActivityTab
          feed={feed}
          loading={activityLoading}
          detail={detail}
          members={members}
          currency={currency}
          onRefresh={loadActivityFeed}
          onReverse={reversePay}
        />
      ) : null}
      {tab === 'recurring' ? (
        <RecurringTab groupId={id} members={members} currency={currency} rules={rules} canWrite={canWrite} onChanged={loadRules} />
      ) : null}

      <Sheet visible={!!itemSheet} onClose={() => !itemBusy && setItemSheet(null)} title={itemSheet?.title}>
        {itemSheet ? (
          <View>
            <MenuRow label={t('common.viewDetails')} onPress={() => { const it = itemSheet; setItemSheet(null); navigation.navigate('ExpenseDetail', { groupId: id, expenseId: it.id }); }} />
            <MenuRow label={t('groupDetail.copyExpense')} disabled={!canWrite || itemBusy} onPress={() => copyExpense(itemSheet)} last={!canEditExpense(itemSheet, detail, meId)} />
            {canEditExpense(itemSheet, detail, meId) ? (
              <MenuRow last label={t('groupDetail.editExpense')} onPress={() => { const it = itemSheet; setItemSheet(null); navigation.navigate('AddExpense', { id, expenseId: it.id }); }} />
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <GroupSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        groupId={id}
        detail={detail}
        categories={categories}
        onReloadCategories={loadCategories}
        onChanged={load}
        onLeft={() => navigation.popTo('Main', { screen: 'Groups' })}
        onOpenStatement={() => navigation.navigate('Statement', { id, userId: meId })}
        onOpenReport={() => navigation.navigate('Report', { id })}
      />
    </Screen>
  );
}

/** Legacy groups list (kept until GroupsScreen.js stops re-exporting it). */
export function GroupsScreen({ navigation }) {
  const t = useT();
  const [groups, setGroups] = useState(null);
  useFocusEffect(useCallback(() => {
    (async () => {
      try { setGroups((await api.get('/api/v1/me/balances')).groups || []); }
      catch { setGroups([]); }
    })();
  }, []));
  if (!groups) return <Screen><SkeletonCard /><SkeletonCard /></Screen>;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={groups}
      keyExtractor={(g) => g.group_id}
      ListEmptyComponent={<Text style={type.small}>{t('dashboard.noGroups')}</Text>}
      renderItem={({ item: g }) => (
        <Card onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}>
          <Row>
            <GroupThumb name={g.name} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{g.name}</Text>
              <Text style={type.small}>{g.currency} · {fmt(Math.abs(g.net_cents), g.currency)}</Text>
            </View>
          </Row>
        </Card>
      )}
    />
  );
}

const st = StyleSheet.create({
  chip: { fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  glyph: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
