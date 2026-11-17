// "Quick Pass" card (Stitch M30): the existing biometric unlock presented as a card.
// The "Saved" chip only shows when credentials for biometric login are stored.
import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../typography';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { colors, radius, shadow, type } from '../../../theme';
import { useT } from '../../../i18n';
import { savedCredentials } from '../../../auth/AuthContext';
import { IconTile, GREY } from './IconTile';

export default function QuickPassCard({ onPress, disabled }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    savedCredentials().then((c) => { if (live) setSaved(!!c); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return (
    <Pressable
      style={({ pressed }) => [s.card, (pressed || disabled) && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${t('se.auth.quickPass')}. ${t('m.account.biometric')}`}
    >
      <IconTile ms="fingerprint" size={48} tone={GREY} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.row}>
          <Text style={type.h2}>{t('se.auth.quickPass')}</Text>
          {saved ? <Text style={s.chip}>{t('se.auth.saved')}</Text> : null}
        </View>
        <Text style={type.small} numberOfLines={2}>{t('se.auth.quickPassSub')}</Text>
      </View>
      <ThemedIcon ms="chevron_right" size={26} color={colors.primary} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius.card, padding: 16, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { fontSize: 11, fontWeight: '700', color: colors.body, backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
