// Frame 2 · Home — balances by currency (FR-11).
// Design: docs/mobile-design.html §2. Web parity: web/src/pages/Dashboard.jsx.
// API: GET /me/balances (groups grouped by currency, NEVER summed across
// currencies; flag >30d unsettled) + GET /groups/:id/me for header net.
// Badge = total owed (tab badge wired in App.js).
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt } from '../api/client';
import { colors } from '../theme';

export default function HomeScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.get('/api/v1/me/balances'));
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Group /me/balances response by currency (server already groups; never sum).
  const byCurrency = {};
  for (const g of data?.groups || []) {
    (byCurrency[g.currency] ||= []).push(g);
  }

  return (
    <ScrollView style={s.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <View style={s.hero}>
        <Text style={s.heroK}>YOU OWE · {(data?.groups?.[0]?.currency) || 'USD'}</Text>
        <Text style={s.heroAmt}>{data ? fmt(data.totals?.USD?.owe_cents || totalOwe(data), 'USD') : '…'}</Text>
        <Text style={s.heroSub}>Owed amounts in other currencies shown per-currency · never summed</Text>
      </View>
      {Object.entries(byCurrency).map(([cur, groups]) => (
        <View key={cur}>
          <Text style={s.sec}>{cur} — {groups.length} group{groups.length > 1 ? 's' : ''}</Text>
          {groups.map((g) => (
            <Pressable key={g.group_id} style={s.card} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}>
              <View style={s.row}>
                <View>
                  <Text style={s.h}>{g.name}</Text>
                  <Text style={netStyle(g.net_cents).t}>
                    {g.net_cents === 0 ? 'Settled' : g.net_cents < 0 ? `You owe ${fmt(-g.net_cents, g.currency)}` : `Owed ${fmt(g.net_cents, g.currency)}`}
                  </Text>
                </View>
                <Text style={netStyle(g.net_cents).b}>{g.net_cents === 0 ? 'SETTLED' : g.net_cents < 0 ? 'OWE' : 'OWED'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
      {!data && !refreshing && <Text style={s.muted}>Loading balances… (&lt;500ms ledger / contacts &lt;200ms p95)</Text>}
    </ScrollView>
  );
}

function totalOwe(data) {
  return Object.values(data?.totals || {}).reduce((a, t) => a + (t.owe_cents || 0), 0);
}
function netStyle(net) {
  if (net === 0) return { t: { color: colors.secondary }, b: s.bLock };
  return net < 0
    ? { t: { color: colors.debtorText, fontWeight: '700' }, b: s.bRed }
    : { t: { color: colors.owedText, fontWeight: '700' }, b: s.bTeal };
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  hero: { backgroundColor: colors.darkHero, borderRadius: 16, padding: 13 },
  heroK: { color: colors.muted, fontSize: 11 },
  heroAmt: { color: '#fff', fontSize: 26, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: colors.muted, fontSize: 11 },
  sec: { fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 8, minHeight: 44 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary },
  bRed: { fontSize: 10, fontWeight: '800', backgroundColor: colors.debtorBg, color: colors.debtorText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bTeal: { fontSize: 10, fontWeight: '800', backgroundColor: colors.owedBg, color: colors.owedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
