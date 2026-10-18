// Frame 6 · Pay + reverse + lock — FR-9. Web parity: PaymentForm (V1 subset).
// POST /groups/:id/payments + Idempotency-Key, 422 OVERPAYMENT + max,
// 403 LOCKED, recorder ∈ {from,to,owner}. Reverse owner-only 24h else counter-payment.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { api, newIdempotencyKey, fmt, displayNameOf } from '../api/client';
import { colors } from '../theme';
import { SpinButton, ErrText } from '../ui';
import { queueOrSend } from '../offline/queue';

export default function PayScreen({ route, navigation }) {
  const { id, to, from, amount, paymentId } = route.params || {};
  const [members, setMembers] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [fromId, setFromId] = useState(from || '');
  const [toId, setToId] = useState(to || '');
  const [amt, setAmt] = useState(amount ? (amount / 100).toFixed(2) : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const g = await api.get(`/api/v1/groups/${id}`);
        const m = g.group?.members || g.members || [];
        setMembers(m.filter((x) => !x.removed));
        setCurrency(g.group?.currency || g.currency || 'USD');
        if (!fromId && m[0]) setFromId(m[0].user_id);
      } catch { /* ignore */ }
    })();
  }, [id]);

  const record = async () => {
    setBusy(true); setE(null);
    const body = {
      from_user_id: fromId, to_user_id: toId, amount: Number(amt), method,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const key = newIdempotencyKey();
    try {
      const send = () => api.post(`/api/v1/groups/${id}/payments`, body, { idempotencyKey: key });
      let res;
      try {
        res = await send();
      } catch (err) {
        if (!err.status) {
          await queueOrSend('payment', id, send, body, key);
          Alert.alert('Queued offline', 'Payment will auto-sync with the same Idempotency-Key.');
          navigation.goBack();
          return;
        }
        throw err;
      }
      Alert.alert(
        'Recorded',
        res.fully_settled ? 'Fully settled — group locked (Settled badge).' : `Settlement updated${res.settlement_version ? ` v${res.settlement_version}` : ''} — see Why-box.`
      );
      navigation.goBack();
    } catch (err) {
      if (err.code === 'OVERPAYMENT') { setE(err); Alert.alert('Overpayment blocked', err.message); }
      else { setE(err); Alert.alert('Payment failed', `${err.code || ''} ${err.message || ''}`); }
    } finally { setBusy(false); }
  };

  const reverse = async () => {
    Alert.alert('Reverse payment?', 'Owner-only, within 24h. Otherwise create a counter-payment.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reverse', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            const r = await api.post(`/api/v1/payments/${paymentId}/reverse`, {});
            Alert.alert('Reversed', `Settlement v${r.settlement_version || '?'}`);
            navigation.goBack();
          } catch (err) { Alert.alert('Reverse failed', `${err.code} ${err.message}`); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Pay {displayNameOf(members, toId) || '…'}</Text>
        <Text style={s.muted}>from/to/owner only · partial allowed · overpay blocked (422 + max)</Text>
        <Text style={s.big}>${amt || '0.00'} {currency}</Text>
        <Text style={s.h}>From</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Pressable key={m.user_id} style={[s.chip, fromId === m.user_id && s.chipOn]} onPress={() => setFromId(m.user_id)}>
              <Text style={s.chipT}>{m.display_name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.h}>To</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Pressable key={m.user_id} style={[s.chip, toId === m.user_id && s.chipOn]} onPress={() => setToId(m.user_id)}>
              <Text style={s.chipT}>{m.display_name}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="amount" />
        <View style={s.seg}>
          {['cash', 'transfer', 'other'].map((m) => (
            <Pressable key={m} style={[s.segI, method === m && s.segOn]} onPress={() => setMethod(m)}>
              <Text style={s.segT}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={note} onChangeText={setNote} placeholder="note ≤280" maxLength={280} />
        <ErrText e={e} />
        <SpinButton title={busy ? 'Recording…' : 'Record payment'} busy={busy} onPress={record} />
        {paymentId && (
          <Pressable style={s.ghost} onPress={reverse}><Text>Reverse (owner, 24h)</Text></Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13 },
  h: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  muted: { fontSize: 12, color: colors.secondary, marginVertical: 6 },
  big: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginVertical: 8 },
  inp: { borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, backgroundColor: '#fff' },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, marginTop: 8 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.lightTealBg },
  chipT: { fontSize: 11, fontWeight: '700' },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
});
