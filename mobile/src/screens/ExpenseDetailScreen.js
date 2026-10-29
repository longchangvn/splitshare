// Expense detail — web ExpenseDetail.jsx parity: summary line, receipt
// preview/delete, audit list, comments, full edit through ExpenseForm,
// archived rows offer a prefilled correction.
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api, imageSource, normalizeDecimal } from '../api/client';
import { colors } from '../theme';
import {
  Card, ErrorBanner, Money, SkeletonCard, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { fmt } from '../lib/money';
import { categoryLabelForKey } from '../lib/categories';
import ExpenseForm from '../components/ExpenseForm';
import Comments from '../components/Comments';

export default function ExpenseDetailScreen({ route, navigation }) {
  const { groupId, expenseId } = route.params || {};
  const t = useT();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [group, setGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [images, setImages] = useState({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, g, cats] = await Promise.all([
        api.get(`/api/v1/expenses/${expenseId}`),
        api.get(`/api/v1/groups/${groupId}`).catch(() => null),
        api.get(`/api/v1/groups/${groupId}/categories`).catch(() => []),
      ]);
      const expense = d.expense || d;
      setDetail({ ...d, expense });
      setGroup(g?.group || g);
      setCategories(Array.isArray(cats) ? cats : []);
      const entries = await Promise.all((expense.images || []).map(async (im) => {
        const id = im.image_id || im.id;
        try { return [id, await imageSource(id)]; } catch { return [id, null]; }
      }));
      setImages(Object.fromEntries(entries.filter(([, v]) => v)));
    } catch (err) { setError(err); }
  }, [expenseId, groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!detail) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const exp = detail.expense || {};
  const members = group?.members || [];
  const currency = group?.currency || 'USD';
  const locked = exp.status === 'LOCKED';
  const audit = detail.audit || exp.audit || [];
  const myId = user?.user_id || user?.id;
  const isOwner = group?.my_role === 'owner';
  const canEdit = !locked && (exp.created_by === myId || exp.payer_id === myId || isOwner);
  const nameOf = (id) => members.find((m) => m.user_id === id)?.display_name || String(id || '').slice(0, 8);

  const deleteExpense = () => {
    Alert.alert(t('expense.deleteTitle'), t('expense.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/expenses/${expenseId}`);
            navigation.goBack();
          } catch (err) {
            Alert.alert(t('expense.deleteTitle'), err.code === 'EXPENSE_LOCKED' ? t('m.errors.expenseLocked') : err.message);
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const uploadReceipt = async () => {
    if ((exp.images || []).length >= 5) {
      Alert.alert(t('expense.receipts'), t('forms.expense.receiptsCount', { count: 5 }));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: false });
    if (res.canceled) return;
    const asset = (res.assets || [])[0];
    if (!asset) return;
    if ((asset.fileSize || 0) > 10 * 1024 * 1024) {
      Alert.alert(t('expense.receiptTooBig'), '');
      return;
    }
    setBusy(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        asset.width ? [{ resize: { width: Math.min(asset.width, 1600) } }] : [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      ).catch(() => asset);
      const form = new FormData();
      form.append('files', { uri: compressed.uri, name: 'receipt.jpg', type: 'image/jpeg' });
      await api.postForm(`/api/v1/expenses/${expenseId}/images`, form);
      await load();
      Alert.alert(t('expense.receiptUploaded'), '');
    } catch (err) {
      Alert.alert(t('expense.uploadReceipt'), err.message);
    } finally { setBusy(false); }
  };

  const deleteImage = (imageId) => {
    Alert.alert(t('common.delete'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/v1/images/${imageId}`);
            await load();
          } catch (err) { Alert.alert(t('common.delete'), err.message); }
        },
      },
    ]);
  };

  if (editing) {
    return (
      <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
        <ExpenseForm
          groupId={groupId}
          group={group}
          members={members}
          currency={currency}
          categories={categories}
          initial={exp}
          onReload={load}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
          enableScan={false}
        />
        <View style={{ height: 30 }} />
      </ScrollView>
    );
  }

  const guests = exp.guests || [];
  const splits = exp.splits || [];

  return (
    <ScrollView style={s.wrap}>
      <Card>
        <View style={s.rowBetween}>
          <Text style={s.title}>{exp.title}</Text>
          <Text style={locked ? s.bLock : s.bOpen}>
            {locked ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}
          </Text>
        </View>
        <Money cents={exp.amount_cents || 0} currency={currency} size="lg" style={{ marginTop: 6 }} />
        <Text style={uiStyles.muted}>
          {t('expense.paidBy')} {nameOf(exp.payer_id)}
          {exp.category ? ` · ${categoryLabelForKey(exp.category, categories, t)}` : ''}
        </Text>
        {!!exp.spent_at && <Text style={uiStyles.muted}>{t('forms.expense.spentOn')} {String(exp.spent_at).slice(0, 10)}</Text>}
        {(exp.tax_cents || exp.tip_cents || exp.fee_cents) ? (
          <Text style={uiStyles.muted}>
            {[
              exp.tax_cents ? `${t('expense.tax')} ${fmt(exp.tax_cents, currency)}` : null,
              exp.tip_cents ? `${t('expense.tip')} ${fmt(exp.tip_cents, currency)}` : null,
              exp.fee_cents ? `${t('expense.fee')} ${fmt(exp.fee_cents, currency)}` : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {!!exp.orig_currency && (
          <Text style={uiStyles.muted}>
            {fmt(exp.orig_amount_cents || 0, exp.orig_currency)} × {exp.fx_rate} ≈ {fmt(exp.amount_cents || 0, currency)}
          </Text>
        {!!exp.description && <Text style={s.muted}>{exp.description}</Text>}
        <Text style={s.h}>Paid by {displayNameOf(members, exp.payer_id)} · {fmt(exp.amount_cents || 0, currency)}</Text>
        {!editing ? (
          <Text style={s.muted}>Tap Edit to change title/amount (creator or owner, ACTIVE only).</Text>
        ) : (
          <>
            <TextInput style={s.inp} value={title} onChangeText={(v) => { setTitle(v); liveEditPreview(v, amount); }} placeholder="Title (1-100)" />
            <TextInput style={s.inp} value={amount} onChangeText={(raw) => { const v = normalizeDecimal(raw); setAmount(v); liveEditPreview(title, v); }} placeholder="0.00" keyboardType="decimal-pad" />
            {preview && <Text style={s.step}>Preview: {JSON.stringify(preview.shares || {})}{preview.unsettled_user_ids?.length ? ` · will un-settle ${preview.unsettled_user_ids.length}` : ''}</Text>}
          </>
        )}
        {!!exp.description && <Text style={[uiStyles.muted, { marginTop: 6 }]}>{exp.description}</Text>}

        <View style={s.actions}>
          {canEdit ? (
            <>
              <Pressable style={s.ghost} onPress={() => setEditing(true)} accessibilityRole="button">
                <Text style={s.ghostT}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable style={s.ghost} onPress={deleteExpense} disabled={busy} accessibilityRole="button">
                <Text style={s.dangerT}>{t('common.delete')}</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            style={s.ghost}
            onPress={() => navigation.navigate('AddExpense', { id: groupId, copyFrom: exp })}
            accessibilityRole="button"
          >
            <Text style={s.ghostT}>{t('groupDetail.copyExpense')}</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('expense.splits')}</Text>
        {splits.map((sp) => (
          <View key={sp.user_id} style={s.rowBetween}>
            <Text style={s.small}>{nameOf(sp.user_id)}{myId === sp.user_id ? ` · ${t('groupDetail.mine')}` : ''}</Text>
            <Money cents={sp.share_cents || 0} currency={currency} size="sm" />
          </View>
        ))}
        {guests.length > 0 && (
          <>
            <Text style={[uiStyles.h, { marginTop: 10 }]}>{t('expense.guests')}</Text>
            {guests.map((g, i) => (
              <View key={`${g.label}-${i}`} style={s.rowBetween}>
                <Text style={s.small}>{g.label} · {nameOf(g.covered_by)}</Text>
                <Money cents={g.share_cents || 0} currency={currency} size="sm" />
              </View>
            ))}
          </>
        )}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('expense.receipts')} ({(exp.images || []).length})</Text>
        {(exp.images || []).length === 0 && <Text style={uiStyles.muted}>{t('expense.noReceipts')}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(exp.images || []).map((im) => {
            const imageId = im.image_id || im.id;
            const source = images[imageId];
            return (
              <View key={imageId} style={s.thumbWrap}>
                {source
                  ? <Image source={source} style={s.thumb} accessible accessibilityLabel={t('expense.receipts')} />
                  : <View style={[s.thumb, s.thumbEmpty]}><Text style={s.small}>🧾</Text></View>}
                {!locked && (
                  <Pressable
                    style={s.thumbDelete}
                    onPress={() => deleteImage(imageId)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <Text style={s.thumbDeleteT}>✕</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
        {!locked && (
          <SpinButton title={t('expense.uploadReceipt')} variant="ghost" onPress={uploadReceipt} busy={busy} />
        )}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('expense.history', { count: audit.length })}</Text>
        {audit.length === 0 && <Text style={uiStyles.muted}>{t('expense.noHistory')}</Text>}
        {audit.map((a, i) => (
          <Text key={i} style={s.audit}>
            {a.at ? `${new Date(a.at).toLocaleString()} · ` : ''}
            {typeof a.diff === 'string' ? a.diff : JSON.stringify(a.diff || a)}
          </Text>
        ))}
      </Card>

      <Comments expenseId={expenseId} groupOwnerId={members.find((m) => m.role === 'owner')?.user_id} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  title: { fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  small: { fontSize: 12, color: colors.text },
  audit: { fontSize: 11, color: colors.secondary, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  ghost: {
    borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 11, minHeight: 44, justifyContent: 'center', backgroundColor: '#fff', flexGrow: 1, alignItems: 'center',
  },
  ghostT: { fontSize: 12, fontWeight: '700', color: colors.text },
  dangerT: { fontSize: 12, fontWeight: '700', color: colors.debtorText },
  thumbWrap: { marginRight: 10, marginTop: 8 },
  thumb: { width: 120, height: 120, borderRadius: 12, backgroundColor: colors.lockedBg },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbDelete: {
    position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,.9)', alignItems: 'center', justifyContent: 'center',
  },
  thumbDeleteT: { fontWeight: '800', color: colors.debtorText },
  bOpen: { fontSize: 10, fontWeight: '800', backgroundColor: colors.openBg, color: colors.openText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
