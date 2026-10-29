// Batch receipt scan — web parity: web/src/components/ScanReceipts.jsx (specs/004 Phase 2).
// Pick up to MAX_BATCH photos (library multi-select or repeated camera shots), scan each
// (3 in flight), review/edit one card per receipt, then create expenses one by one —
// each card keeps its own Idempotency-Key so retries never double-create.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { api, fmt } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, radius, type } from '../theme';
import {
  Screen, Card, Row, Button, ChipRow, Input, Field, SelectField, Badge, Empty, ErrText,
  SkeletonCard, toast,
} from '../ui';
import { categorySelectData } from '../shared/categories';
import { normalizeDecimalInput as dec } from '../shared/decimalInput';
import { scanErrorKey } from '../shared/receiptScan';
import {
  MAX_BATCH, buildExpensePayload, cardAmount, cardsFromSuggestion, findDuplicates, newCard,
  runPool, validateCard,
} from '../shared/receiptBatch';
import {
  chooseSource, pickImages, compressForScan, postScan, uploadImage, isTooBig, isImageFile,
} from '../receipt';

// Status → Badge kind (web STATUS_COLOR: gray/teal/orange/red/blue/green/red).
const STATUS_KIND = {
  scanning: 'comment',
  ready: 'settled',
  manual: 'expense',
  scan_failed: 'owe',
  creating: 'payment',
  created: 'paid',
  create_failed: 'owe',
};

export default function ScanReceiptsScreen({ route, navigation }) {
  const t = useT();
  const { user } = useAuth() || {};
  const meId = user?.user_id;
  const groupId = route.params?.id;
  const [group, setGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [existingExpenses, setExistingExpenses] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const [g, cats, ledger] = await Promise.all([
        api.get(`/api/v1/groups/${groupId}`),
        api.get(`/api/v1/groups/${groupId}/categories`).catch(() => []),
        api.get(`/api/v1/groups/${groupId}/ledger?limit=100`).catch(() => ({ items: [] })),
      ]);
      setGroup(g?.group ? { ...g, ...g.group } : g);
      setCategories(Array.isArray(cats) ? cats : []);
      setExistingExpenses(ledger?.items || []);
    } catch (err) {
      setLoadErr(err);
    }
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  // Block closing while expenses are being created (web: close() ignored while busy).
  useEffect(() => {
    busyRef.current = busy;
    navigation.setOptions({ gestureEnabled: !busy });
  }, [busy, navigation]);
  useEffect(() => navigation.addListener('beforeRemove', (ev) => {
    if (busyRef.current) ev.preventDefault();
  }), [navigation]);

  const members = group?.members || [];
  const currency = group?.currency || '';
  const scanning = cards.filter((c) => c.status === 'scanning').length;
  const duplicates = new Set(findDuplicates(cards, existingExpenses));
  const pending = cards.filter((c) => c.status !== 'created' && c.status !== 'scanning');
  const failed = cards.filter((c) => c.status === 'create_failed');

  const patch = (id, next) => setCards((prev) => prev.map((c) => (
    c.id === id ? { ...c, ...(typeof next === 'function' ? next(c) : next) } : c
  )));

  const memberDefaults = () => ({
    payerId: meId && members.some((m) => m.user_id === meId) ? meId : (members[0]?.user_id || ''),
    participantIds: members.map((m) => m.user_id),
  });

  const scanCard = async (card) => {
    let file = card.file;
    try {
      file = await compressForScan(card.file);
    } catch { /* provider gets the original file */ }
    const resp = await postScan(groupId, file);
    // One photo can hold several receipts → one card each (same photo on all).
    const next = cardsFromSuggestion({ ...card, file }, resp, { currency, categories });
    setCards((prev) => prev.flatMap((c) => (c.id === card.id ? next.map((n) => ({ ...n, file })) : [c])));
  };

  const addPhotos = async () => {
    if (busy || picking) return;
    const room = Math.max(0, MAX_BATCH - cards.length);
    if (room === 0) {
      toast({ message: t('scan.limit', { max: MAX_BATCH }), color: 'orange' });
      return;
    }
    const src = await chooseSource({
      title: cards.length === 0 ? t('scan.addPhotos') : t('scan.takePhotos'),
      camera: t('m.expense.camera'),
      library: t('m.expense.library'),
      cancel: t('common.cancel'),
    });
    if (!src) return;
    setPicking(true);
    let picked = [];
    try {
      const r = await pickImages(src, { multiple: true, limit: room });
      if (r.denied) toast({ message: t('m.expense.cameraDenied'), color: 'orange' });
      picked = r.files;
    } catch {
      picked = [];
    } finally {
      setPicking(false);
    }
    if (picked.length === 0) return;
    if (picked.length > room) toast({ message: t('scan.limit', { max: MAX_BATCH }), color: 'orange' });
    const added = [];
    for (const file of picked.slice(0, room)) {
      if (isTooBig(file)) {
        toast({ message: t('scan.tooBig', { name: file.name }), color: 'red' });
      } else if (!isImageFile(file)) {
        toast({ message: t('scan.notImage', { name: file.name }), color: 'red' });
      } else {
        added.push({ ...newCard(file), ...memberDefaults() });
      }
    }
    if (added.length === 0) return;
    setCards((prev) => [...prev, ...added]);
    const results = await runPool(added, 3, scanCard);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        patch(added[i].id, { status: 'scan_failed', error: r.reason, lowConfidence: false });
        toast({ message: t(scanErrorKey(r.reason)), color: 'red' });
      }
    });
  };

  const createCards = async (list) => {
    if (busy || list.length === 0) return;
    const ready = [];
    for (const card of list) {
      const check = validateCard(card, members);
      patch(card.id, { fieldErrors: check.errors });
      if (check.ok) ready.push(card);
    }
    if (ready.length === 0) return;
    setBusy(true);
    busyRef.current = true;
    let created = 0;
    let photoFailed = false;
    for (const card of ready) {
      patch(card.id, { status: 'creating', error: null });
      try {
        const resp = await api.post(
          `/api/v1/groups/${groupId}/expenses`,
          buildExpensePayload(card, members),
          { idempotencyKey: card.key },
        );
        const expenseId = resp?.expense?.expense_id ?? null;
        if (expenseId && card.file) {
          try { await uploadImage(expenseId, card.file); } catch { photoFailed = true; }
        }
        created += 1;
        patch(card.id, { status: 'created', expenseId, fieldErrors: [] });
      } catch (err) {
        patch(card.id, { status: 'create_failed', error: err });
      }
    }
    busyRef.current = false;
    setBusy(false);
    if (created > 0) {
      toast({
        title: created === 1 ? t('scan.createdOne') : t('scan.created', { count: created }),
        message: photoFailed ? t('scan.savedReceiptFailed') : undefined,
        color: photoFailed ? 'orange' : 'teal',
      });
    }
  };

  if (!group) {
    return (
      <Screen>
        {loadErr ? (
          <>
            <ErrText e={loadErr} />
            <Button variant="ghost" title={t('m.retry')} onPress={load} />
          </>
        ) : <SkeletonCard />}
      </Screen>
    );
  }

  const catOptions = [{ value: '', label: t('common.none') }, ...categorySelectData(categories, t)];
  const memberOptions = members.map((m) => ({ value: m.user_id, label: m.display_name }));
  const statusLabel = (card, amount) => {
    switch (card.status) {
      case 'scanning': return t('scan.scanning');
      case 'ready': return t('scan.receiptTotal', { amount: fmt(Math.round(Number(amount || 0) * 100), currency) });
      case 'manual': return t('scan.manual');
      case 'scan_failed': return t('scan.scanFailed');
      case 'creating': return t('scan.busy');
      case 'created': return t('scan.createdOne');
      case 'create_failed': return t('scan.createFailed');
      default: return card.status;
    }
  };

  const footer = (
    <View style={{ gap: 8 }}>
      {failed.length > 0 && (
        <Button variant="soft" disabled={busy} title={`${t('scan.retryFailed')} (${failed.length})`} onPress={() => createCards(failed)} />
      )}
      <Row>
        <Button style={{ flex: 1 }} variant="ghost" title={t('common.close')} disabled={busy} onPress={() => navigation.goBack()} />
        <Button
          style={{ flex: 2 }}
          busy={busy}
          disabled={busy || pending.length === 0}
          title={pending.length === 1 ? t('scan.createOne') : t('scan.create', { count: pending.length })}
          onPress={() => createCards(pending)}
        />
      </Row>
    </View>
  );

  return (
    <Screen footer={footer}>
      <Text style={type.small}>{t('scan.hint')}</Text>
      <Row>
        <Button
          style={{ flex: 1 }}
          variant="soft"
          icon="📷"
          busy={picking}
          disabled={busy || cards.length >= MAX_BATCH}
          title={cards.length === 0 ? t('scan.addPhotos') : t('scan.takePhotos')}
          onPress={addPhotos}
        />
        {scanning > 0 && <ActivityIndicator color={colors.primary} />}
      </Row>
      <Text style={type.small}>
        {scanning > 0 ? `${t('scan.scanning')} · ` : ''}{t('scan.limit', { max: MAX_BATCH })}
      </Text>
      <Text style={type.small}>{t('scan.thirdParty')}</Text>

      {cards.length === 0 && <Empty emoji="🧾" title={t('scan.empty')} />}

      {cards.map((card, index) => {
        const errors = card.fieldErrors || [];
        const amount = cardAmount(card);
        const done = card.status === 'created';
        const off = busy || done;
        return (
          <Card key={card.id}>
            <Row style={{ alignItems: 'flex-start' }}>
              {card.file?.uri ? <Image source={{ uri: card.file.uri }} style={s.thumb} accessibilityIgnoresInvertColors /> : null}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type.h3}>{t('scan.receiptOf', { index: index + 1, total: cards.length })}</Text>
                <Badge kind={STATUS_KIND[card.status] || 'comment'} label={statusLabel(card, amount)} />
              </View>
              <Pressable
                disabled={off}
                onPress={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('scan.removeCard', { name: card.name })}
                style={off ? { opacity: 0.4 } : null}
              >
                <Text style={s.remove}>{t('common.remove')}</Text>
              </Pressable>
            </Row>

            {card.status === 'scanning' ? <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} /> : null}

            <Field label={t('forms.expense.title')} error={errors.includes('title') ? t('scan.err.title') : null}>
              <Input
                value={card.title}
                editable={!off}
                maxLength={100}
                error={errors.includes('title')}
                onChangeText={(v) => patch(card.id, { title: v })}
              />
            </Field>
            <Row style={{ alignItems: 'flex-start' }}>
              <Field style={{ flex: 1 }} label={t('forms.expense.amount')} error={errors.includes('amount') ? t('scan.err.amount') : null}>
                <Input
                  value={card.amount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  editable={!off && !card.origCurrency}
                  error={errors.includes('amount')}
                  onChangeText={(v) => patch(card.id, { amount: dec(v) })}
                />
              </Field>
              <Field style={{ flex: 1 }} label={t('forms.expense.spentOn')} error={errors.includes('date') ? t('scan.err.date') : null}>
                <Input
                  value={card.spentAt}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  editable={!off}
                  error={errors.includes('date')}
                  onChangeText={(v) => patch(card.id, { spentAt: v.replace(/[^\d-]/g, '').slice(0, 10) })}
                />
              </Field>
            </Row>

            {card.origCurrency ? (
              <View>
                <Row style={{ alignItems: 'flex-start' }}>
                  <Field style={{ flex: 1 }} label={`${t('forms.expense.fxAmount')} (${card.origCurrency})`}>
                    <Input
                      value={card.origAmount}
                      keyboardType="decimal-pad"
                      editable={!off}
                      onChangeText={(v) => patch(card.id, { origAmount: dec(v) })}
                    />
                  </Field>
                  <Field style={{ flex: 1 }} label={t('forms.expense.fxRate')} error={errors.includes('rate') ? t('scan.err.rate') : null}>
                    <Input
                      value={card.fxRate}
                      placeholder="1.00"
                      keyboardType="decimal-pad"
                      editable={!off}
                      error={errors.includes('rate')}
                      onChangeText={(v) => patch(card.id, { fxRate: dec(v) })}
                    />
                  </Field>
                </Row>
                <Text style={[type.small, { marginTop: 6 }]}>
                  {t('forms.expense.fxApprox', { amount: fmt(Math.round(Number(amount || 0) * 100), currency) })}
                </Text>
                <Text style={[type.small, { color: colors.warn }]}>{t('scan.currencyMismatch', { currency: card.origCurrency })}</Text>
              </View>
            ) : null}

            <SelectField
              label={t('forms.expense.category')}
              value={card.category || ''}
              options={catOptions}
              disabled={off}
              onChange={(v) => patch(card.id, { category: v || '' })}
            />
            <SelectField
              label={t('forms.expense.payer')}
              value={card.payerId || ''}
              options={memberOptions}
              disabled={off}
              error={errors.includes('payer') ? t('scan.err.payer') : null}
              onChange={(v) => patch(card.id, { payerId: v || '' })}
            />
            <Field label={t('forms.expense.participants')} error={errors.includes('participants') ? t('scan.err.participants') : null}>
              <View pointerEvents={off ? 'none' : 'auto'} style={off ? { opacity: 0.5 } : null}>
                <ChipRow
                  multi
                  options={memberOptions}
                  value={card.participantIds}
                  onChange={(v) => patch(card.id, { participantIds: v })}
                />
              </View>
            </Field>

            {card.lowConfidence && card.status !== 'created' ? (
              <Text style={[s.warn, { marginTop: 8 }]}>{t('scan.lowConfidence')}</Text>
            ) : null}
            {duplicates.has(card.id) ? <Text style={[s.warn, { marginTop: 4 }]}>{t('scan.duplicate')}</Text> : null}
            {card.status === 'create_failed' && card.error ? (
              <Text style={s.err}>{card.error.message || t('scan.createFailed')}</Text>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  thumb: { width: 52, height: 52, borderRadius: radius.thumb, backgroundColor: colors.line },
  remove: { color: colors.secondary, fontWeight: '700', fontSize: 13 },
  warn: { fontSize: 12, color: colors.warn, fontWeight: '600' },
  err: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
