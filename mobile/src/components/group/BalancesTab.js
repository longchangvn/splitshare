// Balances tab — web BalancesPanel: debtors grouped with their transfers, Nudge + Pay,
// plus the raw owe section (accumulated pairwise debts before optimization).
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { fmt, displayNameOf } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { groupRawDebts } from '../../shared/expenseToggle';
import { Card, Avatar, Button, Row, Empty } from '../../ui';
import { ListRow, TextAction, p as parts } from './parts';

export default function BalancesTab({ byDebtor, debtors, rawDebts, members, currency, meId, onNudge, onPay, nudging, canWrite }) {
  const t = useT();
  const raw = useMemo(() => groupRawDebts(rawDebts), [rawDebts]);
  if (byDebtor.length === 0 && debtors.length === 0 && raw.length === 0) {
    return <Empty emoji="🎉" title={t('net.allSettled')} sub={t('groupDetail.allSettledNobody')} />;
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={type.h2}>{t('groupDetail.whoOwes')}</Text>
      {byDebtor.length === 0 && debtors.length === 0 ? (
        <Text style={type.small}>{t('groupDetail.allSettledNobody')}</Text>
      ) : null}
      {byDebtor.map(([from, list]) => {
        const name = displayNameOf(members, from);
        return (
          <Card key={from}>
            <Row>
              <Avatar name={name} size={34} />
              <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{t('groupDetail.owes', { name })}</Text>
              {from !== meId ? (
                <TextAction label={t('groupDetail.nudge')} disabled={nudging === from || !canWrite} onPress={() => onNudge(from, name)} />
              ) : null}
            </Row>
            <View style={{ marginTop: 6 }}>
              {list.map((x, i) => (
                <ListRow key={`${x.to_user_id}-${i}`} last={i === list.length - 1} style={{ paddingVertical: 8 }}>
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>→ {displayNameOf(members, x.to_user_id)}</Text>
                  <Text style={parts.amount}>{fmt(x.amount_cents, currency)}</Text>
                  <Button small variant="pay" title={t('groupDetail.pay')} disabled={!canWrite} onPress={() => onPay(x)} />
                </ListRow>
              ))}
            </View>
          </Card>
        );
      })}
      {byDebtor.length === 0 && debtors.map((m) => {
        const name = m.display_name || displayNameOf(members, m.user_id);
        return (
          <Card key={m.user_id}>
            <Row>
              <Avatar name={name} size={34} />
              <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{t('groupDetail.owes', { name })}</Text>
              <Text style={[parts.amount, { color: colors.debtorText }]}>{fmt(m.owe_cents, currency)}</Text>
              {m.user_id !== meId ? (
                <TextAction label={t('groupDetail.nudge')} disabled={nudging === m.user_id || !canWrite} onPress={() => onNudge(m.user_id, name)} />
              ) : null}
            </Row>
          </Card>
        );
      })}

      {Array.isArray(rawDebts) ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={type.h2}>{t('groupDetail.rawOweTitle')}</Text>
          <Text style={type.small}>{t('groupDetail.rawOweHint')}</Text>
          {raw.length === 0 ? <Text style={type.small}>{t('groupDetail.rawOweEmpty')}</Text> : null}
          {raw.map((g) => {
            const name = g.from_name || displayNameOf(members, g.from_user_id);
            return (
              <Card key={g.from_user_id}>
                <Row>
                  <Avatar name={name} size={34} />
                  <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{t('groupDetail.owes', { name })}</Text>
                  <Text style={parts.amount}>{t('groupDetail.rawOweTotal', { amount: fmt(g.total_cents, currency) })}</Text>
                </Row>
                <View style={{ marginTop: 6 }}>
                  {g.items.map((x, i) => (
                    <ListRow key={x.to_user_id} last={i === g.items.length - 1} style={{ paddingVertical: 8 }}>
                      <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>→ {x.to_name || displayNameOf(members, x.to_user_id)}</Text>
                      <Text style={parts.amount}>{fmt(x.amount_cents, currency)}</Text>
                    </ListRow>
                  ))}
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
