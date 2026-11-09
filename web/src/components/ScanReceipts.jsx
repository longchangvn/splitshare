import { useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Divider, Group, Loader, Modal, Stack, Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { useT } from '../prefs.jsx';
import { compressReceiptImage, scanErrorKey } from '../receiptScan.js';
import {
  MAX_BATCH, MAX_FILE_BYTES, buildExpensePayload, cardAmount, cardFromSuggestion,
  findDuplicates, newCard, runPool, validateCard,
} from '../receiptBatch.js';
import { newDraft, pickScanCategory } from '../expenseDraft.js';
import { restoreSplit } from '../splitMemory.js';
import { loadLastSplit, saveLastSplit } from '../splitMemoryStore.js';
import { useSplitPreview } from '../useSplitPreview.js';
import { ExpenseFields } from './ExpenseFields.jsx';

const STATUS_COLOR = {
  scanning: 'gray',
  ready: 'teal',
  manual: 'orange',
  scan_failed: 'red',
  creating: 'blue',
  created: 'green',
  create_failed: 'red',
};

/**
 * Multi-receipt flow (specs/004 Phase 2): pick up to MAX_BATCH photos, scan each
 * one, review/edit the cards, then create the expenses one by one. Nothing is
 * saved until the user confirms, and each card carries its own Idempotency-Key.
 * Each card uses the same ExpenseFields + draft rules as Add expense (specs/007) and
 * starts from the remembered split for this user + group.
 */
export function ScanReceipts({
  opened, onClose, groupId, members = [], meId, currency = '', categories = [],
  existingExpenses = [], onCreated,
}) {
  const t = useT();
  const fileRef = useRef(null);
  const libraryRef = useRef(null);
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState(categories);
  useEffect(() => { setCats(categories); }, [categories]);
  const scanning = cards.filter((c) => c.status === 'scanning').length;
  const duplicates = new Set(findDuplicates(cards, existingExpenses));
  const pending = cards.filter((c) => c.status !== 'created' && c.status !== 'scanning');
  const failed = cards.filter((c) => c.status === 'create_failed');

  useEffect(() => {
    if (!opened) return;
    setCards([]);
    setBusy(false);
  }, [opened]);

  const patch = (id, next) => setCards((prev) => prev.map((c) => (
    c.id === id ? { ...c, ...(typeof next === 'function' ? next(c) : next) } : c
  )));

  // New card = remembered split (EXACT → EQUAL) + scan category rule: scanned → remembered → other.
  const cardDefaults = () => {
    const remembered = restoreSplit(loadLastSplit(meId, groupId), { members, meId, context: 'scan' });
    return newDraft({ members, meId, remembered, category: pickScanCategory(cats, remembered?.category) });
  };

  const scanCard = async (card) => {
    let file = card.file;
    try {
      file = await compressReceiptImage(card.file);
    } catch { /* provider gets the original file */ }
    const form = new FormData();
    form.append('file', file, file.name || card.name);
    const resp = await api.postForm(`/api/v1/groups/${groupId}/expenses/scan`, form);
    const next = cardFromSuggestion({ ...card, file }, resp, { currency, categories: cats });
    patch(card.id, { ...next, file });
  };

  const onPickFiles = async (ev) => {
    const picked = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (picked.length === 0) return;
    const room = Math.max(0, MAX_BATCH - cards.length);
    if (room === 0) {
      notifications.show({ message: t('scan.limit', { max: MAX_BATCH }), color: 'orange' });
      return;
    }
    if (picked.length > room) {
      notifications.show({ message: t('scan.limit', { max: MAX_BATCH }), color: 'orange' });
    }
    const added = [];
    const defaults = cardDefaults();
    for (const file of picked.slice(0, room)) {
      if (file.size > MAX_FILE_BYTES) {
        notifications.show({ message: t('scan.tooBig', { name: file.name }), color: 'red' });
      } else if (file.type && !file.type.startsWith('image/')) {
        notifications.show({ message: t('scan.notImage', { name: file.name }), color: 'red' });
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
        notifications.show({ message: t(scanErrorKey(r.reason)), color: 'red' });
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
    let created = 0;
    let photoFailed = false;
    for (const card of ready) {
      patch(card.id, { status: 'creating', error: null });
      try {
        const resp = await api.post(
          `/api/v1/groups/${groupId}/expenses`,
          buildExpensePayload(card, members),
          { headers: { 'Idempotency-Key': card.key } },
        );
        const expenseId = resp?.expense?.expense_id ?? null;
        saveLastSplit(meId, groupId, card);
        if (expenseId && card.file) {
          try {
            const form = new FormData();
            form.append('file', card.file, card.file.name || card.name);
            await api.postForm(`/api/v1/expenses/${expenseId}/images`, form);
          } catch { photoFailed = true; }
        }
        created += 1;
        patch(card.id, { status: 'created', expenseId });
      } catch (err) {
        patch(card.id, { status: 'create_failed', error: err });
      }
    }
    setBusy(false);
    if (created > 0) {
      notifications.show({
        title: created === 1 ? t('scan.createdOne') : t('scan.created', { count: created }),
        message: photoFailed ? t('scan.savedReceiptFailed') : undefined,
        color: photoFailed ? 'orange' : 'teal',
      });
      onCreated?.();
    }
  };

  const close = () => {
    if (busy) return;
    onClose?.();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      closeOnClickOutside={false}
      title={<span className="wizard-title-name">{t('scan.title')}</span>}
      classNames={{
        content: 'wizard-modal-content',
        header: 'wizard-modal-header',
        body: 'wizard-modal-body',
        title: 'wizard-modal-title',
      }}
      centered
      size={720}
      radius={24}
      padding={0}
      overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
    >
      <Stack gap="md" className="wizard-form">
        <Text size="xs" c="dimmed">{t('scan.hint')}</Text>
        <Group gap="xs">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            hidden
            onChange={onPickFiles}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
          <Button
            variant="light"
            onClick={() => fileRef.current?.click()}
            disabled={busy || cards.length >= MAX_BATCH}
            loading={scanning > 0}
          >
            {t('scan.takePhotos')}
          </Button>
          <Button
            variant="default"
            onClick={() => libraryRef.current?.click()}
            disabled={busy || cards.length >= MAX_BATCH || scanning > 0}
          >
            {t('scan.fromLibrary')}
          </Button>
          {scanning > 0 && <Text size="xs" c="dimmed">{t('scan.scanning')}</Text>}
          {cards.length > 0 && (
            <Text size="xs" c="dimmed">{t('scan.limit', { max: MAX_BATCH })}</Text>
          )}
        </Group>
        <Text size="xs" c="dimmed">{t('scan.thirdParty')}</Text>

        {cards.length === 0 && <Text size="sm" c="dimmed">{t('scan.empty')}</Text>}

        {cards.map((card, index) => (
          <ScanCard
            key={card.id}
            card={card}
            index={index}
            total={cards.length}
            busy={busy}
            duplicate={duplicates.has(card.id)}
            groupId={groupId}
            members={members}
            categories={cats}
            onCategoryCreated={(created) => setCats((prev) => [...prev, created])}
            currency={currency}
            onPatch={(next) => patch(card.id, next)}
            onRemove={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
          />
        ))}

        {failed.length > 0 && (
          <Button
            variant="light"
            color="orange"
            disabled={busy}
            onClick={() => createCards(failed)}
          >
            {t('scan.retryFailed')} ({failed.length})
          </Button>
        )}

        <Divider />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {scanning > 0 ? t('scan.scanning') : (cards.length > 0 ? t('scan.limit', { max: MAX_BATCH }) : '')}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={close} disabled={busy}>{t('common.close')}</Button>
            <Button
              className="wizard-primary"
              loading={busy}
              disabled={busy || pending.length === 0}
              onClick={() => createCards(pending)}
            >
              {pending.length === 1 ? t('scan.createOne') : t('scan.create', { count: pending.length })}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

/** One review card: status header + the shared ExpenseFields (same as Add expense). */
function ScanCard({
  card, index, total, busy, duplicate, groupId, members, categories, onCategoryCreated, currency,
  onPatch, onRemove,
}) {
  const t = useT();
  const amount = cardAmount(card);
  const done = card.status === 'created';
  const locked = busy || done || card.status === 'scanning' || card.status === 'creating';
  const { preview, error: previewErr } = useSplitPreview(
    card, `/api/v1/groups/${groupId}/expenses/preview-split`, !locked,
  );
  const errors = card.tried ? validateCard(card, members).errors : [];
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" gap="xs" mb="xs">
        <Group gap="xs">
          <Text size="sm" fw={600}>{t('scan.receiptOf', { index: index + 1, total })}</Text>
          <Badge color={STATUS_COLOR[card.status] || 'gray'} variant="light">
            {card.status === 'scanning' ? t('scan.scanning') : null}
            {card.status === 'ready' && t('scan.receiptTotal', { amount: fmt(Math.round(Number(amount || 0) * 100), currency) })}
            {card.status === 'manual' && t('scan.manual')}
            {card.status === 'scan_failed' && t('scan.scanFailed')}
            {card.status === 'creating' && t('scan.busy')}
            {card.status === 'created' && t('scan.createdOne')}
            {card.status === 'create_failed' && t('scan.createFailed')}
          </Badge>
        </Group>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          aria-label={t('scan.removeCard', { name: card.name })}
          disabled={busy || done}
          onClick={onRemove}
        >
          {t('common.remove')}
        </Button>
      </Group>

      {card.status === 'scanning' && <Loader size="xs" />}

      <Stack gap="xs" className="wizard-fields">
        <ExpenseFields
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
        {card.lowConfidence && card.status !== 'created' && (
          <Text size="xs" c="orange">{t('scan.lowConfidence')}</Text>
        )}
        {duplicate && (
          <Text size="xs" c="orange">{t('scan.duplicate')}</Text>
        )}
        {previewErr && !done && <Text size="xs" c="red">{previewErr.message}</Text>}
        {card.status === 'create_failed' && card.error && (
          <Text size="xs" c="red">{card.error.message || t('scan.createFailed')}</Text>
        )}
      </Stack>
    </Card>
  );
}
