// SplitEase-only "Archived groups" (Stitch M26, without the decorative vault/tax content):
// closed groups (optionally also locked ones) from GET /api/v1/me/balances — the same
// call the Groups tab uses — with total spend, my net and member count. Tap → GroupDetail.
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { Text } from '../../../typography';
import { fmt } from '../../../api/client';
import { useT } from '../../../i18n';
import { colors, radius, shadow, type } from '../../../theme';
import { Button, Card, ErrText, Screen } from '../../../ui';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { useBalances } from '../../../components/home/data';
import { GroupTileSkeleton } from '../../../components/home/parts';
import { statusOf } from '../../../components/home/homeUtils';
import { GroupRow } from '../components/GroupRow';
import { IconTile, GREY } from '../components/IconTile';

export default function ArchivedGroupsScreen({ navigation }) {
  const t = useT();
  const { data, error, refreshing, reload, groups } = useBalances();
  const [withLocked, setWithLocked] = useState(false);
  const ready = !!data;
  const shown = groups
    .filter((g) => statusOf(g) === 'closed' || (withLocked && statusOf(g) === 'locked'))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const lockedCount = groups.filter((g) => statusOf(g) === 'locked').length;

  // Totals per currency over the shown groups (never summed across currencies).
  const spend = {};
  for (const g of shown) {
    const c = String(g.currency || 'USD').toUpperCase();
    spend[c] = (spend[c] || 0) + (Number(g.spent_cents) || 0);
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ pull: true })} tintColor={colors.primary} />}>
      <Card style={s.hero}>
        <IconTile ms="inventory_2" size={48} tone={GREY} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.h1}>{t('se.archived.title')}</Text>
          <Text style={[type.small, { marginTop: 2 }]}>{t('se.archived.subtitle')}</Text>
        </View>
      </Card>

      {ready && shown.length > 0 ? (
        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statK}>{t('groups.title')}</Text>
            <Text style={s.statV}>{shown.length}</Text>
          </View>
          <View style={[s.stat, { flex: 2 }]}>
            <Text style={s.statK}>{t('groups.totalSpend')}</Text>
            <Text style={s.statV} numberOfLines={2} adjustsFontSizeToFit>
              {Object.entries(spend).map(([c, cents]) => fmt(cents, c)).join(' · ')}
            </Text>
          </View>
        </View>
      ) : null}

      {lockedCount > 0 ? (
        <Pressable
          style={[s.toggle, withLocked && s.toggleOn]}
          onPress={() => setWithLocked((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: withLocked }}
        >
          <ThemedIcon ms={withLocked ? 'check_box' : 'check_box_outline_blank'} size={20} color={withLocked ? '#fff' : colors.body} />
          <Text style={[s.toggleT, withLocked && { color: '#fff' }]}>{t('se.archived.includeLocked')} ({lockedCount})</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Card>
          <ErrText e={error} />
          <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('m.retry')} onPress={() => reload()} />
        </Card>
      ) : null}

      {!ready && !error ? [0, 1, 2].map((i) => <GroupTileSkeleton key={i} />) : null}

      {ready && shown.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <IconTile ms="inventory_2" size={56} tone={GREY} round />
          <Text style={[type.body, { textAlign: 'center', color: colors.secondary }]}>{t('se.archived.empty')}</Text>
        </Card>
      ) : null}

      {ready ? shown.map((g) => (
        <GroupRow
          key={g.group_id}
          group={g}
          status={statusOf(g)}
          onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
        />
      )) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, padding: 14, ...shadow.card },
  statK: { ...type.kicker },
  statV: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.3 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.chipBg },
  toggleOn: { backgroundColor: colors.primary },
  toggleT: { fontSize: 13, fontWeight: '600', color: colors.body },
});
