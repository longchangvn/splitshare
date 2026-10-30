// Presentational pieces for Home / Groups / Activity / New group — native
// versions of web Dashboard.jsx GroupTile, ActivityKindThumb, activity rows,
// groups filter chips and the wizard pick/unpick row.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, shadow, type } from '../../theme';
import { GroupThumb, Skeleton } from '../../ui';
import { fmt } from '../../api/client';
import { useT } from '../../i18n';
import { groupNeedsSettlement, kindKey, statusOf } from './homeUtils';

const KIND_THUMB = {
  join: ['#e8faf0', '#0c7a4b'],
  expense: ['#fff6e8', '#b45309'],
  payment: ['#eaf5fc', '#0369a1'],
  comment: ['#f2f5f3', '#3d4a45'],
  nudge: ['#fff3ed', '#c2410c'],
  other: ['#f2f5f3', '#4a5651'],
};

export const LIFECYCLE = {
  opening: { dot: '#12b886', ink: '#087f5b' },
  locked: { dot: '#eab308', ink: '#a16207' },
  closed: { dot: '#ef4444', ink: '#b42318' },
};

/** Big tab-screen header: optional kicker, title, sub line and an ink pill action. */
export function TabHeader({ kicker, title, sub, action, onAction }) {
  return (
    <View style={p.head}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <Text style={p.kicker} numberOfLines={1}>{kicker}</Text> : null}
        <Text style={type.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[type.small, { marginTop: 2 }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable
          style={({ pressed }) => [p.cta, pressed && { opacity: 0.85 }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
        >
          <Text style={p.ctaT}>＋ {action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Soft square kind mark with a short uppercase label (web ActivityKindThumb). */
export function KindThumb({ kind, size = 46 }) {
  const t = useT();
  const key = kindKey(kind);
  const raw = String(kind || 'other').toLowerCase();
  const [bg, fg] = KIND_THUMB[key];
  const label = key === 'other' ? raw.slice(0, 4).toUpperCase() : t(`activity.kindShort.${key}`);
  const full = key === 'other' ? raw : t(`activity.kind.${key}`);
  return (
    <View style={[p.thumb, { width: size, height: size, backgroundColor: bg }]} accessibilityLabel={full}>
      <Text style={[p.thumbT, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function whenShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return d.toDateString(); }
}

export function whenLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try { return d.toLocaleString(); } catch { return d.toString(); }
}

/** One activity row: kind thumb, server text, "group · when". */
export function ActivityRow({ item, onPress, long = false, last = false }) {
  const meta = `${item.group_name || ''} · ${long ? whenLong(item.at) : whenShort(item.at)}`;
  return (
    <Pressable
      style={({ pressed }) => [p.actRow, !last && p.actDivider, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.text || ''}. ${meta}`}
    >
      <KindThumb kind={item.kind} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={p.actText} numberOfLines={2}>{item.text}</Text>
        <Text style={p.actMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <Text style={p.chev}>›</Text>
    </Pressable>
  );
}

export function ActivitySkeleton({ rows = 3 }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Skeleton w={46} h={46} style={{ borderRadius: 14 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton w="80%" h={12} />
            <Skeleton w="45%" h={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Small coloured pill. */
export function Pill({ label, bg, fg, style, accessibilityLabel }) {
  return <Text style={[p.pill, { backgroundColor: bg, color: fg }, style]} numberOfLines={1} accessibilityLabel={accessibilityLabel}>{label}</Text>;
}

/** Groups board tile (web GroupTile): cover band + meta pills, name, status, personal net, total spend. */
export function GroupTile({ group, onPress }) {
  const t = useT();
  const needs = groupNeedsSettlement(group);
  const tone = needs ? colors.tones.open : colors.tones.settled;
  const personalTone = group.net_cents < 0 ? 'owe' : group.net_cents > 0 ? 'owed' : null;
  const personalLabel = personalTone === 'owe'
    ? t('net.youOwe', { amount: fmt(-group.net_cents, group.currency) })
    : personalTone === 'owed'
      ? t('net.youAreOwed', { amount: fmt(group.net_cents, group.currency) })
      : null;
  const members = Number(group.member_count) || 0;
  const lifecycle = statusOf(group);
  const lc = LIFECYCLE[lifecycle] || LIFECYCLE.opening;
  return (
    <Pressable
      style={({ pressed }) => [p.tile, pressed && { opacity: 0.88 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.viewDetailsFor', { name: group.name })}
    >
      <View style={p.tileTop}>
        <GroupThumb name={group.name} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={p.metaRow}>
            {group.my_role === 'owner' ? <Pill label={t('common.owner')} bg="#e8f7ef" fg="#0c7a4b" /> : null}
            <View style={p.lcPill}>
              <View style={[p.dot, { backgroundColor: lc.dot }]} />
              <Text style={[p.lcT, { color: lc.ink }]}>{t(`groupStatus.${lifecycle}`)}</Text>
            </View>
            {group.member_count != null ? (
              <Pill
                label={t('groupDetail.membersCount', { count: members, unit: members === 1 ? t('common.person') : t('common.people') })}
                bg={colors.chipBg}
                fg={colors.secondary}
              />
            ) : null}
            {group.delinquent ? <Pill label="30d+" bg="#fff4e8" fg="#c2410c" accessibilityLabel={t('m.home.overdue')} /> : null}
          </View>
          <Text style={p.tileName} numberOfLines={2}>{group.name}</Text>
        </View>
      </View>
      <View style={p.metaRow}>
        <Pill label={needs ? t('settlement.statusOpen') : t('settlement.statusSettled')} bg={tone.bg} fg={tone.ink} />
        {personalLabel ? (
          <Text style={[p.personal, { color: personalTone === 'owe' ? '#be123c' : '#0369a1' }]} numberOfLines={1}>{personalLabel}</Text>
        ) : null}
      </View>
      <View style={p.tileFoot}>
        <View>
          <Text style={p.footK}>{t('groups.totalSpend')}</Text>
          <Text style={p.footV}>{fmt(Number(group.spent_cents) || 0, group.currency)}</Text>
        </View>
        <View style={p.go}><Text style={p.goT}>›</Text></View>
      </View>
    </Pressable>
  );
}

export function GroupTileSkeleton() {
  return (
    <View style={p.tile}>
      <View style={p.tileTop}>
        <Skeleton w={48} h={48} style={{ borderRadius: 14 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton w="50%" h={12} />
          <Skeleton w="75%" h={16} />
        </View>
      </View>
      <Skeleton w="40%" h={12} />
      <Skeleton w="30%" h={18} />
    </View>
  );
}

/** Status filter chip with coloured dot + count (web groups-filter-chip). */
export function StatusChip({ status, label, count, on, onPress }) {
  const lc = LIFECYCLE[status] || LIFECYCLE.opening;
  return (
    <Pressable
      style={[p.fChip, on && p.fChipOn]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!on }}
      accessibilityLabel={`${label} ${count}`}
    >
      <View style={[p.dot, { backgroundColor: lc.dot }]} />
      <Text style={[p.fChipT, on && { color: '#fff' }]}>{label}</Text>
      <Text style={[p.fCount, on && { backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff' }]}>{count}</Text>
    </Pressable>
  );
}

/** Wizard pick/unpick row shared by search results and the contacts box. */
export function PersonRow({ person, on, onToggle, last }) {
  const t = useT();
  return (
    <View style={[p.person, !last && p.actDivider]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.h3} numberOfLines={1}>{person.display_name}</Text>
        {person.username ? <Text style={type.small} numberOfLines={1}>@{person.username}</Text> : null}
      </View>
      <Pressable
        style={[p.pick, on && p.pickOn]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ selected: !!on }}
        accessibilityLabel={`${on ? t('common.added') : t('common.add')} ${person.display_name}`}
        hitSlop={6}
      >
        <Text style={[p.pickT, on && { color: '#fff' }]}>{on ? t('common.added') : t('common.add')}</Text>
      </Pressable>
    </View>
  );
}

export const p = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  kicker: { fontSize: 13, fontWeight: '600', color: colors.secondary, marginBottom: 2 },
  cta: { backgroundColor: colors.ink, borderRadius: radius.btn, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
  ctaT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  thumb: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  thumbT: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  actDivider: { borderBottomWidth: 1, borderBottomColor: '#f1f6f3' },
  actText: { fontSize: 14, fontWeight: '600', color: colors.text },
  actMeta: { fontSize: 12, color: '#8a938f', marginTop: 2 },
  chev: { fontSize: 20, color: colors.muted, fontWeight: '600' },
  pill: { fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  tile: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12, ...shadow.card },
  tileTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  lcPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  lcT: { fontSize: 11, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tileName: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  personal: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  tileFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eef4f1', paddingTop: 10 },
  footK: { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  footV: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  go: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  goT: { fontSize: 18, color: colors.body, fontWeight: '700', marginTop: -2 },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0e8e4', borderRadius: 999, backgroundColor: '#fff' },
  fChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  fChipT: { fontSize: 13, fontWeight: '600', color: colors.body },
  fCount: { fontSize: 11, fontWeight: '800', color: colors.secondary, backgroundColor: '#eef2f0', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 48 },
  pick: { borderWidth: 1, borderColor: '#e4ebe7', backgroundColor: '#f7f8f7', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  pickOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pickT: { fontSize: 14, fontWeight: '600', color: '#3a3a3c' },
});
