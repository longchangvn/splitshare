// Frame 8a · Activity/System — offline queue + push + settled-lock note.
// V1 NFR: offline draft queue auto-sync (same key), push per-group opt-out,
// deep link splitshare://g/<token>, badge = total owed.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import { getQueue, drainQueue, subscribeReconnect } from '../offline/queue';
import { registerPush, getOptOuts, setGroupOptOut } from '../push/notifications';
import { SpinButton } from '../ui';

export default function SystemScreen({ navigation }) {
  const [queue, setQueue] = useState([]);
  const [draining, setDraining] = useState(false);
  const [push, setPush] = useState({ status: 'unknown' });
  const [optOuts, setOptOuts] = useState({});
  const [groups, setGroups] = useState([]);

  const refresh = useCallback(async () => {
    setQueue(await getQueue());
    setOptOuts(await getOptOuts());
    try { setGroups((await api.get('/api/v1/me/balances')).groups || []); } catch { /* offline */ }
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    const unsub = subscribeReconnect(async () => {
      await drainQueue().catch(() => {});
      refresh();
    });
    return unsub;
  }, [refresh]));

  const doDrain = async () => {
    setDraining(true);
    try {
      const r = await drainQueue();
      Alert.alert('Sync', `Drained ${r.drained}, remaining ${r.remaining}${r.errors?.length ? `: ${r.errors.join('; ')}` : ''}`);
      refresh();
    } finally { setDraining(false); }
  };

  const doPush = async () => {
    const r = await registerPush();
    setPush(r);
    if (r.status === 'granted') Alert.alert('Push enabled', (r.token || '').slice(0, 24) + '…');
    else Alert.alert('Push', r.status);
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <View style={s.row}><Text style={s.h}>Offline queue ({queue.length})</Text><Text style={s.bWarn}>AUTO-SYNC</Text></View>
        <Text style={s.muted}>Expense + Payment → same Idempotency-Key, no duplicate</Text>
        {queue.map((d) => (
          <Text key={d.key} style={s.muted}>• {d.type} → {String(d.group_id).slice(0, 8)} · {d.created_at}</Text>
        ))}
        <SpinButton title="Sync now" busy={draining} onPress={doDrain} />
      </View>
      <View style={s.card}>
        <Text style={s.h}>Push ({push.status})</Text>
        <Text style={s.muted}>"Ana recorded $200 — you owe $50" · "Ben un-settled (−$15)" · per-group opt-out</Text>
        <SpinButton title="Enable push" busy={false} variant="ghost" onPress={doPush} />
        {groups.map((g) => (
          <View key={g.group_id} style={s.row}>
            <Text style={s.muted}>{g.name}</Text>
            <Switch
              value={!optOuts[g.group_id]}
              onValueChange={async (on) => {
                await setGroupOptOut(g.group_id, !on);
                refresh();
              }}
            />
          </View>
        ))}
      </View>
      <View style={[s.card, s.tealCard]}>
        <Text style={s.hTeal}>Settled group</Text>
        <Text style={s.muted}>All nets $0 → LOCKED snapshot · reverse owner-only 24h else counter-payment</Text>
      </View>
      <Pressable style={s.ghost} onPress={() => navigation.navigate('You')}>
        <Text>Open profile ›</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  tealCard: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
  h: { fontSize: 13, fontWeight: '800' },
  hTeal: { fontSize: 13, fontWeight: '800', color: colors.primary },
  muted: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  bWarn: { fontSize: 10, fontWeight: '800', backgroundColor: colors.warnBg, color: colors.warnText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
