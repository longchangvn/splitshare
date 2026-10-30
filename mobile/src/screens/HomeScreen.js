// Home tab — native port of the web Dashboard home view (web/src/pages/Dashboard.jsx).
// GET /api/v1/me/balances drives everything; balances are netted per currency only,
// never summed across currencies (buildBalance). Badge count kept via setOwedBadge.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { fmt } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, radius, shadow, type } from '../theme';
import { Avatar, Button, Card, ErrText, Screen, Skeleton, SkeletonCard } from '../ui';
import { setOwedBadge } from '../push/notifications';
import { buildBalance, signPrefix, toneForNet } from '../shared/balance';
import { useBalances, fetchActivity } from '../components/home/data';
import { ActivityRow, ActivitySkeleton, Pill, TabHeader } from '../components/home/parts';
import { DEFAULT_CURRENCY, recentGroups, settleStats, statusOf } from '../components/home/homeUtils';

const NET_CHIP = {
  open: { bg: '#fff7ed', fg: '#c2410c' },
  owed: { bg: '#e0f2fe', fg: '#0369a1' },
  settled: { bg: 'rgba(100,116,139,0.1)', fg: '#475569' },
};

export default function HomeScreen({ navigation }) {
  const t = useT();
  const { user } = useAuth() || {};
  const [openPanel, setOpenPanel] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { data, error, refreshing, reload, groups } = useBalances({
    onData: (d) => {
      // Badge = what I owe (kept from the previous Home; a count, not a displayed total).
      const owe = Object.values(d?.totals || {}).reduce((a, x) => a + (x?.owe_cents || 0), 0);
      setOwedBadge(owe);
    },
  });

  const ready = !!data;
  const loading = !data && !error;
  const balance = buildBalance(groups, data?.balance);
  const stats = settleStats(groups);
  const active = settleStats(groups.filter((g) => statusOf(g) === 'opening'));
  const newGroup = () => navigation.navigate('NewGroup');
  const name = user?.display_name || user?.username;

  const onRefresh = () => { reload({ pull: true }); setNonce((n) => n + 1); };

  return (
    <Screen
      contentStyle={{ paddingTop: 12, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <TabHeader
        kicker={name ? t('m.home.hello', { name }) : null}
        title={t('dashboard.title')}
        action={t('dashboard.newGroup')}
        onAction={newGroup}
      />
      {error ? (
        <Card>
          <ErrText e={error} />
          <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('m.retry')} onPress={() => reload()} />
        </Card>
      ) : null}

      {/* My balance — one netted card; tap toggles the per-group breakdown right after it. */}
      <Card
        tone={ready ? balance.tone : undefined}
        onPress={() => setOpenPanel((v) => !v)}
        accessibilityLabel={t('dashboard.myBalance')}
      >
        <View style={s.statTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>{t('dashboard.myBalance')}</Text>
            {loading ? <MoneyShimmer /> : null}
            {ready ? (
              <Text style={[s.value, { color: colors.tones[balance.tone].value }]} numberOfLines={1} adjustsFontSizeToFit>
                {signPrefix(balance.primaryNetCents)}
                {fmt(Math.abs(balance.primaryNetCents), balance.primaryCurrency || DEFAULT_CURRENCY)}
              </Text>
            ) : null}
            <Text style={s.delta}>
              {!ready && error ? '—' : ready && (balance.direction === 'owe'
                ? t('dashboard.balanceOwe')
                : balance.direction === 'owed' ? t('dashboard.balanceOwed') : t('net.settledUp'))}
            </Text>
            {ready && balance.currencyCount > 1 ? (
              <View style={s.chips}>
                {balance.byCurrency.filter((c) => c.currency !== balance.primaryCurrency).map((c) => {
                  const tone = NET_CHIP[toneForNet(c.net_cents)];
                  return (
                    <Pill key={c.currency} label={`${signPrefix(c.net_cents)}${fmt(Math.abs(c.net_cents), c.currency)}`} bg={tone.bg} fg={tone.fg} />
                  );
                })}
              </View>
            ) : null}
          </View>
          <StatIcon tone={ready ? balance.tone : 'settled'} glyph={balance.direction === 'owe' ? '↓' : '↑'} />
        </View>
        <Text style={[s.chevron, openPanel && { transform: [{ rotate: '90deg' }] }]}>›</Text>
      </Card>

      {openPanel ? <BalancePanel groups={balance.groups} onClose={() => setOpenPanel(false)} navigation={navigation} /> : null}

      <View style={s.pair}>
        <Card tone="groups" style={{ flex: 1 }} onPress={() => navigation.navigate('Groups')} accessibilityLabel={t('dashboard.activeGroups')}>
          <Text style={s.kicker}>{t('dashboard.activeGroups')}</Text>
          {loading ? <Skeleton h={32} w="50%" style={{ marginTop: 8 }} /> : null}
          {ready ? <Text style={[s.value, { color: colors.tones.groups.value }]}>{active.total}</Text> : null}
          <Text style={s.delta} numberOfLines={2}>
            {ready ? t('dashboard.settledOpen', { settled: active.settled, open: active.open }) : '…'}
          </Text>
        </Card>
        <Card tone="settled" style={{ flex: 1 }}>
          <Text style={s.kicker}>{t('dashboard.settlement')}</Text>
          <Text style={[s.value, { color: colors.tones.settled.value }]}>{ready ? `${stats.pct}%` : '…'}</Text>
          <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: stats.pct }}>
            <View style={[s.fill, { width: `${ready ? stats.pct : 0}%` }]} />
          </View>
          <Text style={[s.delta, { marginTop: 6 }]} numberOfLines={2}>{t('dashboard.settledGroupsRatio')}</Text>
        </Card>
      </View>

      {loading ? <SkeletonCard /> : <HistoryCard groups={groups} ready={ready} nonce={nonce} navigation={navigation} />}

      <Card>
        <View style={s.cardHead}>
          <Text style={s.kicker}>{t('dashboard.groups')}</Text>
          <Text style={s.link} onPress={() => navigation.navigate('Groups')} accessibilityRole="button">{t('common.viewAll')}</Text>
        </View>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton h={44} /><Skeleton h={44} /><Skeleton h={44} />
          </View>
        ) : null}
        {ready && groups.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Text style={[type.small, { textAlign: 'center' }]}>{t('dashboard.noGroups')}</Text>
            <Button small variant="soft" title={t('dashboard.createGroup')} onPress={newGroup} />
          </View>
        ) : null}
        {ready ? recentGroups(groups, 5).map((g, i, arr) => {
          const detail = g.net_cents < 0
            ? t('net.youOwe', { amount: fmt(-g.net_cents, g.currency) })
            : g.net_cents > 0
              ? t('net.youAreOwed', { amount: fmt(g.net_cents, g.currency) })
              : t('net.settledUp');
          return (
            <Pressable
              key={g.group_id}
              style={({ pressed }) => [s.gRow, i < arr.length - 1 && s.divider, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
              accessibilityRole="button"
              accessibilityLabel={t('common.viewDetailsFor', { name: g.name })}
            >
              <Avatar name={g.name} size={40} rounded={false} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.h3} numberOfLines={1}>{g.name}</Text>
                <Text style={[type.small, g.net_cents < 0 && { color: '#be123c' }, g.net_cents > 0 && { color: '#0369a1' }]} numberOfLines={1}>{detail}</Text>
              </View>
              {g.delinquent ? <Pill label="30d+" bg="#fff4e8" fg="#c2410c" accessibilityLabel={t('m.home.overdue')} /> : null}
              <Text style={s.cur}>{g.currency}</Text>
            </Pressable>
          );
        }) : null}
      </Card>

      <View style={s.banner}>
        <View style={s.bannerIdx}><Text style={s.bannerIdxT}>{ready ? stats.pct : '—'}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerH}>{t('dashboard.settleIndex')}</Text>
          <Text style={s.bannerSub}>
            {stats.total === 0
              ? t('dashboard.settleHint')
              : stats.settled === stats.total
                ? t('dashboard.settleProgressAll', { total: stats.total })
                : t('dashboard.settleProgress', { settled: stats.settled, total: stats.total })}
          </Text>
        </View>
      </View>

      <View style={s.promo}>
        <Text style={s.promoK}>SPLITSHARE</Text>
        <Text style={s.promoH}>{t('dashboard.promoTitle')}</Text>
        <Text style={s.promoSub}>{t('dashboard.promoBody')}</Text>
        <Pressable style={({ pressed }) => [s.promoBtn, pressed && { opacity: 0.85 }]} onPress={newGroup} accessibilityRole="button">
          <Text style={s.promoBtnT}>＋ {t('dashboard.newGroup')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function MoneyShimmer() {
  const t = useT();
  return (
    <View style={{ gap: 6, marginTop: 8 }} accessible accessibilityLabel={t('common.loading')}>
      <Skeleton w="60%" h={30} style={{ borderRadius: 10 }} />
      <Skeleton w="40%" h={12} />
    </View>
  );
}

function StatIcon({ tone, glyph }) {
  const c = colors.tones[tone] || colors.tones.settled;
  return (
    <View style={[s.icon, { backgroundColor: c.icon }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: '800' }}>{glyph}</Text>
    </View>
  );
}

/** Per-open-group optimized transfers that involve me (web BalancePanel). */
function BalancePanel({ groups, onClose, navigation }) {
  const t = useT();
  const empty = groups.length === 0;
  return (
    <Card>
      <View style={s.cardHead}>
        <Text style={s.kicker}>{t('dashboard.balanceByGroup')}</Text>
        <Text style={s.close} onPress={onClose} accessibilityRole="button">{t('dashboard.collapseBreakdown')}</Text>
      </View>
      {empty ? <Text style={type.small}>{t('net.allSettled')}</Text> : null}
      {groups.map((g) => {
        const tone = NET_CHIP[toneForNet(g.net_cents)];
        return (
          <View key={g.group_id} style={{ marginBottom: 6 }}>
            <View style={s.bdGroup}>
              <Text
                style={[type.h3, { flex: 1, color: colors.primaryText }]}
                numberOfLines={1}
                onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}
                accessibilityRole="link"
              >
                {g.name}
              </Text>
              <Pill label={`${signPrefix(g.net_cents)}${fmt(Math.abs(g.net_cents), g.currency)}`} bg={tone.bg} fg={tone.fg} />
            </View>
            {g.transfers.map((x, i) => {
              const other = x.from_me ? x.to_name : x.from_name;
              return (
                <View key={`${x.from_user_id}-${x.to_user_id}`} style={[s.person, i > 0 && { borderTopWidth: 1, borderTopColor: '#f1f6f3' }]}>
                  <Avatar name={other} size={34} />
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                    {x.from_me ? t('dashboard.transferPay', { name: other }) : t('dashboard.transferReceive', { name: other })}
                  </Text>
                  <Text style={[s.amt, { color: x.from_me ? '#c2410c' : '#0369a1' }]}>{fmt(x.amount_cents, g.currency)}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
      {!empty ? <Text style={s.note}>{t('dashboard.optimizedNote')}</Text> : null}
    </Card>
  );
}

/** Latest 5 updates across my groups (web HistoryCard: limit=10 per group). */
function HistoryCard({ groups, ready, nonce, navigation }) {
  const t = useT();
  const [items, setItems] = useState(null);
  const key = groups.map((g) => g.group_id).join(',');
  useEffect(() => {
    if (!ready) return undefined;
    if (groups.length === 0) { setItems([]); return undefined; }
    let cancel = false;
    fetchActivity(groups, 10).then((rows) => { if (!cancel) setItems(rows.slice(0, 5)); });
    return () => { cancel = true; };
  }, [ready, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <View style={s.cardHead}>
        <Text style={s.kicker}>{t('dashboard.activity')}</Text>
        <Text style={s.link} onPress={() => navigation.navigate('Activity')} accessibilityRole="button">{t('common.viewAll')}</Text>
      </View>
      {!items ? <ActivitySkeleton rows={3} /> : null}
      {items && items.length === 0 ? <Text style={type.small}>{t('dashboard.noActivity')}</Text> : null}
      {items ? items.map((a, i) => (
        <ActivityRow
          key={`${a.group_id}-${a.kind}-${a.at}-${i}`}
          item={a}
          last={i === items.length - 1}
          onPress={() => navigation.navigate('GroupDetail', { id: a.group_id })}
        />
      )) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  statTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.secondary },
  value: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginTop: 6 },
  delta: { fontSize: 13, color: colors.body, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chevron: { position: 'absolute', right: 16, bottom: 12, fontSize: 22, color: colors.muted, fontWeight: '700' },
  pair: { flexDirection: 'row', gap: 12 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#e7eeea', overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  link: { color: colors.primaryText, fontWeight: '700', fontSize: 13, paddingVertical: 6, paddingLeft: 8 },
  close: { color: colors.secondary, fontSize: 13, paddingVertical: 6, paddingLeft: 8 },
  gRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#f1f6f3' },
  cur: { fontSize: 12, fontWeight: '700', color: colors.muted },
  bdGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#eef4f1', marginBottom: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  amt: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  note: { marginTop: 10, fontSize: 12, color: colors.muted },
  banner: { backgroundColor: '#102924', borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  bannerIdx: { width: 74, height: 74, borderRadius: 37, borderWidth: 6, borderColor: '#1fa36a', backgroundColor: '#0c211c', alignItems: 'center', justifyContent: 'center' },
  bannerIdxT: { color: '#f4fbf7', fontWeight: '800', fontSize: 18 },
  bannerH: { color: '#f4fbf7', fontWeight: '800', fontSize: 15 },
  bannerSub: { color: '#c3fae8', fontSize: 13, marginTop: 4 },
  promo: { backgroundColor: '#1f8f62', borderRadius: 28, padding: 20, gap: 6, ...shadow.card },
  promoK: { color: '#fff', opacity: 0.8, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  promoH: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 4 },
  promoSub: { color: '#e6fcf5', fontSize: 13 },
  promoBtn: { backgroundColor: '#fff', borderRadius: radius.btn, minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 10 },
  promoBtnT: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
