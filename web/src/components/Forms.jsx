import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, Group, Modal, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { categorySelectData } from '../categories.js';
import {
  SCAN_MOBILE_QUERY, compressReceiptImage, scanErrorKey, scanToAmount,
} from '../receiptScan.js';
import { displayNameOf } from './Net.jsx';
import { useT } from '../prefs.jsx';

const splitVal = (s, type) => {
  if (!s) return '';
  if (type === 'EXACT' && s.exact_cents != null) return (s.exact_cents / 100).toString();
  if (type === 'PERCENT' && s.percent != null) return s.percent.toString();
  if (type === 'SHARES' && s.shares != null) return s.shares.toString();
  return '';
};

// Shorten long filenames for the staged list (keep start + extension).
const shortName = (name) => {
  if (!name || name.length <= 28) return name || '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(0, 26 - ext.length);
  return `${base.slice(0, Math.min(18, keep))}…${base.slice(-Math.max(0, keep - 18))}${ext}`;
};

// Equal-percent distribution that sums to exactly 100.00 (mirrors server largest-remainder).
const equalPercent = (n) => {
  const base = Math.floor(10000 / n);
  const out = Array(n).fill(base);
  for (let i = 0; i < 10000 - base * n; i++) out[i] += 1;
  return out.map((c) => (c / 100).toString());
};

const MAX_MONEY_AMOUNT = 1_000_000;

/** Keep only digits + one `.`, max 2 decimal places (currency input). */
function sanitizeMoneyInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`;
    const [whole, dec = ''] = s.split('.');
    s = `${whole.slice(0, 7)}.${dec.slice(0, 2)}`;
  } else {
    s = s.slice(0, 7);
  }
  if (s.startsWith('.')) s = `0${s}`;
  return s;
}

function isValidMoneyAmount(raw) {
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_MONEY_AMOUNT;
}

function moneyAmountError(raw, t) {
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return t('forms.payment.invalidAmount');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return t('forms.payment.invalidAmount');
  if (n > MAX_MONEY_AMOUNT) return t('forms.payment.amountMax', { max: '1,000,000' });
  return null;
}

// Expense create/edit with live split preview + un-settle confirm (tasks 8.2/8.3).
// copyFrom: detail.expense payload to prefill a copy (task 4.1); images carried on save (4.2).
export function ExpenseForm({ groupId, members, existing, copyFrom, onDone, onSaveNew, onCancel, currency = '' }) {
  const t = useT();
  const meId = useAuth()?.user?.user_id;
  const source = existing ?? copyFrom ?? null;
  const isCopy = !!copyFrom && !existing;
  const activeIds = new Set(members.map((m) => m.user_id));

  const initSel = () => {
    if (existing) return existing.splits.map((s) => s.user_id);
    if (copyFrom) {
      const kept = copyFrom.splits.map((s) => s.user_id).filter((id) => activeIds.has(id));
      return kept.length > 0 ? kept : members.map((m) => m.user_id);
    }
    return members.map((m) => m.user_id);
  };
  const initValues = (type, sel) => {
    const out = {};
    if (type === 'SHARES') {
      for (const id of sel) out[id] = '1';
    }
    if (!source || !source.splits) return out;
    for (const s of source.splits) {
      if (!sel.includes(s.user_id)) continue;
      const v = splitVal(s, type);
      if (v !== '') out[s.user_id] = v;
      else if (type === 'SHARES' && !(s.user_id in out)) out[s.user_id] = '1';
    }
    return out;
  };

  const [title, setTitle] = useState(
    existing?.title ?? (copyFrom ? t('forms.expense.copyOf', { title: copyFrom.title }) : ''));
  const [amount, setAmount] = useState(
    source ? (source.amount_cents / 100).toFixed(2) : '');
  const [amountErr, setAmountErr] = useState(null);
  const [payer, setPayer] = useState(() => {
    const p = source?.payer_id;
    if (p && activeIds.has(p)) return p;
    if (meId && activeIds.has(meId)) return meId;
    return members[0]?.user_id || '';
  });
  const [type, setType] = useState(source?.split_type || 'EQUAL');
  const [sel, setSel] = useState(initSel);
  const [values, setValues] = useState(() => initValues(source?.split_type || 'EQUAL', initSel()));
  const [stashed, setStashed] = useState({}); // values of unchecked participants
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // [names] un-settle list
  const [pending, setPending] = useState(null); // PATCH body awaiting confirm
  const [saving, setSaving] = useState(false);
  // Create-only: which footer button triggered submit ('close' | 'new'); Enter key = close.
  const saveModeRef = useRef('close');
  const [savingMode, setSavingMode] = useState('close');
  const [imgErrs, setImgErrs] = useState([]);
  const [e, setE] = useState(null);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(source?.category || 'food');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalErr, setCatModalErr] = useState(null);
  const [spentAt, setSpentAt] = useState(() =>
    source?.spent_at ? String(source.spent_at).slice(0, 10) : todayStr());
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

  const dropped = copyFrom
    ? copyFrom.splits.map((s) => s.user_id).filter((id) => !activeIds.has(id))
    : [];
  // Copy expense never carries receipts: the upload section starts empty.

  const changeType = (nextType) => {
    setType(nextType);
    if (nextType === 'EQUAL') return;
    // Prefill empty boxes with equal defaults (keeps typed values).
    setValues((prev) => {
      const checked = sel.filter((id) => !(id in prev) || prev[id] === '');
      if (checked.length === 0) return prev;
      const next = { ...prev };
      if (nextType === 'PERCENT') {
        const all = sel.filter((id) => !(id in next) || next[id] === '');
        const dist = equalPercent(sel.length);
        sel.forEach((id, i) => { if (all.includes(id)) next[id] = dist[i]; });
      } else if (nextType === 'SHARES') {
        checked.forEach((id) => { next[id] = '1'; });
      }
      return next;
    });
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
        // New participant in SHARES mode defaults to 1 share (not empty/0).
        setValues((prev) => ({ ...prev, [id]: prev[id] ?? '1' }));
      }
    }
  };
  const setVal = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));

  const build = () => {
    const body = {
      title, amount: Number(amount), payer_id: payer, split_type: type, participant_ids: sel,
      category, spent_at: spentAt ? new Date(`${spentAt}T12:00:00Z`).toISOString() : null,
      only_present: onlyPresent,
    };
    if (tax !== '') body.tax = Number(tax);
    if (tip !== '') body.tip = Number(tip);
    if (fee !== '') body.fee = Number(fee);
    if (origCur.trim() !== '') {
      body.orig_currency = origCur.trim().toUpperCase();
      body.orig_amount = Number(origAmt);
      body.fx_rate = Number(fxRate);
    }
    if (guests.length > 0) {
      body.guests = guests.map((g) => ({
        label: g.label, amount_cents: Math.round(Number(g.amount || 0) * 100), covered_by: g.covered_by,
      }));
    }
    if (type === 'EXACT') {
      body.exact = sel.map((id) => ({ user_id: id, amount_cents: Math.round(Number(values[id] || 0) * 100) }));
    }
    if (type === 'PERCENT') {
      body.percent = sel.map((id) => ({ user_id: id, percent: Number(values[id] || 0) }));
    }
    if (type === 'SHARES') {
      // Empty box means 1 share (avoids 0 -> 422 dead-end).
      body.shares = sel.map((id) => ({
        user_id: id,
        shares: values[id] === '' || values[id] == null ? 1 : Math.max(1, Math.round(Number(values[id] || 1))),
      }));
    }
    return body;
  };

  // Local running totals (server 422 stays authoritative).
  const totals = (() => {
    if (type === 'EQUAL' || sel.length === 0) return null;
    const nums = sel.map((id) => Number(values[id] || 0));
    if (nums.some((n) => Number.isNaN(n))) return null;
    if (type === 'EXACT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        text: t('forms.expense.totalsExact', { sum: sum.toFixed(2), total: Number(amount || 0).toFixed(2) }),
        ok: Math.abs(sum - Number(amount || 0)) < 0.005,
      };
    }
    if (type === 'PERCENT') {
      const sum = nums.reduce((a, b) => a + b, 0);
      return { text: t('forms.expense.totalsPercent', { sum }), ok: Math.abs(sum - 100) < 1e-9 };
    }
    return { text: t('forms.expense.totalsShares', { sum: nums.reduce((a, b) => a + b, 0) }), ok: true };
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.get(`/api/v1/groups/${groupId}/categories`);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setCategories(list);
        setCategory((prev) => {
          if (list.some((c) => c.key === prev)) return prev;
          if (source?.category && list.some((c) => c.key === source.category)) return source.category;
          return list.find((c) => c.key === 'food')?.key
            || list.find((c) => c.key === 'other')?.key
            || list[0]?.key
            || prev;
        });
      } catch (err) {
        if (!cancelled) setE(err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const openAddCategory = () => {
    setNewCatName('');
    setCatModalErr(null);
    setCatModalOpen(true);
  };

  const addCategoryFromModal = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setAddingCat(true);
    setCatModalErr(null);
    try {
      const created = await api.post(`/api/v1/groups/${groupId}/categories`, { name });
      setCategories((prev) => [...prev, created]);
      setCategory(created.key);
      setNewCatName('');
      setCatModalOpen(false);
      notifications.show({ message: t('groupDetail.categoryAdded'), color: 'teal' });
    } catch (err) {
      setCatModalErr(err);
    } finally {
      setAddingCat(false);
    }
  };

  useEffect(() => {
    if (!amount || sel.length === 0) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      try {
        const b = build();
        const url = existing
          ? `/api/v1/expenses/${existing.expense_id}/preview-edit`
          : `/api/v1/groups/${groupId}/expenses/preview-split`;
        setPreview(await api.post(url, b));
        setE(null);
      } catch (err) { setPreview(null); setE(err); }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, type, payer, category, spentAt, tax, tip, fee, origCur, origAmt, fxRate,
    JSON.stringify(guests), onlyPresent, sel.join(','), Object.values(values).join('|')]);

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

  const onAmountChange = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmount(next);
    setAmountErr(moneyAmountError(next, t));
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
      const { amount: scanned, lowConfidence, warnings } = scanToAmount(resp);
      if (scanned) {
        onAmountChange(scanned);
        setStaged((prev) => (prev.length < maxStaged ? [...prev, img] : prev));
        notifications.show({
          title: t('forms.expense.scanDone', { amount: fmt(Math.round(Number(scanned) * 100), currency) }),
          message: lowConfidence ? t('forms.expense.scanLowConfidence') : t('forms.expense.scanCheck'),
          color: lowConfidence ? 'orange' : 'teal',
        });
      } else {
        notifications.show({
          message: warnings.includes('not_a_receipt') ? t('forms.expense.scanNotReceipt') : t('forms.expense.scanNoTotal'),
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
    const amtErr = moneyAmountError(amount, t) || (!amount ? t('forms.payment.invalidAmount') : null);
    if (amtErr || !isValidMoneyAmount(amount)) {
      setAmountErr(amtErr || t('forms.payment.invalidAmount'));
      return;
    }
    setE(null);
    setImgErrs([]);
    setSavingMode(mode);
    setSaving(true);
    try {
      if (!existing) {
        const r = await api.post(`/api/v1/groups/${groupId}/expenses`, build());
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
          { expected_version: existing.version, ...build() });
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

  const boxLabel = type === 'EXACT'
    ? t('forms.expense.exactBox')
    : type === 'PERCENT'
      ? t('forms.expense.percentBox')
      : t('forms.expense.sharesBox');

  // Receipt strip: staged (create) or existing images (edit).
  const receiptCount = existing
    ? (source?.images?.length || 0)
    : staged.length;

  // EQUAL explainer: floor + remainder 1¢, who gets +1¢.
  const equalNote = (() => {
    if (type !== 'EQUAL' || !preview?.shares) return null;
    const entries = Object.entries(preview.shares);
    if (entries.length === 0) return null;
    const vals = entries.map(([, v]) => v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const base = fmt(lo, currency);
    if (hi === lo) {
      return t('forms.expense.equalNoteOk', { base, count: entries.length });
    }
    const lucky = entries.filter(([, v]) => v === hi).map(([id]) => displayNameOf(members, id)).join(', ');
    return t('forms.expense.equalNoteLucky', { base, count: entries.length, lucky });
  })();

  const splitTypes = [
    { value: 'EQUAL', label: t('forms.expense.equal') },
    { value: 'EXACT', label: t('forms.expense.exact') },
    { value: 'PERCENT', label: t('forms.expense.percent') },
    { value: 'SHARES', label: t('forms.expense.shares') },
  ];
  const catData = categorySelectData(categories, t);
  const multiSave = !existing && !!onSaveNew;
  const saveActionLabel = multiSave
    ? t('common.save')
    : isCopy ? t('forms.expense.saveCopy') : t('forms.expense.addExpense');

  return (
    <>
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

        <TextInput
          label={t('forms.expense.title')}
          required
          placeholder={t('forms.expense.titlePh')}
          value={title}
          onChange={(x) => setTitle(x.target.value)}
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
        <div className="wizard-field">
          <span className="wizard-label">{t('forms.expense.category')}</span>
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <Select
              style={{ flex: 1 }}
              value={category || null}
              onChange={(v) => setCategory(v || '')}
              data={catData}
              searchable
              comboboxProps={{ withinPortal: true }}
              aria-label={t('forms.expense.category')}
            />
            <Button
              type="button"
              variant="light"
              color="teal"
              className="wizard-cat-add"
              onClick={openAddCategory}
            >
              {t('forms.expense.addCategoryBtn')}
            </Button>
          </Group>
        </div>
        <TextInput
          label={t('forms.expense.spentOn')}
          type="date"
          value={spentAt}
          onChange={(x) => setSpentAt(x.target.value)}
        />
        <Select
          label={t('forms.expense.payer')}
          value={payer || null}
          onChange={(v) => setPayer(v || '')}
          data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
          comboboxProps={{ withinPortal: true }}
        />

        <details className="wizard-optional">
          <summary>{t('forms.expense.billDetails')}</summary>
          <div className="wizard-optional-body">
            <Group gap="xs" grow>
              <TextInput label={t('forms.expense.taxOpt')} inputMode="decimal" placeholder="0.00" value={tax} onChange={(x) => setTax(x.target.value)} />
              <TextInput label={t('forms.expense.tipOpt')} inputMode="decimal" placeholder="0.00" value={tip} onChange={(x) => setTip(x.target.value)} />
              <TextInput label={t('forms.expense.feeOpt')} inputMode="decimal" placeholder="0.00" value={fee} onChange={(x) => setFee(x.target.value)} />
            </Group>
            <div className="wizard-field">
              <span className="wizard-label">{t('forms.expense.foreign')}</span>
              <Group gap="xs" grow>
                <TextInput placeholder="JPY" value={origCur} onChange={(x) => setOrigCur(x.target.value)} />
                <TextInput placeholder={t('forms.expense.fxAmount')} inputMode="decimal" value={origAmt} onChange={(x) => setOrigAmt(x.target.value)} />
                <TextInput placeholder={t('forms.expense.fxRate')} inputMode="decimal" value={fxRate} onChange={(x) => setFxRate(x.target.value)} />
              </Group>
              {origCur.trim() !== '' && origAmt !== '' && fxRate !== '' && !Number.isNaN(Number(origAmt) * Number(fxRate)) && (
                <Text size="xs" c="dimmed" mt={6}>
                  {t('forms.expense.fxApprox', { amount: (Number(origAmt) * Number(fxRate)).toFixed(2) })}
                </Text>
              )}
            </div>
            <div className="wizard-field">
              <Group justify="space-between" mb={6}>
                <span className="wizard-label" style={{ marginBottom: 0 }}>{t('forms.expense.guestShares')}</span>
                <button
                  type="button"
                  className="wizard-chip"
                  onClick={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || payer }])}
                >
                  {t('forms.expense.addGuest')}
                </button>
              </Group>
              {guests.map((g, i) => (
                <Group key={i} gap="xs" mb={6} wrap="nowrap">
                  <TextInput
                    placeholder={t('forms.expense.guestLabel')}
                    value={g.label}
                    style={{ flex: 2 }}
                    onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: x.target.value } : gg)))}
                  />
                  <TextInput
                    placeholder="$"
                    inputMode="decimal"
                    value={g.amount}
                    style={{ flex: 1 }}
                    onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: x.target.value } : gg)))}
                  />
                  <Select
                    value={g.covered_by}
                    style={{ flex: 2 }}
                    onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
                    data={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
                    comboboxProps={{ withinPortal: true }}
                  />
                  <Button size="xs" variant="subtle" color="red" onClick={() => setGuests(guests.filter((_, j) => j !== i))}>X</Button>
                </Group>
              ))}
              {guests.length === 0 && (
                <Text size="xs" c="dimmed">{t('forms.expense.guestHint')}</Text>
              )}
            </div>
            <Checkbox
              checked={onlyPresent}
              onChange={(x) => setOnlyPresent(x.currentTarget.checked)}
              label={t('forms.expense.onlyPresent')}
            />
          </div>
        </details>

        <div className="wizard-field">
          <span className="wizard-label">{t('forms.expense.method')}</span>
          <div className="wizard-chips" role="radiogroup" aria-label={t('forms.expense.method')}>
            {splitTypes.map((st) => (
              <button
                key={st.value}
                type="button"
                role="radio"
                className={type === st.value ? 'wizard-chip is-on' : 'wizard-chip'}
                aria-checked={type === st.value}
                onClick={() => changeType(st.value)}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
        {equalNote && (
          <Text size="xs" c="dimmed">{equalNote}</Text>
        )}
        <div className="wizard-field">
          <span className="wizard-label">{t('forms.expense.participants')}</span>
          <Stack gap={8}>
            {members.map((m) => (
              <div key={m.user_id} className="wizard-person">
                <Checkbox
                  checked={sel.includes(m.user_id)}
                  onChange={() => toggle(m.user_id)}
                  label={m.display_name}
                />
                {type !== 'EQUAL' && sel.includes(m.user_id) && (
                  <TextInput
                    className="split-value"
                    aria-label={`${boxLabel} for ${m.display_name}`}
                    placeholder={type === 'SHARES' ? '1' : boxLabel}
                    inputMode={type === 'SHARES' ? 'numeric' : 'decimal'}
                    min={type === 'SHARES' ? 1 : undefined}
                    value={values[m.user_id] ?? (type === 'SHARES' ? '1' : '')}
                    onChange={(x) => setVal(m.user_id, x.target.value)}
                    style={{ width: 110 }}
                  />
                )}
              </div>
            ))}
          </Stack>
        </div>
        {type !== 'EQUAL' && totals && (
          <Text size="sm" c={totals.ok ? 'teal' : 'orange'}>{totals.text}</Text>
        )}
        {preview && (
          <div className="wizard-person wizard-pay-hint">
            <Text size="sm" fw={600}>{t('forms.expense.livePreview')}</Text>
            <Text size="sm">
              {Object.entries(preview.shares || {}).map(([id, v]) => (
                `${displayNameOf(members, id)} ${fmt(v, currency)}`
              )).join(' · ')}
            </Text>
            {preview.unsettled_user_ids?.length > 0 && (
              <Text size="sm" fw={600} c="orange">
                {t('forms.expense.unsettle', { count: preview.unsettled_user_ids.length })}
              </Text>
            )}
          </div>
        )}
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
      <Err e={e} />
    </form>

    <Modal
      opened={catModalOpen}
      onClose={() => { if (!addingCat) setCatModalOpen(false); }}
      title={t('forms.expense.addCategory')}
      centered
      size="sm"
      radius="lg"
      overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
      zIndex={400}
    >
      <Stack gap="sm">
        <TextInput
          label={t('groupDetail.categoryName')}
          placeholder={t('forms.expense.addCategoryPh')}
          value={newCatName}
          data-autofocus
          autoFocus
          onChange={(x) => setNewCatName(x.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              addCategoryFromModal();
            }
          }}
        />
        <Err e={catModalErr} />
        <Group justify="flex-end" gap="xs">
          <Button
            variant="default"
            disabled={addingCat}
            onClick={() => setCatModalOpen(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="teal"
            loading={addingCat}
            disabled={!newCatName.trim()}
            onClick={addCategoryFromModal}
          >
            {t('forms.expense.addCategoryBtn')}
          </Button>
        </Group>
      </Stack>
    </Modal>
    </>
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
      <Button className="wizard-primary" fullWidth type="submit" loading={paying}>
        {t('forms.payment.record')}
      </Button>
      <Err e={e} />
    </form>
  );
}
