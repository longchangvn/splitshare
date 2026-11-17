// SplitEase group card row (Stitch M32/M26): icon tile, name, members · status, net chip
// and total spend. Same data and navigation as the classic GroupTile.
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../typography';
import { fmt } from '../../../api/client';
import { useT } from '../../../i18n';
import { colors, radius, shadow, type } from '../../../theme';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { IconTile, MINT, GREY, SLATE } from './IconTile';
import { NetChip } from './NetChip';

const STATUS_TILE = {
  opening: { ms: 'groups', tone: MINT },
  locked: { ms: 'lock_outline', tone: SLATE },
  closed: { ms: 'inventory_2', tone: GREY },
};

export function GroupRow({ group, onPress, status = 'opening', showSpend = true, extra }) {
  const t = useT();
  const members = Number(group.member_count) || 0;
  const tile = STATUS_TILE[status] || STATUS_TILE.opening;
  const sub = [
    group.member_count != null ? t('groupDetail.membersCount', { count: members, unit: members === 1 ? t('common.person') : t('common.people') }) : null,
    t(`groupStatus.${status}`),
    group.my_role === 'owner' ? t('common.owner') : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.viewDetailsFor', { name: group.name })}
    >
      <IconTile ms={tile.ms} size={48} tone={tile.tone} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.name} numberOfLines={1}>{group.name}</Text>
        <Text style={type.small} numberOfLines={1}>{sub}</Text>
        {showSpend ? (
          <Text style={s.spend} numberOfLines={1}>
            {t('groups.totalSpend')}: <Text style={s.spendV}>{fmt(Number(group.spent_cents) || 0, group.currency)}</Text>
          </Text>
        ) : null}
        {extra}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <NetChip cents={Number(group.net_cents) || 0} currency={group.currency} />
        {group.delinquent ? <Text style={s.late} accessibilityLabel={t('m.home.overdue')}>30d+</Text> : null}
        <ThemedIcon ms="chevron_right" size={20} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius.card, padding: 16, ...shadow.card },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  spend: { fontSize: 12, color: colors.secondary, marginTop: 2 },
  spendV: { fontWeight: '700', color: colors.text },
  late: { fontSize: 11, fontWeight: '800', color: colors.openText, backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
