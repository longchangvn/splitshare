// Full expense form (spec 005 task 3.2) — create, copy, scan-then-review and
// edit share one implementation so the payload is always identical to web
// Forms.jsx. Trip-pack richness included: category, spent-on, tax/tip/fee, FX,
// guest shares, only-present, staged receipts.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api, newIdempotencyKey } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, Field, Money, Segmented, Sheet, SpinButton, ErrorBanner, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { fmt, moneyFieldError } from '../lib/money';
import { errorText, fieldErrors } from '../lib/errors';
import MoneyInput from './MoneyInput';
import {
  SPLIT_TYPES, buildExpensePayload, buildExpensePatch, equalPercent,
  splitTotals, todayIso, validateExpenseForm,
} from '../lib/expensePayload';
import { defaultCategoryKey } from '../lib/categories';
import { scanToAmount, scannerMessage } from '../lib/scanMessage';
import { compressReceiptImage } from '../lib/receiptScan';
import { queueOrSend } from '../offline/queue';

const MAX_RECEIPTS = 5;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function initialValues(expense) {
  const out = {};
  for (const sp of expense?.splits || []) {
    if (expense.split_type === 'SHARES') out[sp.user_id] = String(sp.shares ?? 1);
    else if (expense.split_type === 'PERCENT') out[sp.user_id] = String(sp.percent ?? '');
    else if (expense.split_type === 'EXACT') out[sp.user_id] = ((sp.share_cents ?? 0) / 100).toString();
  }
  return out;
}

export default function ExpenseForm({
  groupId,
  group,
  members = [],
  currency = 'USD',
  categories = [],
  initial = null,
  copyFrom = null,
  onSaved,
  onCancel,
  onReload,
  enableScan = true,
}) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id || null;
  const editing = !!initial;
  const source = initial || copyFrom || null;
  const active = members.filter((m) => !m.removed);
  const activeIds = new Set(active.map((m) => m.user_id));

  const [title, setTitle] = useState(
    initial?.title ?? (copyFrom ? t('forms.expense.copyOf', { title: copyFrom.title }) : ''),
  );
  const [amount, setAmount] = useState(source ? (source.amount_cents / 100).toFixed(2) : '');
  const [payerId, setPayerId] = useState(() => {
    const p = source?.payer_id;
    if (p && activeIds.has(p)) return p;
    if (meId && activeIds.has(meId)) return meId; // web default: me, never the first member
    return active[0]?.user_id || '';
  });
  const [splitType, setSplitType] = useState(source?.split_type || 'EQUAL');
  const [selected, setSelected] = useState(() => {
    const kept = (source?.splits || []).map((s) => s.user_id).filter((id) => activeIds.has(id));
    return kept.length ? kept : active.map((m) => m.user_id);
  });
  const [values, setValues] = useState(() => initialValues(source));
  const [stashed, setStashed] = useState({});
  const [category, setCategory] = useState(() => defaultCategoryKey(categories, source?.category));
  const [spentAt, setSpentAt] = useState(() => (source?.spent_at ? String(source.spent_at).slice(0, 10) : todayIso()));
  const [tax, setTax] = useState(source?.tax_cents ? (source.tax_cents / 100).toFixed(2) : '');
  const [tip, setTip] = useState(source?.tip_cents ? (source.tip_cents / 100).toFixed(2) : '');
  const [fee, setFee] = useState(source?.fee_cents ? (source.fee_cents / 100).toFixed(2) : '');
  const [origCurrency, setOrigCurrency] = useState(source?.orig_currency || '');
  const [origAmount, setOrigAmount] = useState(source?.orig_amount_cents ? (source.orig_amount_cents / 100).toFixed(2) : '');
  const [fxRate, setFxRate] = useState(source?.fx_rate != null ? String(source.fx_rate) : '');
  const [guests, setGuests] = useState(() => (source?.guests || []).map((g) => ({
    label: g.label, amount: (g.share_cents / 100).toFixed(2), covered_by: g.covered_by,
  })));
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photoErrors, setPhotoErrors] = useState([]);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null); // un-settle names shown in the sheet
  const [fieldError, setFieldError] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [scanning, setScanning] = useState(false);
  const saveMode = useRef('close');
  const nextKey = useRef(newIdempotencyKey());

  const dropped = copyFrom
    ? (copyFrom.splits || []).map((s) => s.user_id).filter((id) => !activeIds.has(id))
    : [];

  const formState = useMemo(() => ({
    title, amount, payerId, splitType, participantIds: selected, category, spentAt,
    onlyPresent, tax, tip, fee, origCurrency, origAmount, fxRate, guests, values,
  }), [title, amount, payerId, splitType, selected, category, spentAt, onlyPresent, tax, tip, fee, origCurrency, origAmount, fxRate, guests, values]);

  const totals = splitTotals(formState);
  const converted = (() => {
    if (!origCurrency.trim() || !origAmount || !fxRate) return null;
    const cents = Math.round(Number(origAmount) * Number(fxRate) * 100);
    return Number.isFinite(cents) && cents > 0 ? cents : null;
  })();

  // Live preview (debounced): create → preview-split, edit → preview-edit.
  useEffect(() => {
    if (!amount || selected.length === 0) { setPreview(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const path = editing
          ? `/api/v1/expenses/${initial.expense_id || initial.id}/preview-edit`
          : `/api/v1/groups/${groupId}/expenses/preview-split`;
        setPreview(await api.post(path, buildExpensePayload(formState)));
      } catch { setPreview(null); /* the save shows the real error */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [formState, groupId, editing, initial]);

  const changeType = (next) => {
    setSplitType(next);
    if (next === 'EQUAL') return;
    setValues((prev) => {
      const nextValues = { ...prev };
      if (next === 'PERCENT') {
        const dist = equalPercent(selected.length);
        selected.forEach((id, i) => { if (!(id in nextValues) || nextValues[id] === '') nextValues[id] = dist[i]; });
      } else if (next === 'SHARES') {
        selected.forEach((id) => { if (!(id in nextValues) || nextValues[id] === '') nextValues[id] = '1'; });
      }
      return nextValues;
    });
  };

  const toggle = (id) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      setStashed({ ...stashed, ...(id in values ? { [id]: values[id] } : {}) });
      setValues((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } else {
      setSelected([...selected, id]);
      if (id in stashed) setValues((prev) => ({ ...prev, [id]: stashed[id] }));
      else if (splitType === 'SHARES') setValues((prev) => ({ ...prev, [id]: prev[id] ?? '1' }));
    }
  };

  const pickPhotos = async () => {
    const room = MAX_RECEIPTS - photos.length;
    if (room <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled) return;
    const accepted = [];
    const rejected = [];
    for (const asset of res.assets || []) {
      if ((asset.fileSize || 0) > MAX_RECEIPT_BYTES) {
        rejected.push(t('forms.expense.over10mb', { name: asset.fileName || 'image' }));
        continue;
      }
      try {
        accepted.push(await compressReceiptImage(ImageManipulator, asset));
      } catch { accepted.push(asset); }
    }
    setPhotos([...photos, ...accepted].slice(0, MAX_RECEIPTS));
    setPhotoErrors(rejected);
  };

  const scanOne = async () => {
    if (photos.length >= MAX_RECEIPTS) return;
    const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: false });
    if (res.canceled) return;
    const asset = (res.assets || [])[0];
    if (!asset) return;
    setScanning(true);
    setFormError(null);
    try {
      const compressed = await compressReceiptImage(ImageManipulator, asset).catch(() => asset);
      const form = new FormData();
      form.append('file', { uri: compressed.uri, name: compressed.fileName || 'receipt.jpg', type: 'image/jpeg' });
      const resp = await api.postForm(`/api/v1/groups/${groupId}/expenses/scan`, form);
      const { amount: scanned, lowConfidence } = scanToAmount(resp);
      if (scanned) setAmount(scanned);
      setPhotos((prev) => (prev.length < MAX_RECEIPTS ? [...prev, compressed] : prev));
      const msg = scannerMessage(t, { scanned, lowConfidence });
      if (msg) Alert.alert(t('forms.expense.scan'), msg);
    } catch (err) {
      setFormError(err);
    } finally {
      setScanning(false);
    }
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const created = await api.post(`/api/v1/groups/${groupId}/categories`, { name });
      setCatSheet(false);
      setNewCategory('');
      setCategory(created?.key || name.toLowerCase().replace(/\s+/g, '-'));
      onReload?.();
    } catch (err) { setFormError(err); }
  };

  const uploadStaged = async (expenseId) => {
    const failures = [];
    for (const photo of photos) {
      const form = new FormData();
      form.append('files', { uri: photo.uri, name: 'receipt.jpg', type: 'image/jpeg' });
      try {
        await api.postForm(`/api/v1/expenses/${expenseId}/images`, form);
      } catch (err) {
        failures.push(errorText(err, t));
      }
    }
    return failures;
  };

  const submit = async (mode = 'close') => {
    saveMode.current = mode;
    const { ok, errors } = validateExpenseForm(formState);
    setFieldError(errors);
    if (!ok) {
      setFormError({ status: 422, code: 'VALIDATION', message: t('m.errors.validation') });
      return;
    }
    if (editing && (preview?.unsettled_user_ids || []).length > 0 && !confirm) {
      setConfirm((preview.unsettled_user_ids || []).map((id) => {
        const name = members.find((m) => m.user_id === id)?.display_name || String(id).slice(0, 8);
        const share = preview.shares?.[id];
        return share != null ? `${name} (${fmt(share, currency)})` : name;
      }));
      return;
    }
    setConfirm(null);
    setBusy(true);
    setFormError(null);

    if (editing) {
      const expenseId = initial.expense_id || initial.id;
      try {
        const res = await api.patch(`/api/v1/expenses/${expenseId}`, buildExpensePatch(formState, initial.version));
        await uploadStaged(expenseId);
        onSaved?.(res, 'close');
      } catch (err) {
        setFieldError(fieldErrors(err));
        setFormError(err);
      } finally {
        setBusy(false);
      }
      return;
    }

    const body = buildExpensePayload(formState);
    const key = nextKey.current;
    const send = () => api.post(`/api/v1/groups/${groupId}/expenses`, body, { idempotencyKey: key });
    try {
      let created;
      try {
        created = await send();
      } catch (err) {
        if (!err.status) {
          // Offline: same Idempotency-Key on drain, so a retry cannot duplicate.
          await queueOrSend('expense', groupId, send, body, key);
          Alert.alert(t('forms.expense.saved'), t('m.state.offline'));
          onSaved?.(null, 'queued');
          return;
        }
        throw err;
      }
      const expenseId = created?.expense?.expense_id || created?.expense?.id || created?.expense_id || created?.id;
      const failures = expenseId ? await uploadStaged(expenseId) : [];
      if (failures.length) {
        Alert.alert(t('forms.expense.savedSomeFailed'), failures.join('\n'));
      }
      if (saveMode.current === 'new') {
        // Keep payer/participants/split, clear the bill itself.
        nextKey.current = newIdempotencyKey();
        setTitle('');
        setAmount('');
        setTax('');
        setTip('');
        setFee('');
        setOrigCurrency('');
        setOrigAmount('');
        setFxRate('');
        setGuests([]);
        setPhotos([]);
        setPhotoErrors([]);
        setPreview(null);
        setFieldError({});
        onSaved?.(created, 'new');
      } else {
        onSaved?.(created, 'close');
      }
    } catch (err) {
      setFieldError(fieldErrors(err));
      setFormError(err);
      if (err.code === 'INVOLVES_REMOVED_MEMBER') Alert.alert(errorText(err, t), '');
    } finally {
      setBusy(false);
    }
  };

  const errorFor = (field) => {
    const reason = fieldError[field];
    if (!reason) return null;
    if (field === 'amount') return null; // MoneyInput renders its own
    if (reason === 'date' || reason === 'future') return t('scan.err.date');
    if (reason === 'required') return t('m.field.required');
    if (reason === 'title') return t('forms.expense.title');
    if (reason === 'rate') return t('scan.err.rate');
    return reason;
  };

  return (
    <View>
      {dropped.length > 0 && (
        <View style={s.warnCard}>
          <Text style={s.warnT}>{t('forms.expense.formerExcluded')}</Text>
        </View>
      )}

      <Card>
        <Text style={uiStyles.h}>{t('forms.expense.basics')}</Text>
        <Field label={t('forms.expense.title')} error={errorFor('title')}>
          <TextInput
            style={[s.input, fieldError.title && s.inputErr]}
            value={title}
            onChangeText={setTitle}
            placeholder={t('forms.expense.titlePh')}
            maxLength={100}
          />
        </Field>
        <MoneyInput
          label={t('forms.expense.amount')}
          value={amount}
          onChangeText={setAmount}
          currency={currency}
          error={fieldError.amount}
        />
        <Field label={t('forms.expense.category')}>
          <View style={s.chips}>
            {categories.map((c) => (
              <Chip
                key={c.key}
                label={t(`forms.expense.cat.${c.key}`) === `forms.expense.cat.${c.key}` ? (c.name || c.key) : t(`forms.expense.cat.${c.key}`)}
                selected={category === c.key}
                onPress={() => setCategory(c.key)}
              />
            ))}
            <Chip label={`＋ ${t('forms.expense.addCategory')}`} onPress={() => setCatSheet(true)} />
          </View>
        </Field>
        <Field label={t('forms.expense.spentOn')} error={errorFor('spentAt')}>
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1 }, fieldError.spentAt && s.inputErr]}
              value={spentAt}
              onChangeText={setSpentAt}
              placeholder="YYYY-MM-DD"
              maxLength={10}
              autoCapitalize="none"
            />
            <Pressable style={s.quick} onPress={() => setSpentAt(todayIso())} accessibilityRole="button">
              <Text style={s.quickT}>{t('common.yes') === 'Có' ? 'Hôm nay' : 'Today'}</Text>
            </Pressable>
          </View>
        </Field>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('forms.expense.payer')}</Text>
        <View style={s.chips}>
          {active.map((m) => (
            <Chip key={m.user_id} label={m.display_name} selected={payerId === m.user_id} onPress={() => setPayerId(m.user_id)} />
          ))}
        </View>
        <Text style={[uiStyles.h, { marginTop: 12 }]}>{t('forms.expense.split')}</Text>
        <Segmented
          options={SPLIT_TYPES.map((type) => ({ value: type, label: t(`forms.expense.${type.toLowerCase()}`) }))}
          value={splitType}
          onChange={changeType}
          label={t('forms.expense.split')}
        />
        <Text style={[uiStyles.h, { marginTop: 12 }]}>{t('forms.expense.participants')} ({selected.length})</Text>
        {active.map((m) => (
          <View key={m.user_id} style={s.participantRow}>
            <Pressable
              style={s.participantToggle}
              onPress={() => toggle(m.user_id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.includes(m.user_id) }}
              accessibilityLabel={m.display_name}
            >
              <Text style={s.checkbox}>{selected.includes(m.user_id) ? '☑' : '☐'}</Text>
              <Text style={s.participantName}>{m.display_name}</Text>
            </Pressable>
            {splitType !== 'EQUAL' && selected.includes(m.user_id) && (
              <TextInput
                style={[s.smallInput, fieldError.split && s.inputErr]}
                value={values[m.user_id] ?? (splitType === 'SHARES' ? '1' : '')}
                onChangeText={(v) => setValues((prev) => ({ ...prev, [m.user_id]: v }))}
                placeholder={splitType === 'SHARES' ? '1' : splitType === 'PERCENT' ? '%' : currency}
                keyboardType="decimal-pad"
                accessibilityLabel={`${m.display_name} ${splitType}`}
              />
            )}
          </View>
        ))}
        {totals && (
          <Text style={[s.totals, !totals.ok && s.totalsBad]}>
            {totals.kind === 'exact'
              ? t('forms.expense.totalsExact', { sum: totals.sum.toFixed(2), total: totals.total.toFixed(2) })
              : totals.kind === 'percent'
                ? t('forms.expense.totalsPercent', { sum: totals.sum })
                : t('forms.expense.totalsShares', { sum: totals.sum })}
          </Text>
        )}
        <View style={s.switchRow}>
          <Text style={s.switchLabel}>{t('forms.expense.onlyPresent')}</Text>
          <Switch value={onlyPresent} onValueChange={setOnlyPresent} accessibilityLabel={t('forms.expense.onlyPresent')} />
        </View>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('forms.expense.billDetails')}</Text>
        <View style={s.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <MoneyInput label={t('forms.expense.taxOpt')} value={tax} onChangeText={setTax} optional />
          </View>
          <View style={{ flex: 1 }}>
            <MoneyInput label={t('forms.expense.tipOpt')} value={tip} onChangeText={setTip} optional />
          </View>
        </View>
        <View style={s.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <MoneyInput label={t('forms.expense.feeOpt')} value={fee} onChangeText={setFee} optional />
          </View>
          <View style={{ flex: 1 }} />
        </View>

        <Text style={[uiStyles.h, { marginTop: 12 }]}>{t('forms.expense.foreign')}</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, { flex: 1, marginRight: 8 }, fieldError.orig_amount && s.inputErr]}
            value={origCurrency}
            onChangeText={(v) => setOrigCurrency(v.toUpperCase())}
            placeholder="EUR"
            maxLength={3}
            autoCapitalize="characters"
            accessibilityLabel={t('forms.expense.foreign')}
          />
          <TextInput
            style={[s.input, { flex: 1, marginRight: 8 }]}
            value={origAmount}
            onChangeText={setOrigAmount}
            placeholder={t('forms.expense.fxAmount')}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={fxRate}
            onChangeText={setFxRate}
            placeholder={t('forms.expense.fxRate')}
            keyboardType="decimal-pad"
          />
        </View>
        {converted != null && (
          <Text style={s.approx}>{t('forms.expense.fxApprox', { amount: fmt(converted, currency) })}</Text>
        )}

        <Text style={[uiStyles.h, { marginTop: 12 }]}>{t('forms.expense.guestShares')}</Text>
        <Text style={s.hint}>{t('forms.expense.guestHint')}</Text>
        {guests.map((g, i) => (
          <View key={i} style={s.row}>
            <TextInput
              style={[s.input, { flex: 1, marginRight: 6 }]}
              value={g.label}
              onChangeText={(v) => setGuests(guests.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              placeholder={t('forms.expense.guestLabel')}
            />
            <TextInput
              style={[s.input, { width: 84, marginRight: 6 }]}
              value={g.amount}
              onChangeText={(v) => setGuests(guests.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <Pressable
              style={s.quick}
              onPress={() => setGuests(guests.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={t('common.remove')}
            >
              <Text style={s.quickT}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          style={s.addGuest}
          onPress={() => setGuests([...guests, { label: '', amount: '', covered_by: payerId || active[0]?.user_id || '' }])}
          accessibilityRole="button"
        >
          <Text style={s.addGuestT}>{t('forms.expense.addGuest')}</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('forms.expense.receiptsCount', { count: photos.length })}</Text>
        <Text style={s.hint}>{t('forms.expense.receiptsHint')}</Text>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={s.photoRow}>
            <Text style={s.photoName} numberOfLines={1}>🧾 {p.fileName || `receipt ${i + 1}`}</Text>
            <Pressable onPress={() => setPhotos(photos.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t('common.remove')}>
              <Text style={s.dangerT}>{t('common.remove')}</Text>
            </Pressable>
          </View>
        ))}
        {photoErrors.map((msg, i) => <Text key={i} style={s.photoErr}>{msg}</Text>)}
        <View style={s.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <SpinButton title={t('forms.expense.addReceipt')} variant="ghost" onPress={pickPhotos} disabled={photos.length >= MAX_RECEIPTS} />
          </View>
          {enableScan && (
            <View style={{ flex: 1 }}>
              <SpinButton title={t('forms.expense.scan')} variant="ghost" onPress={scanOne} busy={scanning} disabled={photos.length >= MAX_RECEIPTS} />
            </View>
          )}
        </View>
      </Card>

      {preview?.shares && (
        <Card style={s.previewCard}>
          <Text style={s.previewH}>{t('forms.expense.livePreview')}</Text>
          {Object.entries(preview.shares).map(([uid, cents]) => (
            <View key={uid} style={s.rowBetween}>
              <Text style={s.previewName}>{members.find((m) => m.user_id === uid)?.display_name || uid.slice(0, 8)}</Text>
              <Money cents={cents} currency={currency} size="sm" />
            </View>
          ))}
        </Card>
      )}

      <ErrorBanner error={formError} />

      <SpinButton
        title={busy ? t('profile.saving') : editing ? t('common.saveChanges') : t('forms.expense.addExpense')}
        busy={busy}
        onPress={() => submit('close')}
      />
      {!editing && (
        <SpinButton title={t('forms.expense.saveNew')} variant="ghost" busy={busy} onPress={() => submit('new')} />
      )}
      {onCancel && <SpinButton title={t('common.cancel')} variant="ghost" onPress={onCancel} />}

      <Sheet visible={catSheet} onClose={() => setCatSheet(false)} title={t('forms.expense.addCategory')}>
        <TextInput
          style={s.input}
          value={newCategory}
          onChangeText={setNewCategory}
          placeholder={t('forms.expense.addCategoryPh')}
          autoFocus
          maxLength={40}
        />
        <SpinButton title={t('common.add')} onPress={addCategory} />
      </Sheet>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={t('forms.expense.unsettle')} scroll={false}>
        <Text style={s.confirmBody}>
          {t('forms.expense.unsettleConfirm')}: {(confirm || []).join(', ')}. {t('forms.expense.unsettleContinue', { names: '' })}
        </Text>
        <SpinButton title={t('forms.expense.yesSave')} busy={busy} onPress={() => submit('close')} />
        <SpinButton title={t('common.back')} variant="ghost" onPress={() => setConfirm(null)} />
      </Sheet>
    </View>
  );
}

export function ExpenseFormScreen({ groupId, ...rest }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.screen, padding: 14 }} keyboardShouldPersistTaps="handled">
      <ExpenseForm groupId={groupId} {...rest} />
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, minHeight: 44, color: colors.text,
  },
  inputErr: { borderColor: colors.debtorText },
  smallInput: {
    width: 92, backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, textAlign: 'right', minHeight: 40,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  participantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  participantToggle: { flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 44 },
  checkbox: { fontSize: 18, marginRight: 8, color: colors.darkTealText },
  participantName: { fontSize: 13, fontWeight: '600', color: colors.text },
  totals: { fontSize: 12, color: colors.owedText, marginTop: 8, fontWeight: '700' },
  totalsBad: { color: colors.warnText },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, minHeight: 44 },
  switchLabel: { fontSize: 12, color: colors.text, flex: 1, marginRight: 10 },
  hint: { fontSize: 11, color: colors.secondary, marginTop: 4 },
  approx: { fontSize: 12, color: colors.darkTealText, marginTop: 6, fontWeight: '700' },
  addGuest: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inputBorder, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' },
  addGuestT: { fontSize: 12, fontWeight: '700', color: colors.darkTealText },
  photoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 36 },
  photoName: { fontSize: 12, color: colors.text, flex: 1, marginRight: 8 },
  photoErr: { fontSize: 11, color: colors.debtorText, marginTop: 4 },
  dangerT: { color: colors.debtorText, fontWeight: '700', fontSize: 12 },
  warnCard: { backgroundColor: colors.warnBg, borderRadius: 12, padding: 10, marginBottom: 8 },
  warnT: { color: colors.warnText, fontSize: 12, fontWeight: '700' },
  previewCard: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
  previewH: { fontSize: 12, fontWeight: '800', color: colors.primary },
  previewName: { fontSize: 12, color: colors.text },
  quick: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: '#fff', paddingHorizontal: 8 },
  quickT: { fontSize: 12, fontWeight: '700', color: colors.text },
  confirmBody: { fontSize: 13, color: colors.text, marginBottom: 6 },
});
