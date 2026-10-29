// Group Activity (spec 005 task 3.8) — payments + updates merged newest first,
// 10 per page, refresh, reverse for open payments. Reached from the group "⋯"
// sheet; the global Activity tab uses GET /me/activity instead.
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, ErrorBanner, Money, PressableRow, SkeletonCard, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { ACTIVITY_PAGE_SIZE, mergeGroupActivity, pageCount, pageSlice } from '../lib/activity';

export default function GroupActivity({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const [group, setGroup] = useState(null);
  const [payments, setPayments] = useState([]);
  const [feed, setFeed] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [g, ledger, activity] = await Promise.all([
        api.get(`/api/v1/groups/${id}`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`).catch(() => ({ items: [] })),
        api.get(`/api/v1/groups/${id}/activity?limit=50`).catch(() => []),
      ]);
      setGroup(g?.group || g);
      setPayments(ledger.items || []);
      setFeed(Array.isArray(activity) ? activity : []);
    } catch (err) { setError(err); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = useMemo(() => mergeGroupActivity(payments, feed), [payments, feed]);
  const sliced = pageSlice(rows, page, ACTIVITY_PAGE_SIZE);
  const currency = group?.currency || 'USD';
  const members = group?.members || [];
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || String(uid || '').slice(0, 8);

  const reverse = (payment) => {
    Alert.alert(t('m.settlement.reverseTitle'), t('m.settlement.reverseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupDetail.reverse'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.post(`/api/v1/payments/${payment.payment_id || payment.id}/reverse`, {});
            await load();
          } catch (err) { Alert.alert(t('groupDetail.reverse'), err.message); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  if (!group && !error) {
    return <View style={s.wrap}><SkeletonCard /><SkeletonCard /></View>;
  }

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <Text style={s.title}>{t('groupDetail.tabActivity')}</Text>
      <Text style={uiStyles.muted}>{t('groupDetail.transfersUpdates')} · {t('groupDetail.newestFirst')}</Text>

      {rows.length === 0 && <Card><Text style={uiStyles.muted}>{t('groupDetail.activityEmpty')}</Text></Card>}

      {sliced.rows.map((row) => {
        if (row.kind === 'payment') {
          const p = row.payment;
          const reversed = p.reversed || p.status === 'REVERSED';
          return (
            <Card key={row.key}>
              <View style={s.rowBetween}>
                <Text style={s.itemTitle}>
                  {nameOf(p.from_user_id)} → {nameOf(p.to_user_id)}
                </Text>
                <Money cents={p.amount_cents} currency={currency} size="md" />
              </View>
              <Text style={uiStyles.muted}>
                {new Date(p.created_at).toLocaleString()} · {p.method || ''}
                {reversed ? ` · ${t('settlement.reversed')}` : p.status === 'LOCKED' ? ` · ${t('settlement.statusSettled')}` : ''}
              </Text>
              {!reversed && p.status !== 'LOCKED' && (
                <PressableRow title={t('groupDetail.reverse')} onPress={() => reverse(p)} chevron={false} />
              )}
            </Card>
          );
        }
        const a = row.activity;
        return (
          <Card key={row.key}>
            <View style={s.rowBetween}>
              <Text style={s.kind}>{String(a.kind || '').toUpperCase()}</Text>
              <Text style={uiStyles.muted}>{a.at ? new Date(a.at).toLocaleString() : ''}</Text>
            </View>
            <Text style={s.itemTitle}>{a.text || a.kind}</Text>
            {a.ref && a.kind === 'expense' && (
              <PressableRow
                title={t('common.viewDetails')}
                onPress={() => navigation.navigate('ExpenseDetail', { groupId: id, expenseId: a.ref })}
                chevron={false}
              />
            )}
          </Card>
        );
      })}

      {pageCount(rows.length) > 1 && (
        <View style={s.pager}>
          <Chip
            label={t('common.prev')}
            onPress={() => setPage(Math.max(1, sliced.page - 1))}
          />
          <Text style={s.pageLabel}>{sliced.page} / {pageCount(rows.length)}</Text>
          <Chip
            label={t('common.next')}
            onPress={() => setPage(Math.min(pageCount(rows.length), sliced.page + 1))}
          />
        </View>
      )}
      {busy && <Text style={uiStyles.muted}>{t('profile.saving')}</Text>}
      <ErrorBanner error={error} onRetry={load} />
      <SpinButton title={t('common.refresh')} variant="ghost" onPress={load} busy={refreshing} />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 4 },
  kind: { fontSize: 9, fontWeight: '800', color: colors.darkTealText, backgroundColor: colors.lightTealBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pageLabel: { fontSize: 12, fontWeight: '700', color: colors.secondary },
});
