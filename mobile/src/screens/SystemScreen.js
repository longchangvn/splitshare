// Offline & notifications — offline draft queue (auto-sync on reconnect, same
// Idempotency-Key so retries never duplicate), push enable + per-group opt-out, and a
// plain-language note on how settled groups lock. Activity feed lives in the Activity tab.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Switch, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { getQueue, drainQueue, subscribeReconnect } from '../offline/queue';
import { registerPush, getOptOuts, setGroupOptOut } from '../push/notifications';
import { Screen, Card, Row, Badge, Button, SectionHeader, toast } from '../ui';
import { usePrefs, useT } from '../i18n';
import { a } from '../components/account/AccountKit';

function fmtTime(iso, locale) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** Friendly one-liner for a queued draft: "Expense · Dinner · 42.50" / "in Trip". */
function draftTitle(d, t) {
  const kind = d.type === 'payment' ? t('m.account.draftPayment') : t('m.account.draftExpense');
  const p = d.payload || {};
  const what = p.title || p.description || p.note || '';
  const amt = p.amount != null && p.amount !== '' ? String(p.amount) : '';
  return [kind, what, amt].filter(Boolean).join(' · ');
}

export default function SystemScreen() {
  const t = useT();
  const { locale } = usePrefs();
  const [queue, setQueue] = useState([]);
  const [draining, setDraining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [push, setPush] = useState({ status: 'unknown' });
  const [pushBusy, setPushBusy] = useState(false);
  const [optOuts, setOptOuts] = useState({});
  const [groups, setGroups] = useState(null);
  const liveRef = useRef(true);

  const refresh = useCallback(async () => {
    const [q, o, perm] = await Promise.all([
      getQueue(), getOptOuts(), Notifications.getPermissionsAsync().catch(() => null),
    ]);
    if (!liveRef.current) return;
    setQueue(q); setOptOuts(o);
    // Reflect the OS permission without prompting; "Enable push" requests + registers.
    if (perm?.status === 'denied') setPush((p) => (p.status === 'unknown' ? { status: 'denied' } : p));
    else if (perm?.status === 'granted') setPush((p) => (p.status === 'unknown' ? { status: 'granted' } : p));
    try {
      const b = await api.get('/api/v1/me/balances');
      if (liveRef.current) setGroups(Array.isArray(b?.groups) ? b.groups : []);
    } catch {
      if (liveRef.current) setGroups((g) => g || []); // offline: keep what we have
    }
  }, []);

  useFocusEffect(useCallback(() => {
    liveRef.current = true;
    refresh();
    // Auto-sync on reconnect (kept from the previous System screen).
    const unsub = subscribeReconnect(async () => {
      await drainQueue().catch(() => {});
      refresh();
    });
    return () => { liveRef.current = false; unsub?.(); };
  }, [refresh]));

  const onPull = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };

  const doDrain = async () => {
    if (draining) return;
    setDraining(true);
    try {
      const r = await drainQueue();
      if (r.offline) {
        toast({ message: t('m.account.syncOffline'), color: 'orange' });
      } else {
        const dropped = (r.errors || []).filter((x) => !String(x).endsWith('network')).length;
        toast({
          title: t('m.account.syncDone', { count: r.drained, remaining: r.remaining }),
          message: dropped ? t('m.account.syncDropped', { count: dropped }) : undefined,
          color: dropped ? 'orange' : 'teal',
        });
      }
      await refresh();
    } catch {
      toast({ message: t('m.account.err.network'), color: 'red' });
    } finally { setDraining(false); }
  };

  const doPush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const r = await registerPush();
      setPush(r);
      if (r.status === 'granted') toast({ title: t('m.account.pushEnabled'), color: 'teal' });
    } finally { setPushBusy(false); }
  };

  const toggleGroup = async (gid, on) => {
    setOptOuts((p) => { const n = { ...p }; if (on) delete n[gid]; else n[gid] = true; return n; });
    try { setOptOuts(await setGroupOptOut(gid, !on)); } catch { refresh(); }
  };

  const groupName = (gid) => (groups || []).find((g) => g.group_id === gid)?.name || t('m.account.aGroup');
  const statusKey = ['granted', 'denied', 'error'].includes(push.status) ? push.status : 'unknown';

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}>
      {/* Offline queue */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>{t('m.account.offlineTitle')}</Text>
          <Badge kind="settled" label={t('m.account.autoSync')} />
        </Row>
        <Text style={[type.small, { marginTop: 6 }]}>{t('m.account.offlineHint')}</Text>
        <Text style={[type.h3, { marginTop: 12 }]} accessibilityLiveRegion="polite">
          {queue.length ? t('m.account.offlineCount', { count: queue.length }) : t('m.account.offlineEmpty')}
        </Text>
        {queue.map((d, i) => (
          <View key={d.key}>
            {i > 0 ? <View style={a.sep} /> : null}
            <View style={{ paddingVertical: 10 }}>
              <Text style={type.body} numberOfLines={1}>{draftTitle(d, t)}</Text>
              <Text style={type.small} numberOfLines={1}>
                {t('m.account.draftIn', { group: groupName(d.group_id) })}
                {d.created_at ? ` · ${t('m.account.savedAt', { time: fmtTime(d.created_at, locale) })}` : ''}
              </Text>
            </View>
          </View>
        ))}
        <Button style={{ marginTop: 12 }} title={t('m.account.syncNow')} busy={draining} disabled={!queue.length} onPress={doDrain} />
      </Card>

      {/* Push notifications */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>{t('m.account.pushTitle')}</Text>
          {statusKey === 'granted' ? <Badge kind="settled" label={t('m.account.pushStatus.granted')} /> : null}
        </Row>
        <Text style={[type.small, { marginTop: 6 }]}>{t('m.account.pushHint')}</Text>
        {statusKey !== 'granted' ? (
          <Text
            style={[type.body, { marginTop: 8 }, (statusKey === 'denied' || statusKey === 'error') && { color: colors.danger }]}
            accessibilityLiveRegion="polite"
          >
            {t(`m.account.pushStatus.${statusKey}`)}
          </Text>
        ) : null}
        {!push.token ? (
          <Button style={{ marginTop: 12 }} variant="soft" title={t('m.account.enablePush')} busy={pushBusy} onPress={doPush} />
        ) : null}

        <SectionHeader title={t('m.account.pushGroups')} style={{ marginTop: 16 }} />
        {groups && groups.length === 0 ? <Text style={[type.small, { marginTop: 6 }]}>{t('m.account.pushNoGroups')}</Text> : null}
        {(groups || []).map((g, i) => {
          const on = !optOuts[g.group_id];
          return (
            <View key={g.group_id}>
              {i > 0 ? <View style={a.sep} /> : null}
              <Row style={{ minHeight: 48, paddingVertical: 6 }}>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                <Switch
                  value={on}
                  onValueChange={(v) => toggleGroup(g.group_id, v)}
                  trackColor={{ true: colors.primary, false: colors.line }}
                  accessibilityLabel={g.name}
                />
              </Row>
            </View>
          );
        })}
      </Card>

      {/* Settled lock explainer */}
      <Card tone="settled">
        <Text style={[type.h2, { color: colors.tones.settled.ink }]}>{t('m.account.lockTitle')}</Text>
        <Text style={[type.body, { marginTop: 6 }]}>{t('m.account.lockBody')}</Text>
      </Card>
    </Screen>
  );
}
