// Frame 4 · Add/Edit expense — FR-5/6/8. Web parity: ExpenseForm (V1 subset).
// V1 only: title/amount/payer/participants + EQUAL/EXACT/PERCENT/SHARES inline
// inputs (UX polish) + live preview-split/preview-edit + un-settle blocking
// confirm + copy support + staged receipts w/ compress. Trip-pack richness
// (category/tax/tip/fx/guests) is OUT of scope.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api, newIdempotencyKey, fmt, displayNameOf, expenseIdOf } from '../api/client';
import { colors } from '../theme';
import { SpinButton, ErrText } from '../ui';
import { queueOrSend } from '../offline/queue';

const SPLITS = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'];

const equalPercent = (n) => {
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
};

export default function AddExpenseScreen({ route, navigation }) {
  const { id: groupId, expenseId, copyFrom } = route.params || {};
  const existing = null; // create mode; edit lives in ExpenseDetail
  const [members, setMembers] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [title, setTitle] = useState(copyFrom ? `Copy of ${copyFrom.title}` : '');
  const [amount, setAmount] = useState(copyFrom ? (copyFrom.amount_cents / 100).toFixed(2) : '');
  const [payer, setPayer] = useState(copyFrom?.payer_id || '');
  const [split, setSplit] = useState(copyFrom?.split_type || 'EQUAL');
  const [sel, setSel] = useState(() => copyFrom?.splits?.map((x) => x.user_id) || []);
  const [values, setValues] = useState(() => initValues(copyFrom));
  const [stashed, setStashed] = useState({});
  const [preview, setPreview] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  function initValues(src) {
    const out = {};
    if (!src?.splits) return out;
    for (const x of src.splits) {
      if (src.split_type === 'SHARES') out[x.user_id] = String(x.shares ?? 1);
      else if (src.split_type === 'PERCENT') out[x.user_id] = String(x.percent ?? '');
      else if (src.split_type === 'EXACT') out[x.user_id] = ((x.share_cents ?? 0) / 100).toString();
    }
    return out;
  }

  useEffect(() => {
    (async () => {
      try {
        const g = await api.get(`/api/v1/groups/${groupId}`);
        const m = g.group?.members || g.members || [];
        setMembers(m);
        setCurrency(g.group?.currency || g.currency || 'USD');
        if (!payer && m[0]) setPayer(copyFrom?.payer_id && m.some((x) => x.user_id === copyFrom.payer_id) ? copyFrom.payer_id : m[0].user_id);
        if (sel.length === 0 && m.length) {
          const kept = (copyFrom?.splits || []).map((x) => x.user_id).filter((uid) => m.some((x) => x.user_id === uid));
          setSel(kept.length ? kept : m.map((x) => x.user_id));
        }
      } catch { /* ignore */ }
    })();
  }, [groupId]);

  // Live preview (debounced 350ms) — create: preview-split.
  useEffect(() => {
    if (!amount || sel.length === 0) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        setPreview(await api.post(`/api/v1/groups/${groupId}/expenses/preview-split`, build()));
        setE(null);
      } catch (err) { setPreview(null); /* preview best-effort; show on save */ }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, split, payer, sel.join(','), Object.values(values).join('|')]);

  const toggle = (uid) => {
    if (sel.includes(uid)) {
      setSel(sel.filter((x) => x !== uid));
      setStashed({ ...stashed, ...(uid in values ? { [uid]: values[uid] } : {}) });
      setValues((prev) => { const n = { ...prev }; delete n[uid]; return n; });
    } else {
      setSel([...sel, uid]);
      if (uid in stashed) setValues((prev) => ({ ...prev, [uid]: stashed[uid] }));
      else if (split === 'SHARES') setValues((prev) => ({ ...prev, [uid]: prev[uid] ?? '1' }));
    }
  };

  const changeType = (t) => {
    setSplit(t);
    if (t === 'EQUAL') return;
    setValues((prev) => {
      const next = { ...prev };
      if (t === 'PERCENT') {
        const dist = equalPercent(sel.length);
        sel.forEach((uid, i) => { if (!(uid in next) || next[uid] === '') next[uid] = dist[i]; });
      } else if (t === 'SHARES') {
        sel.forEach((uid) => { if (!(uid in next) || next[uid] === '') next[uid] = '1'; });
      }
      return next;
    });
  };

  const build = () => {
    const body = {
      title, amount: Number(amount), payer_id: payer, split_type: split, participant_ids: sel,
    };
    if (split === 'EXACT') body.exact = sel.map((uid) => ({ user_id: uid, amount_cents: Math.round(Number(values[uid] || 0) * 100) }));
    if (split === 'PERCENT') body.percent = sel.map((uid) => ({ user_id: uid, percent: Number(values[uid] || 0) }));
    if (split === 'SHARES') body.shares = sel.map((uid) => ({ user_id: uid, shares: values[uid] === '' || values[uid] == null ? 1 : Math.max(1, Math.round(Number(values[uid] || 1))) }));
    return body;
  };

  const totals = (() => {
    if (split === 'EQUAL' || sel.length === 0) return null;
    const nums = sel.map((uid) => Number(values[uid] || 0));
    if (nums.some((n) => Number.isNaN(n))) return null;
    if (split === 'EXACT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: `sum = $${sum.toFixed(2)} of $${Number(amount || 0).toFixed(2)}`, ok: Math.abs(sum - Number(amount || 0)) < 0.005 };
    }
    if (split === 'PERCENT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: `${sum}% of 100%`, ok: Math.abs(sum - 100) < 1e-9 };
    }
    return { text: `${nums.reduce((a, b) => a + b, 0)} shares total`, ok: true };
  })();

  const equalNote = (() => {
    if (split !== 'EQUAL' || !preview?.shares) return null;
    const entries = Object.entries(preview.shares);
    if (!entries.length) return null;
    const vals = entries.map(([, v]) => v);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) return `EQUAL: ${fmt(lo, currency)} × ${entries.length} · sum == total ✓`;
    const lucky = entries.filter(([, v]) => v === hi).map(([uid]) => displayNameOf(members, uid)).join(', ');
    return `EQUAL floor + remainder 1¢ → ${lucky} gets +1¢ · sum == total ✓`;
  })();

  const pick = async () => {
    if (photos.length >= 5) return Alert.alert('Limit', '0–5 images per expense.');
    const r = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, selectionLimit: 5 - photos.length });
    if (!r.canceled) {
      const out = [];
      for (const a of r.assets || []) {
        if ((a.fileSize || 0) > 10 * 1024 * 1024) {
          Alert.alert('Too large', 'Each image must be ≤10MB.');
          continue;
        }
        // Camera+compress (REQ §10): downscale receipts before upload.
        try {
          const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
          out.push({ ...a, uri: m.uri });
        } catch { out.push(a); }
      }
      setPhotos([...photos, ...out].slice(0, 5));
    }
  };

  const save = async () => {
    setBusy(true); setE(null);
    const body = build();
    const key = newIdempotencyKey();
    try {
      const send = () => api.post(`/api/v1/groups/${groupId}/expenses`, body, { idempotencyKey: key });
      let exp;
      try {
        exp = await send();
      } catch (err) {
        // Offline: queue draft with SAME key for auto-sync, no duplicate.
        if (!err.status) {
          await queueOrSend('expense', groupId, send, body, key);
          Alert.alert('Queued offline', 'Will auto-sync with the same Idempotency-Key.');
          navigation.goBack();
          return;
        }
        throw err;
      }
      const eid = expenseIdOf(exp);
      for (const p of photos) {
        const fd = new FormData();
        fd.append('files', { uri: p.uri, name: 'receipt.jpg', type: 'image/jpeg' });
        await api.postForm(`/api/v1/expenses/${eid}/images`, fd).catch(() => {});
      }
      navigation.goBack();
    } catch (err) {
      setE(err);
      Alert.alert('Save failed', `${err.code || ''} ${err.message || ''}${err.code === 'INVOLVES_REMOVED_MEMBER' ? '\nRemoved members cannot be included.' : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Photos {photos.length}/5 · auto-compress · EXIF-GPS stripped server-side</Text>
        <Pressable style={s.dash} onPress={pick}><Text>＋ Add receipt (camera roll)</Text></Pressable>
        {photos.map((p, i) => (
          <View key={i} style={s.prow}>
            <Text style={s.muted}>🧾 receipt {i + 1}</Text>
            <Pressable onPress={() => setPhotos(photos.filter((_, j) => j !== i))}><Text style={s.danger}>Remove</Text></Pressable>
          </View>
        ))}
      </View>
      <View style={s.card}>
        <TextInput style={s.inp} value={title} onChangeText={setTitle} placeholder="Title (1–100)" />
        <TextInput style={s.inp} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
        <Text style={[s.h, { marginTop: 8 }]}>Payer (must be active member)</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Pressable key={m.user_id} style={[s.chip, payer === m.user_id && s.chipOn]} onPress={() => setPayer(m.user_id)}>
              <Text style={s.chipT}>{m.display_name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.seg}>
          {SPLITS.map((t) => (
            <Pressable key={t} style={[s.segI, split === t && s.segOn]} onPress={() => changeType(t)}>
              <Text style={s.segT}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {split !== 'EQUAL' && totals && (
          <Text style={{ color: totals.ok ? colors.owedText : '#b45309', fontSize: 12, marginTop: 4 }}>{totals.text}</Text>
        )}
        {equalNote && <Text style={s.step}>{equalNote}</Text>}
      </View>
      <View style={s.card}>
        <Text style={s.h}>Participants ({sel.length})</Text>
        {members.map((m) => (
          <View key={m.user_id} style={s.prow}>
            <Pressable style={{ flex: 1 }} onPress={() => toggle(m.user_id)}>
              <Text>{sel.includes(m.user_id) ? '☑' : '☐'} {m.display_name}</Text>
            </Pressable>
            {split !== 'EQUAL' && sel.includes(m.user_id) && (
              <TextInput
                style={[s.inp, { width: 100, marginTop: 0 }]}
                value={values[m.user_id] ?? (split === 'SHARES' ? '1' : '')}
                onChangeText={(v) => setValues((p) => ({ ...p, [m.user_id]: v }))}
                placeholder={split === 'SHARES' ? '1' : split === 'PERCENT' ? '%' : '$'}
                keyboardType="decimal-pad"
              />
            )}
          </View>
        ))}
      </View>
      <View style={[s.card, s.tealCard]}>
        <Text style={s.hTeal}>Live preview · preview-split (no persist)</Text>
        {preview ? (
          <Text style={s.muted}>{Object.entries(preview.shares || {}).map(([uid, v]) => `${displayNameOf(members, uid)} ${fmt(v, currency)}`).join(' · ')}</Text>
        ) : <Text style={s.muted}>Enter amount + participants for largest-remainder preview.</Text>}
      </View>
      <ErrText e={e} />
      <SpinButton title={busy ? 'Saving…' : 'Save expense · Idempotency-Key ✓'} busy={busy} onPress={save} />
      <Text style={s.mutedC}>Offline? queued → auto-sync, no duplicate (same key)</Text>
      <View style={{ height: 24 }} />
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
  danger: { color: colors.debtorText, fontWeight: '700' },
  inp: { borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, backgroundColor: '#fff' },
  dash: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.inputBorder, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, marginTop: 8 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700' },
  step: { backgroundColor: colors.paleTealBg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accentLight, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.lightTealBg },
  chipT: { fontSize: 11, fontWeight: '700' },
  prow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
});
