import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Group, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api, fmt, newIdempotencyKey } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import {
  SCAN_MOBILE_QUERY, compressReceiptImage, scanErrorKey,
} from '../receiptScan.js';
import { displayNameOf } from './Net.jsx';
import { ExpenseFields } from './ExpenseFields.jsx';
import { useT } from '../prefs.jsx';
import {
  applyScan, draftFromSource, draftToBody, droppedMembers, isValidMoneyAmount, moneyAmountError,
  newDraft, pickCategory, sanitizeMoneyInput, scanReceipt, validateDraft,
} from '../expenseDraft.js';
import { restoreSplit } from '../splitMemory.js';
import { saveLastSplit } from '../splitMemoryStore.js';
import { useSplitPreview } from '../useSplitPreview.js';

// Shorten long filenames for the staged list (keep start + extension).
const shortName = (name) => {
  if (!name || name.length <= 28) return name || '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(0, 26 - ext.length);
  return `${base.slice(0, Math.min(18, keep))}…${base.slice(-Math.max(0, keep - 18))}${ext}`;
};

const SPLIT_FIELDS = ['splitType', 'participantIds', 'values', 'stashed', 'payerId', 'category'];

// Expense create/edit/copy with live split preview + un-settle confirm (tasks 8.2/8.3).
// Fields come from the shared ExpenseFields + expenseDraft (specs/007), same as Scan Receipts.
// copyFrom: detail.expense payload to prefill a copy (task 4.1).
// initialSplit: remembered split for this user + group (create only; edit/copy ignore it).
export function ExpenseForm({ groupId, members, existing, copyFrom, initialSplit = null, onDone, onSaveNew, onCancel, currency = '' }) {
  const t = useT();
  const meId = useAuth()?.user?.user_id;
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
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
  const [pending, setPending] = useState(null); // PATCH body awaiting confirm
  const [saving, setSaving] = useState(false);
  // Create-only: which footer button triggered submit ('close' | 'new'); Enter key = close.
  const saveModeRef = useRef('close');
  const [savingMode, setSavingMode] = useState('close');
  // One key per form instance: a double click or retry replays instead of double-creating.
  const idemKey = useRef(newIdempotencyKey()).current;
  const [imgErrs, setImgErrs] = useState([]);
  const [e, setE] = useState(null);
  const [categories, setCategories] = useState([]);

  const dropped = droppedMembers(copyFrom, members);
  // Copy expense never carries receipts: the upload section starts empty.

  // Edit may still list former members (server answers INVOLVES_REMOVED_MEMBER).
  const validationMembers = existing
    ? [...members, ...existing.splits.filter((s) => !activeIds.has(s.user_id)).map((s) => ({ user_id: s.user_id }))]
    : members;
  const errors = tried ? validateDraft(draft, validationMembers).errors : [];

  const previewUrl = existing
    ? `/api/v1/expenses/${existing.expense_id}/preview-edit`
    : `/api/v1/groups/${groupId}/expenses/preview-split`;
  const { preview, error: previewErr } = useSplitPreview(draft, previewUrl);

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

  // Staged receipts for create: picked now, uploaded only on Save.
  const [staged, setStaged] = useState([]);
  const fileRef = useRef(null);
  const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
  const maxStaged = 5;
  const onPickFiles = (ev) => {
    const picked = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (picked.length === 0) return;
    const ok = [];
    for (const f of picked) {
      if (f.size > 10 * 1024 * 1024) {
        setE({ message: t('forms.expense.over10mb', { name: f.name }) });
        continue;
      }
      ok.push(f);
    }
    setStaged((prev) => [...prev, ...ok].slice(0, Math.max(0, maxStaged)));
  };
  const uploadStaged = async (newExpenseId) => {
    const failures = [];
    for (const file of staged) {
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        await api.postForm(`/api/v1/expenses/${newExpenseId}/images`, form);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    return failures;
  };

  // Receipt scan (mobile site only, create only, hidden unless the API has OCR enabled).
  const isMobile = useMediaQuery(SCAN_MOBILE_QUERY);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef(null);
  const canScan = !existing && isMobile && ocrEnabled;
  useEffect(() => {
    if (existing) return undefined;
    let cancelled = false;
    api.get('/api/v1/capabilities')
      .then((c) => { if (!cancelled) setOcrEnabled(!!c?.ocr_enabled); })
      .catch(() => { if (!cancelled) setOcrEnabled(false); });
    return () => { cancelled = true; };
  }, [existing]);

  // Same scan merge as Scan Receipts (shared applyScan); fields the user already changed stay.
  const onScanFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || scanning) return;
    setScanning(true);
    try {
      let img;
      try {
        img = await compressReceiptImage(file);
      } catch {
        notifications.show({ message: t('forms.expense.scanImageError'), color: 'red' });
        return;
      }
      const form = new FormData();
      form.append('file', img, img.name);
      const resp = await api.postForm(`/api/v1/groups/${groupId}/expenses/scan`, form);
      const group = { currency, categories };
      const scan = scanReceipt(resp, group);
      if (scan.hasTotal) {
        setDraft((d) => ({
          ...d,
          ...applyScan(d, resp, group, { keep: (f) => d[f] !== initialRef.current[f] }).patch,
        }));
        setReceiptCurrency(scan.receiptCurrency);
        setStaged((prev) => (prev.length < maxStaged ? [...prev, img] : prev));
        const shown = scan.fields.amount || scan.fields.origAmount;
        notifications.show({
          title: t('forms.expense.scanDone', { amount: fmt(Math.round(Number(shown) * 100), scan.receiptCurrency || currency) }),
          message: scan.lowConfidence ? t('forms.expense.scanLowConfidence') : t('forms.expense.scanCheck'),
          color: scan.lowConfidence ? 'orange' : 'teal',
        });
      } else {
        notifications.show({
          message: scan.warnings.includes('not_a_receipt') ? t('forms.expense.scanNotReceipt') : t('forms.expense.scanNoTotal'),
          color: 'orange',
        });
      }
    } catch (err) {
      notifications.show({
        message: err?.status === 422 && err.message ? err.message : t(scanErrorKey(err)),
        color: 'red',
      });
    } finally {
      setScanning(false);
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return; // double-submit guard
    const mode = saveModeRef.current;
    saveModeRef.current = 'close';
    setTried(true);
    if (!validateDraft(draft, validationMembers).ok) return;
    setE(null);
    setImgErrs([]);
    setSavingMode(mode);
    setSaving(true);
    try {
      if (!existing) {
        const r = await api.post(`/api/v1/groups/${groupId}/expenses`, draftToBody(draft),
          { headers: { 'Idempotency-Key': idemKey } });
        saveLastSplit(meId, groupId, draft);
        const newId = r.expense?.expense_id;
        let notified = false;
        if (newId && staged.length > 0) {
          const failures = await uploadStaged(newId);
          notified = true;
          if (failures.length > 0) {
            setImgErrs(failures);
            notifications.show({ title: t('forms.expense.savedSomeFailed'), message: failures.join('; '), color: 'orange' });
          } else {
            notifications.show({ title: t('forms.expense.savedWithReceipts'), color: 'teal' });
          }
        }
        if (mode === 'new' && onSaveNew) {
          if (!notified) notifications.show({ title: t('forms.expense.saved'), color: 'teal' });
          onSaveNew(r);
        } else {
          onDone(r);
        }
      } else {
        const r = await api.patch(`/api/v1/expenses/${existing.expense_id}`,
          { expected_version: existing.version, ...draftToBody(draft) });
        onDone(r);
      }
    } catch (err) {
      setE(err);
    } finally {
      setSaving(false);
    }
  };

  // Pre-save un-settle check for edits: preview-edit already ran live; if it
  // flags members, ask for confirmation naming them.
  const submitEdit = async (ev) => {
    ev.preventDefault();
    setTried(true);
    if (!validateDraft(draft, validationMembers).ok) return;
    const names = preview?.unsettled_user_ids || [];
    if (names.length > 0 && !pending) {
      const resolved = names.map((id) => {
        const share = preview.shares?.[id] != null ? ` → ${(preview.shares[id] / 100).toFixed(2)}` : '';
        return `${displayNameOf(members, id)} ($0.00${share})`;
      });
      setPending(true);
      setConfirm(resolved);
      return;
    }
    setConfirm(null);
    setPending(null);
    await submit(ev);
  };

  // Receipt strip: staged (create) or existing images (edit).
  const receiptCount = existing
    ? (source?.images?.length || 0)
    : staged.length;

  const multiSave = !existing && !!onSaveNew;
  const saveActionLabel = multiSave
    ? t('common.save')
    : isCopy ? t('forms.expense.saveCopy') : t('forms.expense.addExpense');
  const splitHint = usingLast ? (
    <Group gap={6} mb={6} className="expense-last-split">
      <Text size="xs" c="dimmed">{t('forms.expense.lastSplit')}</Text>
      <button type="button" className="wizard-chip" onClick={resetSplit}>{t('forms.expense.lastSplitReset')}</button>
    </Group>
  ) : null;

  return (
    <form className="wizard-form" onSubmit={existing ? submitEdit : submit}>
      {isCopy && dropped.length > 0 && (
        <Alert color="yellow" variant="light" title={t('forms.expense.formerExcluded')}>
          <Text size="sm">{dropped.map((id) => id.slice(0, 8)).join(', ')}</Text>
        </Alert>
      )}

      <div className="wizard-fields">
        <div className="wizard-person wizard-pay-hint">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {receiptCount > 0 ? (
              Array.from({ length: Math.min(receiptCount, 3) }).map((_, i) => (
                <span key={i} className="wizard-receipt-thumb" aria-hidden>🧾</span>
              ))
            ) : (
              <span className="wizard-receipt-slot" aria-hidden>＋</span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600}>{t('forms.expense.receiptsCount', { count: receiptCount })}</Text>
              <Text size="xs" c="dimmed">
                {existing ? t('forms.expense.receiptsManage') : t('forms.expense.receiptsHint')}
              </Text>
            </div>
            {!existing && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  multiple
                  style={{ display: 'none' }}
                  onChange={onPickFiles}
                />
                <Button
                  size="xs"
                  variant="light"
                  style={{ flex: 'none' }}
                  disabled={maxStaged <= 0 || staged.length >= maxStaged}
                  onClick={() => fileRef.current?.click()}
                >
                  {maxStaged <= 0 || staged.length >= maxStaged
                    ? t('forms.expense.addReceiptFull')
                    : t('forms.expense.addReceipt')}
                </Button>
              </>
            )}
          </Group>
          {!existing && staged.length > 0 && (
            <Stack gap={4}>
              {staged.map((f, i) => (
                <Group key={`${f.name}-${f.size}-${i}`} gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text size="xs" style={{ flex: 1, minWidth: 0 }} truncate title={f.name}>🧾 {shortName(f.name)}</Text>
                  <Text size="xs" c="dimmed" style={{ flex: 'none' }}>{(f.size / 1024).toFixed(0)}KB</Text>
                  <Button size="xs" variant="subtle" color="red" style={{ flex: 'none' }} onClick={() => setStaged(staged.filter((_, j) => j !== i))}>X</Button>
                </Group>
              ))}
              <Text size="xs" c="dimmed">{t('forms.expense.uploadsOnSave', { action: saveActionLabel })}</Text>
            </Stack>
          )}
        </div>

        {canScan && (
          <div className="wizard-field">
            {/* No capture attribute: mobile browsers offer camera or photo library. */}
            <input
              ref={scanRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onScanFile}
              data-testid="scan-receipt-input"
            />
            <Button
              type="button"
              fullWidth
              variant="light"
              color="teal"
              loading={scanning}
              onClick={() => scanRef.current?.click()}
            >
              {t('forms.expense.scan')}
            </Button>
            <Text size="xs" c="dimmed" mt={4}>{t('forms.expense.scanHint')}</Text>
          </div>
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
      </div>

      {confirm && (
        <Alert color="orange" variant="light" title={t('forms.expense.unsettleConfirm')}>
          <Text size="sm" mb="xs">{t('forms.expense.unsettleContinue', { names: confirm.join(', ') })}</Text>
          <Group gap="xs">
            <Button className="wizard-primary" size="sm" type="submit" loading={saving}>{t('forms.expense.yesSave')}</Button>
            <Button className="wizard-back" size="sm" onClick={() => { setConfirm(null); setPending(null); }}>
              {t('common.cancel')}
            </Button>
          </Group>
        </Alert>
      )}
      {!confirm && multiSave && (
        <Group gap="sm" className="wizard-actions expense-save-actions">
          {onCancel && (
            <Button className="expense-save-cancel" type="button" onClick={onCancel} disabled={saving}>
              {t('common.cancel')}
            </Button>
          )}
          <Button
            className="expense-save-new"
            type="submit"
            onClick={() => { saveModeRef.current = 'new'; }}
            loading={saving && savingMode === 'new'}
            disabled={saving && savingMode !== 'new'}
          >
            {t('forms.expense.saveNew')}
          </Button>
          <Button
            className="wizard-primary expense-save-close"
            type="submit"
            onClick={() => { saveModeRef.current = 'close'; }}
            loading={saving && savingMode === 'close'}
            disabled={saving && savingMode !== 'close'}
          >
            {t('forms.expense.saveClose')}
          </Button>
        </Group>
      )}
      {!confirm && !multiSave && (
        <Button
          className="wizard-primary"
          fullWidth
          type="submit"
          loading={saving}
        >
          {existing ? t('common.saveChanges') : saveActionLabel}
        </Button>
      )}
      {imgErrs.length > 0 && (
        <Alert color="orange" variant="light" title={t('forms.expense.receiptFailed')}>
          <Text size="sm">{imgErrs.join('; ')}</Text>
        </Alert>
      )}
      <Err e={e || previewErr} />
    </form>
  );
}

export function PaymentForm({ groupId, members, preset, onDone }) {
  const t = useT();
  const options = [...members];
  for (const key of ['from_user_id', 'to_user_id']) {
    const id = preset?.[key];
    if (id && !options.some((m) => m.user_id === id)) {
      options.push({
        user_id: id,
        display_name: t('forms.payment.formerMember', { id: id.slice(0, 8) }),
      });
    }
  }
  const [from, setFrom] = useState(preset?.from_user_id || '');
  const [to, setTo] = useState(preset?.to_user_id || '');
  const [amount, setAmount] = useState(preset?.amount_cents != null ? (preset.amount_cents / 100).toFixed(2) : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [proofRef, setProofRef] = useState('');
  const [handles, setHandles] = useState([]);
  const [e, setE] = useState(null);
  const [amountErr, setAmountErr] = useState(null);
  const [paying, setPaying] = useState(false);

  // Settle sheet: show the receiver's payment handles + exact amount.
  useEffect(() => {
    if (!to) { setHandles([]); return; }
    api.get(`/api/v1/users/${to}/handles`).then(setHandles).catch(() => setHandles([]));
  }, [to]);

  const onAmountChange = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmount(next);
    setAmountErr(moneyAmountError(next, t));
  };

  const go = async (ev) => {
    ev.preventDefault();
    if (paying) return;
    const err = moneyAmountError(amount, t) || (!amount ? t('forms.payment.invalidAmount') : null);
    if (err || !isValidMoneyAmount(amount)) {
      setAmountErr(err || t('forms.payment.invalidAmount'));
      return;
    }
    setAmountErr(null);
    setPaying(true);
    try {
      const r = await api.post(`/api/v1/groups/${groupId}/payments`,
        { from_user_id: from, to_user_id: to, amount: Number(amount), method, note: note || null, proof_ref: proofRef || null });
      onDone(r);
    } catch (err) { setE(err); } finally { setPaying(false); }
  };

  const data = options.map((m) => ({ value: m.user_id, label: m.display_name }));
  const toName = options.find((m) => m.user_id === to)?.display_name;
  const methods = [
    { value: 'cash', label: t('forms.payment.cash') },
    { value: 'transfer', label: t('forms.payment.bank') },
    { value: 'other', label: t('forms.payment.other') },
  ];
  return (
    <form className="wizard-form" onSubmit={go}>
      <div className="wizard-fields">
        <Select
          label={t('forms.payment.from')}
          required
          searchable
          value={from || null}
          onChange={(v) => setFrom(v || '')}
          data={data}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label={t('forms.payment.to')}
          required
          searchable
          value={to || null}
          onChange={(v) => setTo(v || '')}
          data={data}
          comboboxProps={{ withinPortal: true }}
        />
        <TextInput
          label={t('forms.expense.amount')}
          required
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          error={amountErr}
          onChange={(x) => onAmountChange(x.target.value)}
          onBlur={() => {
            if (amount) setAmountErr(moneyAmountError(amount, t));
          }}
        />
        {to && (
          <div className="wizard-person wizard-pay-hint">
            <Text size="sm" fw={600}>
              {isValidMoneyAmount(amount)
                ? t('forms.payment.payNamedAmount', { name: toName, amount })
                : t('forms.payment.payNamed', { name: toName })}
            </Text>
            {handles.length === 0
              ? (
                <Text size="xs" c="dimmed">
                  {t('forms.payment.noAccountsHint', { name: toName })}
                </Text>
              )
              : handles.map((h) => (
                <Text key={h.handle_id} size="sm">{h.label}: <b>{h.details}</b></Text>
              ))}
          </div>
        )}
        <div className="wizard-field">
          <span className="wizard-label">{t('forms.payment.method')}</span>
          <div className="wizard-chips" role="radiogroup" aria-label={t('forms.payment.method')}>
            {methods.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                className={method === m.value ? 'wizard-chip is-on' : 'wizard-chip'}
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <TextInput
          label={t('forms.payment.note')}
          placeholder={t('forms.payment.notePh')}
          value={note}
          onChange={(x) => setNote(x.target.value)}
        />
        <TextInput
          label={t('forms.payment.proofRef')}
          description={t('forms.payment.proofHint')}
          placeholder={t('forms.payment.proofPh')}
          value={proofRef}
          onChange={(x) => setProofRef(x.target.value)}
        />
      </div>
      <div className="wizard-sticky-footer">
        <Err e={e} />
        <Button className="wizard-primary" fullWidth type="submit" loading={paying}>
          {t('forms.payment.record')}
        </Button>
      </div>
    </form>
  );
}
