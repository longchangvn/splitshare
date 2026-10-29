// Balances tab (spec 005 task 2.4) — debtor groups from the settlement
// optimizer, per-transfer Pay, Nudge (24 h server throttle) and the all-settled
// state. No cross-currency totals: a group has exactly one currency.
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, ErrorBanner, Money, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../lib/errors';

export default function BalancesTab({ group, plan, loading, onPay, onChanged, canWrite = true }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const members = (group?.members || []).filter((m) => !m.removed);
  const currency = group?.currency || 'USD';
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || String(uid || '').slice(0, 8);
  const transfers = plan?.transfers || [];

  const nudge = async (userId) => {
    setBusyId(userId);
    setError(null);
    try {
      await api.post(`/api/v1/groups/${group.group_id}/nudges`, { user_ids: [userId] });
      Alert.alert(t('groupDetail.nudged', { name: nameOf(userId) }), '');
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally { setBusyId(null); }
  };

  if (!plan && loading) {
    return <Card><Text style={uiStyles.muted}>{t('common.loading')}</Text></Card>;
  }

  return (
    <View>
      <Card>
        <Text style={uiStyles.h}>{t('groupDetail.whoOwes')}</Text>
        {transfers.length === 0 && (
          <Text style={[uiStyles.muted, { marginTop: 6 }]}>{t('groupDetail.allSettledNobody')}</Text>
        )}
        {transfers.map((xfer, i) => {
          const iAmDebtor = xfer.from_user_id === meId;
          const iAmCreditor = xfer.to_user_id === meId;
          return (
            <View key={`${xfer.from_user_id}-${xfer.to_user_id}-${i}`} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{t('groupDetail.owes', { name: nameOf(xfer.from_user_id) })}</Text>
                <Text style={s.meta}>{nameOf(xfer.to_user_id)}</Text>
                <Money cents={xfer.amount_cents} currency={currency} size="md" tone={iAmDebtor ? 'owe' : iAmCreditor ? 'owed' : undefined} />
              </View>
              <View style={s.actions}>
                {(iAmDebtor || canWrite) && (
                  <Pressable
                    style={s.pay}
                    onPress={() => onPay?.(xfer)}
                    accessibilityRole="button"
                    accessibilityLabel={t('forms.payment.payNamedAmount', { name: nameOf(xfer.to_user_id), amount: xfer.amount_cents / 100 })}
                  >
                    <Text style={s.payT}>{t('groupDetail.pay')}</Text>
                  </Pressable>
                )}
                {iAmCreditor && canWrite && (
                  <Pressable
                    style={s.nudge}
                    onPress={() => nudge(xfer.from_user_id)}
                    disabled={busyId === xfer.from_user_id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('groupDetail.nudge')} ${nameOf(xfer.from_user_id)}`}
                  >
                    <Text style={s.nudgeT}>{busyId === xfer.from_user_id ? '…' : t('groupDetail.nudge')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
        {transfers.length > 0 && (
          <Text style={s.note}>{t('dashboard.optimizedNote')}</Text>
        )}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('forms.expense.participants')}</Text>
        {members.map((m) => (
          <View key={m.user_id} style={s.memberRow}>
            <Text style={s.name}>{m.display_name}</Text>
            <Text style={s.meta}>{m.role === 'owner' ? t('common.owner') : m.role === 'treasurer' ? t('common.treasurer') : t('common.member')}</Text>
          </View>
        ))}
      </Card>

      <ErrorBanner error={error} />
      {!canWrite && <Text style={[uiStyles.muted, { marginBottom: 8 }]}>{t('m.errors.groupReadOnly')}</Text>}
      {transfers.length > 0 && (
        <SpinButton
          title={t('groupDetail.recordPayment')}
          variant="ghost"
          onPress={() => onPay?.(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: colors.cardBorder, minHeight: 52,
  },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 36 },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pay: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  payT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  nudge: { borderWidth: 1, borderColor: colors.accentLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center', backgroundColor: colors.paleTealBg },
  nudgeT: { color: colors.darkTealText, fontWeight: '800', fontSize: 12 },
  note: { fontSize: 11, color: colors.secondary, marginTop: 10 },
});
