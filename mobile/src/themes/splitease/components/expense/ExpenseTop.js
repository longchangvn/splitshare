// SplitEase top half of ExpenseFields (features.expenseCards; Stitch M50/M34): total-amount hero,
// description card, date + category tiles and a "Paid by" card. Same draft fields and handlers
// as the classic section — ExpenseFields passes its own field elements / onChange in.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '../../../../typography';
import { colors, type, radius, CATEGORY_META } from '../../../../theme';
import { Card, ChipRow, Avatar } from '../../../../ui';
import { IconTile } from '../../../../components/group/parts';
import { sanitizeMoneyInput } from '../../../../shared/expenseDraft';

function symbolOf(currency) {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency || '';
  }
}

export default function ExpenseTop({
  t, draft, currency, disabled, fx, shownAmount, amountErr, payerErr, members, memberOptions, onChange,
  titleField, categoryField, dateField, money, effectiveCents,
}) {
  const payer = members.find((m) => m.user_id === draft.payerId);
  const cat = CATEGORY_META[draft.category] || CATEGORY_META.other;
  return (
    <>
      <Card style={s.hero}>
        <Text style={[type.kicker, { textAlign: 'center' }]}>{t('se.expense.total')}</Text>
        <View style={s.amountRow}>
          <Text style={s.symbol}>{symbolOf(currency)}</Text>
          <TextInput
            value={shownAmount}
            editable={!disabled && !fx}
            onChangeText={(v) => onChange({ amount: sanitizeMoneyInput(v) })}
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            accessibilityLabel={t('forms.expense.amount')}
            style={[s.amount, amountErr && { color: colors.danger }]}
          />
        </View>
        {amountErr ? <Text style={s.err}>{amountErr}</Text> : null}
        {fx ? <Text style={[type.small, { textAlign: 'center' }]}>{t('forms.expense.amountFromFx')}</Text> : null}
      </Card>

      <Card>{titleField}</Card>

      <Card>
        <View style={s.tileRow}>
          <IconTile ms="calendar_today" size={40} color={colors.secondary} />
          <View style={{ flex: 1 }}>{dateField}</View>
        </View>
      </Card>

      <Card>
        <View style={s.tileRow}>
          <IconTile ms={cat.ms || 'category'} size={40} color={cat.color} />
          <View style={{ flex: 1 }}>{categoryField}</View>
        </View>
      </Card>

      <Card>
        <Text style={type.kicker}>{t('forms.expense.payer')}</Text>
        <View style={s.payer}>
          <Avatar name={payer?.display_name || '?'} size={40} />
          <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{payer?.display_name || '—'}</Text>
          {effectiveCents != null ? <Text style={s.payerAmt}>{money(effectiveCents)}</Text> : null}
        </View>
        <View style={[{ marginTop: 10 }, disabled && { opacity: 0.5 }]} pointerEvents={disabled ? 'none' : 'auto'}>
          <ChipRow scroll options={memberOptions} value={draft.payerId} onChange={(v) => onChange({ payerId: v || '' })} />
        </View>
        {payerErr ? <Text style={[s.err, { textAlign: 'left' }]}>{payerErr}</Text> : null}
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'stretch', paddingVertical: 22 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  symbol: { fontSize: 28, fontWeight: '800', color: colors.primary },
  amount: { minWidth: 140, fontSize: 44, fontWeight: '800', letterSpacing: -1.2, color: colors.text, textAlign: 'center', paddingVertical: 4 },
  err: { fontSize: 12, color: colors.danger, marginTop: 4, textAlign: 'center' },
  tileRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  payer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12, borderRadius: radius.tile, backgroundColor: colors.paleTealBg },
  payerAmt: { fontSize: 16, fontWeight: '800', color: colors.primary },
});
