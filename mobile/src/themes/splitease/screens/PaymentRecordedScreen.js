// SplitEase "Payment recorded" confirmation (features.paymentRecorded; Stitch M31/M40/M54).
// PayScreen replaces itself with this after the API accepted a payment (not when queued offline).
// Params: { amount (cents), currency, fromName, toName, method, date (ISO), groupId, fullySettled }.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../typography';
import { fmt } from '../../../api/client';
import { colors, type, radius, shadow } from '../../../theme';
import { useT } from '../../../i18n';
import { Screen, Button, Avatar } from '../../../ui';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { useDateFmt } from '../../../components/group/parts';

export default function PaymentRecordedScreen({ route, navigation }) {
  const {
    amount = 0, currency = 'USD', fromName = '', toName = '', method = '', date, groupId, fullySettled,
  } = route.params || {};
  const t = useT();
  const d = useDateFmt();
  const methodLabel = method === 'cash' ? t('forms.payment.cash')
    : method === 'transfer' ? t('forms.payment.bank')
      : method ? t('forms.payment.other') : '—';

  const done = () => navigation.goBack();
  const viewGroup = () => {
    if (groupId) navigation.popTo('GroupDetail', { id: groupId });
    else navigation.goBack();
  };

  return (
    <Screen
      footer={(
        <View style={{ gap: 8 }}>
          <Button variant="brand" title={t('se.pay.done')} onPress={done} />
          {groupId ? <Button variant="ghost" title={t('se.pay.viewGroup')} onPress={viewGroup} /> : null}
        </View>
      )}
    >
      <View style={[s.card, { alignItems: 'center' }]}>
        <View style={s.check}>
          <ThemedIcon ms="check_circle" size={44} color="#fff" />
        </View>
        {fullySettled ? (
          <View style={s.pill}>
            <ThemedIcon ms="task_alt" size={14} color={colors.primaryText} />
            <Text style={s.pillT}>{t('groupDetail.fullySettled')}</Text>
          </View>
        ) : null}
        <Text style={[type.title, { marginTop: 10, textAlign: 'center' }]}>{t('se.pay.recordedTitle')}</Text>
        <Text style={[type.body, { textAlign: 'center', marginTop: 4 }]}>{t('se.pay.recordedSub', { from: fromName, to: toName })}</Text>
      </View>

      <View style={s.card}>
        <Text style={type.kicker}>{t('se.pay.amount')}</Text>
        <Text style={s.amount}>{fmt(amount, currency)}</Text>

        <View style={s.parties}>
          <View style={s.party}>
            <Avatar name={fromName} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={type.h3} numberOfLines={1}>{fromName}</Text>
              <Text style={type.small}>{t('forms.payment.from')}</Text>
            </View>
          </View>
          <View style={s.arrow}>
            <ThemedIcon ms="arrow_forward" size={18} color={colors.primary} />
          </View>
          <View style={[s.party, { justifyContent: 'flex-end' }]}>
            <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
              <Text style={type.h3} numberOfLines={1}>{toName}</Text>
              <Text style={type.small}>{t('forms.payment.to')}</Text>
            </View>
            <Avatar name={toName} size={40} />
          </View>
        </View>

        <View style={s.line}>
          <Text style={type.small}>{t('forms.payment.method')}</Text>
          <Text style={type.h3}>{methodLabel}</Text>
        </View>
        <View style={[s.line, { borderBottomWidth: 0 }]}>
          <Text style={type.small}>{t('common.date')}</Text>
          <Text style={type.h3}>{date ? d.dateTime(date) : '—'}</Text>
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 18, ...shadow.card },
  check: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, backgroundColor: colors.accentLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillT: { fontSize: 11, fontWeight: '700', color: colors.primaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  amount: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, color: colors.primary, marginTop: 2 },
  parties: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: radius.tile, backgroundColor: colors.paleTealBg },
  party: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  arrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
});
