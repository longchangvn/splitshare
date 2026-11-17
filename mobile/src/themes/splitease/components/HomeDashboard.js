// SplitEase Home body (Stitch M32 "Dashboard"): net-balance summary with owe / owed tiles
// and Settle up, horizontal "Active groups" cards, recent activity as card rows and
// quick-action pills. Data comes from HomeScreen (GET /me/balances); nothing new is fetched
// except the same per-group activity the classic Home loads.
import React, { useEffect, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../../../typography';
import { fmt } from '../../../api/client';
import { useT } from '../../../i18n';
import { colors, radius, shadow, type } from '../../../theme';
import { Badge, Button, Card, ErrText, Skeleton, SkeletonCard } from '../../../ui';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { signPrefix } from '../../../shared/balance';
import { fetchActivity } from '../../../components/home/data';
import { ActivitySkeleton, KIND_MS, whenShort } from '../../../components/home/parts';
import { DEFAULT_CURRENCY, kindKey, recentGroups, statusOf } from '../../../components/home/homeUtils';
import { IconTile, MINT, GREY } from './IconTile';
import { NetChip } from './NetChip';

export default function HomeDashboard({ navigation, data, error, ready, loading, groups, balance, reload, nonce, name }) {
  const t = useT();
  const [picker, setPicker] = useState(false);
  const currency = balance.primaryCurrency || DEFAULT_CURRENCY;
  const totals = data?.totals?.[currency] || data?.totals?.[currency.toLowerCase()] || {};
  const settleable = balance.groups; // groups where my net ≠ 0
  const active = recentGroups(groups.filter((g) => statusOf(g) === 'opening'), 10);
  const amountColor = balance.direction === 'owe' ? colors.danger : balance.direction === 'owed' ? colors.primary : colors.text;

  const settleUp = () => {
    if (settleable.length === 1) navigation.navigate('Settlement', { id: settleable[0].group_id });
    else setPicker((v) => !v);
  };

  return (
    <>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.brand} numberOfLines={1}>{name ? t('m.home.hello', { name }) : t('shell.brand')}</Text>
          <Text style={type.title} accessibilityRole="header" numberOfLines={1}>{t('dashboard.title')}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.roundBtn, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate('NewGroup')}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.newGroup')}
          hitSlop={4}
        >
          <ThemedIcon ms="group_add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {error ? (
        <Card>
          <ErrText e={error} />
          <Button small variant="ghost" style={{ marginTop: 8, alignSelf: 'flex-start' }} title={t('m.retry')} onPress={() => reload()} />
        </Card>
      ) : null}

      {/* Net balance summary */}
      <Card style={s.summary}>
        <View style={s.sumHead}>
          <ThemedIcon ms="account_balance" size={20} color={colors.body} />
          <Text style={s.sumTitle}>{t('se.home.netSummary')}</Text>
        </View>
        <Text style={s.kicker}>
          {!ready ? ' ' : balance.direction === 'owe' ? t('dashboard.balanceOwe') : balance.direction === 'owed' ? t('dashboard.balanceOwed') : t('net.settledUp')}
        </Text>
        {loading ? <Skeleton w="60%" h={40} style={{ marginTop: 6, borderRadius: 10 }} /> : null}
        {ready ? (
          <View style={s.amountRow}>
            <Text style={[s.amount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {signPrefix(balance.primaryNetCents)}{fmt(Math.abs(balance.primaryNetCents), currency)}
            </Text>
            <Text style={s.cur}>{currency}</Text>
          </View>
        ) : null}
        {ready && balance.currencyCount > 1 ? (
          <View style={s.chips}>
            {balance.byCurrency.filter((c) => c.currency !== currency).map((c) => (
              <NetChip key={c.currency} cents={c.net_cents} currency={c.currency} />
            ))}
          </View>
        ) : null}
        <View style={s.tiles}>
          <View style={s.tile}>
            <View style={s.tileHead}>
              <ThemedIcon ms="north_east" size={16} color={colors.danger} />
              <Text style={[s.tileK, { color: colors.danger }]}>{t('net.youOweShort')}</Text>
            </View>
            <Text style={[s.tileV, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>
              {ready ? fmt(totals.owe_cents || 0, currency) : '…'}
            </Text>
          </View>
          <View style={s.tile}>
            <View style={s.tileHead}>
              <ThemedIcon ms="south_west" size={16} color={colors.primary} />
              <Text style={[s.tileK, { color: colors.primary }]}>{t('net.owedToYou')}</Text>
            </View>
            <Text style={[s.tileV, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              {ready ? fmt(totals.owed_cents || 0, currency) : '…'}
            </Text>
          </View>
        </View>
        <Button
          style={{ marginTop: 14 }}
          variant="brand"
          title={t('se.home.settleUp')}
          disabled={!ready || settleable.length === 0}
          onPress={settleUp}
        />
        {picker && settleable.length > 1 ? (
          <View style={s.picker}>
            <Text style={s.pickerT}>{t('se.home.chooseGroup')}</Text>
            {settleable.map((g) => (
              <Pressable
                key={g.group_id}
                style={({ pressed }) => [s.pickRow, pressed && { opacity: 0.7 }]}
                onPress={() => { setPicker(false); navigation.navigate('Settlement', { id: g.group_id }); }}
                accessibilityRole="button"
                accessibilityLabel={g.name}
              >
                <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                <NetChip cents={g.net_cents} currency={g.currency} />
                <ThemedIcon ms="chevron_right" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Active groups */}
      <View style={s.secRow}>
        <Text style={s.secT}>{t('dashboard.activeGroups')}</Text>
        <Pressable onPress={() => navigation.navigate('Groups')} accessibilityRole="button" hitSlop={8} style={s.linkRow}>
          <Text style={s.link}>{t('common.viewAll')}</Text>
          <ThemedIcon ms="chevron_right" size={18} color={colors.primary} />
        </Pressable>
      </View>
      {loading ? <SkeletonCard /> : null}
      {ready && active.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
          <IconTile ms="groups" size={48} />
          <Text style={[type.small, { textAlign: 'center' }]}>{t('dashboard.noGroups')}</Text>
          <Button small variant="soft" title={t('dashboard.createGroup')} onPress={() => navigation.navigate('NewGroup')} />
        </Card>
      ) : null}
      {ready && active.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hContent}>
          {active.map((g) => <GroupCard key={g.group_id} group={g} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })} />)}
        </ScrollView>
      ) : null}

      {/* Recent activity */}
      <View style={s.secRow}>
        <Text style={s.secT}>{t('se.home.recentActivity')}</Text>
      </View>
      <RecentActivity groups={groups} ready={ready} nonce={nonce} navigation={navigation} />

      <View style={s.pills}>
        <Pressable
          style={({ pressed }) => [s.pill, s.pillGhost, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate('Activity')}
          accessibilityRole="button"
        >
          <ThemedIcon ms="history" size={18} color={colors.text} />
          <Text style={[s.pillT, { color: colors.text }]}>{t('se.home.fullHistory')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.pill, s.pillBrand, pressed && { opacity: 0.85 }]}
          onPress={() => navigation.navigate('QuickAdd')}
          accessibilityRole="button"
        >
          <ThemedIcon ms="edit_note" size={18} color="#fff" />
          <Text style={[s.pillT, { color: '#fff' }]}>{t('m.fab.addExpense')}</Text>
        </Pressable>
      </View>
    </>
  );
}

function GroupCard({ group, onPress }) {
  const t = useT();
  const members = Number(group.member_count) || 0;
  const net = Number(group.net_cents) || 0;
  const status = net > 0 ? t('se.home.youGetBack') : net < 0 ? t('se.home.youOweShort') : t('se.home.allEven');
  return (
    <Pressable
      style={({ pressed }) => [s.gCard, pressed && { opacity: 0.88 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.viewDetailsFor', { name: group.name })}
    >
      <View style={s.gTop}>
        <IconTile ms="groups" size={48} tone={MINT} />
        <NetChip cents={net} currency={group.currency} />
      </View>
      <Text style={s.gName} numberOfLines={1}>{group.name}</Text>
      <Text style={type.small} numberOfLines={1}>
        {t('groupDetail.membersCount', { count: members, unit: members === 1 ? t('common.person') : t('common.people') })} · {status}
      </Text>
      <View style={s.gFoot}>
        <Text style={s.gSpend} numberOfLines={1}>{fmt(Number(group.spent_cents) || 0, group.currency)}</Text>
        <ThemedIcon ms="arrow_forward" size={20} color={colors.text} />
      </View>
    </Pressable>
  );
}

function RecentActivity({ groups, ready, nonce, navigation }) {
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

  if (!items) return <Card><ActivitySkeleton rows={3} /></Card>;
  if (items.length === 0) return <Card><Text style={type.small}>{t('dashboard.noActivity')}</Text></Card>;
  return items.map((a, i) => {
    const k = kindKey(a.kind);
    const label = k === 'other' ? String(a.kind || '').toLowerCase() : t(`activity.kind.${k}`);
    const meta = `${whenShort(a.at)} · ${a.group_name || ''}`;
    return (
      <Pressable
        key={`${a.group_id}-${a.kind}-${a.at}-${i}`}
        style={({ pressed }) => [s.aRow, pressed && { opacity: 0.85 }]}
        onPress={() => navigation.navigate('GroupDetail', { id: a.group_id })}
        accessibilityRole="button"
        accessibilityLabel={`${a.text || ''}. ${meta}`}
      >
        <IconTile ms={KIND_MS[k]} size={48} tone={k === 'payment' || k === 'join' ? MINT : GREY} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.aText} numberOfLines={2}>{a.text}</Text>
          <Text style={type.small} numberOfLines={1}>{meta}</Text>
        </View>
        <Badge kind={k === 'other' ? 'comment' : k} label={label} />
      </Pressable>
    );
  });
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  brand: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 0.6, textTransform: 'uppercase' },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  summary: { padding: 20 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sumTitle: { fontSize: 14, fontWeight: '600', color: colors.body },
  kicker: { ...type.kicker, marginTop: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 },
  amount: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, flexShrink: 1 },
  cur: { fontSize: 14, fontWeight: '700', color: colors.secondary, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: colors.inputBg, borderRadius: radius.tile, padding: 12, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileK: { fontSize: 13, fontWeight: '600' },
  tileV: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  picker: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  pickerT: { ...type.kicker, marginBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  secT: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  hScroll: { marginHorizontal: -16 },
  hContent: { paddingHorizontal: 16, gap: 12, paddingBottom: 6 },
  gCard: { width: 240, backgroundColor: colors.card, borderRadius: radius.card, padding: 16, gap: 4, ...shadow.card },
  gTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  gName: { fontSize: 18, fontWeight: '700', color: colors.text },
  gFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  gSpend: { fontSize: 14, fontWeight: '700', color: colors.body },
  aRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius.card, padding: 14, ...shadow.card },
  aText: { fontSize: 15, fontWeight: '700', color: colors.text },
  pills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999 },
  pillGhost: { backgroundColor: colors.card, ...shadow.card },
  pillBrand: { backgroundColor: colors.primary, ...shadow.fab },
  pillT: { fontSize: 14, fontWeight: '700' },
});
