// Groups list + group shell (spec 005 tasks 1.2, 2.1–2.4).
// Web parity: Dashboard group tiles + GroupDetail hero/ledger/balances, with the
// mobile information hierarchy approved in D5: Expenses · Balances visible,
// everything else in one "⋯" sheet (never more than 3 taps deep).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, EmptyState, ErrorBanner, ListFooter, Money, PressableRow, Segmented,
  Sheet, SkeletonCard, SpinButton, StaleChip, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { currencyNet, fmt, percentOf } from '../lib/money';
import { errorText } from '../lib/errors';
import {
  DEFAULT_FILTERS, activeFilterCount, buildLedgerQuery, isPaymentRow, ledgerEmptyState, ledgerTotals, rowKey,
} from '../lib/ledger';
import { categoryLabelForKey } from '../lib/categories';
import BalancesTab from '../components/BalancesTab';
import PeopleTab from '../components/PeopleTab';
import InviteSheet from '../components/InviteSheet';
import GroupActivity from './GroupActivity';

const GROUP_FILTERS = ['all', 'opening', 'locked', 'closed'];

export function GroupsScreen({ navigation }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await api.getCached('/api/v1/me/balances', {
        ttlMs: 60_000,
        onData: ({ data: payload, stale: isStale }) => {
          setData(payload);
          setStale(isStale);
        },
      });
      setData(res.data);
      setStale(!!res.stale);
    } catch (err) { setError(err); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const groups = data.groups || [];
  const counts = GROUP_FILTERS.reduce((acc, key) => {
    acc[key] = key === 'all' ? groups.length : groups.filter((g) => (g.status || 'opening') === key).length;
    return acc;
  }, {});
  const shown = filter === 'all' ? groups : groups.filter((g) => (g.status || 'opening') === filter);
  const sorted = [...shown].sort((a, b) => Number(!!b.needs_settlement) - Number(!!a.needs_settlement)
    || new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 14 }}
      data={sorted}
      keyExtractor={(g) => g.group_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListHeaderComponent={(
        <View>
          <View style={s.rowBetween}>
            <Text style={s.title}>{t('groups.title')}</Text>
            {stale && <StaleChip label={t('m.state.stale')} />}
          </View>
          <Text style={uiStyles.muted}>{t('groups.shownOf', { shown: sorted.length, total: groups.length })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {GROUP_FILTERS.map((key) => (
              <Chip
                key={key}
                label={key === 'all' ? t('common.all') : t(`groupStatus.${key}`)}
                count={counts[key]}
                selected={filter === key}
                onPress={() => setFilter(key)}
              />
            ))}
          </ScrollView>
          <ErrorBanner error={error} onRetry={load} />
        </View>
      )}
      ListEmptyComponent={(
        <EmptyState
          title={groups.length === 0 ? t('dashboard.noGroups') : t('groups.filterEmpty')}
          hint={groups.length === 0 ? t('dashboard.promoBody') : undefined}
          action={groups.length === 0 ? `＋ ${t('dashboard.createGroup')}` : undefined}
          onAction={() => navigation.navigate('NewGroup')}
        />
      )}
      renderItem={({ item: g }) => <GroupTile group={g} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })} />}
      ListFooterComponent={<View style={{ height: 20 }} />}
    />
  );
}

function GroupTile({ group, onPress }) {
  const t = useT();
  const net = Number(group.net_cents) || 0;
  const tone = net < 0 ? 'owe' : net > 0 ? 'owed' : 'settled';
  return (
    <Card onPress={onPress} accessibilityLabel={`${group.name} ${fmt(net, group.currency)}`}>
      <View style={s.rowBetween}>
        <Text style={s.tileName} numberOfLines={1}>{group.name}</Text>
        <Text style={s.tileMeta}>{(group.status || 'opening').toUpperCase()}</Text>
      </View>
      <Text style={uiStyles.muted}>
        {group.currency} · {t('groupDetail.membersCount', { count: group.member_count ?? 0, unit: (group.member_count ?? 0) === 1 ? t('common.person') : t('common.people') })}
        {group.my_role ? ` · ${group.my_role === 'owner' ? t('common.owner') : group.my_role === 'treasurer' ? t('common.treasurer') : t('common.member')}` : ''}
      </Text>
      <View style={[s.rowBetween, { marginTop: 6 }]}>
        <Money
          cents={net}
          currency={group.currency}
          signed={net !== 0}
          tone={tone}
          size="md"
        />
        <Text style={s.tileMeta}>
          {t('groups.totalSpend')} {fmt(group.spent_cents || 0, group.currency)}
        </Text>
      </View>
      <Text style={[uiStyles.muted, net === 0 ? { color: colors.owedText } : null]}>
        {net === 0 ? t('net.settledUp') : net < 0 ? t('net.youOwe', { amount: fmt(-net, group.currency) }) : t('net.youAreOwed', { amount: fmt(net, group.currency) })}
      </Text>
      {group.delinquent ? <Text style={s.warn}>⚠ &gt;30d</Text> : null}
    </Card>
  );
}

export default function GroupDetailScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();

  const [group, setGroup] = useState(null);
  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState([]);
  const [plan, setPlan] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('OPEN');
  const [tab, setTab] = useState('expenses');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ledgerError, setLedgerError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [page, setPage] = useState(1);
  const reqRef = useRef(0);

  const loadCore = useCallback(async () => {
    setError(null);
    try {
      // Read-through cache: the hero renders instantly from disk when offline.
      const g = await api.getCached(`/api/v1/groups/${id}`, {
        ttlMs: 300_000,
        onData: ({ data, stale: isStale }) => {
          setGroup(data.group || data);
          setStale(isStale);
        },
      });
      setGroup(g.data.group || g.data);
      setStale(!!g.stale);
    } catch (err) {
      setError(err);
    }
    const [m, s, p, cats] = await Promise.all([
      api.get(`/api/v1/groups/${id}/me`).catch(() => null),
      api.get(`/api/v1/groups/${id}/summary`).catch(() => []),
      api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      api.get(`/api/v1/groups/${id}/categories`).catch(() => []),
    ]);
    setMe(m);
    setSummary(Array.isArray(s) ? s : []);
    setPlan(p);
    setCategories(Array.isArray(cats) ? cats : []);
  }, [id]);

  const loadLedger = useCallback(async (nextStatus = status, nextFilters = filters, nextPage = 1) => {
    const req = ++reqRef.current; // stale-response guard
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const path = buildLedgerQuery(id, { ...nextFilters, status: nextStatus, q }, 100 * nextPage);
      const res = await api.get(path);
      if (req !== reqRef.current) return;
      setItems(res.items || []);
      setPage(nextPage);
    } catch (err) {
      if (req !== reqRef.current) return;
      setLedgerError(err);
    } finally {
      if (req === reqRef.current) setLedgerLoading(false);
    }
  }, [id, filters, q, status]);

  const doDelete = async () => {
    Alert.alert('Delete group?', 'Only if zero expenses or fully settled.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/groups/${id}`);
            navigation.popTo('Main', { screen: 'Groups' });
          } catch (err) { Alert.alert('Delete failed', `${err.code} ${err.message}`); }
          finally { setBusy(false); }
        },
      },
    ]);
  };
  const loadAll = useCallback(async () => {
    setRefreshing(true);
    await loadCore();
    await loadLedger();
    setRefreshing(false);
  }, [loadCore, loadLedger]);

  useFocusEffect(useCallback(() => { loadCore(); }, [loadCore]));

  useEffect(() => {
    const timer = setTimeout(() => loadLedger(status, filters, 1), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, JSON.stringify(filters)]);

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={loadCore} />
      </View>
    );
  }

  const members = group.members || [];
  const currency = group.currency || 'USD';
  const myRole = group.my_role;
  const isOwner = myRole === 'owner';
  const canWrite = group.status !== 'closed' && !(group.status === 'locked' && myRole !== 'owner');
  const transfers = plan?.transfers || [];
  const myNet = me?.net_cents ?? currencyNet([group], currency);
  const budget = group.budget || null;
  const totals = ledgerTotals(items);
  const activeFilters = activeFilterCount({ ...filters, q });
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || String(uid || '').slice(0, 8);

  const openExpense = async (row) => {
    const expenseId = row.expense_id || row.id;
    if (isPaymentRow(row)) {
      navigation.navigate('Settlement', { id });
      return;
    }
    navigation.navigate('ExpenseDetail', { groupId: id, expenseId });
  };

  const copyRow = async (row) => {
    try {
      const d = await api.get(`/api/v1/expenses/${row.expense_id || row.id}`);
      const expense = d.expense || d;
      navigation.navigate('AddExpense', { id, copyFrom: expense });
    } catch (err) { Alert.alert(t('groupDetail.copyExpense'), errorText(err, t)); }
  };

  const rowMenu = (row) => {
    if (isPaymentRow(row)) { navigation.navigate('Settlement', { id }); return; }
    Alert.alert(row.title || t('groupDetail.expense'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('groupDetail.copyExpense'), onPress: () => copyRow(row) },
      { text: t('common.edit'), onPress: () => openExpense(row) },
    ]);
  };

  const emptyState = ledgerEmptyState({
    archived: status === 'LOCKED',
    hasHistory: items.length > 0,
    transfers: transfers.length,
  });

  const moreItems = [
    { title: t('groupDetail.tabActivity'), screen: 'GroupActivity' },
    { title: t('groupDetail.tabStatement'), screen: 'Statement' },
    { title: t('report.title'), screen: 'Report' },
    { title: t('groupDetail.tabPeople'), tab: 'people' },
    { title: t('groupDetail.tabRecurring'), screen: 'Recurring' },
    { title: t('groupDetail.tabCategories'), screen: 'Categories' },
    { title: t('groupDetail.inviteMembers'), invite: true },
    { title: t('groupDetail.groupSettings'), screen: 'GroupSettings' },
  ];

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadAll} />}
    >
      <Card>
        <View style={s.rowBetween}>
          <Text style={s.title} numberOfLines={1}>{group.name}</Text>
          {stale && <StaleChip label={t('m.state.stale')} />}
        </View>
        <View style={s.chips}>
          <Chip label={currency} />
          <Chip label={t(`groupStatus.${group.status || 'opening'}`)} />
          <Chip
            label={myRole === 'owner' ? t('common.owner') : myRole === 'treasurer' ? t('common.treasurer') : t('common.member')}
          />
          {transfers.length === 0 && <Chip label={t('common.settled')} selected />}
        </View>
        <Text style={uiStyles.muted}>
          {t('groupDetail.membersCount', { count: members.length, unit: members.length === 1 ? t('common.person') : t('common.people') })}
          {group.created_at ? ` · ${new Date(group.created_at).toLocaleDateString()}` : ''}
        </Text>
        {me && (
          <View style={[s.netBox, myNet < 0 && s.netBoxOwe]}>
            <Text style={s.netLabel}>
              {myNet === 0 ? t('net.settledUp') : myNet < 0 ? t('net.youOweShort') : t('net.owedToYou')}
            </Text>
            <Money cents={Math.abs(myNet)} currency={currency} size="lg" tone={myNet < 0 ? 'owe' : myNet > 0 ? 'owed' : 'settled'} />
          </View>
        )}
        {transfers.length === 0 ? (
          <Text style={s.settledHint}>{t('m.group.allSettled')}</Text>
        ) : (
          <Text style={uiStyles.muted}>{t('settlement.statusOpenHint', { n: transfers.length, saved: plan?.explanation?.saved ?? '—' })}</Text>
        )}
        {budget?.budget_cents ? (
          <View style={{ marginTop: 8 }}>
            <View style={s.rowBetween}>
              <Text style={uiStyles.muted}>{t('groupDetail.budget')}</Text>
              <Text style={uiStyles.muted}>
                {fmt(budget.spent_cents || 0, currency)} / {fmt(budget.budget_cents, currency)}
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${percentOf(budget.spent_cents, budget.budget_cents)}%`, backgroundColor: (budget.spent_cents || 0) > budget.budget_cents ? colors.debtorText : colors.primary }]} />
            </View>
          </View>
        ) : null}
        <View style={s.heroActions}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <SpinButton title={`＋ ${t('groupDetail.addExpense')}`} onPress={() => navigation.navigate('AddExpense', { id })} disabled={!canWrite} />
          </View>
          <View style={{ flex: 1 }}>
            <SpinButton title={t('groupDetail.recordPayment')} variant="ghost" onPress={() => navigation.navigate('Pay', { id })} disabled={!canWrite} />
          </View>
        </View>
      </Card>

      <Segmented
        options={[
          { value: 'expenses', label: t('groupDetail.tabExpenses') },
          { value: 'balances', label: t('groupDetail.tabBalances') },
        ]}
        value={tab}
        onChange={setTab}
        label={t('groupDetail.tabExpenses')}
      />

      {tab === 'expenses' && (
        <View style={{ marginTop: 10 }}>
          <View style={s.searchRow}>
            <TextInput
              style={s.search}
              value={q}
              onChangeText={setQ}
              placeholder={t('groupDetail.searchItem')}
              accessibilityLabel={t('groupDetail.searchItem')}
            />
            <Pressable
              style={[s.filterBtn, activeFilters > 0 && s.filterBtnOn]}
              onPress={() => setFilterOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('groupDetail.filtersActive', { count: activeFilters })}
            >
              <Text style={s.filterT}>⧩ {activeFilters || ''}</Text>
            </Pressable>
          </View>

          <View style={s.chips}>
            <Chip label={t('groupDetail.statusOpen')} selected={status === 'OPEN'} onPress={() => setStatus('OPEN')} />
            <Chip label={t('groupDetail.statusLocked')} selected={status === 'LOCKED'} onPress={() => setStatus('LOCKED')} />
            <Chip
              label={t('common.newest')}
              selected={filters.sort !== 'oldest'}
              onPress={() => setFilters({ ...filters, sort: filters.sort === 'oldest' ? 'created_at_desc' : 'oldest' })}
            />
          </View>

          <ErrorBanner error={ledgerError} onRetry={() => loadLedger()} />

          {items.map((row, index) => {
            const payment = isPaymentRow(row);
            const locked = row.status === 'LOCKED';
            return (
              <Pressable
                key={rowKey(row, index)}
                style={s.row}
                onPress={() => openExpense(row)}
                onLongPress={() => rowMenu(row)}
                accessibilityRole="button"
                accessibilityLabel={payment
                  ? `${nameOf(row.from_user_id)} → ${nameOf(row.to_user_id)} ${fmt(row.amount_cents || 0, currency)}`
                  : `${row.title} ${fmt(row.amount_cents || 0, currency)}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {payment ? `${nameOf(row.from_user_id)} → ${nameOf(row.to_user_id)}` : row.title || t('groupDetail.expense')}
                  </Text>
                  <Text style={uiStyles.muted} numberOfLines={1}>
                    {payment ? (row.method || t('groupDetail.payment')) : categoryLabelForKey(row.category, categories, t)}
                    {' · '}
                    {String(row.created_at || row.spent_at || '').slice(0, 10)}
                    {payment ? '' : ` · ${t('groupDetail.myShare')} ${fmt(row.my_share_cents || 0, currency)}`}
                    {row.reversed ? ` · ${t('common.reversed')}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Money cents={row.amount_cents || 0} currency={currency} size="md" />
                  <Text style={locked ? s.bLock : s.bOpen}>{locked ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}</Text>
                </View>
              </Pressable>
            );
          })}

          {!ledgerLoading && items.length === 0 && (
            <EmptyState
              title={emptyState === 'archive'
                ? t('groupDetail.ledgerEmptyArchive')
                : emptyState === 'all-settled' ? t('groupDetail.ledgerAllSettled') : t('groupDetail.ledgerEmptyActive')}
              hint={emptyState === 'all-settled' ? t('groupDetail.ledgerAllSettledHint') : undefined}
              action={emptyState === 'archive' ? t('groupDetail.viewActive') : emptyState === 'all-settled' ? t('groupDetail.viewArchive') : undefined}
              onAction={() => setStatus(emptyState === 'archive' ? 'OPEN' : 'LOCKED')}
            />
          )}

          {items.length > 0 && (
            <Card>
              <View style={s.rowBetween}>
                <Text style={uiStyles.h}>{t('groupDetail.totalRows', { count: items.length })}</Text>
                <Money cents={totals.amount} currency={currency} size="md" />
              </View>
              <View style={s.rowBetween}>
                <Text style={uiStyles.muted}>{t('groupDetail.myShare')}</Text>
                <Money cents={totals.mine} currency={currency} size="sm" />
              </View>
            </Card>
          )}

          <ListFooter loading={ledgerLoading} done={items.length > 0 && items.length < 100} />
        </View>
      )}

      {tab === 'balances' && (
        <View style={{ marginTop: 10 }}>
          <BalancesTab
            group={group}
            plan={plan}
            loading={!plan}
            canWrite={canWrite}
            onChanged={() => { loadCore(); loadLedger(); }}
            onPay={(xfer) => navigation.navigate('Pay', xfer
              ? { id, from: xfer.from_user_id, to: xfer.to_user_id, amount: xfer.amount_cents, maxCents: xfer.amount_cents }
              : { id })}
          />
        </View>
      )}

      {tab === 'people' && (
        <View style={{ marginTop: 10 }}>
          <PressableRow title={`← ${t('groupDetail.tabExpenses')}`} onPress={() => setTab('expenses')} chevron={false} />
          <PeopleTab group={group} onChanged={loadCore} />
        </View>
      )}

      <PressableRow
        title={`${t('m.group.moreActions')} · ${t('dashboard.activity')}, ${t('groupDetail.tabStatement')}, ${t('report.title')}, ${t('groupDetail.tabPeople')}…`}
        onPress={() => setMoreOpen(true)}
        accessibilityLabel={t('m.group.moreActions')}
        style={{ marginTop: 10 }}
      />

      <ErrorBanner error={error} onRetry={loadCore} />
      <View style={{ height: 24 }} />

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title={t('m.group.more')}>
        {moreItems.map((item) => (
          <PressableRow
            key={item.title}
            title={item.title}
            onPress={() => {
              setMoreOpen(false);
              if (item.invite) setInviteOpen(true);
              else if (item.tab) setTab(item.tab);
              else navigation.navigate(item.screen, { id });
            }}
          />
        ))}
      </Sheet>

      <InviteSheet
        visible={inviteOpen}
        onClose={() => { setInviteOpen(false); loadCore(); }}
        group={group}
        onChanged={loadCore}
      />

      <LedgerFilters
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        members={members}
        categories={categories}
        onApply={(next) => { setFilters(next); setFilterOpen(false); loadLedger(status, next, 1); }}
      />
    </ScrollView>
  );
}

function LedgerFilters({ visible, onClose, filters, members, categories, onApply }) {
  const t = useT();
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('common.filters')}>
      <Text style={s.filterLabel}>{t('groupDetail.filterAll')}</Text>
      <View style={s.chips}>
        {[{ value: '', label: t('common.all') }, { value: 'expense', label: t('groupDetail.filterExpenses') }, { value: 'payment', label: t('groupDetail.filterPayments') }].map((opt) => (
          <Chip key={opt.value || 'all'} label={opt.label} selected={draft.type === opt.value} onPress={() => setDraft({ ...draft, type: opt.value })} />
        ))}
      </View>

      <Text style={s.filterLabel}>{t('groupDetail.payerParty')}</Text>
      <View style={s.chips}>
        <Chip label={t('common.anyone')} selected={!draft.payer_id} onPress={() => setDraft({ ...draft, payer_id: '' })} />
        {members.map((m) => (
          <Chip key={m.user_id} label={m.display_name} selected={draft.payer_id === m.user_id} onPress={() => setDraft({ ...draft, payer_id: m.user_id })} />
        ))}
      </View>

      <Text style={s.filterLabel}>{t('common.category')}</Text>
      <View style={s.chips}>
        <Chip label={t('common.any')} selected={!draft.category} onPress={() => setDraft({ ...draft, category: '' })} />
        {categories.map((c) => (
          <Chip key={c.key} label={categoryLabelForKey(c.key, categories, t)} selected={draft.category === c.key} onPress={() => setDraft({ ...draft, category: c.key })} />
        ))}
      </View>

      <View style={s.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.filterLabel}>{t('groupDetail.minAmount')}</Text>
          <TextInput style={s.search} value={draft.min_amount} onChangeText={(v) => setDraft({ ...draft, min_amount: v })} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.filterLabel}>{t('groupDetail.maxAmount')}</Text>
          <TextInput style={s.search} value={draft.max_amount} onChangeText={(v) => setDraft({ ...draft, max_amount: v })} keyboardType="decimal-pad" placeholder="∞" />
        </View>
      </View>

      <View style={s.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.filterLabel}>{t('common.from')}</Text>
          <TextInput style={s.search} value={draft.from_date} onChangeText={(v) => setDraft({ ...draft, from_date: v })} placeholder="YYYY-MM-DD" maxLength={10} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.filterLabel}>{t('common.to')}</Text>
          <TextInput style={s.search} value={draft.to_date} onChangeText={(v) => setDraft({ ...draft, to_date: v })} placeholder="YYYY-MM-DD" maxLength={10} />
        </View>
      </View>

      <Text style={s.filterLabel}>{t('common.sort')}</Text>
      <View style={s.chips}>
        <Chip label={t('common.newest')} selected={draft.sort !== 'oldest'} onPress={() => setDraft({ ...draft, sort: 'created_at_desc' })} />
        <Chip label={t('common.oldest')} selected={draft.sort === 'oldest'} onPress={() => setDraft({ ...draft, sort: 'oldest' })} />
      </View>

      <SpinButton title={t('common.apply')} onPress={() => onApply(draft)} />
      <SpinButton title={t('common.cancel')} variant="ghost" onPress={() => { setDraft({ ...DEFAULT_FILTERS }); onApply({ ...DEFAULT_FILTERS }); }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800', flex: 1, marginRight: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, minHeight: 60,
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  tileName: { fontSize: 14, fontWeight: '800', flex: 1, marginRight: 8 },
  tileMeta: { fontSize: 11, color: colors.secondary, fontWeight: '600' },
  warn: { fontSize: 11, color: colors.warnText, fontWeight: '700', marginTop: 4 },
  netBox: { marginTop: 10, backgroundColor: colors.paleTealBg, borderRadius: 12, padding: 10 },
  netBoxOwe: { backgroundColor: colors.dangerCardBg },
  netLabel: { fontSize: 11, fontWeight: '800', color: colors.secondary, textTransform: 'uppercase' },
  settledHint: { fontSize: 11, color: colors.owedText, marginTop: 8, fontWeight: '700' },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.lockedBg, overflow: 'hidden', marginTop: 4 },
  fill: { height: 8, borderRadius: 999 },
  heroActions: { flexDirection: 'row', marginTop: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flex: 1, backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44, fontSize: 13,
  },
  filterBtn: {
    marginLeft: 8, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12,
    minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  filterBtnOn: { borderColor: colors.accentLight, backgroundColor: colors.paleTealBg },
  filterT: { fontSize: 13, fontWeight: '800', color: colors.darkTealText },
  filterLabel: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 12, textTransform: 'uppercase' },
  bOpen: { fontSize: 9, fontWeight: '800', backgroundColor: colors.openBg, color: colors.openText, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  bLock: { fontSize: 9, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
});
