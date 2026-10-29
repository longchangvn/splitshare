// Recurring bills (spec 005 task 4.4) — owner/treasurer only, EQUAL split like
// the web panel. Create, pause/resume, delete.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, ErrorBanner, Money, PressableRow, Segmented, SkeletonCard, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { moneyFieldError } from '../lib/money';
import MoneyInput from '../components/MoneyInput';

export default function Recurring({ route }) {
  const { id } = route.params || {};
  const t = useT();
  const [group, setGroup] = useState(null);
  const [rules, setRules] = useState(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [g, rows] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/recurring`).catch(() => []),
      ]);
      const detail = g.group || g;
      setGroup(detail);
      setRules(Array.isArray(rows) ? rows : []);
      const me = (detail.members || []).find((m) => m.user_id === detail.members?.[0]?.user_id);
      if (!payerId && me) setPayerId(me.user_id);
      setError(null);
    } catch (err) { setError(err); }
  }, [id, payerId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!group || !rules) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const canManage = group.my_role === 'owner' || group.my_role === 'treasurer';
  const members = (group.members || []).filter((m) => !m.removed);
  const currency = group.currency || 'USD';
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || String(uid).slice(0, 8);

  const create = async () => {
    const reason = moneyFieldError(amount);
    if (!title.trim() || reason || !payerId) {
      setError({ status: 422, code: 'VALIDATION', message: t('m.errors.validation') });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/groups/${id}/recurring`, {
        title: title.trim(),
        amount: Number(amount),
        split_type: 'EQUAL',
        payer_id: payerId,
        participant_ids: members.map((m) => m.user_id),
        frequency,
      });
      setTitle('');
      setAmount('');
      await load();
      Alert.alert(t('groupDetail.recurringBills'), '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const toggle = async (rule) => {
    setBusy(true);
    try {
      await api.patch(`/api/v1/groups/${id}/recurring/${rule.rule_id}`, { active: !rule.active });
      await load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const remove = (rule) => {
    Alert.alert(t('common.delete'), rule.title, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/groups/${id}/recurring/${rule.rule_id}`);
            await load();
          } catch (err) { setError(err); } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={uiStyles.h}>{t('groupDetail.recurringBills')}</Text>
        {rules.length === 0 && <Text style={uiStyles.muted}>{t('groupDetail.noRecurring')}</Text>}
        {rules.map((rule) => (
          <View key={rule.rule_id} style={s.rule}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{rule.title}</Text>
              <Text style={s.meta}>
                {nameOf(rule.payer_id)} · {rule.frequency === 'weekly' ? t('groupDetail.weekly') : t('groupDetail.monthly')}
                {' · '}{rule.active ? t('groupDetail.active') : t('groupDetail.paused')}
                {rule.next_run_at ? ` · ${t('groupDetail.next')} ${String(rule.next_run_at).slice(0, 10)}` : ''}
              </Text>
              <Money cents={rule.amount_cents} currency={currency} size="sm" />
            </View>
            <View style={s.actions}>
              <Text style={s.action} onPress={() => toggle(rule)} accessibilityRole="button">
                {rule.active ? t('groupDetail.pause') : t('groupDetail.resume')}
              </Text>
              <Text style={[s.action, s.danger]} onPress={() => remove(rule)} accessibilityRole="button">
                {t('common.delete')}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {canManage ? (
        <Card>
          <Text style={uiStyles.h}>{t('common.add')}</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={t('groupDetail.rentPh')} maxLength={100} />
          <MoneyInput value={amount} onChangeText={setAmount} label={t('groupDetail.recurringAmount')} currency={currency} />
          <Text style={s.label}>{t('groupDetail.recurringPayer')}</Text>
          <View style={s.chips}>
            {members.map((m) => (
              <Chip key={m.user_id} label={m.display_name} selected={payerId === m.user_id} onPress={() => setPayerId(m.user_id)} />
            ))}
          </View>
          <Text style={s.label}>{t('groupDetail.every')}</Text>
          <Segmented
            options={[{ value: 'weekly', label: t('groupDetail.weekly') }, { value: 'monthly', label: t('groupDetail.monthly') }]}
            value={frequency}
            onChange={setFrequency}
          />
          <SpinButton title={t('common.add')} busy={busy} onPress={create} />
        </Card>
      ) : (
        <Text style={uiStyles.muted}>{t('m.errors.forbidden')}</Text>
      )}

      <ErrorBanner error={error} />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  rule: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 1 },
  actions: { alignItems: 'flex-end', gap: 4 },
  action: { fontSize: 12, fontWeight: '700', color: colors.darkTealText, paddingVertical: 6 },
  danger: { color: colors.debtorText },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, minHeight: 44, fontSize: 14,
  },
  label: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 12, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
});
