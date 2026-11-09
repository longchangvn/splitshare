// Batch receipt scan — web parity: web/src/components/ScanReceipts.jsx (specs/004 Phase 2).
// Each card uses the shared ExpenseFields + draft rules (specs/007), same as Add expense, and
// starts from the remembered split for this user + group.
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
  Screen, Card, Row, Button, Badge, Empty, ErrText, SkeletonCard, toast,
} from '../ui';
import { scanErrorKey } from '../shared/receiptScan';
import { newDraft, pickScanCategory } from '../shared/expenseDraft';
import { restoreSplit } from '../shared/splitMemory';
import { loadLastSplit, saveLastSplit } from '../splitMemoryStore';
import { useSplitPreview } from '../useSplitPreview';
import ExpenseFields from '../components/expense/ExpenseFields';
import {
  MAX_BATCH, buildExpensePayload, cardAmount, cardsFromSuggestion, findDuplicates, newCard,
  runPool, validateCard,
} from '../shared/receiptBatch';
import {
  chooseSource, pickImages, prepareScanFile, postScan, scanErrorDetail, uploadImage, isTooBig, isImageFile,
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
        loadLastSplit(meId, groupId),
      ]);
      setGroup(g?.group ? { ...g, ...g.group } : g);
      setCategories(Array.isArray(cats) ? cats : []);
      setExistingExpenses(ledger?.items || []);
    } catch (err) {
      setLoadErr(err);
    }
  }, [groupId, meId]);
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
  const failedScans = cards.filter((c) => c.status === 'scan_failed');

  const patch = (id, next) => setCards((prev) => prev.map((c) => (
    c.id === id ? { ...c, ...(typeof next === 'function' ? next(c) : next) } : c
  )));

  // Localized sentence plus the technical reason (server message / status) so a failure is actionable.
  const scanToast = (reason) => {
    const text = t(scanErrorKey(reason));
    const detail = scanErrorDetail(reason);
    return detail && detail !== text ? `${text} · ${detail}` : text;
  };

  // New card = remembered split (EXACT → EQUAL) + scan category rule: scanned → remembered → other.
  const cardDefaults = async () => {
    const remembered = restoreSplit(await loadLastSplit(meId, groupId), { members, meId, context: 'scan' });
    return newDraft({ members, meId, remembered, category: pickScanCategory(categories, remembered?.category) });
  };

  const scanCard = async (card) => {
    // JPEG re-encode first: the scan API takes jpg/png/webp only (HEIC library photos otherwise 422).
    const file = await prepareScanFile(card.file);
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
    const defaults = await cardDefaults();
    for (const file of picked.slice(0, room)) {
      if (isTooBig(file)) {
        toast({ message: t('scan.tooBig', { name: file.name }), color: 'red' });
      } else if (!isImageFile(file)) {
        toast({ message: t('scan.notImage', { name: file.name }), color: 'red' });
      } else {
        added.push({ ...newCard(file), ...defaults });
      }
    }
    if (added.length === 0) return;
    setCards((prev) => [...prev, ...added]);
    const results = await runPool(added, 3, scanCard);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        patch(added[i].id, { status: 'scan_failed', error: r.reason, lowConfidence: false });
        toast({ message: scanToast(r.reason), color: 'red' });
      }
    });
  };

  /** Re-scan the photos that failed (same file, new attempt) without re-picking them. */
  const rescan = async () => {
    const failedCards = cards.filter((c) => c.status === 'scan_failed');
    if (busy || picking || failedCards.length === 0) return;
    const retrying = failedCards.map((c) => ({ ...c, status: 'scanning', error: null }));
    setCards((prev) => prev.map((c) => (c.status === 'scan_failed' ? { ...c, status: 'scanning', error: null } : c)));
    const results = await runPool(retrying, 3, scanCard);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        patch(retrying[i].id, { status: 'scan_failed', error: r.reason, lowConfidence: false });
        toast({ message: scanToast(r.reason), color: 'red' });
      }
    });
  };

  const createCards = async (list) => {
    if (busy || list.length === 0) return;
    const ready = [];
    for (const card of list) {
      // Same rule as the expense form: errors show live once a save was attempted.
      patch(card.id, { tried: true });
      if (validateCard(card, members).ok) ready.push(card);
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
        saveLastSplit(meId, groupId, card);
        if (expenseId && card.file) {
          try { await uploadImage(expenseId, card.file); } catch { photoFailed = true; }
        }
        created += 1;
        patch(card.id, { status: 'created', expenseId });
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
      {failedScans.length > 0 && (
        <Button variant="soft" disabled={busy || picking} title={`${t('m.retry')} (${failedScans.length})`} onPress={rescan} />
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

      {cards.map((card, index) => (
        <ScanCard
          key={card.id}
          card={card}
          index={index}
          total={cards.length}
          busy={busy}
          duplicate={duplicates.has(card.id)}
          statusLabel={statusLabel(card, cardAmount(card))}
          groupId={groupId}
          members={members}
          categories={categories}
          onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
          currency={currency}
          onPatch={(next) => patch(card.id, next)}
          onRemove={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
        />
      ))}
    </Screen>
  );
}

/** One review card: status header + the shared ExpenseFields (same as Add expense). */
function ScanCard({
  card, index, total, busy, duplicate, statusLabel, groupId, members, categories, onCategoryCreated,
  currency, onPatch, onRemove,
}) {
  const t = useT();
  const done = card.status === 'created';
  const off = busy || done;
  const locked = off || card.status === 'scanning' || card.status === 'creating';
  const { preview, error: previewErr } = useSplitPreview(
    card, `/api/v1/groups/${groupId}/expenses/preview-split`, !locked,
  );
  const errors = card.tried ? validateCard(card, members).errors : [];
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        {card.file?.uri ? <Image source={{ uri: card.file.uri }} style={s.thumb} accessibilityIgnoresInvertColors /> : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.h3}>{t('scan.receiptOf', { index: index + 1, total })}</Text>
          <Badge kind={STATUS_KIND[card.status] || 'comment'} label={statusLabel} />
        </View>
        <Pressable
          disabled={off}
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('scan.removeCard', { name: card.name })}
          style={off ? { opacity: 0.4 } : null}
        >
          <Text style={s.remove}>{t('common.remove')}</Text>
        </Pressable>
      </Row>

      {card.status === 'scanning' ? <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} /> : null}

      <View style={{ marginTop: 12 }}>
        <ExpenseFields
          bare
          draft={card}
          onChange={onPatch}
          groupId={groupId}
          members={members}
          categories={categories}
          onCategoryCreated={onCategoryCreated}
          currency={currency}
          preview={preview}
          errors={errors}
          disabled={locked}
          receiptCurrency={card.receiptCurrency}
        />
      </View>

      {card.lowConfidence && card.status !== 'created' ? (
        <Text style={[s.warn, { marginTop: 8 }]}>{t('scan.lowConfidence')}</Text>
      ) : null}
      {duplicate ? <Text style={[s.warn, { marginTop: 4 }]}>{t('scan.duplicate')}</Text> : null}
      {previewErr && !done ? <Text style={s.err}>{previewErr.message}</Text> : null}
      {card.status === 'create_failed' && card.error ? (
        <Text style={s.err}>{card.error.message || t('scan.createFailed')}</Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  thumb: { width: 52, height: 52, borderRadius: radius.thumb, backgroundColor: colors.line },
  remove: { color: colors.secondary, fontWeight: '700', fontSize: 13 },
  warn: { fontSize: 12, color: colors.warn, fontWeight: '600' },
  err: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
