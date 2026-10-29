// Report (spec 005 task 4.2) — metric cards, settlement status → detail,
// paid-vs-share bars per member, per-person table and category breakdown.
// No chart library and no export control (D3/G-1: export stays web-only).
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, ErrorBanner, Money, PressableRow, ShareBars, SkeletonCard, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { fmt, percentOf } from '../lib/money';
import { categoryLabelForKey } from '../lib/categories';

export default function Report({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const [group, setGroup] = useState(null);
  const [summary, setSummary] = useState([]);
  const [plan, setPlan] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [categories, setCategories] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [g, s, p, b, cats] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/summary`).catch(() => []),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
        api.get(`/api/v1/groups/${id}/breakdown`).catch(() => []),
        api.get(`/api/v1/groups/${id}/categories`).catch(() => []),
      ]);
      setGroup(g.group || g);
      setSummary(Array.isArray(s) ? s : []);
      setPlan(p);
      setBreakdown(Array.isArray(b) ? b : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) { setError(err); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const currency = group.currency || 'USD';
  const totalSpend = summary.reduce((sum, m) => sum + (m.total_paid_cents || 0), 0);
  const mine = summary.find((m) => m.user_id === meId);
  const transfers = plan?.transfers || [];
  const settled = transfers.length === 0;
  const budget = group.budget || null;

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <Text style={s.title}>{t('report.tripReport')} · {group.name}</Text>
      <Text style={uiStyles.muted}>{group.currency} · {t(`groupStatus.${group.status || 'opening'}`)}</Text>

      <View style={s.metrics}>
        <Metric label={t('report.totalSpend')} value={fmt(totalSpend, currency)} />
        <Metric label={t('report.totalPaid')} value={fmt(mine?.total_paid_cents || 0, currency)} />
        <Metric label={t('report.totalShare')} value={fmt(mine?.total_share_cents || 0, currency)} />
        <Metric
          label={t('report.balance')}
          value={fmt(Math.abs(mine?.net_cents || 0), currency)}
          tone={(mine?.net_cents || 0) < 0 ? 'owe' : (mine?.net_cents || 0) > 0 ? 'owed' : 'settled'}
        />
      </View>

      {budget?.budget_cents ? (
        <Card>
          <View style={s.rowBetween}>
            <Text style={uiStyles.h}>{t('report.budget')}</Text>
            <Text style={uiStyles.muted}>
              {fmt(budget.spent_cents || 0, currency)} / {fmt(budget.budget_cents, currency)}
            </Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${percentOf(budget.spent_cents, budget.budget_cents)}%` }]} />
          </View>
        </Card>
      ) : null}

      <Card onPress={() => navigation.navigate('Settlement', { id })} accessibilityLabel={t('settlement.viewDetails')}>
        <View style={s.rowBetween}>
          <Text style={uiStyles.h}>{t('report.settlement')}</Text>
          <Text style={settled ? s.settledTag : s.openTag}>
            {settled ? t('settlement.statusSettled') : t('settlement.needsAction')}
          </Text>
        </View>
        <Text style={uiStyles.muted}>
          {settled ? t('settlement.statusSettledHint') : t('settlement.statusOpenHint', { n: transfers.length, saved: plan?.explanation?.saved ?? '—' })}
        </Text>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('report.whoPaid')}</Text>
        <ShareBars
          rows={summary.map((m) => ({ key: `p-${m.user_id}`, label: m.display_name, value: m.total_paid_cents }))}
          currency={currency}
          emptyLabel={t('report.noPayments')}
        />
        <Text style={[uiStyles.h, { marginTop: 12 }]}>{t('report.whoOwesShare')}</Text>
        <ShareBars
          rows={summary.map((m) => ({ key: `s-${m.user_id}`, label: m.display_name, value: m.total_share_cents, tone: 'danger' }))}
          currency={currency}
          emptyLabel={t('report.noShares')}
        />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('report.perPerson')}</Text>
        <View style={[s.rowBetween, s.headRow]}>
          <Text style={[s.headCell, { flex: 1 }]}>{t('report.member')}</Text>
          <Text style={s.headCell}>{t('report.paid')}</Text>
          <Text style={s.headCell}>{t('report.share')}</Text>
          <Text style={s.headCell}>{t('report.net')}</Text>
        </View>
        {summary.map((m) => {
          const net = m.net_cents || 0;
          return (
            <View key={m.user_id} style={s.rowBetween}>
              <Text style={[s.cell, { flex: 1 }]} numberOfLines={1}>{m.display_name}</Text>
              <Text style={s.cell}>{fmt(m.total_paid_cents || 0, currency)}</Text>
              <Text style={s.cell}>{fmt(m.total_share_cents || 0, currency)}</Text>
              <Money
                cents={Math.abs(net)}
                currency={currency}
                size="xs"
                tone={net < 0 ? 'owe' : net > 0 ? 'owed' : 'settled'}
                style={{ minWidth: 72, textAlign: 'right' }}
              />
            </View>
          );
        })}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('report.byCategory')}</Text>
        <Text style={uiStyles.muted}>{t('report.byCategoryHint')}</Text>
        {breakdown.length === 0 && <Text style={uiStyles.muted}>{t('report.noCategories')}</Text>}
        <ShareBars
          rows={breakdown.map((row) => ({
            key: row.category || 'none',
            label: `${categoryLabelForKey(row.category, categories, t)} (${row.expense_count})`,
            value: row.paid_cents,
          }))}
          currency={currency}
          emptyLabel={t('report.noCategories')}
        />
        <PressableRow title={t('groupDetail.tabCategories')} onPress={() => navigation.navigate('Categories', { id })} />
      </Card>

      <ErrorBanner error={error} onRetry={load} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Metric({ label, value, tone }) {
  const color = tone === 'owe' ? colors.debtorText : tone === 'owed' ? colors.owedText : colors.text;
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 8 },
  metric: {
    width: '48%', backgroundColor: colors.card, borderColor: colors.cardBorder,
    borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 68,
  },
  metricLabel: { fontSize: 10, fontWeight: '800', color: colors.secondary, textTransform: 'uppercase' },
  metricValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  headRow: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder, paddingBottom: 6 },
  headCell: { fontSize: 10, fontWeight: '800', color: colors.secondary, minWidth: 68, textAlign: 'right' },
  cell: { fontSize: 11, color: colors.text, minWidth: 68, textAlign: 'right' },
  settledTag: { fontSize: 10, fontWeight: '800', color: colors.owedText, backgroundColor: colors.owedBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  openTag: { fontSize: 10, fontWeight: '800', color: colors.openText, backgroundColor: colors.openBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.lockedBg, overflow: 'hidden', marginTop: 6 },
  fill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
});
