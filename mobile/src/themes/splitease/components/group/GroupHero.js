// SplitEase group header (features.groupHero; Stitch M22/M3): status / role / mode chips,
// "Your group net" figure with an owed / owe chip, member + expense counts, budget tracker.
// Same data as the classic hero + my-net cards; tapping the net opens Settlement.
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../../typography';
import { fmt } from '../../../../api/client';
import { colors, type, radius, shadow, groupTokens } from '../../../../theme';
import { useT } from '../../../../i18n';
import { ThemedIcon } from '../../../../components/ThemedIcon';
import { Bar } from '../../../../components/group/parts';

const MODE_MS = { trip: 'flight', event: 'event', shared: 'home', household: 'home' };

export default function GroupHero({ detail, members, net, currency, lifecycle, settled, expenseCount, version, onOpenSettlement }) {
  const t = useT();
  const [lbg, lfg] = groupTokens.lifecycle[lifecycle] || groupTokens.lifecycle.opening;
  const role = detail.my_role === 'owner' ? t('common.owner') : detail.my_role === 'treasurer' ? t('common.treasurer') : null;
  const tone = net == null ? null : net === 0 ? 'settled' : net < 0 ? 'owe' : 'owed';
  const netColor = tone === 'owe' ? colors.danger : colors.primary;
  const chipTone = tone ? colors.kind[tone] : null;
  const budget = detail.budget;

  return (
    <>
      <Pressable
        onPress={onOpenSettlement}
        accessibilityRole="button"
        accessibilityLabel={t('settlement.viewDetails')}
        style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
      >
        <View style={s.chips}>
          <View style={[s.chip, { backgroundColor: lbg }]}>
            <View style={[s.dot, { backgroundColor: lfg }]} />
            <Text style={[s.chipT, { color: lfg }]}>{t(`groupStatus.${lifecycle}`)}</Text>
          </View>
          {role ? (
            <View style={[s.chip, { backgroundColor: groupTokens.roleTone.treasurer[0] }]}>
              <ThemedIcon ms="verified_user" size={14} color={groupTokens.roleTone.treasurer[1]} />
              <Text style={[s.chipT, { color: groupTokens.roleTone.treasurer[1] }]}>{role}</Text>
            </View>
          ) : null}
          {detail.mode && detail.mode !== 'shared' ? (
            <View style={[s.chip, { backgroundColor: colors.chipBg }]}>
              <ThemedIcon ms={MODE_MS[detail.mode] || 'groups'} size={14} color={colors.body} />
              <Text style={[s.chipT, { color: colors.body }]}>{detail.mode}</Text>
            </View>
          ) : null}
          {settled != null ? (
            <View style={[s.chip, { backgroundColor: settled ? colors.kind.settled[0] : colors.openBg }]}>
              <Text style={[s.chipT, { color: settled ? colors.kind.settled[1] : colors.openText }]}>
                {settled ? t('settlement.statusSettled') : t('settlement.statusOpen')}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={s.netRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.kicker}>{t('se.group.yourNet')}</Text>
            {net != null ? (
              <View style={s.figureRow}>
                <Text style={[s.figure, { color: netColor }]}>
                  {net === 0 ? fmt(0, currency) : `${net > 0 ? '+' : '−'}${fmt(Math.abs(net), currency)}`}
                </Text>
                {chipTone ? (
                  <Text style={[s.netChip, { backgroundColor: chipTone[0], color: chipTone[1] }]}>
                    {net === 0 ? t('net.settledUp') : net < 0 ? t('net.youOweShort') : t('net.youreOwed')}
                  </Text>
                ) : null}
              </View>
            ) : <Text style={[s.figure, { color: colors.muted }]}>—</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={type.small}>{t('groupDetail.membersCount', { count: members.length, unit: members.length === 1 ? t('common.person') : t('common.people') })}</Text>
            {expenseCount != null ? <Text style={type.h3}>{t('groupDetail.tabExpensesCount', { count: expenseCount })}</Text> : null}
            {version != null ? <Text style={type.small}>{t('report.settlementVer', { version })}</Text> : null}
          </View>
        </View>
      </Pressable>

      {budget ? (
        <View style={s.card}>
          <View style={s.budgetHead}>
            <ThemedIcon ms="savings" size={20} color={colors.primary} />
            <Text style={[type.h3, { flex: 1 }]}>{t('groupDetail.budget')}</Text>
            <Text style={[s.netChip, budget.over || budget.alert ? { backgroundColor: colors.debtorBg, color: colors.debtorText } : { backgroundColor: colors.kind.settled[0], color: colors.kind.settled[1] }]}>
              {budget.over ? t('groupDetail.budgetOver') : budget.alert ? t('groupDetail.budgetNear') : t('groupDetail.budgetOnTrack')} · {budget.pct}%
            </Text>
          </View>
          <View style={s.figureRow}>
            <Text style={s.budgetFig}>{fmt(budget.spent_cents, currency)}</Text>
            <Text style={type.small}>/ {fmt(budget.budget_cents, currency)}</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <Bar value={budget.pct} color={budget.over ? colors.danger : budget.alert ? groupTokens.warnDot : colors.primary} />
          </View>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, ...shadow.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipT: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  netRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  figureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  figure: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  netChip: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  budgetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  budgetFig: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
});
