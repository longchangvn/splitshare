// Groups tab — native port of the web Dashboard groups board (GroupsPage + GroupTile
// in web/src/pages/Dashboard.jsx). Data: GET /api/v1/me/balances groups[].
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { Text } from '../typography';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, Card, ErrText, Screen } from '../ui';
import { useBalances } from '../components/home/data';
import { GroupTile, GroupTileSkeleton, StatusChip, TabHeader } from '../components/home/parts';
import { GROUP_STATUSES, statusOf } from '../components/home/homeUtils';
import { activeTheme } from '../themes';
import { ThemedIcon } from '../components/ThemedIcon';

export default function GroupsScreen({ navigation }) {
  const t = useT();
  const { data, error, refreshing, reload, groups } = useBalances();
  const [statuses, setStatuses] = useState(['opening']);
  const ready = !!data;
  const shown = groups.filter((g) => statuses.includes(statusOf(g)));
  const toggle = (st) => setStatuses((cur) => (cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st]));
  const create = () => navigation.navigate('NewGroup');

  return (
    <Screen
      contentStyle={{ paddingTop: 12, paddingBottom: activeTheme().features?.flatTabBar ? 40 : 150 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ pull: true })} tintColor={colors.primary} />}
    >
      <TabHeader
        title={t('groups.title')}
        sub={ready ? t('groups.shownOf', { shown: shown.length, total: groups.length }) : '…'}
        action={t('dashboard.newGroup')}
        onAction={create}
      />
      {error ? (
        <Card>
          <ErrText e={error} />
          <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('m.retry')} onPress={() => reload()} />
        </Card>
      ) : null}

      {ready && groups.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={t('groups.filterLabel')}>
          {GROUP_STATUSES.map((st) => (
            <StatusChip
              key={st}
              status={st}
              label={t(`groupStatus.${st}`)}
              count={groups.filter((g) => statusOf(g) === st).length}
              on={statuses.includes(st)}
              onPress={() => toggle(st)}
            />
          ))}
          {activeTheme().features?.archivedGroups ? (
            <Pressable
              style={({ pressed }) => [s.archived, pressed && { opacity: 0.8 }]}
              onPress={() => navigation.navigate('Archived')}
              accessibilityRole="button"
              accessibilityLabel={t('se.archived.title')}
            >
              <ThemedIcon ms="inventory_2" size={16} color={colors.body} />
              <Text style={s.archivedT}>{t('se.groups.archived')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!ready && !error ? [0, 1, 2, 3].map((i) => <GroupTileSkeleton key={i} />) : null}

      {ready && groups.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <Text style={[type.body, { textAlign: 'center', color: colors.secondary }]}>{t('dashboard.noGroups')}</Text>
          <Button small variant="soft" title={t('dashboard.createGroup')} onPress={create} />
        </Card>
      ) : null}

      {ready && groups.length > 0 && shown.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Text style={[type.body, { textAlign: 'center', color: colors.secondary }]}>
            {statuses.length === 0 ? t('groups.filterNone') : t('groups.filterEmpty')}
          </Text>
        </Card>
      ) : null}

      {ready ? shown.map((g) => (
        <GroupTile key={g.group_id} group={g} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })} />
      )) : null}
    </Screen>
  );
}

// SplitEase-only "Archived" link chip (features.archivedGroups).
const s = StyleSheet.create({
  archived: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.chipBg },
  archivedT: { fontSize: 13, fontWeight: '600', color: colors.body },
});
