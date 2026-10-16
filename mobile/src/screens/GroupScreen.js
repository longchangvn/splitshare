// Frame 3 · Group — ledger + header (FR-10/11).
// Design: docs/mobile-design.html §3. Web parity: web/src/pages/GroupDetail.jsx
// ledger tab + header net + filters + OPEN/LOCKED + GroupDetail tabs
// (mobile: Ledger | Settle | Members | Photos segmented rail).
// API: GET /groups/:id, GET /groups/:id/me {net_cents, owes[]},
// GET /groups/:id/ledger?type=&q=&status=&... (filters title/payer/amount/date/status).
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, fmt } from '../api/client';
import { colors } from '../theme';

const TABS = ['Ledger', 'Settle', 'Members', 'Photos'];

export function GroupsScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  useFocusEffect(useCallback(() => {
    (async () => setGroups((await api.get('/api/v1/me/balances')).groups || []))();
  }, []));
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 14 }}
      data={groups}
      keyExtractor={(g) => g.group_id}
      renderItem={({ item: g }) => (
        <Pressable style={s.card} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}>
          <Text style={s.h}>{g.name}</Text>
          <Text style={s.muted}>{g.currency} · {fmt(Math.abs(g.net_cents), g.currency)}</Text>
        </Pressable>
      )}
    />
  );
}

export default function GroupDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [group, setGroup] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('Ledger');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const [g, m, l] = await Promise.all([
      api.get(`/api/v1/groups/${id}`),
      api.get(`/api/v1/groups/${id}/me`),
      api.get(`/api/v1/groups/${id}/ledger?limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    ]);
    setGroup(g); setMe(m); setItems(l.items || []);
  }, [id, q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{group?.name || '…'} · {group?.currency}</Text>
      <Text style={s.muted}>{group?.currency} · 1 currency locked</Text>
      {me && (
        <View style={[s.card, me.net_cents < 0 && s.danger]}>
          <Text style={s.h}>
            {me.net_cents === 0 ? 'Settled' : me.net_cents < 0 ? `You owe ${fmt(-me.net_cents, group?.currency)}` : `You are owed ${fmt(me.net_cents, group?.currency)}`}
          </Text>
        </View>
      )}
      <View style={s.seg}>
        {TABS.map((t) => (
          <Pressable key={t} style={[s.segI, tab === t && s.segOn]} onPress={() => {
            if (t === 'Settle') return navigation.navigate('Settlement', { id });
            setTab(t);
          }}>
            <Text style={s.segT}>{t}{t === 'Settle' ? ' (2)' : ''}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={s.inp} value={q} onChangeText={setQ} placeholder="Filter — title · payer · $ · date · status" />
      <FlatList
        data={items}
        keyExtractor={(it, i) => `${it.kind}-${it.id || i}`}
        renderItem={({ item: it }) => (
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.h}>{it.title}</Text>
              <Text style={s.amt}>{fmt(it.amount_cents, group?.currency)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.muted}>{it.status === 'LOCKED' ? 'Settled · snapshot' : `my share ${fmt(it.my_share_cents || 0, group?.currency)}`}</Text>
              <Text style={it.status === 'LOCKED' ? s.bLock : s.bOpen}>{it.status}</Text>
            </View>
          </View>
        )}
      />
      <Pressable style={s.btn} onPress={() => navigation.navigate('AddExpense', { id })}>
        <Text style={s.btnT}>＋ Add expense · 📷 receipt</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14, gap: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
  danger: { backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder },
  h: { fontSize: 13, fontWeight: '800' },
  amt: { fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, gap: 3 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700', color: colors.darkTealText },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700' },
  bOpen: { fontSize: 10, fontWeight: '800', backgroundColor: colors.openBg, color: colors.openText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
