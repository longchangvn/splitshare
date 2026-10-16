// Frame 8 · System — offline · push · profile (NFR).
// Design: docs/mobile-design.html §8 (composite Activity + You — no separate
// Activity feed on web; BottomNav synthesizes via GET /me/balances).
// API: GET/PATCH/DELETE /me (delete blocked if any net != 0 → 422),
// PATCH /me/password, offline queue (src/offline/queue.js stub),
// push per-group opt-out (src/push/notifications.js stub),
// deep link splitshare://g/<token> (expo-linking, App.js),
// badge = total owed. Lock rule: all nets 0 → LOCKED snapshot;
// reverse owner-only 24h else counter-payment.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import { drainQueue } from '../offline/queue';
import { useAuth } from '../auth/AuthContext';

export default function SystemScreen() {
  const { user, logout } = useAuth();
  const [queue, setQueue] = useState({ drained: 0, note: 'stub' });

  useFocusEffect(useCallback(() => {
    (async () => setQueue(await drainQueue()))();
  }, []));

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <View style={s.row}><Text style={s.h}>📶 Offline queue (2)</Text><Text style={s.bWarn}>AUTO-SYNC</Text></View>
        <Text style={s.muted}>Expense + Payment → same Idempotency-Key, no duplicate ({queue.note})</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>🔔 Push</Text>
        <Text style={s.muted}>"Ana recorded $200 — you owe $50" · "Ben un-settled (−$15)" · per-group opt-out ✓ (stub)</Text>
      </View>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.h}>👤 {user?.username || '…'} · {user?.display_name || ''}</Text>
          <Text style={s.bTeal}>{user?.email_verified ? '✓ verified' : '! unverified'}</Text>
        </View>
        <Text style={s.muted}>change-password · delete blocked if net ≠ 0 · Keychain biometric on</Text>
        <View style={s.row2}>
          <Pressable style={s.ghost} onPress={() => Alert.alert('Password', 'PATCH /api/v1/me/password — TODO form')}>
            <Text>Change password</Text>
          </Pressable>
          <Pressable style={s.ghost} onPress={async () => {
            try { await api.del('/api/v1/me'); await logout(); }
            catch (e) { Alert.alert('Blocked', e.code === 'HAS_OPEN_BALANCE' ? `Settle first: ${e.message}` : e.message); }
          }}>
            <Text>Delete account</Text>
          </Pressable>
        </View>
        <Pressable style={[s.ghost, { marginTop: 8 }]} onPress={logout}><Text>Log out</Text></Pressable>
      </View>
      <View style={[s.card, s.tealCard]}>
        <Text style={s.hTeal}>🔒 Settled group</Text>
        <Text style={s.muted}>All nets $0 → LOCKED snapshot · reverse owner-only 24h else counter-payment</Text>
      </View>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row2: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ghost: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  bTeal: { fontSize: 10, fontWeight: '800', backgroundColor: colors.owedBg, color: colors.owedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bWarn: { fontSize: 10, fontWeight: '800', backgroundColor: colors.warnBg, color: colors.warnText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
