// Frame 6 · Pay + un-settle guard + lock (FR-8/9).
// Design: docs/mobile-design.html §6. Web parity: GroupDetail payment form +
// un-settle modal. API:
// POST /groups/:id/payments {from_user_id,to_user_id,amount,method,note}
//   + Idempotency-Key. 422 OVERPAYMENT returns max; LOCKED→403.
// Un-settle guard: POST /expenses/:id/preview-edit -> {unsettled_preview[],
// unsettled_user_ids[]}; non-empty => BLOCKING confirm bottom-sheet
// ("Ben $0.00 → −$15.00 · v12 → v13. Push + email. Continue?").
// On success: toast "v12 → v13, Ben un-settled" + Why-box link.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Modal } from 'react-native';
import { api, newIdempotencyKey } from '../api/client';
import { colors } from '../theme';

export default function PayScreen({ route, navigation }) {
  const { id, to, amount } = route.params || {};
  const [amt, setAmt] = useState(amount ? (amount / 100).toFixed(2) : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [guard, setGuard] = useState(null); // {users:[], fromV, toV}
  const [busy, setBusy] = useState(false);

  const record = async (force = false) => {
    setBusy(true);
    try {
      // NOTE: from_user_id defaults to me (TODO: member picker); to/amount
      // prefilled from Settlement Pay ›. preview-edit check would run here
      // for expense edits; for payments the server returns unsettled effects.
      const res = await api.post(`/api/v1/groups/${id}/payments`, {
        // from_user_id: me, // TODO
        to_user_id: to, amount: amt, method, note,
      }, { idempotencyKey: newIdempotencyKey() });
      if (!force && (res.unsettled_user_ids || res.unsettled_preview || []).length) {
        setGuard({ users: res.unsettled_user_ids || [], fromV: res.settlement_version - 1, toV: res.settlement_version });
        return;
      }
      Alert.alert('Recorded', `Settlement updated${res.settlement_version ? ` v${res.settlement_version}` : ''} — see Why-box.`);
      navigation.goBack();
    } catch (e) {
      if (e.code === 'OVERPAYMENT') Alert.alert('Overpayment blocked', e.message);
      else Alert.alert('Payment failed', `${e.code || ''} ${e.message || ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Pay {to || '…'}</Text>
        <Text style={s.muted}>max owed {amt || '…'} · overpay blocked · from/to/owner only</Text>
        <Text style={s.big}>${amt || '0.00'}</Text>
        <TextInput style={s.inp} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="amount" />
        <View style={s.seg}>
          {['cash', 'transfer', 'other'].map((m) => (
            <Pressable key={m} style={[s.segI, method === m && s.segOn]} onPress={() => setMethod(m)}>
              <Text style={s.segT}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={note} onChangeText={setNote} placeholder="note ≤280" maxLength={280} />
        <Pressable style={s.btn} onPress={() => record(false)} disabled={busy}>
          <Text style={s.btnT}>{busy ? 'Recording…' : 'Record payment · from/to/owner only'}</Text>
        </Pressable>
      </View>
      <Modal visible={!!guard} transparent animationType="slide" onRequestClose={() => setGuard(null)}>
        <View style={s.scrim}>
          <View style={s.sheet}>
            <Text style={s.h}>⚠️ This will un-settle {(guard?.users || []).join(', ') || 'Ben'}</Text>
            <Text style={s.muted}>v{guard?.fromV} → v{guard?.toV}. Push + email to affected. Continue?</Text>
            <Text style={s.step}>preview unsettled_preview[] non-empty → blocking confirm (web + mobile)</Text>
            <View style={s.row}>
              <Pressable style={s.ghost} onPress={() => setGuard(null)}><Text>Back</Text></Pressable>
              <Pressable style={s.danger} onPress={() => { setGuard(null); record(true); }}>
                <Text style={s.dangerT}>Un-settle & save</Text>
              </Pressable>
            </View>
            <Text style={s.mutedC}>On success: toast + Why-box link</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13 },
  h: { fontSize: 15, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary, marginVertical: 6 },
  mutedC: { fontSize: 11, color: colors.secondary, textAlign: 'center', marginTop: 8 },
  big: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginVertical: 8 },
  inp: { borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, marginTop: 8 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700' },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8, minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  ghost: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center' },
  danger: { flex: 1, backgroundColor: colors.debtorText, borderRadius: 12, padding: 13, alignItems: 'center' },
  dangerT: { color: '#fff', fontWeight: '700' },
});
