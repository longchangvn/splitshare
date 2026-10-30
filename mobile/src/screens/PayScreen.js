// Record payment — web parity with components/Forms.jsx PaymentForm.
// POST /groups/:id/payments with Idempotency-Key; 422 OVERPAYMENT shows the server's max;
// offline → queued with the SAME key (offline/queue.js) and auto-synced later.
// paymentId param → reverse (owner/treasurer, within 24h; otherwise record a counter-payment).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Share, StyleSheet } from 'react-native';
import { api, newIdempotencyKey, fmt } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type, radius } from '../theme';
import { sanitizeMoneyInput, isValidMoneyAmount, moneyAmountError } from '../money';
import { Screen, Card, Field, Input, SelectField, ChipRow, Button, ErrText, ConfirmSheet, toast } from '../ui';
import { queueOrSend } from '../offline/queue';

const NOTE_MAX = 280;

export default function PayScreen({ route, navigation }) {
  const { id, to, from, amount, paymentId } = route.params || {};
  const t = useT();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [fromId, setFromId] = useState(from || '');
  const [toId, setToId] = useState(to || '');
  const [amt, setAmt] = useState(amount != null ? (Number(amount) / 100).toFixed(2) : '');
  const [amtErr, setAmtErr] = useState(null);
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [proofRef, setProofRef] = useState('');
  const [handles, setHandles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const [revOpen, setRevOpen] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const g = await api.get(`/api/v1/groups/${id}`);
        if (!live) return;
        const m = (g.group?.members || g.members || []).filter((x) => !x.removed);
        setMembers(m);
        setCurrency(g.group?.currency || g.currency || 'USD');
        if (!from) {
          const mine = m.find((x) => x.user_id === user?.user_id);
          setFromId((cur) => cur || mine?.user_id || m[0]?.user_id || '');
        }
      } catch (err) { if (live) setE(err); }
    })();
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Receiver's payment handles (web "settle sheet" hint).
  useEffect(() => {
    if (!toId) { setHandles([]); return undefined; }
    let live = true;
    api.get(`/api/v1/users/${toId}/handles`)
      .then((h) => { if (live) setHandles(Array.isArray(h) ? h : []); })
      .catch(() => { if (live) setHandles([]); });
    return () => { live = false; };
  }, [toId]);

  // Preset ids that are no longer members still show (web "former member").
  const options = useMemo(() => {
    const out = members.map((m) => ({ value: m.user_id, label: m.display_name || m.username }));
    for (const uid of [from, to]) {
      if (uid && !out.some((o) => o.value === uid)) out.push({ value: uid, label: t('forms.payment.formerMember', { id: String(uid).slice(0, 8) }) });
    }
    return out;
  }, [members, from, to, t]);
  const toName = options.find((o) => o.value === toId)?.label;

  const onAmount = (raw) => {
    const next = sanitizeMoneyInput(raw);
    setAmt(next);
    setAmtErr(moneyAmountError(next, t));
  };

  const record = async () => {
    if (busy) return;
    const err = moneyAmountError(amt, t) || (!amt ? t('forms.payment.invalidAmount') : null);
    if (err || !isValidMoneyAmount(amt)) { setAmtErr(err || t('forms.payment.invalidAmount')); return; }
    if (!fromId || !toId) { setE({ message: t('m.group.pickBoth') }); return; }
    if (fromId === toId) { setE({ message: t('m.group.samePerson') }); return; }
    setAmtErr(null); setE(null); setBusy(true);
    const body = {
      from_user_id: fromId, to_user_id: toId, amount: Number(amt), method,
      note: note.trim() || null, proof_ref: proofRef.trim() || null,
    };
    // One key per submission (busy guard blocks double taps); the offline queue reuses it on retry.
    const key = newIdempotencyKey();
    try {
      const send = () => api.post(`/api/v1/groups/${id}/payments`, body, { idempotencyKey: key });
      let res;
      try {
        res = await send();
      } catch (err2) {
        if (!err2.status) {
          const q = await queueOrSend('payment', id, send, body, key);
          if (q?.queued) {
            toast({ title: t('m.group.payQueuedTitle'), message: t('m.group.payQueued'), color: 'orange' });
          } else {
            toast({ title: q?.fully_settled ? t('groupDetail.fullySettled') : t('groupDetail.paymentRecorded'), color: 'teal' });
          }
          navigation.goBack();
          return;
        }
        throw err2;
      }
      toast({ title: res?.fully_settled ? t('groupDetail.fullySettled') : t('groupDetail.paymentRecorded'), color: 'teal' });
      navigation.goBack();
    } catch (err) {
      if (err.code === 'OVERPAYMENT') {
        setAmtErr(err.message || t('m.group.overpayTitle'));
        toast({ title: t('m.group.overpayTitle'), message: err.message, color: 'red' });
      } else {
        setE(err);
      }
    } finally { setBusy(false); }
  };

  const reverse = async () => {
    setBusy(true);
    try {
      await api.post(`/api/v1/payments/${paymentId}/reverse`, {});
      toast({ title: t('groupDetail.paymentReversed'), color: 'teal' });
      setRevOpen(false);
      navigation.goBack();
    } catch (err) { setRevOpen(false); setE(err); }
    finally { setBusy(false); }
  };

  const cents = isValidMoneyAmount(amt) ? Math.round(Number(amt) * 100) : 0;
  const methods = [
    { value: 'cash', label: t('forms.payment.cash') },
    { value: 'transfer', label: t('forms.payment.bank') },
    { value: 'other', label: t('forms.payment.other') },
  ];

  return (
    <Screen
      footer={(
        <View style={{ gap: 8 }}>
          <ErrText e={e} />
          <Button title={t('forms.payment.record')} busy={busy} onPress={record} />
          {paymentId ? <Button variant="ghost" title={t('groupDetail.reverse')} disabled={busy} onPress={() => setRevOpen(true)} /> : null}
        </View>
      )}
    >
      <Card style={{ alignItems: 'center' }}>
        <Text style={type.kicker}>{toName ? t('forms.payment.payNamed', { name: toName }) : t('groupDetail.recordPayment')}</Text>
        <Text style={s.big}>{fmt(cents, currency)}</Text>
      </Card>

      <Card>
        <SelectField label={t('forms.payment.from')} value={fromId} onChange={setFromId} options={options} placeholder={t('m.group.selectMember')} />
        <SelectField label={t('forms.payment.to')} value={toId} onChange={setToId} options={options} placeholder={t('m.group.selectMember')} />
        <Field label={t('forms.expense.amount')} error={amtErr}>
          <Input
            value={amt}
            onChangeText={onAmount}
            onBlur={() => { if (amt) setAmtErr(moneyAmountError(amt, t)); }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            error={!!amtErr}
            accessibilityLabel={t('forms.expense.amount')}
          />
        </Field>

        {toId ? (
          <View style={s.hint}>
            <Text style={type.h3}>
              {isValidMoneyAmount(amt) ? t('forms.payment.payNamedAmount', { name: toName, amount: fmt(cents, currency) }) : t('forms.payment.payNamed', { name: toName })}
            </Text>
            {handles.length === 0 ? (
              <Text style={[type.small, { marginTop: 4 }]}>{t('forms.payment.noAccountsHint', { name: toName })}</Text>
            ) : handles.map((h) => (
              <Pressable
                key={h.handle_id || `${h.label}-${h.details}`}
                style={({ pressed }) => [s.handle, pressed && { opacity: 0.7 }]}
                onPress={() => Share.share({ message: String(h.details || '') }).catch(() => {})}
                accessibilityRole="button"
                accessibilityHint={t('m.group.handleHint')}
              >
                <Text style={type.small}>{h.label}</Text>
                <Text style={[type.h3, { marginTop: 2 }]} selectable>{h.details}</Text>
              </Pressable>
            ))}
            {handles.length > 0 ? <Text style={[type.small, { marginTop: 6 }]}>{t('m.group.handleHint')}</Text> : null}
          </View>
        ) : null}

        <Field label={t('forms.payment.method')}>
          <ChipRow options={methods} value={method} onChange={setMethod} />
        </Field>
        <Field label={t('forms.payment.note')} hint={`${note.length}/${NOTE_MAX}`}>
          <Input value={note} onChangeText={setNote} placeholder={t('forms.payment.notePh')} maxLength={NOTE_MAX} />
        </Field>
        <Field label={t('forms.payment.proofRef')} hint={t('forms.payment.proofHint')}>
          <Input value={proofRef} onChangeText={setProofRef} placeholder={t('forms.payment.proofPh')} autoCapitalize="none" maxLength={120} />
        </Field>
      </Card>

      {paymentId ? <Text style={[type.small, { textAlign: 'center' }]}>{t('m.group.reverseHint')}</Text> : null}

      <ConfirmSheet
        visible={revOpen}
        title={t('m.group.reverseTitle')}
        message={t('m.group.reverseHint')}
        confirmLabel={t('groupDetail.reverse')}
        danger
        busy={busy}
        onClose={() => !busy && setRevOpen(false)}
        onConfirm={reverse}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 34, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.5 },
  hint: { marginTop: 14, padding: 12, borderRadius: radius.tile, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  handle: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe' },
});
