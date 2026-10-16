// Frame 2 · Home — FR-11. Web parity: Dashboard home view (boxed, whole-card nav).
// GET /me/balances grouped by currency, NEVER summed. UX polish: skeletons,
// whole-card press, spinner-safe refresh.
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt } from '../api/client';
import { colors } from '../theme';
import { SkeletonCard, NetBadge, ErrText } from '../ui';
import { setOwedBadge } from '../push/notifications';

export default function HomeScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [e, setE] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true); setE(null);
    try {
      const d = await api.get('/api/v1/me/balances');
      setData(d);
      const owe = Object.values(d?.totals || {}).reduce((a, t) => a + (t.owe_cents || 0), 0);
      setOwedBadge(owe);
    } catch (err) { setE(err); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byCurrency = {};
  for (const g of data?.groups || []) {
    (byCurrency[g.currency] ||= []).push(g);
  }
  const oweUsd = data?.totals?.USD?.owe_cents ?? null;

  return (
    <ScrollView style={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.hero}>
        <Text style={s.heroK}>YOU OWE · USD</Text>
        <Text style={s.heroAmt}>{data ? fmt(oweUsd ?? totalOwe(data), 'USD') : '…'}</Text>
        <Text style={s.heroSub}>Owed amounts in other currencies shown per-currency · never summed</Text>
      </View>
      <ErrText e={e} />
      {!data && [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
      {Object.entries(byCurrency).map(([cur, groups]) => (
        <View key={cur}>
          <Text style={s.sec}>{cur} — {groups.length} group{groups.length > 1 ? 's' : ''}</Text>
          {groups.map((g) => (
            <Pressable
              key={g.group_id}
              style={s.card}
              accessibilityRole="button"
              onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
            >
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.h}>{g.name}</Text>
                  <Text style={netColor(g.net_cents)}>
                    {g.net_cents === 0 ? 'Settled' : g.net_cents < 0 ? `You owe ${fmt(-g.net_cents, g.currency)}` : `Owed ${fmt(g.net_cents, g.currency)}`}
                  </Text>
                  {g.delinquent ? <Text style={s.warn}>⚠ &gt;30d unsettled</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <NetBadge net={g.net_cents} />
                  <Text style={s.chev}>›</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
      {data && (data.groups || []).length === 0 && (
        <View style={s.card}>
          <Text style={s.h}>No groups yet</Text>
          <Text style={s.muted}>Tap Add to create your first group.</Text>
          <Pressable style={s.btn} onPress={() => navigation.navigate('NewGroup')}>
            <Text style={s.btnT}>＋ New group</Text>
          </Pressable>
        </View>
      )}
      <Pressable style={s.ghost} onPress={() => navigation.navigate('NewGroup')}>
        <Text style={s.ghostT}>＋ New group</Text>
      </Pressable>
    </ScrollView>
  );
}

function totalOwe(data) {
  return Object.values(data?.totals || {}).reduce((a, t) => a + (t.owe_cents || 0), 0);
}
function netColor(net) {
  if (net === 0) return { color: colors.secondary };
  return net < 0
    ? { color: colors.debtorText, fontWeight: '700' }
    : { color: colors.owedText, fontWeight: '700' };
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  hero: { backgroundColor: colors.darkHero, borderRadius: 16, padding: 13, marginBottom: 6 },
  heroK: { color: colors.muted, fontSize: 11 },
  heroAmt: { color: '#fff', fontSize: 26, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: colors.muted, fontSize: 11 },
  sec: { fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 8, minHeight: 44 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary },
  warn: { fontSize: 11, color: colors.warnText, fontWeight: '700' },
  chev: { fontSize: 18, color: colors.muted, fontWeight: '700' },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8, minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700' },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
  ghostT: { fontWeight: '700' },
});
