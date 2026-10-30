// Activity tab — web GroupDetail "activity" panel: payments + activity entries, newest first,
// paginated (10/page), reverse payment (owner/treasurer, within 24h) with confirm.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fmt, displayNameOf } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { Card, Button, Row, ConfirmSheet, Skeleton } from '../../ui';
import { ListRow, TextAction, useDateFmt, p as parts } from './parts';
import { paginate, canReversePayment } from './helpers';

export default function ActivityTab({ feed, loading, detail, members, currency, onRefresh, onReverse }) {
  const t = useT();
  const d = useDateFmt();
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(null);
  const [busy, setBusy] = useState(false);
  const pg = paginate(feed, page);

  const kindChip = (kind) => {
    const [bg, fg] = colors.kind[kind] || colors.kind.comment;
    const k = `activity.kindShort.${kind}`;
    const label = t(k) === k ? String(kind || '').toUpperCase().slice(0, 5) : t(k);
    return <View style={[s.thumb, { backgroundColor: bg }]}><Text style={[s.thumbT, { color: fg }]}>{label}</Text></View>;
  };

  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text style={type.h2}>{t('groupDetail.tabActivity')}</Text>
          <Text style={type.small}>{t('groupDetail.transfersUpdates')} · {t('groupDetail.newestFirst')}</Text>
        </View>
        <TextAction label={t('common.refresh')} onPress={onRefresh} disabled={loading} />
      </Row>
      <Card style={{ paddingVertical: 4 }}>
        {loading && feed.length === 0 ? (
          <View style={{ gap: 12, paddingVertical: 12 }}><Skeleton h={36} /><Skeleton h={36} /></View>
        ) : null}
        {!loading && feed.length === 0 ? (
          <Text style={[type.small, { paddingVertical: 16, textAlign: 'center' }]}>{t('groupDetail.activityEmpty')}</Text>
        ) : null}
        {pg.items.map((row, i) => {
          const last = i === pg.items.length - 1;
          if (row.payment) {
            const p = row.payment;
            const from = p.from_name || (p.from_user_id ? displayNameOf(members, p.from_user_id) : t('activity.someone'));
            const to = p.to_name || (p.to_user_id ? displayNameOf(members, p.to_user_id) : t('activity.someone'));
            const meta = [
              d.dateTime(p.created_at),
              p.reversed ? t('common.reversed') : null,
              p.status && String(p.status).toUpperCase() !== 'OPEN' ? t('groupDetail.statusLocked') : null,
            ].filter(Boolean).join(' · ');
            return (
              <ListRow key={row.key} last={last} style={p.reversed ? { opacity: 0.55 } : null}>
                {kindChip('payment')}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.h3} numberOfLines={1}>{from} → {to}</Text>
                  <Text style={parts.meta} numberOfLines={1}>{meta}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={parts.amount}>{fmt(p.amount_cents, currency)}</Text>
                  {canReversePayment(p, detail) ? (
                    <TextAction danger label={t('groupDetail.reverse')} onPress={() => setRev({ ...p, from, to })} />
                  ) : null}
                </View>
              </ListRow>
            );
          }
          const a = row.activity;
          return (
            <ListRow key={row.key} last={last}>
              {kindChip(a.kind)}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.body} numberOfLines={3}>{a.text}</Text>
                <Text style={parts.meta}>{d.dateTime(a.at)}</Text>
              </View>
            </ListRow>
          );
        })}
      </Card>
      {pg.count > 1 ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Button small variant="ghost" title={t('common.prev')} disabled={pg.page <= 1} onPress={() => setPage(pg.page - 1)} />
          <Text style={type.small}>{t('activity.range', { from: pg.from, to: pg.to, total: feed.length })}</Text>
          <Button small variant="ghost" title={t('common.next')} disabled={pg.page >= pg.count} onPress={() => setPage(pg.page + 1)} />
        </Row>
      ) : null}

      <ConfirmSheet
        visible={!!rev}
        title={t('m.group.reverseTitle')}
        message={rev ? t('m.group.reverseBody', { from: rev.from, to: rev.to, amount: fmt(rev.amount_cents, currency) }) : ''}
        confirmLabel={t('groupDetail.reverse')}
        danger
        busy={busy}
        onClose={() => !busy && setRev(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await onReverse(rev.id); } finally { setBusy(false); setRev(null); }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  thumb: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbT: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
});
