// Recurring tab — web RecurringForm + RecurringRuleList: add rule (EQUAL across all members),
// pause/resume, delete (confirm).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api, fmt } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { sanitizeMoneyInput, isValidMoneyAmount, moneyAmountError } from '../../money';
import { Card, Input, Field, SelectField, Segmented, Button, Row, ErrText, ConfirmSheet, toast } from '../../ui';
import { ListRow, TextAction, useDateFmt, p as parts } from './parts';

export default function RecurringTab({ groupId, members, currency, rules, canWrite, onChanged }) {
  const t = useT();
  const d = useDateFmt();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [amountErr, setAmountErr] = useState(null);
  const [payer, setPayer] = useState(members[0]?.user_id || '');
  const [freq, setFreq] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);
  const [del, setDel] = useState(null);
  const [e, setE] = useState(null);

  useEffect(() => {
    if (!payer && members[0]?.user_id) setPayer(members[0].user_id);
  }, [members, payer]);

  const add = async () => {
    const err = moneyAmountError(amount, t) || (!amount ? t('forms.payment.invalidAmount') : null);
    if (err || !isValidMoneyAmount(amount)) { setAmountErr(err || t('forms.payment.invalidAmount')); return; }
    if (!title.trim()) { setE({ message: t('m.group.titleRequired') }); return; }
    setBusy(true); setE(null);
    try {
      await api.post(`/api/v1/groups/${groupId}/recurring`, {
        title: title.trim(), amount: Number(amount), split_type: 'EQUAL', payer_id: payer,
        participant_ids: members.map((m) => m.user_id), frequency: freq,
      });
      setTitle(''); setAmount(''); setAmountErr(null);
      toast({ message: t('m.group.ruleAdded'), color: 'teal' });
      onChanged();
    } catch (err) { setE(err); } finally { setBusy(false); }
  };

  const toggle = async (r) => {
    setRowBusy(r.rule_id); setE(null);
    try { await api.patch(`/api/v1/groups/${groupId}/recurring/${r.rule_id}`, { active: !r.active }); onChanged(); }
    catch (err) { setE(err); } finally { setRowBusy(null); }
  };

  const freqLabel = (f) => (f === 'weekly' ? t('groupDetail.weekly') : f === 'monthly' ? t('groupDetail.monthly') : f);

  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={type.h2}>{t('groupDetail.recurringBills')}</Text>
        <TextAction label={t('common.refresh')} onPress={onChanged} />
      </Row>
      {canWrite ? (
        <Card>
          <Field label={t('groupDetail.recurringTitle')} style={{ marginTop: 0 }}>
            <Input value={title} onChangeText={setTitle} placeholder={t('groupDetail.rentPh')} maxLength={120} />
          </Field>
          <Field label={t('groupDetail.recurringAmount')} error={amountErr}>
            <Input
              value={amount}
              onChangeText={(v) => { const n = sanitizeMoneyInput(v); setAmount(n); setAmountErr(moneyAmountError(n, t)); }}
              keyboardType="decimal-pad"
              placeholder="0.00"
              error={!!amountErr}
            />
          </Field>
          <SelectField
            label={t('groupDetail.recurringPayer')}
            value={payer}
            onChange={setPayer}
            options={members.map((m) => ({ value: m.user_id, label: m.display_name }))}
          />
          <Field label={t('groupDetail.every')}>
            <Segmented value={freq} onChange={setFreq} options={[{ value: 'weekly', label: t('groupDetail.weekly') }, { value: 'monthly', label: t('groupDetail.monthly') }]} />
          </Field>
          <Text style={[type.small, { marginTop: 8 }]}>{t('m.group.recurringHint')}</Text>
          <ErrText e={e} />
          <Button style={{ marginTop: 10 }} title={t('common.add')} busy={busy} onPress={add} />
        </Card>
      ) : <ErrText e={e} />}
      <Card style={{ paddingVertical: 4 }}>
        {rules.length === 0 ? (
          <Text style={[type.small, { paddingVertical: 16, textAlign: 'center' }]}>{t('groupDetail.noRecurring')}</Text>
        ) : rules.map((r, i) => (
          <ListRow key={r.rule_id} last={i === rules.length - 1}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Row gap={6}>
                <Text style={[type.h3, { flexShrink: 1 }]} numberOfLines={1}>{r.title}</Text>
                <Text style={s.freq}>{freqLabel(r.frequency)}</Text>
              </Row>
              <Text style={parts.meta}>{t('m.group.nextRun', { date: d.date(r.next_run_at) })}</Text>
              {canWrite ? (
                <Row gap={14}>
                  <TextAction label={r.active ? t('groupDetail.pause') : t('groupDetail.resume')} disabled={rowBusy === r.rule_id} onPress={() => toggle(r)} />
                  <TextAction danger label={t('common.delete')} disabled={rowBusy === r.rule_id} onPress={() => setDel(r)} />
                </Row>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={parts.amount}>{fmt(r.amount_cents, currency)}</Text>
              <Text style={[s.st, r.active ? s.on : s.off]}>{r.active ? t('m.group.ruleActive') : t('m.group.rulePaused')}</Text>
            </View>
          </ListRow>
        ))}
      </Card>
      <ConfirmSheet
        visible={!!del}
        title={t('m.group.deleteRuleTitle')}
        message={del ? t('groupDetail.categoryDeleteBody', { name: del.title }) : ''}
        confirmLabel={t('common.delete')}
        danger
        busy={rowBusy === del?.rule_id}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const r = del;
          setRowBusy(r.rule_id); setE(null);
          try { await api.del(`/api/v1/groups/${groupId}/recurring/${r.rule_id}`); onChanged(); }
          catch (err) { setE(err); } finally { setRowBusy(null); setDel(null); }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  freq: { fontSize: 11, fontWeight: '700', color: colors.secondary, backgroundColor: colors.chipBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  st: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  on: { backgroundColor: '#e8f7ef', color: '#0c7a4b' },
  off: { backgroundColor: '#f1f5f9', color: '#64748b' },
});
