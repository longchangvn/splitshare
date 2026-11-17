// SplitEase "Member balances" carousel (features.memberCarousel; Stitch M22): one card per other
// member with what they owe me / I owe them in the current settlement plan. Actions reuse the
// group's existing nudge and Pay flows.
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../../../../typography';
import { fmt } from '../../../../api/client';
import { colors, type, radius, shadow, groupTokens } from '../../../../theme';
import { useT } from '../../../../i18n';
import { Avatar, Button } from '../../../../ui';
import { ThemedIcon } from '../../../../components/ThemedIcon';

/** Per-member amounts from the optimised transfers: owesMe / iOwe (+ the transfer to pay). */
function balancesFor(members, transfers, meId) {
  return members.filter((m) => m.user_id !== meId && !m.removed).map((m) => {
    let owesMe = 0;
    let iOwe = 0;
    let payTransfer = null;
    for (const x of transfers || []) {
      if (x.from_user_id === m.user_id && x.to_user_id === meId) owesMe += x.amount_cents || 0;
      if (x.from_user_id === meId && x.to_user_id === m.user_id) { iOwe += x.amount_cents || 0; payTransfer = payTransfer || x; }
    }
    return { m, owesMe, iOwe, payTransfer };
  });
}

export default function MemberBalances({ members, transfers, meId, currency, canWrite, nudging, onNudge, onPay, onInvite }) {
  const t = useT();
  const rows = balancesFor(members, transfers, meId);
  if (rows.length === 0) return null;
  const roleLabel = (r) => (r === 'owner' ? t('common.owner') : r === 'treasurer' ? t('common.treasurer') : null);
  return (
    <View style={{ gap: 8 }}>
      <View style={s.head}>
        <ThemedIcon ms="groups" size={22} color={colors.text} />
        <Text style={[type.h1, { flex: 1 }]}>{t('se.group.memberBalances')}</Text>
        {onInvite ? (
          <Text style={s.link} onPress={onInvite} accessibilityRole="button">{t('groupDetail.inviteMembers')}</Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {rows.map(({ m, owesMe, iOwe, payTransfer }) => {
          const name = m.display_name || m.username;
          const role = roleLabel(m.role);
          const [rbg, rfg] = groupTokens.roleTone[m.role] || groupTokens.roleTone.member;
          return (
            <View key={m.user_id} style={s.card}>
              <View style={s.top}>
                <Avatar name={name} size={40} />
                {role ? <Text style={[s.role, { backgroundColor: rbg, color: rfg }]}>{role}</Text> : null}
              </View>
              <Text style={[type.h3, { marginTop: 8 }]} numberOfLines={1}>{name}</Text>
              {owesMe > 0 ? (
                <Text style={[s.amt, { color: groupTokens.lent }]} numberOfLines={1}>{t('se.group.owesYou', { amount: fmt(owesMe, currency) })}</Text>
              ) : iOwe > 0 ? (
                <Text style={[s.amt, { color: groupTokens.borrowed }]} numberOfLines={1}>{t('se.group.youOweThem', { amount: fmt(iOwe, currency) })}</Text>
              ) : (
                <Text style={[s.amt, { color: colors.secondary }]}>{t('common.settled')}</Text>
              )}
              <View style={{ marginTop: 10 }}>
                {owesMe > 0 ? (
                  <Button small variant="ghost" title={t('groupDetail.nudge')} disabled={nudging === m.user_id || !canWrite} onPress={() => onNudge(m.user_id, name)} />
                ) : iOwe > 0 ? (
                  <Button small variant="brand" title={t('se.group.payName', { name })} disabled={!canWrite} onPress={() => onPay(payTransfer)} />
                ) : (
                  <View style={s.settled}>
                    <ThemedIcon ms="check_circle" size={16} color={colors.primary} />
                    <Text style={s.settledT}>{t('net.settledUp')}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  link: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  card: { width: 190, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, ...shadow.card },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  role: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  amt: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  settled: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.btn, backgroundColor: colors.lightTealBg },
  settledT: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
});
