// SplitEase closed-group banner (features.closedBanner; Stitch M39/M46): shown at the top of a
// closed group — "All balances settled · ledger locked" plus each member's settled state from
// the existing group summary.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../../typography';
import { fmt, displayNameOf } from '../../../../api/client';
import { colors, type, radius } from '../../../../theme';
import { useT } from '../../../../i18n';
import { Avatar } from '../../../../ui';
import { ThemedIcon } from '../../../../components/ThemedIcon';

export default function ClosedBanner({ members, summary, currency, settled }) {
  const t = useT();
  const rows = (Array.isArray(summary) && summary.length > 0 ? summary : members.map((m) => ({ user_id: m.user_id, net_cents: 0 })))
    .map((r) => ({ id: r.user_id, name: r.display_name || displayNameOf(members, r.user_id), net: r.net_cents || 0 }));
  const allClear = settled !== false && rows.every((r) => r.net === 0);
  return (
    <View style={s.card} accessibilityRole="summary">
      <View style={s.pill}>
        <ThemedIcon ms="lock" size={14} color={colors.primaryText} />
        <Text style={s.pillT}>{t('groupStatus.closed')}</Text>
      </View>
      <Text style={[type.h1, { marginTop: 8 }]}>{allClear ? t('se.closed.title') : t('se.closed.titleOpen')}</Text>
      <Text style={[type.small, { marginTop: 2 }]}>{t('se.closed.sub', { count: rows.length })}</Text>
      <View style={s.list}>
        {rows.map((r, i) => (
          <View key={r.id} style={[s.row, i < rows.length - 1 && s.rowLine]}>
            <Avatar name={r.name} size={30} />
            <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
            {r.net === 0 ? (
              <View style={s.ok}>
                <ThemedIcon ms="check_circle" size={14} color={colors.primaryText} />
                <Text style={s.okT}>{t('common.settled')}</Text>
              </View>
            ) : (
              <Text style={[s.okT, { color: r.net < 0 ? colors.danger : colors.primaryText }]}>{fmt(r.net, currency)}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.lightTealBg, borderColor: colors.borderTeal, borderWidth: 1, borderRadius: radius.card, padding: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillT: { fontSize: 11, fontWeight: '700', color: colors.primaryText, textTransform: 'uppercase', letterSpacing: 0.4 },
  list: { marginTop: 12, backgroundColor: colors.card, borderRadius: radius.tile, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  ok: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.kind.settled[0], paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  okT: { fontSize: 11, fontWeight: '700', color: colors.primaryText },
});
