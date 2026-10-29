// Home (spec 005 task 1.1) — web Dashboard parity:
// per-currency headline (never summed), balance sheet with the optimizer's
// transfers and one-tap Pay, settled-groups gauge, needs-attention rows and the
// three most recent updates. Reads through the cache so offline shows data.
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, EmptyState, ErrorBanner, Money, PressableRow, ProgressBar, SkeletonCard,
  StaleChip, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { buildBalance, fmt } from '../lib/money';
import { buildGlobalActivityQuery, hasGlobalActivity } from '../lib/activity';
import { setOwedBadge } from '../push/notifications';

export default function HomeScreen({ navigation }) {
  const t = useT();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await api.getCached('/api/v1/me/balances', {
        ttlMs: 60_000,
        onData: ({ data: payload, stale: isStale }) => { setData(payload); setStale(isStale); },
      });
      setData(res.data);
      setStale(!!res.stale);

      const caps = await api.get('/api/v1/capabilities').catch(() => null);
      setCapabilities(caps);

      if (hasGlobalActivity(caps)) {
        const feed = await api.get(buildGlobalActivityQuery({ limit: 3 })).catch(() => null);
        setUpdates(feed?.items || []);
      } else {
        // Fallback for an older API build: fan out per group and merge.
        const groups = (res.data?.groups || []).slice(0, 8);
        const lists = await Promise.all(groups.map(async (g) => {
          const rows = await api.get(`/api/v1/groups/${g.group_id}/activity?limit=3`).catch(() => []);
          return rows.map((r) => ({ ...r, group_id: g.group_id, group_name: g.name }));
        }));
        setUpdates(lists.flat().sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 3));
      }

      // Badge shows what I owe in the primary currency only (never a cross-currency sum).
      const balance = buildBalance(res.data?.groups || [], res.data?.balance || null);
      setOwedBadge(Math.abs(Math.min(0, balance.primaryNetCents)));
    } catch (err) {
      setError(err);
    } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return (
      <ScrollView style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </ScrollView>
    );
  }

  const groups = data.groups || [];
  const balance = buildBalance(groups, data.balance || null);

  const attention = groups.filter((g) => g.delinquent);
  const settledPercent = balance.totalGroups > 0
    ? Math.round((balance.settledCount / balance.totalGroups) * 100)
    : 0;

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <View style={s.hero}>
        <View style={s.rowBetween}>
          <Text style={s.heroK}>{t('dashboard.myBalance').toUpperCase()}</Text>
          {stale && <StaleChip label={t('m.state.stale')} />}
        </View>
        {balance.primaryCurrency ? (
          <>
            <Text style={s.heroAmt}>
              {balance.direction === 'owe' ? '' : balance.direction === 'owed' ? '+' : ''}
              {fmt(Math.abs(balance.primaryNetCents), balance.primaryCurrency)}
            </Text>
            <Text style={s.heroSub}>
              {balance.direction === 'owed'
                ? t('dashboard.balanceOwed')
                : balance.direction === 'owe' ? t('dashboard.balanceOwe') : t('net.settledUp')}
              {' · '}
              {balance.direction === 'owe'
                ? t('dashboard.oweInGroups', { count: balance.primaryGroupCount })
                : balance.direction === 'owed'
                  ? t('dashboard.owedInGroups', { count: balance.primaryGroupCount })
                  : t('dashboard.neverSummed')}
            </Text>
          </>
        ) : (
          <>
            <Text style={s.heroAmt}>{fmt(0, 'USD')}</Text>
            <Text style={s.heroSub}>{t('dashboard.noGroups')}</Text>
          </>
        )}

        {balance.currencyCount > 1 && (
          <View style={s.currencyStrip}>
            <Text style={s.currencyNote}>{t('dashboard.multiCurrency', { count: balance.currencyCount })}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
              {balance.byCurrency.map((row) => (
                <View key={row.currency} style={s.currencyChip}>
                  <Text style={s.currencyCode}>{row.currency}</Text>
                  <Money cents={row.net_cents} currency={row.currency} signed size="sm" />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        <Text style={s.neverSummed}>{t('m.currency.hint')}</Text>
      </View>

      <ErrorBanner error={error} onRetry={load} />

      <Card>
        <View style={s.rowBetween}>
          <Text style={uiStyles.h}>{t('dashboard.settleIndex')}</Text>
          <Text style={uiStyles.muted}>{t('dashboard.settledOpen', { settled: balance.settledCount, open: balance.totalGroups - balance.settledCount })}</Text>
        </View>
        <ProgressBar
          percent={settledPercent}
          accessibilityLabel={t('dashboard.settledGroupsRatio')}
        />
        <Text style={uiStyles.muted}>
          {balance.totalGroups === 0
            ? t('dashboard.settleHint')
            : settledPercent === 100
              ? t('dashboard.settleProgressAll', { total: balance.totalGroups })
              : t('dashboard.settleProgress', { settled: balance.settledCount, total: balance.totalGroups })}
        </Text>
      </Card>

      {attention.length > 0 && (
        <Card style={s.warnCard}>
          <Text style={s.warnH}>{t('groupDetail.budgetOver')} 30d</Text>
          {attention.slice(0, 3).map((g) => (
            <PressableRow
              key={g.group_id}
              title={g.name}
              subtitle={t('net.youOwe', { amount: fmt(Math.abs(g.net_cents), g.currency) })}
              onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
            />
          ))}
        </Card>
      )}

      <Text style={s.section}>{t('dashboard.balanceByGroup')}</Text>
      {balance.groups.length === 0 && (
        <EmptyState
          title={groups.length === 0 ? t('dashboard.noGroups') : t('net.allSettled')}
          hint={groups.length === 0 ? t('dashboard.promoBody') : t('dashboard.settleProgressAll', { total: balance.totalGroups })}
          action={groups.length === 0 ? `＋ ${t('dashboard.createGroup')}` : undefined}
          onAction={() => navigation.navigate('NewGroup')}
        />
      )}

      {balance.groups.map((g) => (
        <Card key={g.group_id}>
          <View style={s.rowBetween}>
            <Text style={s.groupName} numberOfLines={1}>{g.name}</Text>
            <Money
              cents={g.net_cents}
              currency={g.currency}
              signed
              tone={g.net_cents < 0 ? 'owe' : 'owed'}
              size="md"
            />
          </View>
          {(g.transfers || []).map((xfer, i) => (
            <View key={`${xfer.from_user_id}-${xfer.to_user_id}-${i}`} style={s.transfer}>
              <View style={{ flex: 1 }}>
                <Text style={s.transferText}>
                  {xfer.from_me
                    ? t('dashboard.transferPay', { name: xfer.to_name })
                    : t('dashboard.transferReceive', { name: xfer.from_name })}
                </Text>
                <Money cents={xfer.amount_cents} currency={g.currency} size="sm" />
              </View>
              <Pressable
                style={s.payBtn}
                onPress={() => navigation.navigate('Pay', {
                  id: g.group_id,
                  from: xfer.from_user_id,
                  to: xfer.to_user_id,
                  amount: xfer.amount_cents,
                  maxCents: xfer.amount_cents,
                })}
                accessibilityRole="button"
                accessibilityLabel={`${t('groupDetail.pay')} ${xfer.from_me ? xfer.to_name : xfer.from_name}`}
              >
                <Text style={s.payT}>{t('groupDetail.pay')}</Text>
              </Pressable>
            </View>
          ))}
          <PressableRow
            title={t('common.viewDetails')}
            onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
            chevron={false}
          />
        </Card>
      ))}

      <Text style={s.section}>{t('dashboard.activity')}</Text>
      {updates.length === 0
        ? <Card><Text style={uiStyles.muted}>{t('dashboard.noActivity')}</Text></Card>
        : updates.map((a, i) => (
          <Card
            key={`${a.group_id}-${a.at}-${i}`}
            onPress={() => navigation.navigate('GroupActivity', { id: a.group_id })}
            accessibilityLabel={a.text}
          >
            <Text style={s.updateText}>{a.text || a.kind}</Text>
            <Text style={uiStyles.muted}>
              {a.group_name || ''} · {a.at ? new Date(a.at).toLocaleString() : ''}
            </Text>
          </Card>
        ))}

      <View style={s.actions}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Pressable style={s.primary} onPress={() => navigation.navigate('NewGroup')} accessibilityRole="button">
            <Text style={s.primaryT}>＋ {t('dashboard.newGroup')}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Pressable
            style={s.ghost}
            onPress={() => navigation.navigate('QuickAdd')}
            accessibilityRole="button"
          >
            <Text style={s.ghostT}>{t('quickAdd.title')}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  hero: { backgroundColor: colors.darkHero, borderRadius: 18, padding: 16, marginBottom: 8 },
  heroK: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  heroAmt: { color: '#fff', fontSize: 30, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: colors.muted, fontSize: 11 },
  neverSummed: { color: colors.muted, fontSize: 10, marginTop: 8 },
  currencyStrip: { marginTop: 10 },
  currencyNote: { color: colors.accentLight, fontSize: 10, fontWeight: '700' },
  currencyChip: { backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  currencyCode: { color: colors.accentLight, fontSize: 9, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 6, color: colors.text },
  groupName: { fontSize: 14, fontWeight: '800', flex: 1, marginRight: 8 },
  transfer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen,
    borderRadius: 10, padding: 10, marginTop: 8, minHeight: 48,
  },
  transferText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  payBtn: {
    backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14,
    paddingVertical: 9, minHeight: 40, justifyContent: 'center',
  },
  payT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  updateText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  warnCard: { backgroundColor: colors.warnBg, borderColor: '#fdba74' },
  warnH: { fontSize: 12, fontWeight: '800', color: colors.warnText },
  actions: { flexDirection: 'row', marginTop: 16 },
  primary: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  primaryT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center', backgroundColor: '#fff' },
  ghostT: { fontWeight: '800', fontSize: 13, color: colors.text },
});
