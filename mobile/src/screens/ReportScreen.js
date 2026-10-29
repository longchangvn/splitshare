// Group report — web parity with pages/Report.jsx ReportPanel (screen part, not the print doc).
// Same endpoints: /groups/:id, /summary, /settlement, /breakdown. Charts are View-based
// (no svg dependency): paid-vs-share bars, stacked distribution bars, category % bars.
import React, { useCallback, useState } from 'react';
import { View, Text, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt, displayNameOf } from '../api/client';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Screen, Card, Button, Row, Avatar, SkeletonCard, ErrText } from '../ui';
import { Bar, Swatch, ListRow, NetChip, useDateFmt, p as parts } from '../components/group/parts';
import { categoryRowsOf, distributionOf, chartColorsFor, pct, canWriteGroup } from '../components/group/helpers';

const PAID = '#14b8a6';
const SHARE = '#38bdf8';

export default function ReportScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const d = useDateFmt();
  const [detail, setDetail] = useState(null);
  const [summary, setSummary] = useState([]);
  const [plan, setPlan] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [e, setE] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [at, setAt] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [g, s, p, b] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/summary`).catch(() => []),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
        api.get(`/api/v1/groups/${id}/breakdown`).catch(() => []),
      ]);
      const det = g?.group || g;
      setDetail(det); setSummary(Array.isArray(s) ? s : []); setPlan(p); setBreakdown(Array.isArray(b) ? b : []);
      setAt(new Date().toISOString()); setE(null);
      if (det?.name) navigation.setOptions({ title: `${t('report.title')} · ${det.name}` });
    } catch (err) { setE(err); } finally { setRefreshing(false); }
  }, [id, navigation, t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!detail) {
    return (
      <Screen>
        <SkeletonCard /><SkeletonCard />
        <ErrText e={e} />
        {e ? <Button variant="ghost" title={t('m.retry')} onPress={load} /> : null}
      </Screen>
    );
  }

  const c = detail.currency || 'USD';
  const members = detail.members || [];
  const rows = summary;
  const totalPaid = rows.reduce((a, m) => a + (m.total_paid_cents || 0), 0);
  const totalShare = rows.reduce((a, m) => a + (m.total_share_cents || 0), 0);
  const transfers = plan?.transfers || [];
  const settled = transfers.length === 0;
  const canPay = canWriteGroup(detail);

  const paid = distributionOf(
    [...rows].sort((a, b) => b.total_paid_cents - a.total_paid_cents).map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_paid_cents || 0 })),
    'member',
  );
  const share = distributionOf(
    [...rows].sort((a, b) => b.total_share_cents - a.total_share_cents).map((m) => ({ key: m.user_id, label: m.display_name, value: m.total_share_cents || 0 })),
    'member',
  );
  const barRows = [...rows].sort((a, b) => Math.max(b.total_paid_cents, b.total_share_cents) - Math.max(a.total_paid_cents, a.total_share_cents));
  const barMax = Math.max(1, ...rows.flatMap((m) => [m.total_paid_cents || 0, m.total_share_cents || 0]));
  const catRows = categoryRowsOf(breakdown, t);
  const catTotal = catRows.reduce((a, r) => a + r.value, 0);
  const catColors = chartColorsFor(catRows.map((r) => r.key), 'category');

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}>
      <ErrText e={e} />
      {/* Metrics */}
      <Card tone={settled ? 'settled' : 'open'} onPress={() => navigation.navigate('Settlement', { id })} accessibilityLabel={t('settlement.viewDetails')}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={type.h2}>{settled ? t('settlement.statusSettled') : t('settlement.statusOpen')}</Text>
            <Text style={type.small}>{settled ? t('settlement.statusSettledHint') : t('settlement.statusOpenHint', { n: transfers.length })}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
        </Row>
      </Card>
      <View style={s.grid}>
        <Metric label={t('report.totalPaid')} value={fmt(totalPaid, c)} />
        <Metric label={t('report.totalShare')} value={fmt(totalShare, c)} />
        <Metric label={t('common.members')} value={String(members.length)} sub={`${detail.mode || 'shared'} · ${c}`} />
        {detail.budget ? (
          <Metric
            label={t('report.budget')}
            value={`${detail.budget.pct}%`}
            sub={`${fmt(detail.budget.spent_cents, c)} / ${fmt(detail.budget.budget_cents, c)}`}
            alert={detail.budget.over}
          />
        ) : null}
      </View>

      {/* Settlement transfers */}
      {transfers.length > 0 ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h2}>{t('report.settlement')}</Text>
            <Text style={type.small}>{t(transfers.length === 1 ? 'report.transferCountOne' : 'report.transferCount', { count: transfers.length })}</Text>
          </Row>
          {transfers.map((x, i) => (
            <ListRow key={`${x.from_user_id}-${x.to_user_id}-${i}`} last={i === transfers.length - 1}>
              <View style={s.step}><Text style={s.stepT}>{i + 1}</Text></View>
              <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
                {displayNameOf(members, x.from_user_id)} → {displayNameOf(members, x.to_user_id)}
              </Text>
              <Text style={parts.amount}>{fmt(x.amount_cents, c)}</Text>
              {canPay ? (
                <Button small variant="soft" title={t('groupDetail.pay')} onPress={() => navigation.navigate('Pay', { id, from: x.from_user_id, to: x.to_user_id, amount: x.amount_cents })} />
              ) : null}
            </ListRow>
          ))}
          {at ? <Text style={[type.small, { marginTop: 8 }]}>{t('report.generated', { when: d.dateTime(at) })}</Text> : null}
        </Card>
      ) : null}

      {/* Paid vs share */}
      <Card>
        <Text style={type.h2}>{t('report.paidVsShare')}</Text>
        <Row gap={14} style={{ marginTop: 6 }}>
          <Row gap={6}><Swatch color={PAID} /><Text style={type.small}>{t('charts.paid')}</Text></Row>
          <Row gap={6}><Swatch color={SHARE} /><Text style={type.small}>{t('charts.share')}</Text></Row>
        </Row>
        {barRows.length === 0 ? <Text style={[type.small, { marginTop: 10 }]}>{t('charts.noMemberTotals')}</Text> : null}
        {barRows.map((m) => (
          <View key={m.user_id} style={{ marginTop: 12, gap: 4 }} accessible accessibilityLabel={`${m.display_name}: ${t('charts.paidTip', { amount: fmt(m.total_paid_cents, c) })}, ${t('charts.shareTip', { amount: fmt(m.total_share_cents, c) })}`}>
            <Text style={type.h3} numberOfLines={1}>{m.display_name}</Text>
            <Row gap={8}>
              <View style={{ flex: 1 }}><Bar value={((m.total_paid_cents || 0) / barMax) * 100} color={PAID} height={10} /></View>
              <Text style={[parts.meta, s.barNum]}>{fmt(m.total_paid_cents, c)}</Text>
            </Row>
            <Row gap={8}>
              <View style={{ flex: 1 }}><Bar value={((m.total_share_cents || 0) / barMax) * 100} color={SHARE} height={10} /></View>
              <Text style={[parts.meta, s.barNum]}>{fmt(m.total_share_cents, c)}</Text>
            </Row>
          </View>
        ))}
      </Card>

      <Distribution title={t('report.whoPaid')} data={paid} currency={c} empty={t('report.noPayments')} totalLabel={t('charts.total')} />
      <Distribution title={t('report.whoOwesShare')} data={share} currency={c} empty={t('report.noShares')} totalLabel={t('charts.total')} />

      {/* Per person */}
      <Card style={{ paddingBottom: 4 }}>
        <Text style={type.h2}>{t('report.perPerson')}</Text>
        {rows.map((m, i) => (
          <ListRow key={m.user_id} last={i === rows.length - 1}>
            <Avatar name={m.display_name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={type.h3} numberOfLines={1}>{m.display_name}</Text>
              <Text style={parts.meta} numberOfLines={1}>
                {t('report.paid')} <Text style={{ fontWeight: '700', color: colors.text }}>{fmt(m.total_paid_cents, c)}</Text>
                {'  ·  '}
                {t('report.share')} <Text style={{ fontWeight: '700', color: colors.text }}>{fmt(m.total_share_cents, c)}</Text>
              </Text>
            </View>
            <NetChip cents={m.net_cents} label={m.net_cents === 0 ? t('common.settled') : fmt(m.net_cents, c)} />
          </ListRow>
        ))}
      </Card>

      {/* By category */}
      <Card style={{ paddingBottom: 4 }}>
        <Text style={type.h2}>{t('report.byCategory')}</Text>
        {catRows.length === 0 ? <Text style={[type.small, { marginVertical: 10 }]}>{t('report.noCategories')}</Text> : null}
        {catRows.length > 0 ? (
          <View style={[s.stack, { marginTop: 10 }]}>
            {catRows.filter((r) => r.value > 0).map((r) => (
              <View key={r.key} style={{ flex: r.value, backgroundColor: catColors.get(r.key) }} />
            ))}
          </View>
        ) : null}
        {catRows.map((r) => {
          const p = pct(r.value, catTotal);
          return (
            <ListRow key={r.key}>
              <Swatch color={catColors.get(r.key)} size={12} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Row gap={6}>
                  <Text style={[type.h3, { flexShrink: 1 }]} numberOfLines={1}>{r.label}</Text>
                  <Text style={parts.meta}>{t(r.count === 1 ? 'report.catCountOne' : 'report.catCount', { count: r.count })}</Text>
                </Row>
                <Bar value={p} color={catColors.get(r.key)} height={6} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={parts.amount}>{fmt(r.value, c)}</Text>
                <Text style={parts.meta}>{p}%</Text>
              </View>
            </ListRow>
          );
        })}
        {catRows.length > 0 ? (
          <ListRow last>
            <Swatch color={colors.line} size={12} />
            <Text style={[type.h3, { flex: 1 }]}>{t('common.total')}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={parts.amount}>{fmt(catTotal, c)}</Text>
              <Text style={parts.meta}>100%</Text>
            </View>
          </ListRow>
        ) : null}
      </Card>
    </Screen>
  );
}

function Metric({ label, value, sub, alert }) {
  return (
    <Card style={[s.metric, alert && { borderColor: colors.dangerCardBorder, backgroundColor: colors.dangerCardBg }]}>
      <Text style={type.kicker} numberOfLines={1}>{label}</Text>
      <Text style={[type.h1, { marginTop: 4 }, alert && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={type.small} numberOfLines={1}>{sub}</Text> : null}
    </Card>
  );
}

/** Stacked proportion bar + legend rows (native stand-in for web MoneyDonut). */
function Distribution({ title, data, currency, empty, totalLabel }) {
  return (
    <Card style={{ paddingBottom: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={type.h2}>{title}</Text>
        {data.total > 0 ? <Text style={type.small}>{totalLabel} {fmt(data.total, currency)}</Text> : null}
      </Row>
      {data.total <= 0 ? <Text style={[type.small, { marginVertical: 10 }]}>{empty}</Text> : (
        <>
          <View style={[s.stack, { marginTop: 10 }]}>
            {data.rows.map((r) => <View key={r.key} style={{ flex: r.value, backgroundColor: r.color }} />)}
          </View>
          {data.rows.map((r, i) => (
            <ListRow key={r.key} last={i === data.rows.length - 1} style={{ paddingVertical: 10, minHeight: 40 }}>
              <Swatch color={r.color} size={12} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{r.label}</Text>
              <Text style={parts.meta}>{r.pct}%</Text>
              <Text style={[parts.amount, { minWidth: 80, textAlign: 'right' }]}>{fmt(r.value, currency)}</Text>
            </ListRow>
          ))}
        </>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexBasis: '47%', flexGrow: 1, padding: 14 },
  step: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 12, fontWeight: '800', color: colors.primaryText },
  stack: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: '#eef2f0', gap: 2 },
  barNum: { minWidth: 76, textAlign: 'right' },
});
