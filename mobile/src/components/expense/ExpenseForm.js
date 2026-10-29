// Native ExpenseForm — 1:1 with web/src/components/Forms.jsx ExpenseForm (create, copy, edit).
// Create: POST /groups/:id/expenses (offline queue + Idempotency-Key), staged receipts uploaded after save,
// receipt scan (OCR). Edit: PATCH /expenses/:id with expected_version, live preview-edit, un-settle confirm.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import {
  api, fmt, displayNameOf, getCapabilities, newIdempotencyKey,
} from '../../api/client';
import { queueOrSend } from '../../offline/queue';
import { colors, radius, type } from '../../theme';
import {
  Screen, Card, Row, Button, ChipRow, Chip, CheckRow, Input, Field, SelectField, Sheet,
  ConfirmSheet, toast, Badge, ErrText,
} from '../../ui';
import { useT } from '../../i18n';
import { sanitizeMoneyInput, isValidMoneyAmount, moneyAmountError } from '../../money';
import { categorySelectData, categoryLabelForKey } from '../../shared/categories';
import { scanErrorKey, scanToAmount } from '../../shared/receiptScan';
import {
  chooseSource, pickImages, compressForUpload, compressForScan, postScan, uploadImage,
  isTooBig, shortName,
} from '../../receipt';
import {
  MAX_STAGED, initSel, initValues, initPayer, droppedMembers, valuesForType, pickCategory,
  buildBody, runningTotals, equalNote as equalNoteOf, isValidDay, todayStr, decimal, saveErrorKey,
} from './formLogic';

export default function ExpenseForm({
  groupId, members, existing, copyFrom, currency = '', meId,
  onDone, onSaveNew, onCancel, onReload,
}) {
  const t = useT();
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const nameOf = (id) => displayNameOf(members, id);
  const money = (cents) => fmt(cents, currency);

  const [title, setTitle] = useState(
    existing?.title ?? (copyFrom ? t('forms.expense.copyOf', { title: copyFrom.title }) : ''));
  const [amount, setAmount] = useState(source ? (source.amount_cents / 100).toFixed(2) : '');
  const [amountErr, setAmountErr] = useState(null);
  const [payer, setPayer] = useState(() => initPayer(source, members, meId));
  const [type, setType] = useState(source?.split_type || 'EQUAL');
  const [sel, setSel] = useState(() => initSel({ existing, copyFrom, members }));
  const [values, setValues] = useState(() => initValues(source, source?.split_type || 'EQUAL', initSel({ existing, copyFrom, members })));
  const [stashed, setStashed] = useState({});
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // [names] un-settle list
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState('close');
  const [imgErrs, setImgErrs] = useState([]);
  const [e, setE] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(source?.category || 'food');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalErr, setCatModalErr] = useState(null);
  const [spentAt, setSpentAt] = useState(() => (source?.spent_at ? String(source.spent_at).slice(0, 10) : todayStr()));
  const [dateErr, setDateErr] = useState(null);
  const [tax, setTax] = useState(source?.tax_cents ? (source.tax_cents / 100).toFixed(2) : '');
  const [tip, setTip] = useState(source?.tip_cents ? (source.tip_cents / 100).toFixed(2) : '');
  const [fee, setFee] = useState(source?.fee_cents ? (source.fee_cents / 100).toFixed(2) : '');
  const [origCur, setOrigCur] = useState(source?.orig_currency || '');
  const [origAmt, setOrigAmt] = useState(source?.orig_amount_cents ? (source.orig_amount_cents / 100).toFixed(2) : '');
  const [fxRate, setFxRate] = useState(source?.fx_rate != null ? String(source.fx_rate) : '');
  const [guests, setGuests] = useState(() => (source?.guests || []).map((g) => ({
    label: g.label, amount: (g.share_cents / 100).toFixed(2), covered_by: g.covered_by,
  })));
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => !!(source && (
    source.tax_cents || source.tip_cents || source.fee_cents || source.orig_currency || (source.guests || []).length)));
  // One key per form instance: a double tap or offline retry replays instead of double-counting.
  const idemKey = useRef(newIdempotencyKey()).current;

  const dropped = droppedMembers(copyFrom, members);
  // Copy expense never carries receipts: the upload section starts empty.

  const changeType = (nextType) => {
    setType(nextType);
    setValues((prev) => valuesForType(prev, nextType, sel));
  };

  const toggle = (id) => {
    if (sel.includes(id)) {
      setSel(sel.filter((x) => x !== id));
      setStashed({ ...stashed, ...(id in values ? { [id]: values[id] } : {}) });
      setValues((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      setSel([...sel, id]);
      if (id in stashed) {
        setValues((prev) => ({ ...prev, [id]: stashed[id] }));
      } else if (type === 'SHARES') {
        setValues((prev) => ({ ...prev, [id]: prev[id] ?? '1' }));
      }
    }
  };
  const setVal = (id, v) => setValues((prev) => ({ ...prev, [id]: decimal(v) }));

  const build = () => buildBody({
    title, amount, payer, type, sel, values, category, spentAt: isValidDay(spentAt) ? spentAt.trim() : '',
    onlyPresent, tax, tip, fee, origCur, origAmt, fxRate, guests,
  });

  const totals = runningTotals({ type, sel, values, amount }, t);

  // Group categories (default 'food' fallback chain, same as web).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get(`/api/v1/groups/${groupId}/categories`);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setCategories(list);
        setCategory((prev) => pickCategory(list, prev, source?.category));
      } catch (err) {
        if (!cancelled) setE(err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name || addingCat) return;
    setAddingCat(true);
    setCatModalErr(null);
    try {
      const created = await api.post(`/api/v1/groups/${groupId}/categories`, { name });
      setCategories((prev) => [...prev, created]);
      setCategory(created.key);
      setNewCatName('');
      setCatModalOpen(false);
      toast({ message: t('groupDetail.categoryAdded'), color: 'teal' });
    } catch (err) {
      setCatModalErr(err);
    } finally {
      setAddingCat(false);
    }
  };

  // Live preview (350ms debounce): create → preview-split, edit → preview-edit.
  useEffect(() => {
    if (!amount || sel.length === 0) { setPreview(null); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const url = existing
          ? `/api/v1/expenses/${existing.expense_id}/preview-edit`
          : `/api/v1/groups/${groupId}/expenses/preview-split`;
        const p = await api.post(url, build());
        if (!live) return;
        setPreview(p);
        setE(null);
      } catch (err) {
        if (live) { setPreview(null); setE(err); }
      }
    }, 350);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, type, payer, category, spentAt, tax, tip, fee, origCur, origAmt, fxRate,
    JSON.stringify(guests), onlyPresent, sel.join(','), Object.values(values).join('|')]);

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

  const onAmountChange = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmount(next);
    setAmountErr(moneyAmountError(next, t));
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
      const { amount: scanned, lowConfidence, warnings } = scanToAmount(resp);
      if (scanned) {
        onAmountChange(scanned);
        setStaged((prev) => (prev.length < MAX_STAGED ? [...prev, img] : prev));
        toast({
          title: t('forms.expense.scanDone', { amount: fmt(Math.round(Number(scanned) * 100), currency) }),
          message: lowConfidence ? t('forms.expense.scanLowConfidence') : t('forms.expense.scanCheck'),
          color: lowConfidence ? 'orange' : 'teal',
        });
      } else {
        toast({
          message: warnings.includes('not_a_receipt') ? t('forms.expense.scanNotReceipt') : t('forms.expense.scanNoTotal'),
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
    const amtErr = moneyAmountError(amount, t) || (!amount ? t('forms.payment.invalidAmount') : null);
    let ok = true;
    if (amtErr || !isValidMoneyAmount(amount)) {
      setAmountErr(amtErr || t('forms.payment.invalidAmount'));
      ok = false;
    }
    if (!isValidDay(spentAt)) {
      setDateErr(t('scan.err.date'));
      ok = false;
    }
    return ok;
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
        const body = build();
        const send = () => api.post(`/api/v1/groups/${groupId}/expenses`, body, { idempotencyKey: idemKey });
        // Offline: queue the draft with the SAME key; it syncs later without duplicates.
        const r = await queueOrSend('expense', groupId, send, body, idemKey);
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
          { expected_version: existing.version, ...build() });
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

  const boxLabel = type === 'EXACT'
    ? t('forms.expense.exactBox')
    : type === 'PERCENT' ? t('forms.expense.percentBox') : t('forms.expense.sharesBox');
  const receiptCount = existing ? (source?.images?.length || 0) : staged.length;
  const equalNote = equalNoteOf(type, preview, { fmtCents: money, nameOf }, t);
  const splitTypes = [
    { value: 'EQUAL', label: t('forms.expense.equal') },
    { value: 'EXACT', label: t('forms.expense.exact') },
    { value: 'PERCENT', label: t('forms.expense.percent') },
    { value: 'SHARES', label: t('forms.expense.shares') },
  ];
  const catData = categorySelectData(categories, t);
  if (category && !catData.some((c) => c.value === category)) catData.push({ value: category, label: categoryLabelForKey(category, categories, t) });
  const memberOptions = members.map((m) => ({ value: m.user_id, label: m.display_name }));
  const multiSave = !existing && !!onSaveNew;
  const saveActionLabel = multiSave
    ? t('forms.expense.saveClose')
    : isCopy ? t('forms.expense.saveCopy') : t('forms.expense.addExpense');
  const fxApprox = origCur.trim() !== '' && origAmt !== '' && fxRate !== '' && !Number.isNaN(Number(origAmt) * Number(fxRate))
    ? t('forms.expense.fxApprox', { amount: (Number(origAmt) * Number(fxRate)).toFixed(2) })
    : null;
  const errKey = saveErrorKey(e);

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

      <Card>
        <Field label={t('forms.expense.title')} style={{ marginTop: 0 }}>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder={t('forms.expense.titlePh')}
            maxLength={100}
            accessibilityLabel={t('forms.expense.title')}
          />
        </Field>
        <Field label={t('forms.expense.amount')} error={amountErr}>
          <Input
            value={amount}
            error={!!amountErr}
            onChangeText={onAmountChange}
            onBlur={() => { if (amount) setAmountErr(moneyAmountError(amount, t)); }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            accessibilityLabel={t('forms.expense.amount')}
          />
        </Field>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <SelectField
              label={t('forms.expense.category')}
              value={category}
              options={catData}
              onChange={(v) => setCategory(v || '')}
            />
          </View>
          <Button
            small
            variant="soft"
            style={{ minHeight: 46 }}
            title={t('forms.expense.addCategoryBtn')}
            accessibilityLabel={t('forms.expense.addCategory')}
            onPress={() => { setNewCatName(''); setCatModalErr(null); setCatModalOpen(true); }}
          />
        </Row>
        <Field label={t('forms.expense.spentOn')} error={dateErr} hint={t('m.expense.dateHint')}>
          <Input
            value={spentAt}
            error={!!dateErr}
            onChangeText={(v) => { setSpentAt(v.replace(/[^\d-]/g, '').slice(0, 10)); setDateErr(null); }}
            onBlur={() => setDateErr(isValidDay(spentAt) ? null : t('scan.err.date'))}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            accessibilityLabel={t('forms.expense.spentOn')}
          />
          <Row style={{ marginTop: 8 }}>
            <Chip label={t('m.expense.today')} on={spentAt === todayStr()} onPress={() => { setSpentAt(todayStr()); setDateErr(null); }} />
            <Chip
              label={t('m.expense.yesterday')}
              on={spentAt === todayStr(new Date(Date.now() - 864e5))}
              onPress={() => { setSpentAt(todayStr(new Date(Date.now() - 864e5))); setDateErr(null); }}
            />
          </Row>
        </Field>
        <SelectField
          label={t('forms.expense.payer')}
          value={payer}
          options={memberOptions}
          onChange={(v) => setPayer(v || '')}
        />
      </Card>

      {/* Bill details (collapsible, like web <details>) */}
      <Card>
        <Pressable
          onPress={() => setDetailsOpen((o) => !o)}
          style={s.summary}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
        >
          <Text style={[type.h3, { flex: 1 }]}>{t('forms.expense.billDetails')}</Text>
          <Text style={{ color: colors.secondary }}>{detailsOpen ? '▴' : '▾'}</Text>
        </Pressable>
        {detailsOpen && (
          <View>
            <Row style={{ alignItems: 'flex-start' }}>
              <Field label={t('forms.expense.taxOpt')} style={{ flex: 1 }}>
                <Input value={tax} onChangeText={(v) => setTax(decimal(v))} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
              <Field label={t('forms.expense.tipOpt')} style={{ flex: 1 }}>
                <Input value={tip} onChangeText={(v) => setTip(decimal(v))} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
              <Field label={t('forms.expense.feeOpt')} style={{ flex: 1 }}>
                <Input value={fee} onChangeText={(v) => setFee(decimal(v))} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
            </Row>
            <Field label={t('forms.expense.foreign')} hint={fxApprox}>
              <Row>
                <Input
                  style={{ flex: 1 }}
                  value={origCur}
                  onChangeText={setOrigCur}
                  placeholder="JPY"
                  autoCapitalize="characters"
                  maxLength={3}
                  accessibilityLabel={t('forms.expense.foreign')}
                />
                <Input
                  style={{ flex: 1 }}
                  value={origAmt}
                  onChangeText={(v) => setOrigAmt(decimal(v))}
                  placeholder={t('forms.expense.fxAmount')}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('forms.expense.fxAmount')}
                />
                <Input
                  style={{ flex: 1 }}
                  value={fxRate}
                  onChangeText={(v) => setFxRate(decimal(v))}
                  placeholder={t('forms.expense.fxRate')}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('forms.expense.fxRate')}
                />
              </Row>
            </Field>
            <View style={{ marginTop: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.label}>{t('forms.expense.guestShares')}</Text>
                <Chip
                  label={t('forms.expense.addGuest')}
                  onPress={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || payer }])}
                />
              </Row>
              {guests.map((g, i) => (
                <View key={i} style={s.guest}>
                  <Row>
                    <Input
                      style={{ flex: 2 }}
                      placeholder={t('forms.expense.guestLabel')}
                      value={g.label}
                      onChangeText={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: v } : gg)))}
                    />
                    <Input
                      style={{ flex: 1 }}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      value={g.amount}
                      onChangeText={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: decimal(v) } : gg)))}
                    />
                    <Pressable
                      onPress={() => setGuests(guests.filter((_, j) => j !== i))}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.remove')}
                    >
                      <Text style={s.remove}>✕</Text>
                    </Pressable>
                  </Row>
                  <SelectField
                    label={t('m.expense.coveredBy')}
                    value={g.covered_by}
                    options={memberOptions}
                    onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
                  />
                </View>
              ))}
              {guests.length === 0 && <Text style={[type.small, { marginTop: 6 }]}>{t('forms.expense.guestHint')}</Text>}
            </View>
            <CheckRow
              label={t('forms.expense.onlyPresent')}
              checked={onlyPresent}
              onPress={() => setOnlyPresent((v) => !v)}
            />
          </View>
        )}
      </Card>

      <Card>
        <Text style={s.label}>{t('forms.expense.method')}</Text>
        <ChipRow options={splitTypes} value={type} onChange={changeType} />
        {equalNote ? <Text style={[type.small, { marginTop: 8 }]}>{equalNote}</Text> : null}
        <Text style={[s.label, { marginTop: 14 }]}>{t('forms.expense.participants')}</Text>
        {members.map((m) => {
          const on = sel.includes(m.user_id);
          return (
            <CheckRow
              key={m.user_id}
              label={m.display_name}
              checked={on}
              onPress={() => toggle(m.user_id)}
              right={type !== 'EQUAL' && on ? (
                <Input
                  style={s.splitBox}
                  value={values[m.user_id] ?? (type === 'SHARES' ? '1' : '')}
                  onChangeText={(v) => setVal(m.user_id, v)}
                  placeholder={type === 'SHARES' ? '1' : boxLabel}
                  keyboardType={type === 'SHARES' ? 'number-pad' : 'decimal-pad'}
                  accessibilityLabel={`${boxLabel} · ${m.display_name}`}
                />
              ) : null}
            />
          );
        })}
        {type !== 'EQUAL' && totals && (
          <Text style={[type.h3, { marginTop: 6, color: totals.ok ? colors.primaryText : colors.warn }]}>{totals.text}</Text>
        )}
      </Card>

      {preview && (
        <Card tone="settled">
          <Text style={type.h3}>{t('forms.expense.livePreview')}</Text>
          <Text style={[type.body, { marginTop: 4 }]}>
            {Object.entries(preview.shares || {}).map(([id, v]) => `${nameOf(id)} ${money(v)}`).join(' · ')}
          </Text>
          {preview.unsettled_user_ids?.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Badge kind="nudge" label={t('forms.expense.unsettle', { count: preview.unsettled_user_ids.length })} />
            </View>
          )}
        </Card>
      )}

      {imgErrs.length > 0 && (
        <Card tone="open">
          <Text style={type.h3}>{t('forms.expense.receiptFailed')}</Text>
          <Text style={type.small}>{imgErrs.join('; ')}</Text>
        </Card>
      )}
      {errKey ? (
        <Card style={s.errCard}>
          <Text style={[type.h3, { color: colors.dangerDeep }]}>{t(errKey)}</Text>
          {e?.code === 'STALE_VERSION' && onReload ? (
            <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('common.refresh')} onPress={onReload} />
          ) : null}
        </Card>
      ) : <ErrText e={e} />}

      <ConfirmSheet
        visible={!!confirm}
        title={t('forms.expense.unsettleConfirm')}
        message={confirm ? t('forms.expense.unsettleContinue', { names: confirm.join(', ') }) : ''}
        confirmLabel={t('forms.expense.yesSave')}
        busy={saving}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { setConfirm(null); await submit('close'); }}
      />

      <Sheet
        visible={catModalOpen}
        onClose={() => { if (!addingCat) setCatModalOpen(false); }}
        title={t('forms.expense.addCategory')}
        footer={(
          <Row>
            <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={addingCat} onPress={() => setCatModalOpen(false)} />
            <Button
              style={{ flex: 1 }}
              variant="brand"
              busy={addingCat}
              disabled={!newCatName.trim()}
              title={t('forms.expense.addCategoryBtn')}
              onPress={addCategory}
            />
          </Row>
        )}
      >
        <Field label={t('groupDetail.categoryName')} style={{ marginTop: 0 }}>
          <Input
            value={newCatName}
            onChangeText={setNewCatName}
            placeholder={t('forms.expense.addCategoryPh')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addCategory}
          />
        </Field>
        <ErrText e={catModalErr} />
      </Sheet>
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
  summary: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  guest: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  splitBox: { width: 104, minHeight: 40, paddingVertical: 8 },
  errCard: { backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder },
});
