// Payment form (spec 005 task 3.6) — web PaymentForm parity: from/to, the
// receiver's payment handles, amount validation, method, note, proof ref,
// fully-settled feedback, offline queue with the same Idempotency-Key.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, newIdempotencyKey } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, ErrorBanner, Money, Segmented, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { moneyFieldError, fmt } from '../lib/money';
import { errorText, MONEY_FIELD_KEYS } from '../lib/errors';
import { queueOrSend } from '../offline/queue';
import MoneyInput from './MoneyInput';

const METHODS = [
  { value: 'cash', key: 'forms.payment.cash' },
  { value: 'transfer', key: 'forms.payment.bank' },
  { value: 'other', key: 'forms.payment.other' },
];

export default function PaymentForm({ group, onSaved, onCancel, initial, maxCents }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const members = (group?.members || []).filter((m) => !m.removed);
  const currency = group?.currency || 'USD';

  const [fromId, setFromId] = useState(initial?.from || (members.some((m) => m.user_id === meId) ? meId : members[0]?.user_id || ''));
  const [toId, setToId] = useState(initial?.to || '');
  const [amount, setAmount] = useState(initial?.amount ? (initial.amount / 100).toFixed(2) : '');
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [proofRef, setProofRef] = useState('');
  const [handles, setHandles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!toId) { setHandles([]); return () => { cancelled = true; }; }
    (async () => {
      try {
        const rows = await api.get(`/api/v1/users/${toId}/handles`);
        if (!cancelled) setHandles(Array.isArray(rows) ? rows : []);
      } catch { if (!cancelled) setHandles([]); }
    })();
    return () => { cancelled = true; };
  }, [toId]);

  const maxLabel = useMemo(() => (maxCents ? fmt(maxCents, currency) : null), [maxCents, currency]);

  const submit = async () => {
    const reason = moneyFieldError(amount);
    if (reason) { setFieldError(reason); return; }
    if (!fromId || !toId || fromId === toId) {
      setError({ status: 422, code: 'VALIDATION', message: t('forms.payment.invalidAmount') });
      return;
    }
    const cents = Math.round(Number(amount) * 100);
    if (maxCents && cents > maxCents) {
      setError({ status: 422, code: 'OVERPAYMENT', message: t('forms.payment.amountMax', { max: maxLabel }) });
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    const body = {
      from_user_id: fromId,
      to_user_id: toId,
      amount: Number(amount),
      method,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(proofRef.trim() ? { proof_ref: proofRef.trim() } : {}),
    };
    const key = newIdempotencyKey();
    const send = () => api.post(`/api/v1/groups/${group.group_id}/payments`, body, { idempotencyKey: key });
    try {
      let res;
      try {
        res = await send();
      } catch (err) {
        if (!err.status) {
          await queueOrSend('payment', group.group_id, send, body, key);
          Alert.alert(t('groupDetail.paymentRecorded'), t('m.state.offline'));
          onSaved?.(null, 'queued');
          return;
        }
        throw err;
      }
      const settled = res?.fully_settled;
      onSaved?.(res, settled ? 'settled' : 'open');
    } catch (err) {
      setError(err);
      if (err.code === 'OVERPAYMENT') setFieldError('max');
    } finally { setBusy(false); }
  };

  return (
    <View>
      <Card>
        <Text style={uiStyles.h}>{t('forms.payment.transfer')}</Text>
        {initial?.toName && <Text style={uiStyles.muted}>{t('forms.payment.payNamed', { name: initial.toName })}</Text>}

        <Text style={s.label}>{t('forms.payment.from')}</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Chip key={m.user_id} label={m.display_name} selected={fromId === m.user_id} onPress={() => setFromId(m.user_id)} />
          ))}
        </View>

        <Text style={s.label}>{t('forms.payment.to')}</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Chip
              key={m.user_id}
              label={m.display_name}
              selected={toId === m.user_id}
              onPress={() => setToId(m.user_id)}
              accessibilityLabel={t('forms.payment.payNamed', { name: m.display_name })}
            />
          ))}
        </View>

        <MoneyInput
          label={t('forms.expense.amount')}
          value={amount}
          onChangeText={setAmount}
          currency={currency}
          error={fieldError}
          autoFocus={!initial?.amount}
        />
        {fieldError && (
          <Text style={s.errLine}>
            {fieldError === 'max'
              ? t('forms.payment.amountMax', { max: maxLabel || fmt(0, currency) })
              : t(MONEY_FIELD_KEYS[fieldError] || 'm.field.amountFormat')}
          </Text>
        )}
        {!!maxCents && <Text style={s.hint}>{t('forms.payment.amountMax', { max: maxLabel })}</Text>}

        <Text style={s.label}>{t('forms.payment.method')}</Text>
        <Segmented options={METHODS.map((m) => ({ value: m.value, label: t(m.key) }))} value={method} onChange={setMethod} />

        <Text style={s.label}>{t('forms.payment.note')}</Text>
        <TextInput style={s.input} value={note} onChangeText={setNote} placeholder={t('forms.payment.notePh')} maxLength={280} />
        <Text style={s.label}>{t('forms.payment.proofRef')}</Text>
        <TextInput style={s.input} value={proofRef} onChangeText={setProofRef} placeholder={t('forms.payment.proofPh')} maxLength={64} autoCapitalize="characters" />

        {handles.length > 0 && (
          <View style={s.handles}>
            <Text style={s.label}>{t('forms.payment.details')}</Text>
            {handles.map((h) => (
              <Text key={`${h.label}-${h.details}`} style={s.handle}>{h.label}: {h.details}</Text>
            ))}
          </View>
        )}
        {handles.length === 0 && toId && (
          <Text style={s.hint}>{t('forms.payment.noAccountsHint', { name: members.find((m) => m.user_id === toId)?.display_name || '' })}</Text>
        )}

        <ErrorBanner error={error} />
        <SpinButton title={busy ? t('profile.saving') : t('forms.payment.record')} busy={busy} onPress={submit} />
        {onCancel && <SpinButton title={t('common.cancel')} variant="ghost" onPress={onCancel} />}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 6, minHeight: 44, fontSize: 14,
  },
  hint: { fontSize: 11, color: colors.secondary, marginTop: 6 },
  errLine: { fontSize: 11, color: colors.debtorText, fontWeight: '700', marginTop: 4 },
  handles: { marginTop: 10, backgroundColor: colors.paleTealBg, borderRadius: 12, padding: 10 },
  handle: { fontSize: 12, color: colors.darkTealText, fontWeight: '700', marginTop: 4 },
});
