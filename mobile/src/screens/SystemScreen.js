// Activity tab (spec 005 task 3.9) — one request per page from GET /me/activity
// when the capability flag is present, otherwise a per-group fan-out. Also the
// home of the offline queue and push notification controls.
import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Switch, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, EmptyState, ErrorBanner, ListFooter, PressableRow, SkeletonCard, SpinButton,
  uiStyles,
} from '../ui';
import { useT } from '../prefs';
import {
  buildGlobalActivityQuery, fanOutGlobalActivity, hasGlobalActivity, nextCursor,
} from '../lib/activity';
import { drainQueue, getQueue, subscribeReconnect } from '../offline/queue';
import { getOptOuts, registerPush, setGroupOptOut } from '../push/notifications';

export default function SystemScreen({ navigation }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [queue, setQueue] = useState([]);
  const [draining, setDraining] = useState(false);
  const [pushState, setPushState] = useState('unknown');
  const [muted, setMuted] = useState({});

  const loadPage = useCallback(async (before = null, replace = true) => {
    if (before) setMoreLoading(true); else setLoading(true);
    setError(null);
    try {
      const caps = capabilities || await api.get('/api/v1/capabilities').catch(() => null);
      setCapabilities(caps);
      const balances = await api.get('/api/v1/me/balances').catch(() => ({ groups: [] }));
      const allGroups = balances.groups || [];
      setGroups(allGroups);

      let rows;
      let next = null;
      if (hasGlobalActivity(caps)) {
        const res = await api.get(buildGlobalActivityQuery({ limit: 20, before, groupId }));
        rows = res.items || [];
        next = res.next_before || null;
      } else {
        // Older API build: fan out across groups and page the merged list locally.
        const feeds = await Promise.all(allGroups.map(async (g) => {
          const feed = await api.get(`/api/v1/groups/${g.group_id}/activity?limit=50`).catch(() => []);
          return { group_id: g.group_id, group_name: g.name, rows: feed };
        }));
        const merged = fanOutGlobalActivity(feeds)
          .filter((r) => !groupId || r.group_id === groupId);
        rows = merged.slice(0, 50);
        next = null;
      }
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setCursor(next);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, [capabilities, groupId]);

  const refreshExtras = useCallback(async () => {
    setQueue(await getQueue());
    setMuted(await getOptOuts());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(null, true);
    await refreshExtras();
    setRefreshing(false);
  }, [loadPage, refreshExtras]);

  useFocusEffect(useCallback(() => {
    refresh();
    const unsubscribe = subscribeReconnect(async () => {
      await drainQueue().catch(() => {});
      refresh();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]));

  const drain = async () => {
    setDraining(true);
    try {
      const res = await drainQueue();
      Alert.alert(t('common.refresh'), `${res.drained} · ${res.remaining}`);
      await refreshExtras();
    } finally { setDraining(false); }
  };

  const enablePush = async () => {
    const res = await registerPush();
    setPushState(res.status);
    if (res.status === 'granted') Alert.alert(t('m.push.title'), t('m.push.hint'));
    else Alert.alert(t('m.push.title'), res.status);
  };

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Text style={s.title}>{t('activity.title')}</Text>
      <Text style={uiStyles.muted}>{t('activity.subtitle')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Chip label={t('m.activity.groupFilter')} selected={!groupId} onPress={() => setGroupId('')} />
        {groups.map((g) => (
          <Chip key={g.group_id} label={g.name} selected={groupId === g.group_id} onPress={() => setGroupId(g.group_id)} />
        ))}
      </ScrollView>

      {loading && <SkeletonCard />}
      {!loading && items.length === 0 && (
        <EmptyState title={t('activity.empty')} />
      )}

      {items.map((a, i) => (
        <Card
          key={`${a.group_id || ''}-${a.at}-${i}`}
          onPress={() => (a.group_id ? navigation.navigate('GroupActivity', { id: a.group_id }) : null)}
          accessibilityLabel={a.text || a.kind}
        >
          <Text style={s.itemText}>{a.text || a.kind}</Text>
          <Text style={uiStyles.muted}>
            {a.group_name || ''}{a.at ? ` · ${new Date(a.at).toLocaleString()}` : ''}
          </Text>
        </Card>
      ))}

      {loading && items.length === 0 && <ListFooter loading />}
      {!!cursor && (
        <SpinButton
          title={t('m.activity.nextPage')}
          variant="ghost"
          busy={moreLoading}
          onPress={() => loadPage(cursor, false)}
        />
      )}
      {!cursor && items.length > 0 && <Text style={s.done}>{t('m.activity.noMore')}</Text>}

      <ErrorBanner error={error} onRetry={() => loadPage(null, true)} />

      <Card>
        <Text style={uiStyles.h}>{t('settings.title')} · {t('common.total')} {queue.length}</Text>
        <Text style={uiStyles.muted}>{t('forms.expense.uploadsOnSave', { action: t('common.save') })}</Text>
        <SpinButton title={t('common.refresh')} variant="ghost" busy={draining} onPress={drain} />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('m.push.title')}</Text>
        <Text style={uiStyles.muted}>{t('m.push.hint')}</Text>
        <SpinButton title={t('m.push.title')} onPress={enablePush} />
        {groups.map((g) => (
          <View key={g.group_id} style={s.muteRow}>
            <Text style={s.muteLabel} numberOfLines={1}>{g.name}</Text>
            <Switch
              value={!muted[g.group_id]}
              onValueChange={async (on) => {
                const map = await setGroupOptOut(g.group_id, !on);
                setMuted({ ...map });
              }}
              accessibilityLabel={`${t('m.push.mute')} ${g.name}`}
            />
          </View>
        ))}
      </Card>

      <PressableRow title={t('profile.title')} onPress={() => navigation.navigate('You')} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  chips: { gap: 6, paddingVertical: 10 },
  itemText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  done: { fontSize: 11, color: colors.muted, textAlign: 'center', marginVertical: 8 },
  muteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, minHeight: 44 },
  muteLabel: { fontSize: 12, color: colors.text, flex: 1, marginRight: 8 },
});
