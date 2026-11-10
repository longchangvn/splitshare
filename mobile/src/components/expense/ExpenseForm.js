// Native ExpenseForm — 1:1 with web/src/components/Forms.jsx ExpenseForm (create, copy, edit).
// Fields come from the shared ExpenseFields + shared/expenseDraft (specs/007), same as Scan Receipts.
// Create: POST /groups/:id/expenses (offline queue + Idempotency-Key), staged receipts uploaded after save,
// receipt scan (OCR, shared applyScan). Edit: PATCH /expenses/:id with expected_version, live
// preview-edit, un-settle confirm. initialSplit = remembered split (create only).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import {
  api, fmt, displayNameOf, getCapabilities, newIdempotencyKey,
} from '../../api/client';
import { queueOrSend } from '../../offline/queue';
import { colors, radius, type } from '../../theme';
import {
  Screen, Card, Row, Button, ConfirmSheet, toast, ErrText,
} from '../../ui';
import { useT } from '../../i18n';
import { scanErrorKey } from '../../shared/receiptScan';
import {
  applyScan, draftFromSource, draftToBody, droppedMembers, newDraft, pickCategory, scanReceipt,
  validateDraft,
} from '../../shared/expenseDraft';
import { restoreSplit } from '../../shared/splitMemory';
import { saveLastSplit } from '../../splitMemoryStore';
import { useSplitPreview } from '../../useSplitPreview';
import {
  chooseSource, pickImages, compressForUpload, compressForScan, postScan, uploadImage,
  isTooBig, shortName,
} from '../../receipt';
import { MAX_STAGED, saveErrorKey } from './formLogic';
import ExpenseFields from './ExpenseFields';

const SPLIT_FIELDS = ['splitType', 'participantIds', 'values', 'stashed', 'payerId', 'category'];

export default function ExpenseForm({
  groupId, members, existing, copyFrom, currency = '', meId, initialSplit = null,
  onDone, onSaveNew, onCancel, onReload,
}) {
  const t = useT();
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const nameOf = (id) => displayNameOf(members, id);
  const activeIds = new Set(members.map((m) => m.user_id));

  const freshDraft = (remembered) => newDraft({ members, meId, remembered, category: 'food' });
  const [remembered] = useState(() => (source ? null : restoreSplit(initialSplit, { members, meId })));
  const [draft, setDraft] = useState(() => (source
    ? draftFromSource({
      existing, copyFrom, members, meId,
      title: existing ? undefined : t('forms.expense.copyOf', { title: copyFrom.title }),
    })
    : freshDraft(remembered)));
  // Untouched new-form values: the single scan only fills fields still equal to these.
  const initialRef = useRef(draft);
  const patchDraft = (p) => setDraft((d) => ({ ...d, ...p }));
  const [usingLast, setUsingLast] = useState(!!remembered);
  const [tried, setTried] = useState(false);
  const [receiptCurrency, setReceiptCurrency] = useState('');
  const [confirm, setConfirm] = useState(null); // [names] un-settle list
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState('close');
  const [imgErrs, setImgErrs] = useState([]);
  const [e, setE] = useState(null);
  const [categories, setCategories] = useState([]);
  // One key per form instance: a double tap or offline retry replays instead of double-counting.
  const idemKey = useRef(newIdempotencyKey()).current;

  const dropped = droppedMembers(copyFrom, members);
  // Copy expense never carries receipts: the upload section starts empty.

  // Edit may still list former members (server answers INVOLVES_REMOVED_MEMBER).
  const validationMembers = existing
    ? [...members, ...(existing.splits || []).filter((x) => !activeIds.has(x.user_id)).map((x) => ({ user_id: x.user_id }))]
    : members;
  const errors = tried ? validateDraft(draft, validationMembers).errors : [];

  const previewUrl = existing
    ? `/api/v1/expenses/${existing.expense_id}/preview-edit`
    : `/api/v1/groups/${groupId}/expenses/preview-split`;
  const { preview, error: previewErr } = useSplitPreview(draft, previewUrl);

  // Group categories (default 'food' fallback chain, same as web).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get(`/api/v1/groups/${groupId}/categories`);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setCategories(list);
        setDraft((d) => {
          const category = pickCategory(list, d.category, source?.category);
          if (initialRef.current.category === d.category) initialRef.current = { ...initialRef.current, category };
          return { ...d, category };
        });
      } catch (err) {
        if (!cancelled) setE(err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const resetSplit = () => {
    const base = freshDraft(null);
    base.category = pickCategory(categories, '', null);
    setDraft((d) => ({ ...d, ...Object.fromEntries(SPLIT_FIELDS.map((k) => [k, base[k]])) }));
    setUsingLast(false);
  };

  // ---------- Receipts (create only): staged now, uploaded after Save ----------
  const [staged, setStaged] = useState([]);
  const [picking, setPicking] = useState(false);
  const sourceLabels = {
    title: t('m.expense.photoSource'),
    camera: t('m.expense.camera'),
    library: t('m.expense.library'),
    cancel: t('common.cancel'),
  };

  const addReceipts = async () => {
    if (picking || staged.length >= MAX_STAGED) return;
    const src = await chooseSource(sourceLabels);
    if (!src) return;
    setPicking(true);
    try {
      const room = MAX_STAGED - staged.length;
      const { files, denied } = await pickImages(src, { multiple: true, limit: room });
      if (denied) { toast({ message: t('m.expense.cameraDenied'), color: 'orange' }); return; }
      const ok = [];
      for (const f of files) {
        if (isTooBig(f)) {
          setE({ message: t('forms.expense.over10mb', { name: f.name }) });
          continue;
        }
        ok.push(await compressForUpload(f));
      }
      setStaged((prev) => [...prev, ...ok].slice(0, MAX_STAGED));
    } catch (err) {
      setE(err);
    } finally {
      setPicking(false);
    }
  };

  const uploadStaged = async (newExpenseId) => {
    const failures = [];
    for (const file of staged) {
      try {
        await uploadImage(newExpenseId, file);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    return failures;
  };

  // ---------- Receipt scan (create only, hidden unless the API has OCR enabled) ----------
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const canScan = !existing && ocrEnabled;
  useEffect(() => {
    if (existing) return undefined;
    let cancelled = false;
    getCapabilities()
      .then((c) => { if (!cancelled) setOcrEnabled(!!c?.ocr_enabled); })
      .catch(() => { if (!cancelled) setOcrEnabled(false); });
    return () => { cancelled = true; };
  }, [existing]);

  // Same scan merge as Scan Receipts (shared applyScan); fields the user already changed stay.
  const onScan = async () => {
    if (scanning) return;
    const src = await chooseSource(sourceLabels);
    if (!src) return;
    let file;
    try {
      const { files, denied } = await pickImages(src, { multiple: false, limit: 1 });
      if (denied) { toast({ message: t('m.expense.cameraDenied'), color: 'orange' }); return; }
      file = files[0];
    } catch {
      return;
    }
    if (!file) return;
    setScanning(true);
    try {
      let img;
      try {
        img = await compressForScan(file);
      } catch {
        toast({ message: t('forms.expense.scanImageError'), color: 'red' });
        return;
      }
      const resp = await postScan(groupId, img);
      const group = { currency, categories };
      const scan = scanReceipt(resp, group);
      if (scan.hasTotal) {
        setDraft((d) => ({
          ...d,
          ...applyScan(d, resp, group, { keep: (f) => d[f] !== initialRef.current[f] }).patch,
        }));
        setReceiptCurrency(scan.receiptCurrency);
        setStaged((prev) => (prev.length < MAX_STAGED ? [...prev, img] : prev));
        const shown = scan.fields.amount || scan.fields.origAmount;
        toast({
          title: t('forms.expense.scanDone', { amount: fmt(Math.round(Number(shown) * 100), scan.receiptCurrency || currency) }),
          message: scan.lowConfidence ? t('forms.expense.scanLowConfidence') : t('forms.expense.scanCheck'),
          color: scan.lowConfidence ? 'orange' : 'teal',
        });
      } else {
        toast({
          message: scan.warnings.includes('not_a_receipt') ? t('forms.expense.scanNotReceipt') : t('forms.expense.scanNoTotal'),
          color: 'orange',
        });
      }
    } catch (err) {
      toast({
        message: err?.status === 422 && err.message ? err.message : t(scanErrorKey(err)),
        color: 'red',
      });
    } finally {
      setScanning(false);
    }
  };

  // ---------- Submit ----------
  const validate = () => {
    setTried(true);
    return validateDraft(draft, validationMembers).ok;
  };

  const submit = async (mode) => {
    if (saving) return; // double-submit guard
    if (!validate()) return;
    setE(null);
    setImgErrs([]);
    setSavingMode(mode);
    setSaving(true);
    try {
      if (!existing) {
        const body = draftToBody(draft);
        const send = () => api.post(`/api/v1/groups/${groupId}/expenses`, body, { idempotencyKey: idemKey });
        // Offline: queue the draft with the SAME key; it syncs later without duplicates.
        const r = await queueOrSend('expense', groupId, send, body, idemKey);
        saveLastSplit(meId, groupId, draft);
        if (r?.queued) {
          toast({
            title: t('m.expense.queued'),
            message: staged.length > 0 ? t('m.expense.queuedNoReceipts') : undefined,
            color: 'orange',
          });
        } else {
          const newId = r?.expense?.expense_id;
          let notified = false;
          if (newId && staged.length > 0) {
            const failures = await uploadStaged(newId);
            notified = true;
            if (failures.length > 0) {
              setImgErrs(failures);
              toast({ title: t('forms.expense.savedSomeFailed'), message: failures.join('; '), color: 'orange' });
            } else {
              toast({ title: t('forms.expense.savedWithReceipts'), color: 'teal' });
            }
          }
          if (!notified) toast({ title: t('forms.expense.saved'), color: 'teal' });
        }
        if (mode === 'new' && onSaveNew) onSaveNew(r);
        else onDone(r);
      } else {
        const r = await api.patch(`/api/v1/expenses/${existing.expense_id}`,
          { expected_version: existing.version, ...draftToBody(draft) });
        const unsettled = r?.unsettled_user_ids || [];
        toast({
          title: t('forms.expense.saved'),
          message: unsettled.length > 0 ? t('m.expense.unsettledNames', { names: unsettled.map(nameOf).join(', ') }) : undefined,
          color: unsettled.length > 0 ? 'orange' : 'teal',
        });
        onDone(r);
      }
    } catch (err) {
      setE(err);
    } finally {
      setSaving(false);
    }
  };

  // Edit: preview-edit already ran live; if it flags members, ask first (naming them).
  const submitEdit = () => {
    if (saving) return;
    if (!validate()) return;
    const ids = preview?.unsettled_user_ids || [];
    if (ids.length > 0) {
      setConfirm(ids.map((id) => {
        const share = preview.shares?.[id] != null ? ` → ${(preview.shares[id] / 100).toFixed(2)}` : '';
        return `${nameOf(id)} ($0.00${share})`;
      }));
      return;
    }
    submit('close');
  };

  const receiptCount = existing ? (source?.images?.length || 0) : staged.length;
  const multiSave = !existing && !!onSaveNew;
  const saveActionLabel = multiSave
    ? t('forms.expense.saveClose')
    : isCopy ? t('forms.expense.saveCopy') : t('forms.expense.addExpense');
  const shownErr = e || previewErr;
  const errKey = saveErrorKey(shownErr);
  const splitHint = usingLast ? (
    <Row style={{ marginBottom: 8 }}>
      <Text style={[type.small, { flex: 1 }]}>{t('forms.expense.lastSplit')}</Text>
      <Button small variant="ghost" title={t('forms.expense.lastSplitReset')} onPress={resetSplit} />
    </Row>
  ) : null;

  const footer = multiSave ? (
    <Row>
      {onCancel ? (
        <Button small variant="ghost" title={t('common.cancel')} onPress={onCancel} disabled={saving} />
      ) : null}
      <Button
        style={{ flex: 1 }}
        variant="ghost"
        title={t('forms.expense.saveNew')}
        busy={saving && savingMode === 'new'}
        disabled={saving && savingMode !== 'new'}
        onPress={() => submit('new')}
      />
      <Button
        style={{ flex: 1 }}
        title={t('forms.expense.saveClose')}
        busy={saving && savingMode === 'close'}
        disabled={saving && savingMode !== 'close'}
        onPress={() => submit('close')}
      />
    </Row>
  ) : (
    <Button
      title={existing ? t('common.saveChanges') : saveActionLabel}
      busy={saving}
      onPress={existing ? submitEdit : () => submit('close')}
    />
  );

  return (
    <Screen footer={footer}>
      {isCopy && dropped.length > 0 && (
        <Card tone="open">
          <Text style={[type.h3, { color: colors.tones.open.ink }]}>{t('forms.expense.formerExcluded')}</Text>
          <Text style={type.small}>{dropped.map((id) => id.slice(0, 8)).join(', ')}</Text>
        </Card>
      )}

      {/* Receipts strip */}
      <Card>
        <Row>
          {receiptCount > 0 && !existing ? (
            <Row gap={6}>
              {staged.slice(0, 3).map((f) => (
                <Image key={f.uri} source={{ uri: f.uri }} style={s.thumb} accessibilityIgnoresInvertColors />
              ))}
            </Row>
          ) : receiptCount > 0 ? (
            <Text style={s.slot}>🧾</Text>
          ) : (
            <Text style={s.slot}>＋</Text>
          )}
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{t('forms.expense.receiptsCount', { count: receiptCount })}</Text>
            <Text style={type.small}>{existing ? t('forms.expense.receiptsManage') : t('forms.expense.receiptsHint')}</Text>
          </View>
          {!existing && (
            <Button
              small
              variant="soft"
              busy={picking}
              disabled={staged.length >= MAX_STAGED}
              title={staged.length >= MAX_STAGED ? t('forms.expense.addReceiptFull') : t('forms.expense.addReceipt')}
              onPress={addReceipts}
            />
          )}
        </Row>
        {!existing && staged.length > 0 && (
          <View style={{ marginTop: 10, gap: 6 }}>
            {staged.map((f, i) => (
              <Row key={`${f.uri}-${i}`}>
                <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>🧾 {shortName(f.name)}</Text>
                {f.size ? <Text style={type.small}>{(f.size / 1024).toFixed(0)}KB</Text> : null}
                <Pressable
                  onPress={() => setStaged(staged.filter((_, j) => j !== i))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('common.remove')} ${f.name}`}
                >
                  <Text style={s.remove}>{t('common.remove')}</Text>
                </Pressable>
              </Row>
            ))}
            <Text style={type.small}>{t('forms.expense.uploadsOnSave', { action: saveActionLabel })}</Text>
          </View>
        )}
      </Card>

      {canScan && (
        <View>
          <Button variant="soft" icon="📷" title={t('forms.expense.scan')} busy={scanning} onPress={onScan} />
          <Text style={[type.small, { marginTop: 4 }]}>{t('forms.expense.scanHint')}</Text>
        </View>
      )}

      <ExpenseFields
        draft={draft}
        onChange={patchDraft}
        groupId={groupId}
        members={members}
        categories={categories}
        onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        currency={currency}
        preview={preview}
        errors={errors}
        splitHint={splitHint}
        receiptCurrency={receiptCurrency}
      />

      {imgErrs.length > 0 && (
        <Card tone="open">
          <Text style={type.h3}>{t('forms.expense.receiptFailed')}</Text>
          <Text style={type.small}>{imgErrs.join('; ')}</Text>
        </Card>
      )}
      {errKey ? (
        <Card style={s.errCard}>
          <Text style={[type.h3, { color: colors.dangerDeep }]}>{t(errKey)}</Text>
          {shownErr?.code === 'STALE_VERSION' && onReload ? (
            <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('common.refresh')} onPress={onReload} />
          ) : null}
        </Card>
      ) : <ErrText e={shownErr} />}

      <ConfirmSheet
        visible={!!confirm}
        title={t('forms.expense.unsettleConfirm')}
        message={confirm ? t('forms.expense.unsettleContinue', { names: confirm.join(', ') }) : ''}
        confirmLabel={t('forms.expense.yesSave')}
        busy={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await submit('close'); }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  thumb: { width: 36, height: 36, borderRadius: radius.thumb, backgroundColor: colors.line },
  slot: {
    width: 36, height: 36, borderRadius: radius.thumb, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inputBorder,
    textAlign: 'center', lineHeight: 34, color: colors.secondary, fontSize: 16, overflow: 'hidden',
  },
  remove: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  errCard: { backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder },
});
