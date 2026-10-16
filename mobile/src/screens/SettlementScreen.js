// Frame 5 · Settlement — FR-7 normative. Web parity: SettlementBox.jsx.
// Collapsible Why-box: header, nets-before, numbered steps, final transfers w/
// Pay, hash/version/timestamp, raw-debts toggle, completed transfers, history
// read-only + refresh. Empty: All settled — nets $0.00 → locks.
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt, displayNameOf } from '../api/client';
import { colors } from '../theme';
import { SkeletonCard, SpinButton, ErrText } from '../ui';

export default function SettlementScreen({ route, navigation }) {
  const { id } = route.params;
  const [plan, setPlan] = useState(null);
  const [group, setGroup] = useState(null);
  const [why, setWhy] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewV, setViewV] = useState(null);
  const [payments, setPayments] = useState([]);
  const [raw, setRaw] = useState(false);
  const [e, setE] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true); setE(null);
    try {
      const [p, g, pay] = await Promise.all([
        api.get(`/api/v1/groups/${id}/settlement`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`).catch(() => ({ items: [] })),
      ]);
      setPlan(p); setGroup(g?.group || g); setPayments(pay.items || []); setViewV(null);
    } catch (err) { setE(err); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadHist = async () => {
    try {
      const h = await api.get(`/api/v1/groups/${id}/settlement/history`);
      setHistory(Array.isArray(h) ? h : h.plans || []);
    } catch (err) { setE(err); }
  };

  if (!plan && !e) return <View style={s.wrap}><SkeletonCard /><SkeletonCard /></View>;
  if (e && !plan) return <View style={s.wrap}><ErrText e={e} /><SpinButton title="Retry" busy={refreshing} onPress={load} /></View>;

  const members = group?.members || [];
  const currency = group?.currency || 'USD';
  const view = viewV ? history.find((h) => h.version === viewV) || plan : plan;
  const ex = view?.explanation || {};
  const transfers = view?.transfers || [];
  const historical = viewV !== null;
  const empty = transfers.length === 0;
  const head = empty
    ? 'All settled — nets all $0.00'
    : `Optimized: ${ex.raw_debts ?? transfers.length} debts → ${transfers.length} transfers (saved ${ex.saved ?? '?'}) • v${view?.version} • Why?`;

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>{head}</Text>
        <Text style={s.muted}>inputs {String(view?.inputs_hash || '').slice(0, 9)}… · v{view?.version} · {view?.computed_at || ''}</Text>
        <Pressable onPress={() => setWhy(!why)} accessibilityRole="button" accessibilityState={{ expanded: why }}>
          <Text style={s.link}>{why ? 'Hide explanation' : 'WHY?'}</Text>
        </Pressable>
        {why && (
          <>
            {historical && <Text style={s.warn}>Historical plan v{viewV} — read-only, not actionable.</Text>}
            <Text style={[s.h, { marginTop: 8 }]}>Net balances before</Text>
            {Object.entries(ex.before_nets || {}).map(([uid, v]) => (
              <View key={uid} style={s.nrow}>
                <Text style={s.small}>{displayNameOf(members, uid)}</Text>
                <Text style={s.small}>{fmt(v, currency)}</Text>
              </View>
            ))}
            <Text style={[s.h, { marginTop: 8 }]}>Steps</Text>
            {(ex.steps || []).map((st, i) => (
              <Text key={i} style={s.step}>{i + 1}. {st}</Text>
            ))}
            {(!ex.steps || ex.steps.length === 0) && <Text style={s.muted}>Greedy: most-negative debtor first, largest creditor first.</Text>}
          </>
        )}
        <Text style={[s.h, { marginTop: 8 }]}>Final transfers</Text>
        {transfers.map((t, i) => (
          <View key={i} style={s.trow}>
            <Text style={s.small}>{displayNameOf(members, t.from_user_id || t.from)} → {displayNameOf(members, t.to_user_id || t.to)} {fmt(t.amount_cents ?? t.amount ?? 0, currency)}</Text>
            {!historical && (
              <Pressable style={s.pay} onPress={() => navigation.navigate('Pay', {
                id, to: t.to_user_id || t.to, from: t.from_user_id || t.from, amount: t.amount_cents ?? t.amount,
              })}>
                <Text style={s.payT}>Pay ›</Text>
              </Pressable>
            )}
          </View>
        ))}
        {empty && (
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={s.h}>All settled — nets $0.00 🎉</Text>
            <Text style={s.muted}>Locks all OPEN expenses + payments (Settled badge).</Text>
          </View>
        )}
        <Pressable onPress={() => setRaw(!raw)}><Text style={s.link}>{raw ? 'Hide raw debts' : 'View raw debts (unoptimized)'}</Text></Pressable>
        {raw && <Text style={s.muted}>Raw view: {ex.raw_debts} participant-share debts collapsed into {transfers.length} transfers.</Text>}
        <Text style={[s.h, { marginTop: 8 }]}>Completed transfers ({payments.length})</Text>
        {payments.length === 0
          ? <Text style={s.muted}>No transfers recorded yet.</Text>
          : payments.slice(0, 10).map((p, i) => (
            <Text key={i} style={s.muted}>{displayNameOf(members, p.from_user_id)} → {displayNameOf(members, p.to_user_id)}: {fmt(p.amount_cents, currency)}{p.reversed ? ' · reversed' : ''}{p.status === 'LOCKED' ? ' · settled' : ''}</Text>
          ))}
        <View style={s.row}>
          <Pressable style={s.quiet} onPress={loadHist}><Text>History</Text></Pressable>
          <Pressable style={s.quiet} onPress={load}><Text>Refresh</Text></Pressable>
        </View>
        {history.length > 0 && (
          <View style={s.chips}>
            <Pressable style={[s.chip, viewV === null && s.chipOn]} onPress={() => setViewV(null)}><Text>current</Text></Pressable>
            {history.map((h) => (
              <Pressable key={h.version} style={[s.chip, viewV === h.version && s.chipOn]} onPress={() => setViewV(h.version)}>
                <Text>v{h.version}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.accentLight, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 11, color: colors.secondary, marginTop: 4 },
  warn: { backgroundColor: colors.warnBg, color: colors.warnText, padding: 8, borderRadius: 8, marginTop: 6, fontSize: 11 },
  link: { color: colors.primary, fontWeight: '700', marginTop: 6 },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 6 },
  nrow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  trow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, padding: 8, marginTop: 8, minHeight: 44 },
  small: { fontSize: 12, fontWeight: '700' },
  pay: { backgroundColor: colors.lightTealBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  payT: { color: colors.darkTealText, fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quiet: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.lightTealBg },
});
