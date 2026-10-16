// Expense detail — FR-8 (edit/resplit/delete + un-settle guard + frozen removed-member).
// Web parity: ExpenseDetail.jsx (V1 subset, no trip-pack comments).
// PATCH +expected_version, 409 STALE_VERSION, LOCKED 403 + correction affordance.
import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { api, fmt, displayNameOf } from '../api/client';
import { colors } from '../theme';
import { SpinButton, ErrText } from '../ui';

export default function ExpenseDetailScreen({ route, navigation }) {
  const { groupId, expenseId } = route.params;
  const [detail, setDetail] = useState(null);
  const [group, setGroup] = useState(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([
        api.get(`/api/v1/expenses/${expenseId}`),
        api.get(`/api/v1/groups/${groupId}`).catch(() => null),
      ]);
      const exp = d.expense || d;
      setDetail({ ...d, expense: exp });
      setTitle(exp.title || '');
      setAmount(((exp.amount_cents ?? 0) / 100).toFixed(2));
      setGroup(g?.group || g);
    } catch (err) { setE(err); }
  }, [expenseId, groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exp = detail?.expense || {};
  const members = group?.members || [];
  const currency = group?.currency || 'USD';
  const locked = exp.status === 'LOCKED';
  const audit = detail?.audit || exp.audit || [];

  const liveEditPreview = async (nt = title, na = amount) => {
    if (!nt || !na) return;
    try {
      const p = await api.post(`/api/v1/expenses/${expenseId}/preview-edit`, {
        title: nt, amount: Number(na), payer_id: exp.payer_id, split_type: exp.split_type,
        participant_ids: (exp.splits || []).map((x) => x.user_id),
      });
      setPreview(p);
    } catch { /* best-effort */ }
  };

  const saveEdit = async () => {
    setBusy(true); setE(null);
    try {
      // Pre-save un-settle check: blocking confirm if preview non-empty.
      const names = preview?.unsettled_user_ids || [];
      if (names.length > 0 && !confirm) {
        setConfirm(names.map((uid) => {
          const sh = preview.shares?.[uid] != null ? ` → ${fmt(preview.shares[uid], currency)}` : '';
          return `${displayNameOf(members, uid)} ($0.00${sh})`;
        }));
        setBusy(false);
        return;
      }
      setConfirm(null);
      const r = await api.patch(`/api/v1/expenses/${expenseId}`, {
        expected_version: exp.version, title, amount: Number(amount),
      });
      if ((r.unsettled_user_ids || []).length) {
        Alert.alert('Settlement updated', `v${exp.version} → v${r.settlement_version}, ${(r.unsettled_user_ids || []).join(', ')} un-settled. See Why-box.`);
      }
      setEditing(false);
      load();
    } catch (err) {
      if (err.code === 'STALE_VERSION') Alert.alert('Stale version', '409 — reload and retry.');
      else if (err.code === 'EXPENSE_LOCKED') Alert.alert('Locked', '403 — settled snapshot. Create a correction instead.');
      else if (err.code === 'INVOLVES_REMOVED_MEMBER') Alert.alert('Removed member', 'Owner must re-add the member first.');
      else setE(err);
    } finally { setBusy(false); }
  };

  const doDelete = () => {
    Alert.alert('Delete expense?', 'Soft-delete, OPEN only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const r = await api.del(`/api/v1/expenses/${expenseId}`);
            if ((r?.unsettled_user_ids || []).length) Alert.alert('Un-settled', (r.unsettled_user_ids || []).join(', '));
            navigation.goBack();
          } catch (err) {
            Alert.alert('Delete failed', `${err.code} ${err.message}`);
          }
        },
      },
    ]);
  };

  const doCopy = () => {
    navigation.navigate('AddExpense', { id: groupId, copyFrom: exp });
  };

  const uploadReceipt = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: false });
    if (r.canceled) return;
    const a = (r.assets || [])[0];
    if (!a) return;
    if ((a.fileSize || 0) > 10 * 1024 * 1024) return Alert.alert('Too large', '≤10MB.');
    const fd = new FormData();
    fd.append('files', { uri: a.uri, name: 'receipt.jpg', type: 'image/jpeg' });
    try {
      await api.postForm(`/api/v1/expenses/${expenseId}/images`, fd);
      load();
    } catch (err) { Alert.alert('Upload failed', `${err.code} ${err.message}`); }
  };

  if (!detail) return <View style={s.wrap}><Text style={s.muted}>Loading…</Text>{e && <ErrText e={e} />}</View>;

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.title}>{exp.title}</Text>
          <Text style={locked ? s.bLock : s.bOpen}>{exp.status || 'OPEN'}</Text>
        </View>
        {!!exp.description && <Text style={s.muted}>{exp.description}</Text>}
        <Text style={s.h}>Paid by {displayNameOf(members, exp.payer_id)} · {fmt(exp.amount_cents || 0, currency)}</Text>
        {!editing ? (
          <Text style={s.muted}>Tap Edit to change title/amount (creator or owner, OPEN only).</Text>
        ) : (
          <>
            <TextInput style={s.inp} value={title} onChangeText={(v) => { setTitle(v); liveEditPreview(v, amount); }} placeholder="Title (1-100)" />
            <TextInput style={s.inp} value={amount} onChangeText={(v) => { setAmount(v); liveEditPreview(title, v); }} placeholder="0.00" keyboardType="decimal-pad" />
            {preview && <Text style={s.step}>Preview: {JSON.stringify(preview.shares || {})}{preview.unsettled_user_ids?.length ? ` · will un-settle ${preview.unsettled_user_ids.length}` : ''}</Text>}
          </>
        )}
        <View style={s.row3}>
          {!locked ? (
            <>
              {!editing
                ? <Pressable style={s.ghost} onPress={() => { setEditing(true); liveEditPreview(); }}><Text>Edit</Text></Pressable>
                : <Pressable style={s.ghost} onPress={() => setEditing(false)}><Text>Cancel</Text></Pressable>}
              {editing
                ? <SpinButton title="Save" busy={busy} onPress={saveEdit} />
                : <Pressable style={s.ghost} onPress={doDelete}><Text>Delete</Text></Pressable>}
            </>
          ) : (
            <Pressable style={s.ghost} onPress={doCopy}><Text>Create correction (prefilled reversed)</Text></Pressable>
          )}
          <Pressable style={s.ghost} onPress={doCopy}><Text>Copy</Text></Pressable>
        </View>
        <ErrText e={e} />
      </View>

      <View style={s.card}>
        <Text style={s.h}>Splits</Text>
        {(exp.splits || []).map((x) => (
          <Text key={x.user_id} style={s.muted}>{displayNameOf(members, x.user_id)}: {fmt(x.share_cents ?? 0, currency)}</Text>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.h}>Receipts ({(exp.images || []).length}/5)</Text>
        {(exp.images || []).map((im) => (
          <View key={im.image_id || im.id} style={s.row}>
            <Text style={s.muted}>🧾 {im.image_id || im.id}</Text>
            {!locked && (
              <Pressable onPress={async () => {
                try { await api.del(`/api/v1/images/${im.image_id || im.id}`); load(); }
                catch (err) { Alert.alert('Delete failed', err.message); }
              }}><Text style={s.danger}>Delete</Text></Pressable>
            )}
          </View>
        ))}
        {!locked && <Pressable style={s.ghost} onPress={uploadReceipt}><Text>＋ Upload receipt (jpg/png/webp/heic ≤10MB)</Text></Pressable>}
      </View>

      {audit.length > 0 && (
        <View style={s.card}>
          <Text style={s.h}>History</Text>
          {audit.map((a, i) => (
            <Text key={i} style={s.muted}>{a.at || ''} · {typeof a.diff === 'string' ? a.diff : JSON.stringify(a.diff || a)}</Text>
          ))}
        </View>
      )}

      <Modal visible={!!confirm} transparent animationType="slide" onRequestClose={() => setConfirm(null)}>
        <View style={s.scrim}>
          <View style={s.sheet}>
            <Text style={s.h}>⚠️ This will un-settle {(confirm || []).join(', ')}</Text>
            <Text style={s.muted}>Push + email to affected. Continue?</Text>
            <View style={s.row3}>
              <Pressable style={s.ghost} onPress={() => setConfirm(null)}><Text>Back</Text></Pressable>
              <Pressable style={s.dangerBtn} onPress={() => saveEdit()}><Text style={s.dangerBtnT}>Un-settle & save</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  h: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  muted: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  danger: { color: colors.debtorText, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row3: { flexDirection: 'row', gap: 8, marginTop: 8 },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 8 },
  ghost: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dangerBtn: { flex: 1, backgroundColor: colors.debtorText, borderRadius: 12, padding: 13, alignItems: 'center' },
  dangerBtnT: { color: '#fff', fontWeight: '700' },
  bOpen: { fontSize: 10, fontWeight: '800', backgroundColor: colors.openBg, color: colors.openText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
});
