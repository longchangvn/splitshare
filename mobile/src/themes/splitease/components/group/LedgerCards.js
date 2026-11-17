// SplitEase ledger (features.ledgerByDate): rows as cards grouped under date headings, Material
// category tiles, and my impact (+$x lent / −$x borrowed) from the API's my_share_cents.
// Same data, taps and long-press actions as the classic LedgerTab list.
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../../typography';
import { fmt, displayNameOf } from '../../../../api/client';
import { colors, type, radius, shadow, groupTokens } from '../../../../theme';
import { useT } from '../../../../i18n';
import { categoryLabelForKey } from '../../../../shared/categories';
import { Skeleton } from '../../../../ui';
import { ThemedIcon } from '../../../../components/ThemedIcon';
import { Tile, useDateFmt, p as parts } from '../../../../components/group/parts';
import { dayKeyOf, groupByDay, ledgerImpact } from '../../../../components/group/helpers';

const IMPACT = {
  lent: { sign: '+', color: () => groupTokens.lent, key: 'se.ledger.lent' },
  received: { sign: '+', color: () => groupTokens.lent, key: 'se.ledger.received' },
  borrowed: { sign: '−', color: () => groupTokens.borrowed, key: 'se.ledger.borrowed' },
  paid: { sign: '−', color: () => groupTokens.borrowed, key: 'se.ledger.paid' },
};

export default function LedgerCards({
  items, loading, loaded, currency, members, categories, meId, totals, onOpen, onItemActions, emptyState,
}) {
  const t = useT();
  const d = useDateFmt();
  const today = dayKeyOf(new Date().toISOString());
  const yesterday = dayKeyOf(new Date(Date.now() - 864e5).toISOString());
  const heading = (key, iso) => (key === today ? t('m.expense.today') : key === yesterday ? t('m.expense.yesterday') : d.date(iso));

  if (!loaded && loading) {
    return <View style={[s.card, { gap: 12 }]}>{[0, 1, 2].map((i) => <Skeleton key={i} h={36} />)}</View>;
  }
  if (items.length === 0) return emptyState ? <View style={s.card}>{emptyState}</View> : null;

  return (
    <View style={{ gap: 10 }}>
      {groupByDay(items).map((day) => (
        <View key={day.key || 'unknown'} style={{ gap: 8 }}>
          <Text style={s.day}>{heading(day.key, day.items[0].created_at)}</Text>
          {day.items.map((it) => {
            const isExp = it.kind === 'expense';
            const payer = it.payer_name || displayNameOf(members, it.payer_id);
            const meta = isExp
              ? [it.category ? categoryLabelForKey(it.category, categories, t) : null, t('se.ledger.paidBy', { name: it.payer_id === meId ? t('m.group.you') : payer })].filter(Boolean).join(' · ')
              : `${it.from_name || displayNameOf(members, it.from_user_id)} → ${it.to_name || displayNameOf(members, it.to_user_id)}`;
            const locked = it.status === 'LOCKED';
            const imp = ledgerImpact(it, meId);
            const look = IMPACT[imp.kind];
            return (
              <Pressable
                key={`${it.kind}-${it.id}`}
                onPress={isExp ? () => onOpen(it) : undefined}
                onLongPress={isExp ? () => onItemActions(it) : undefined}
                disabled={!isExp}
                accessibilityRole={isExp ? 'button' : undefined}
                accessibilityLabel={isExp ? t('groupDetail.openItem', { title: it.title }) : undefined}
                style={({ pressed }) => [s.card, (it.reversed || it.excluded) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}
              >
                <View style={s.row}>
                  <Tile item={it} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={[type.h3, s.title, it.reversed && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                      {it.title}{it.reversed ? ` (${t('common.reversed')})` : ''}{it.excluded ? ` (${t('groupDetail.expenseDisabled')})` : ''}
                    </Text>
                    <Text style={parts.meta} numberOfLines={1}>{meta}</Text>
                    <View style={s.tags}>
                      <Text style={[s.chip, locked ? s.chLocked : s.chOpen]}>{locked ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}</Text>
                      {it.has_image ? (
                        <View style={s.tagRow}>
                          <ThemedIcon ms="receipt_long" size={14} color={colors.primaryText} />
                          <Text style={s.tagT}>{t('se.ledger.receipt')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {look ? (
                      <>
                        <Text style={[s.impact, { color: look.color() }]}>{look.sign}{fmt(imp.cents, currency)}</Text>
                        <Text style={[s.impactL, { color: look.color() }]}>{t(look.key)}</Text>
                      </>
                    ) : (
                      <Text style={[s.impact, { color: colors.text }, it.excluded && { textDecorationLine: 'line-through' }]}>{fmt(it.amount_cents, currency)}</Text>
                    )}
                    {look ? <Text style={parts.meta}>{fmt(it.amount_cents, currency)}</Text> : null}
                  </View>
                  {isExp ? (
                    <Pressable
                      onPress={() => onItemActions(it)}
                      hitSlop={8}
                      style={s.more}
                      accessibilityRole="button"
                      accessibilityLabel={t('groupDetail.expenseMore', { title: it.title })}
                    >
                      <ThemedIcon ms="more_vert" size={20} color={colors.secondary} />
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={[s.card, s.row]}>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{t('groupDetail.totalCount', { count: items.length })}</Text>
          {totals.excluded > 0 ? <Text style={parts.meta}>{t('groupDetail.excludedNotCounted', { count: totals.excluded })}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={parts.amount}>{fmt(totals.amount, currency)}</Text>
          <Text style={parts.meta}>{t('groupDetail.mine')} {fmt(totals.mine, currency)}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  day: { ...type.kicker, marginTop: 6, marginLeft: 2 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tagT: { fontSize: 11, fontWeight: '600', color: colors.primaryText },
  chip: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chOpen: { backgroundColor: colors.lightTealBg, color: colors.primaryText },
  chLocked: { backgroundColor: colors.lockedBg, color: colors.lockedText },
  impact: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  impactL: { fontSize: 11, fontWeight: '700' },
  more: { width: 20, height: 32, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
});
