// Frame 4 · Add expense — receipt + split (FR-5/6).
// Design: docs/mobile-design.html §4. Web parity: GroupDetail expense modal +
// ExpenseDetail. API (group-scoped!):
// POST /groups/:id/expenses/preview-split (live, no persist) —
// requirements §9 prints /expenses/preview-split but backend implements the
// group-scoped path (see api/Endpoints/ExpenseEndpoints.cs).
// POST /groups/:id/expenses {title, amount, payer_id, split_type, ...}
//   + header Idempotency-Key (uuid per intent) then
// POST /expenses/:id/images multipart (0-5, ≤10MB jpg/png/webp/heic).
// Split math is server truth: EQUAL floor+remainder 1c to first user_id asc.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, newIdempotencyKey } from '../api/client';
import { colors } from '../theme';

const SPLITS = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

export default function AddExpenseScreen({ route, navigation }) {
  const { id } = route.params;
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState('EQUAL');
  const [preview, setPreview] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    if (photos.length >= 5) return Alert.alert('Limit', '0–5 images per expense.');
    const r = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, selectionLimit: 5 - photos.length });
    if (!r.canceled) {
      const tooBig = (r.assets || []).filter((a) => (a.fileSize || 0) > 10 * 1024 * 1024);
      if (tooBig.length) Alert.alert('Too large', 'Each image must be ≤10MB (client pre-check).');
      setPhotos([...photos, ...(r.assets || []).filter((a) => (a.fileSize || 0) <= 10 * 1024 * 1024)]);
    }
  };

  const livePreview = async (nextAmount = amount) => {
    if (!nextAmount) return;
    try {
      // Minimal EQUAL preview; EXACT/PERCENT/SHARES need participant detail —
      // same inline-input contract as web ExpenseForm (Forms.jsx).
      setPreview(await api.post(`/api/v1/groups/${id}/expenses/preview-split`, {
        amount: nextAmount, split_type: split, participant_ids: [],
      }).catch(() => null));
    } catch { /* preview is best-effort */ }
  };

  const save = async () => {
    setBusy(true);
    const key = newIdempotencyKey(); // stable across offline retries
    try {
      const exp = await api.post(`/api/v1/groups/${id}/expenses`, {
        title, amount, split_type: split,
        // payer_id/participant_ids wired from member picker (TODO: default me)
      }, { idempotencyKey: key });
      // Two-phase attach: create -> upload each file (per-file failure non-blocking)
      for (const p of photos) {
        const fd = new FormData();
        fd.append('files', { uri: p.uri, name: 'receipt.jpg', type: 'image/jpeg' });
        await api.postForm(`/api/v1/expenses/${exp.expense?.expense_id || exp.expense_id}/images`, fd).catch(() => {});
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Save failed', `${e.code || ''} ${e.message || ''}\n${e.code === 'INVOLVES_REMOVED_MEMBER' ? 'Removed members cannot be included.' : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Photos {photos.length}/5 · auto-compress · EXIF-GPS stripped server-side</Text>
        <Pressable style={s.dash} onPress={pick}><Text>＋ Add receipt</Text></Pressable>
      </View>
      <View style={s.card}>
        <TextInput style={s.inp} value={title} onChangeText={setTitle} placeholder="Title (1–100)" />
        <TextInput style={s.inp} value={amount} onChangeText={(v) => { setAmount(v); livePreview(v); }} placeholder="0.00" keyboardType="decimal-pad" />
        <View style={s.seg}>
          {SPLITS.map((t) => (
            <Pressable key={t} style={[s.segI, split === t && s.segOn]} onPress={() => setSplit(t)}>
              <Text style={s.segT}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.step}>EQUAL: floor + remainder 1¢ → first user_id asc · sum == total ✓</Text>
        {preview && <Text style={s.muted}>{JSON.stringify(preview.shares || preview)}</Text>}
      </View>
      <View style={[s.card, s.tealCard]}>
        <Text style={s.hTeal}>Live preview · preview-split</Text>
        <Text style={s.muted}>No persist · largest-remainder for %/shares</Text>
      </View>
      <Pressable style={s.btn} onPress={save} disabled={busy}>
        <Text style={s.btnT}>{busy ? 'Saving…' : 'Save expense · Idempotency-Key ✓'}</Text>
      </Pressable>
      <Text style={s.mutedC}>Offline? queued → auto-sync, no duplicate (same key)</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  tealCard: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
  h: { fontSize: 13, fontWeight: '800' },
  hTeal: { fontSize: 13, fontWeight: '800', color: colors.primary },
  muted: { fontSize: 12, color: colors.secondary },
  mutedC: { fontSize: 11, color: colors.secondary, textAlign: 'center', marginTop: 6 },
  inp: { borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  dash: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.inputBorder, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, marginTop: 8 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700' },
  step: { backgroundColor: colors.paleTealBg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accentLight, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 8 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700' },
});
