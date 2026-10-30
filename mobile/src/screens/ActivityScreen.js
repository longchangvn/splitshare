// Activity tab — native port of the web Dashboard activity view (ActivityFeed in
// web/src/pages/Dashboard.jsx): merged feed across my groups (limit=50 each),
// newest first, 10 per page with Prev / Next and numbered pages.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, Card, ErrText, Screen } from '../ui';
import { useBalances, fetchActivity } from '../components/home/data';
import { ActivityRow, ActivitySkeleton, TabHeader } from '../components/home/parts';
import { ACTIVITY_PAGE_SIZE, activityPageTokens, pageSlice } from '../components/home/homeUtils';

export default function ActivityScreen({ navigation }) {
  const t = useT();
  const { data, error, reload, groups } = useBalances();
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [pulling, setPulling] = useState(false);
  const ready = !!data;
  const key = groups.map((g) => g.group_id).join(',');

  useEffect(() => {
    if (!ready) return undefined;
    if (groups.length === 0) { setItems([]); setPage(1); setPulling(false); return undefined; }
    let cancel = false;
    fetchActivity(groups, 50).then((rows) => {
      if (cancel) return;
      setItems(rows);
      setPage(1);
      setPulling(false);
    });
    return () => { cancel = true; };
  }, [ready, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    setPulling(true);
    await reload();
    setNonce((n) => n + 1);
  };
  useEffect(() => { if (error) setPulling(false); }, [error]);

  const pg = pageSlice(items || [], page, ACTIVITY_PAGE_SIZE);

  return (
    <Screen
      contentStyle={{ paddingTop: 12, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <TabHeader
        title={t('activity.title')}
        sub={items && pg.total > 0
          ? t('activity.updatesPage', { count: pg.total, size: ACTIVITY_PAGE_SIZE })
          : t('activity.subtitle')}
      />
      {error ? (
        <Card>
          <ErrText e={error} />
          <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('m.retry')} onPress={() => reload()} />
        </Card>
      ) : null}

      <Card>
        {!items && !error ? <ActivitySkeleton rows={5} /> : null}
        {items && items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontSize: 30, marginBottom: 6 }}>🗒️</Text>
            <Text style={[type.body, { textAlign: 'center', color: colors.secondary }]}>{t('activity.empty')}</Text>
          </View>
        ) : null}
        {items && items.length > 0 ? (
          <>
            <Text style={s.range}>{t('activity.range', { from: pg.from, to: pg.to, total: pg.total })}</Text>
            {pg.items.map((a, i) => (
              <ActivityRow
                key={`${a.group_id}-${a.kind}-${a.at}-${i}`}
                item={a}
                long
                last={i === pg.items.length - 1}
                onPress={() => navigation.navigate('GroupDetail', { id: a.group_id, tab: 'activity' })}
              />
            ))}
          </>
        ) : null}
      </Card>

      {items && pg.totalPages > 1 ? (
        <View style={s.pager} accessibilityLabel={t('activity.pages')}>
          <Button small variant="ghost" title={t('common.prev')} disabled={pg.page <= 1} onPress={() => setPage(Math.max(1, pg.page - 1))} />
          <View style={s.pages}>
            {activityPageTokens(pg.page, pg.totalPages).map((tok, i) => (tok === '…' ? (
              <Text key={`e-${i}`} style={s.ellipsis}>…</Text>
            ) : (
              <Pressable
                key={tok}
                style={[s.pageBtn, tok === pg.page && s.pageOn]}
                onPress={() => setPage(tok)}
                accessibilityRole="button"
                accessibilityState={{ selected: tok === pg.page }}
                accessibilityLabel={t('m.home.page', { page: tok, total: pg.totalPages })}
              >
                <Text style={[s.pageT, tok === pg.page && { color: '#fff' }]}>{tok}</Text>
              </Pressable>
            )))}
          </View>
          <Button small variant="ghost" title={t('common.next')} disabled={pg.page >= pg.totalPages} onPress={() => setPage(Math.min(pg.totalPages, pg.page + 1))} />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  range: { fontSize: 12, fontWeight: '700', color: colors.secondary, marginBottom: 4 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pages: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4 },
  pageBtn: { minWidth: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pageOn: { backgroundColor: colors.ink },
  pageT: { fontSize: 13, fontWeight: '700', color: colors.body },
  ellipsis: { color: colors.muted, paddingHorizontal: 2 },
});
