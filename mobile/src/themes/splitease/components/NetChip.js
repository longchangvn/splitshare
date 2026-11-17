// Pill amount chip (Stitch): mint "+$x" when owed, pale red "-$x" when owing, grey when even.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../../../typography';
import { fmt } from '../../../api/client';
import { useT } from '../../../i18n';
import { signPrefix } from '../../../shared/balance';
import { colors } from '../../../theme';

export const NET_TONE = {
  owed: { bg: colors.owedBg, fg: colors.owedText },
  owe: { bg: colors.debtorBg, fg: colors.debtorText },
  even: { bg: colors.lockedBg, fg: colors.lockedText },
};

export const netTone = (cents) => (cents > 0 ? NET_TONE.owed : cents < 0 ? NET_TONE.owe : NET_TONE.even);

export function NetChip({ cents = 0, currency, label, style }) {
  const t = useT();
  const tone = netTone(cents);
  const text = label || (cents === 0 ? t('net.settledUp') : `${signPrefix(cents)}${fmt(Math.abs(cents), currency)}`);
  return <Text style={[s.chip, { backgroundColor: tone.bg, color: tone.fg }, style]} numberOfLines={1}>{text}</Text>;
}

const s = StyleSheet.create({
  chip: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start', fontVariant: ['tabular-nums'] },
});
