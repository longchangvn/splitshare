// Settlement details — web parity with components/SettlementBox.jsx (detail dialog):
// status hero, net balances, suggested transfers with Pay, completed transfers, steps +
// raw-debts collapsibles, read-only history versions, refresh, version footer.
// Refreshes on focus so returning from Pay shows the new plan + completed list.
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt, displayNameOf } from '../api/client';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Screen, Card, Button, Row, Chip, SkeletonCard, ErrText, Badge } from '../ui';
import { ListRow, useDateFmt, NetChip, p as parts } from '../components/group/parts';
import { canWriteGroup } from '../components/group/helpers';

export default function SettlementScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const d = useDateFmt();
  const [plan, setPlan] = useState(null);
  const [group, setGroup] = useState(null);
  const [history, setHistory] = useState([]);
  const [viewV, setViewV] = useState(null);
  const [payments, setPayments] = useState([]);
  const [showSteps, setShowSteps] = useState(false);
  const [raw, setRaw] = useState(false);
  const [e, setE] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [histBusy, setHistBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true); setE(null);
    try {
      const [p, g, pay] = await Promise.all([
        api.get(`/api/v1/groups/${id}/settlement`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`).catch(() => ({ items: [] })),
      ]);
      setPlan(p); setGroup(g?.group || g); setPayments(pay?.items || []); setViewV(null);
    } catch (err) { setE(err); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadHist = async () => {
    setHistBusy(true);
    try {
      const h = await api.get(`/api/v1/groups/${id}/settlement/history`);
      setHistory(Array.isArray(h) ? h : h?.plans || []);
    } catch (err) { setE(err); } finally { setHistBusy(false); }
  };

  if (!plan && !e) return <Screen><SkeletonCard /><SkeletonCard /></Screen>;
  if (e && !plan) {
    return (
      <Screen>
        <ErrText e={e} />
        <Button title={t('m.retry')} busy={refreshing} onPress={load} />
      </Screen>
    );
  }

  const members = group?.members || [];
  const currency = group?.currency || 'USD';
  const view = viewV ? history.find((h) => h.version === viewV) || plan : plan;
  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  const settled = transfers.length === 0;
  const canPay = !historical && canWriteGroup(group);
  const subtitle = settled
    ? t('settlement.statusSettledHint')
    : t('settlement.statusOpenHint', { n: transfers.length });

  const netEntries = Object.entries(ex.before_nets || {});
  const balanceRows = netEntries.length > 0
    ? netEntries.map(([uid, cents]) => ({ id: uid, name: displayNameOf(members, uid), cents }))
    : members.map((m) => ({ id: m.user_id, name: m.display_name, cents: 0 }));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}>
      {historical ? (
        <Card style={{ backgroundColor: colors.warnBg, borderColor: '#fdba74' }}>
          <Text style={[type.h3, { color: colors.warnText }]}>{t('settlement.historical', { version: viewV })}</Text>
        </Card>
      ) : null}

      <Card tone={settled ? 'settled' : 'open'}>
        <Row gap={12}>
          <View style={[s.glyph, { borderColor: settled ? colors.kind.settled[1] : colors.openText }]}>
            <Text style={{ color: settled ? colors.kind.settled[1] : colors.openText, fontWeight: '900', fontSize: 16 }}>{settled ? '✓' : '!'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Badge kind={settled ? 'settled' : 'owe'} label={settled ? t('net.settledUp') : t('settlement.needsAction')} />
            <Text style={[type.body, { marginTop: 6 }]}>{subtitle}</Text>
            {!settled && ex.raw_debts != null ? (
              <Text style={type.small}>{t('settlement.optimized', { raw: ex.raw_debts, n: transfers.length })}</Text>
            ) : null}
          </View>
        </Row>
      </Card>

      <Card>
        <Text style={type.h2}>{t('settlement.netBalances')}</Text>
        {balanceRows.length === 0 ? <Text style={[type.small, { marginTop: 8 }]}>{t('settlement.noNets')}</Text> : null}
        {balanceRows.map((row, i) => (
          <ListRow key={row.id} last={i === balanceRows.length - 1} style={{ paddingVertical: 10 }}>
            <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{row.name}</Text>
            <NetChip cents={row.cents} label={row.cents === 0 ? t('common.settled') : fmt(row.cents, currency)} />
          </ListRow>
        ))}
      </Card>

      <Card>
        <Text style={type.h2}>{t('settlement.finalTransfers')}</Text>
        {settled ? <Text style={[type.small, { marginTop: 8 }]}>{t('settlement.allSettledHint')}</Text> : null}
        {transfers.map((x, i) => {
          const from = x.from_user_id || x.from;
          const to = x.to_user_id || x.to;
          const cents = x.amount_cents ?? x.amount ?? 0;
          return (
            <ListRow key={`${from}-${to}-${i}`} last={i === transfers.length - 1}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.h3} numberOfLines={1}>{displayNameOf(members, from)} → {displayNameOf(members, to)}</Text>
                <Text style={parts.amount}>{fmt(cents, currency)}</Text>
              </View>
              {canPay ? (
                <Button small variant="pay" title={t('groupDetail.pay')} onPress={() => navigation.navigate('Pay', { id, from, to, amount: cents })} />
              ) : null}
            </ListRow>
          );
        })}
      </Card>

      <Card>
        <Text style={type.h2}>{t('settlement.completed', { count: payments.length })}</Text>
        {payments.length === 0 ? <Text style={[type.small, { marginTop: 8 }]}>{t('settlement.noTransfers')}</Text> : null}
        {payments.map((p, i) => (
          <ListRow key={p.id || i} last={i === payments.length - 1} style={p.reversed ? { opacity: 0.55 } : null}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={type.h3} numberOfLines={1}>
                {p.from_name || displayNameOf(members, p.from_user_id)} → {p.to_name || displayNameOf(members, p.to_user_id)}
              </Text>
              <Row gap={6}>
                <Text style={parts.meta}>{d.dateTime(p.created_at)}</Text>
                {p.reversed ? <Badge kind="nudge" label={t('settlement.reversed')} /> : null}
                {!p.reversed && String(p.status).toUpperCase() === 'LOCKED' ? <Badge kind="settled" label={t('common.settled')} /> : null}
              </Row>
            </View>
            <Text style={parts.amount}>{fmt(p.amount_cents, currency)}</Text>
          </ListRow>
        ))}
      </Card>

      {(ex.steps || []).length > 0 ? (
        <Card>
          <Collapser label={t('settlement.steps')} open={showSteps} onToggle={() => setShowSteps(!showSteps)} hideLabel={t('settlement.hide')} />
          {showSteps ? (ex.steps || []).map((step, i) => (
            <Text key={i} style={s.step}>{i + 1}. {step}</Text>
          )) : null}
        </Card>
      ) : null}

      <Card>
        <Collapser label={t('settlement.viewRaw')} open={raw} onToggle={() => setRaw(!raw)} hideLabel={t('settlement.hide')} />
        {raw ? <Text style={[type.small, { marginTop: 6 }]}>{t('settlement.rawHint', { raw: ex.raw_debts ?? '—', n: transfers.length })}</Text> : null}
      </Card>

      <Row>
        <Button small style={{ flex: 1 }} variant="ghost" title={t('settlement.history')} busy={histBusy} onPress={loadHist} />
        <Button small style={{ flex: 1 }} variant="ghost" title={t('common.refresh')} busy={refreshing} onPress={load} />
      </Row>
      {history.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('settlement.current')} on={viewV === null} onPress={() => setViewV(null)} />
          {history.map((h) => (
            <Chip key={h.version} label={`v${h.version} · ${d.date(h.computed_at)}`} on={viewV === h.version} onPress={() => setViewV(h.version)} />
          ))}
        </View>
      ) : null}
      {view?.version != null ? (
        <Text style={[type.small, { textAlign: 'center', marginTop: 4 }]}>v{view.version} · {d.dateTime(view.computed_at)}</Text>
      ) : null}
      <ErrText e={e} />
    </Screen>
  );
}

function Collapser({ label, hideLabel, open, onToggle }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
      <Text style={[parts.textAction, { flex: 1 }]}>{open ? hideLabel : label}</Text>
      <Text style={{ color: colors.muted }}>{open ? '⌃' : '⌄'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  glyph: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 10, fontSize: 13, color: colors.darkTealText, marginTop: 8 },
});
