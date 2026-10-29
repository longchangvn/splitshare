// Amount field with inline validation (spec 005 task 3.1). Every money box in
// the app goes through this so no form can send an amount the API will reject.
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import { moneyFieldError } from '../lib/money';
import { MONEY_FIELD_KEYS } from '../lib/errors';
import { useT } from '../prefs';

export default function MoneyInput({
  value,
  onChangeText,
  label,
  placeholder = '0.00',
  currency,
  optional = false,
  error,
  testID,
  autoFocus,
  maxLength = 12,
}) {
  const t = useT();
  const reason = error || (optional && String(value ?? '').trim() === '' ? null : moneyFieldError(value));
  const message = reason ? t(MONEY_FIELD_KEYS[reason] || 'm.field.amountFormat') : null;
  return (
    <View style={s.wrap}>
      {!!label && <Text style={s.label}>{label}{currency ? ` · ${currency}` : ''}</Text>}
      <View style={[s.box, !!message && s.boxErr]}>
        {!!currency && <Text style={s.prefix}>{currency}</Text>}
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxLength={maxLength}
          autoFocus={autoFocus}
          testID={testID}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
        />
      </View>
      {!!message && <Text style={s.error}>{message}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 10 },
  label: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  box: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 12,
  },
  boxErr: { borderColor: colors.debtorText },
  prefix: { fontSize: 13, fontWeight: '800', color: colors.secondary, marginRight: 8 },
  input: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, paddingVertical: 12 },
  error: { fontSize: 11, color: colors.debtorText, marginTop: 4, fontWeight: '700' },
});
