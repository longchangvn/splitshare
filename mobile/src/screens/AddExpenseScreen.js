// Add expense — hosts the full ExpenseForm (create + copy + scan) and the
// batch receipt scanner. Web parity: GroupDetail "Add expense" + QuickAdd.
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, normalizeDecimal } from '../api/client';
import { colors } from '../theme';
import { ErrorBanner, SkeletonCard, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import ExpenseForm, { ExpenseFormScreen } from '../components/ExpenseForm';
import ScanReceipts from '../components/ScanReceipts';

export default function AddExpenseScreen({ route, navigation }) {
  const { id: groupId, copyFrom, scanned } = route.params || {};
  const t = useT();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [scanOpen, setScanOpen] = useState(!!scanned);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [g, cats] = await Promise.all([
        api.get(`/api/v1/groups/${groupId}`),
        api.get(`/api/v1/groups/${groupId}/categories`).catch(() => []),
      ]);
      setGroup(g.group || g);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) { setError(err); }
  }, [groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const members = group.members || [];
  const meId = user?.user_id || user?.id;

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ExpenseFormScreen
        groupId={groupId}
        group={group}
        members={members}
        currency={group.currency || 'USD'}
        categories={categories}
        copyFrom={copyFrom || null}
        onReload={load}
        onSaved={(_, mode) => {
          if (mode === 'close' || mode === 'queued') navigation.goBack();
        }}
        onCancel={() => navigation.goBack()}
      />

      <View style={s.scanBar}>
        <SpinButton title={t('scan.open')} variant="ghost" onPress={() => setScanOpen(true)} />
      </View>

      <ScanReceipts
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        groupId={groupId}
        group={group}
        members={members}
        currency={group.currency || 'USD'}
        categories={categories}
        meId={meId}
        onCreated={() => {
          setScanOpen(false);
          Alert.alert(t('forms.expense.saved'), '');
          navigation.goBack();
        }}
      />
    </View>
      <View style={s.card}>
        <TextInput style={s.inp} value={title} onChangeText={setTitle} placeholder="Title (1–100)" />
        <TextInput style={s.inp} value={amount} onChangeText={(v) => setAmount(normalizeDecimal(v))} placeholder="0.00" keyboardType="decimal-pad" />
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
                onChangeText={(v) => setValues((p) => ({ ...p, [m.user_id]: normalizeDecimal(v) }))}
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
  scanBar: { paddingHorizontal: 14, paddingBottom: 10, backgroundColor: colors.screen },
});
