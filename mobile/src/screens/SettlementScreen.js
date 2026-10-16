// Frame 5 · Settlement — minimize transfers ★ (FR-7 normative).
// Design: docs/mobile-design.html §5. Web parity: components/SettlementBox.jsx.
// API: GET /groups/:id/settlement {version, computed_at, inputs_hash,
// transfers[], explanation} + GET /groups/:id/settlement/history (100).
// Algorithm (server): greedy debtors-asc / creditors-desc, tie user_id asc,
// x=min(-d,c); result ≤ n-1. Canonical check B→A/C→B ⇒ single C→A.
// Stale plan_version on pay → accept + recompute, returns superseded:true.
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';

export default function SettlementScreen({ route, navigation }) {
  const { id } = route.params;
  const [plan, setPlan] = useState(null);
  const [why, setWhy] = useState(false);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setPlan(await api.get(`/api/v1/groups/${id}/settlement`));
    setHistory((await api.get(`/api/v1/groups/${id}/settlement/history`).catch(() => ({ plans: [] }))).plans || []);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!plan) return <View style={s.wrap}><Text>Loading settlement…</Text></View>;
  const empty = (plan.transfers || []).length === 0;

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Optimized: → {plan.transfers?.length || 0} transfers · v{plan.version} · Why?</Text>
        <Text style={s.muted}>inputs {String(plan.inputs_hash).slice(0, 9)}… · aria-expanded ✓</Text>
        <Pressable onPress={() => setWhy(!why)} accessibilityRole="button" accessibilityState={{ expanded: why }}>
          <Text style={s.link}>{why ? 'Hide explanation' : 'WHY?'}</Text>
        </Pressable>
        {why && <Text style={s.step}>{plan.explanation || 'Greedy: most-negative debtor first, largest creditor first.'}</Text>}
        {(plan.transfers || []).map((t, i) => (
          <View key={i} style={s.trow}>
            <Text style={s.small}>{t.from} → {t.to} ${(t.amount_cents / 100).toFixed(2)}</Text>
            <Pressable style={s.pay} onPress={() => navigation.navigate('Pay', { id, to: t.to, amount: t.amount_cents })}>
              <Text style={s.payT}>Pay ›</Text>
            </Pressable>
          </View>
        ))}
        <Text style={s.muted}>☐ raw debts toggle · history {history.map((h) => `v${h.version}`).join(' ') || 'v…'} read-only + diff</Text>
      </View>
      {empty && (
        <View style={s.card}>
          <Text style={s.h}>Empty state · v{plan.version}</Text>
          <Text style={s.muted}>All settled — nets $0.00 🎉 → locks all OPEN</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.accentLight, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 11, color: colors.secondary, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '700', marginTop: 6 },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 8 },
  trow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, padding: 8, marginTop: 8, minHeight: 44 },
  small: { fontSize: 12, fontWeight: '700' },
  pay: { backgroundColor: colors.lightTealBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  payT: { color: colors.darkTealText, fontWeight: '800', fontSize: 12 },
});
