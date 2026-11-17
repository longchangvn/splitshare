// SplitEase invite QR (features.inviteQr; Stitch M33): the group's existing invite link encoded
// with qrcode-generator and drawn as rows of Views (dark runs merged into one View each).
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import qrcode from 'qrcode-generator';
import { Text } from '../../../../typography';
import { colors, type, radius, groupTokens } from '../../../../theme';
import { useT } from '../../../../i18n';
import { ThemedIcon } from '../../../../components/ThemedIcon';

const QUIET = 2; // modules of white border around the code

/** Rows of [start, length] dark runs for `text`; null if it cannot be encoded. */
function qrRuns(text) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const rows = [];
    for (let r = 0; r < n; r += 1) {
      const runs = [];
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) { c += 1; continue; }
        const start = c;
        while (c < n && qr.isDark(r, c)) c += 1;
        runs.push([start, c - start]);
      }
      rows.push(runs);
    }
    return { n, rows };
  } catch {
    return null;
  }
}

export function QrCode({ value, size = 200 }) {
  const code = useMemo(() => (value ? qrRuns(value) : null), [value]);
  if (!code) return null;
  const cell = Math.max(2, Math.floor(size / (code.n + QUIET * 2)));
  const side = cell * (code.n + QUIET * 2);
  return (
    <View
      style={{ width: side, height: side, padding: cell * QUIET, backgroundColor: groupTokens.qrLight }}
      accessible
      accessibilityRole="image"
    >
      {code.rows.map((runs, r) => (
        <View key={r} style={{ height: cell, width: cell * code.n }}>
          {runs.map(([start, len]) => (
            <View key={start} style={{ position: 'absolute', left: start * cell, width: len * cell, height: cell, backgroundColor: groupTokens.qrDark }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function InviteQr({ link }) {
  const t = useT();
  if (!link) return null;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.icon}><ThemedIcon ms="qr_code_2" size={20} color={colors.primary} /></View>
        <Text style={[type.h3, { flex: 1 }]}>{t('se.invite.qrTitle')}</Text>
        <Text style={type.small}>{t('se.invite.inPerson')}</Text>
      </View>
      <View style={s.frame} accessibilityLabel={t('se.invite.qrHint')}>
        <View style={s.paper}><QrCode value={link} size={200} /></View>
        <Text style={[type.small, { marginTop: 10, textAlign: 'center' }]}>{t('se.invite.qrHint')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: radius.tile, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  frame: { marginTop: 14, alignSelf: 'center', alignItems: 'center', padding: 16, borderRadius: radius.card, backgroundColor: colors.chipBg },
  paper: { borderRadius: radius.tile, overflow: 'hidden', backgroundColor: groupTokens.qrLight },
});
