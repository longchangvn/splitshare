// Batch receipt scanner (spec 005 task 3.5) — port of web ScanReceipts.jsx:
// up to 10 photos, one scan request each with a 3-way concurrency pool, every
// card reviewed before anything is saved, per-card Idempotency-Key so a retry
// cannot duplicate, photos attached after the expense exists.
import React, { useMemo, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { colors } from '../theme';
import { Chip, ErrorBanner, Money, SpinButton } from '../ui';
import { useT } from '../prefs';
import { fmt } from '../lib/money';
import { categoryLabelForKey } from '../lib/categories';
import { compressReceiptImage } from '../lib/receiptScan';
import {
  MAX_BATCH, assetsToCards, buildExpensePayload, cardAmount, cardsFromSuggestion,
  findDuplicates, remainingSlots, runPool, validateCard,
} from '../lib/receipts';

export default function ScanReceipts({
  visible, onClose, groupId, group, members = [], currency = 'USD', categories = [], meId, onCreated,
}) {
  const t = useT();
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);

  const patch = (id, next) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...next } : c)));

  const scanCard = async (card) => {
    try {
      const asset = await compressReceiptImage(ImageManipulator, card.asset).catch(() => card.asset);
      const form = new FormData();
      form.append('file', { uri: asset.uri, name: asset.fileName || 'receipt.jpg', type: 'image/jpeg' });
      const resp = await api.postForm(`/api/v1/groups/${groupId}/expenses/scan`, form);
      const filled = cardsFromSuggestion({ ...card, asset }, resp, { currency, categories });
      setCards((prev) => {
        const index = prev.findIndex((c) => c.id === card.id);
        if (index === -1) return prev;
        const next = [...prev.slice(0, index), ...filled, ...prev.slice(index + 1)];
        return next;
      });
      // Default payer = me and everyone participating, like the web review card.
      for (const filledCard of filled) {
        patch(filledCard.id, {
          payerId: filledCard.payerId || (meId && members.some((m) => m.user_id === meId) ? meId : members[0]?.user_id || ''),
          participantIds: filledCard.participantIds?.length ? filledCard.participantIds : members.filter((m) => !m.removed).map((m) => m.user_id),
        });
      }
    } catch (err) {
      patch(card.id, { status: 'failed', error: err });
    }
  };

  const addPhotos = async (fromCamera) => {
    if (remainingSlots(cards) === 0) return;
    const picker = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await picker({
      allowsMultipleSelection: !fromCamera,
      selectionLimit: fromCamera ? 1 : remainingSlots(cards),
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled) return;
    const { cards: next, rejected } = assetsToCards(res.assets || [], cards);
    setCards(next);
    if (rejected.length) {
      const msg = rejected.map((r) => (r.reason === 'tooBig'
        ? t('scan.tooBig', { name: r.asset?.fileName || 'image' })
        : r.reason === 'notImage'
          ? t('scan.notImage', { name: r.asset?.fileName || 'image' })
          : t('scan.limit', { max: MAX_BATCH }))).join('\n');
      Alert.alert(t('scan.title'), msg);
    }
    const fresh = next.slice(cards.length);
    await runPool(fresh, 3, (card) => scanCard(card));
  };

  const refreshDuplicates = async () => {
    try {
      const rows = await api.get(`/api/v1/groups/${groupId}/ledger?limit=100`);
      setLedgerRows(rows.items || []);
    } catch { /* duplicate hint is best-effort */ }
  };

  React.useEffect(() => {
    if (!visible) return;
    refreshDuplicates();
  }, [visible, groupId]);

  React.useEffect(() => {
    setDuplicates(findDuplicates(cards, ledgerRows));
  }, [cards, ledgerRows]);

  const ready = useMemo(() => cards.filter((c) => validateCard(c, members).ok && !c.expenseId), [cards, members]);

  const createAll = async () => {
    setBusy(true);
    setError(null);
    let created = 0;
    const failures = [];
    for (const card of cards) {
      if (card.expenseId) continue;
      const check = validateCard(card, members);
      if (!check.ok) { failures.push({ card, reason: check.errors[0] }); continue; }
      const body = buildExpensePayload(card, members);
      try {
        const res = await api.post(`/api/v1/groups/${groupId}/expenses`, body, { idempotencyKey: card.key });
        const expenseId = res?.expense?.expense_id || res?.expense?.id || res?.expense_id || res?.id;
        if (expenseId && card.asset?.uri) {
          const form = new FormData();
          form.append('files', { uri: card.asset.uri, name: 'receipt.jpg', type: 'image/jpeg' });
          await api.postForm(`/api/v1/expenses/${expenseId}/images`, form).catch(() => {
            Alert.alert(t('scan.savedReceiptFailed'), '');
          });
        }
        patch(card.id, { expenseId, status: 'created', error: null });
        created += 1;
      } catch (err) {
        patch(card.id, { status: 'failed', error: err });
        failures.push({ card, reason: err.code || err.message });
      }
    }
    setBusy(false);
    if (failures.length === 0 && created > 0) {
      Alert.alert(t('scan.created', { count: created }), '');
      onCreated?.();
    } else if (created > 0) {
      Alert.alert(t('scan.created', { count: created }), t('scan.failedCount', { count: failures.length }));
    } else {
      setError(failures[0]?.card?.error || null);
    }
  };

  const editing = cards.find((c) => c.id === editingId) || null;

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.head}>
          <Text style={s.title}>{t('scan.title')}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.close}>
            <Text style={s.closeT}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          <Text style={s.hint}>{t('scan.hint')}</Text>
          <Text style={s.hintSmall}>{t('scan.thirdParty')}</Text>

          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <SpinButton title={t('scan.takePhotos')} onPress={() => addPhotos(true)} disabled={remainingSlots(cards) === 0} />
            </View>
            <View style={{ flex: 1 }}>
              <SpinButton title={t('scan.fromLibrary')} variant="ghost" onPress={() => addPhotos(false)} disabled={remainingSlots(cards) === 0} />
            </View>
          </View>

          {cards.length === 0 && <Text style={s.empty}>{t('scan.empty')}</Text>}

          {cards.map((card, index) => {
            const errors = validateCard(card, members).errors;
            const amount = cardAmount(card);
            const isDuplicate = duplicates.includes(card.id);
            return (
              <View key={card.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle} numberOfLines={1}>
                    {card.status === 'created' ? '✓ ' : ''}{card.title || t('scan.receiptOf', { index: index + 1, total: cards.length })}
                  </Text>
                  <Money cents={amount ? Math.round(Number(amount) * 100) : 0} currency={currency} size="md" />
                </View>
                {card.status === 'scanning' && <Text style={s.meta}>{t('scan.scanning')}</Text>}
                {card.status === 'failed' && (
                  <Text style={s.err}>{t('scan.scanFailed')}{card.error?.code ? ` (${card.error.code})` : ''}</Text>
                )}
                {card.status === 'manual' && <Text style={s.meta}>{t('scan.manual')}</Text>}
                {card.lowConfidence && card.status !== 'failed' && <Text style={s.warn}>{t('scan.lowConfidence')}</Text>}
                {!!card.receiptCurrency && (
                  <Text style={s.warn}>{t('scan.currencyMismatch', { currency: card.receiptCurrency })}</Text>
                )}
                {isDuplicate && <Text style={s.warn}>{t('scan.duplicate')}</Text>}
                {card.spentAt && <Text style={s.meta}>{card.spentAt} · {categoryLabelForKey(card.category, categories, t) || '—'}</Text>}
                {errors.length > 0 && !card.expenseId && (
                  <Text style={s.err}>{errors.map((e) => t(`scan.err.${e}`)).join(' · ')}</Text>
                )}
                <View style={s.row}>
                  <Pressable style={s.small} onPress={() => setEditingId(card.id)} accessibilityRole="button">
                    <Text style={s.smallT}>{t('common.edit')}</Text>
                  </Pressable>
                  {card.status === 'failed' && (
                    <Pressable style={s.small} onPress={() => scanCard(card)} accessibilityRole="button">
                      <Text style={s.smallT}>{t('m.state.retry')}</Text>
                    </Pressable>
                  )}
                  {!card.expenseId && (
                    <Pressable
                      style={s.small}
                      onPress={() => setCards(cards.filter((c) => c.id !== card.id))}
                      accessibilityRole="button"
                      accessibilityLabel={t('scan.removeCard', { name: card.title || index + 1 })}
                    >
                      <Text style={s.danger}>{t('common.remove')}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}

          <ErrorBanner error={error} />

          {cards.length > 0 && (
            <SpinButton
              title={busy
                ? t('scan.busy')
                : ready.length === 1
                  ? t('scan.createOne')
                  : t('scan.create', { count: ready.length })}
              busy={busy}
              onPress={createAll}
              disabled={ready.length === 0}
            />
          )}
        </ScrollView>

        {editing && (
          <EditorSheet
            card={editing}
            members={members.filter((m) => !m.removed)}
            categories={categories}
            currency={currency}
            onChange={(next) => patch(editing.id, next)}
            onClose={() => setEditingId(null)}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function EditorSheet({ card, members, categories, currency, onChange, onClose }) {
  const t = useT();
  const toggle = (uid) => {
    const has = card.participantIds.includes(uid);
    onChange({ participantIds: has ? card.participantIds.filter((x) => x !== uid) : [...card.participantIds, uid] });
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>{t('common.edit')}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={s.close}>
                <Text style={s.closeT}>✕</Text>
              </Pressable>
            </View>
            <TextInput style={s.input} value={card.title} onChangeText={(v) => onChange({ title: v })} placeholder={t('forms.expense.title')} maxLength={100} />
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1, marginRight: 8 }]}
                value={card.amount}
                onChangeText={(v) => onChange({ amount: v })}
                placeholder={t('forms.expense.amount')}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={card.spentAt}
                onChangeText={(v) => onChange({ spentAt: v })}
                placeholder="YYYY-MM-DD"
                maxLength={10}
              />
            </View>
            <Text style={s.label}>{t('forms.expense.category')}</Text>
            <View style={s.chips}>
              {categories.map((c) => (
                <Chip
                  key={c.key}
                  label={categoryLabelForKey(c.key, categories, t)}
                  selected={card.category === c.key}
                  onPress={() => onChange({ category: c.key })}
                />
              ))}
            </View>
            <Text style={s.label}>{t('forms.expense.foreign')}</Text>
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} value={card.origCurrency} onChangeText={(v) => onChange({ origCurrency: v.toUpperCase() })} placeholder="EUR" maxLength={3} />
              <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} value={card.origAmount} onChangeText={(v) => onChange({ origAmount: v })} placeholder={t('forms.expense.fxAmount')} keyboardType="decimal-pad" />
              <TextInput style={[s.input, { flex: 1 }]} value={card.fxRate} onChangeText={(v) => onChange({ fxRate: v })} placeholder={t('forms.expense.fxRate')} keyboardType="decimal-pad" />
            </View>
            <Text style={s.label}>{t('forms.expense.payer')}</Text>
            <View style={s.chips}>
              {members.map((m) => (
                <Chip key={m.user_id} label={m.display_name} selected={card.payerId === m.user_id} onPress={() => onChange({ payerId: m.user_id })} />
              ))}
            </View>
            <Text style={s.label}>{t('forms.expense.participants')}</Text>
            <View style={s.chips}>
              {members.map((m) => (
                <Chip key={m.user_id} label={m.display_name} selected={card.participantIds.includes(m.user_id)} onPress={() => toggle(m.user_id)} />
              ))}
            </View>
            {!!cardAmount(card) && <Text style={s.meta}>{t('scan.receiptTotal', { amount: fmt(Math.round(Number(cardAmount(card)) * 100), currency) })}</Text>}
            <SpinButton title={t('common.close')} onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.screen },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeT: { fontSize: 16, fontWeight: '800', color: colors.secondary },
  hint: { fontSize: 12, color: colors.text, marginBottom: 4 },
  hintSmall: { fontSize: 11, color: colors.secondary, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { fontSize: 12, color: colors.secondary, textAlign: 'center', marginTop: 24 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  cardTitle: { fontSize: 13, fontWeight: '800', flex: 1, marginRight: 8 },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 4 },
  err: { fontSize: 11, color: colors.debtorText, marginTop: 4, fontWeight: '600' },
  warn: { fontSize: 11, color: colors.warnText, marginTop: 4, fontWeight: '700' },
  small: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8, minHeight: 40, justifyContent: 'center' },
  smallT: { fontSize: 12, fontWeight: '700', color: colors.text },
  danger: { fontSize: 12, fontWeight: '700', color: colors.debtorText },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '88%' },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, marginTop: 8, minHeight: 44,
  },
  label: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 12, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
