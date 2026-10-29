// Balances tab — web BalancesPanel: debtors grouped with their transfers, Nudge + Pay.
import React from 'react';
import { View, Text } from 'react-native';
import { fmt, displayNameOf } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { Card, Avatar, Button, Row, Empty } from '../../ui';
import { ListRow, TextAction, p as parts } from './parts';

export default function BalancesTab({ byDebtor, debtors, members, currency, meId, onNudge, onPay, nudging, canWrite }) {
  const t = useT();
  if (byDebtor.length === 0 && debtors.length === 0) {
    return <Empty emoji="🎉" title={t('net.allSettled')} sub={t('groupDetail.allSettledNobody')} />;
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={type.h2}>{t('groupDetail.whoOwes')}</Text>
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
    </View>
  );
}
