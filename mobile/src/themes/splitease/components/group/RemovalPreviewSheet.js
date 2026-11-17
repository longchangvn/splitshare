// SplitEase member-removal confirm (features.removalPreview; Stitch M5): the server's removal
// preview laid out as cards — per-member share impact, then each re-split expense with
// old → new shares. Same confirm / cancel / stale-reload flow as the classic ConfirmSheet.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../../typography';
import { fmt } from '../../../../api/client';
import { colors, type, radius, groupTokens } from '../../../../theme';
import { useT } from '../../../../i18n';
import { Sheet, Button, Row, Avatar } from '../../../../ui';
import { removalSummary } from '../../../../shared/memberRemoval';
import { ThemedIcon } from '../../../../components/ThemedIcon';

export default function RemovalPreviewSheet({
  visible, title, message, confirmLabel, danger, busy, confirmDisabled, onConfirm, onClose,
  name, preview, previewErr, stale, members, currency,
}) {
  const t = useT();
  const close = () => { if (!busy) onClose?.(); };
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || '?';
  const sum = previewErr ? null : removalSummary(preview, nameOf);
  const resplit = sum?.mode === 'resplit';

  // Per-member total share before → after across all re-split expenses.
  const impact = new Map();
  if (resplit) {
    for (const x of sum.expenses) {
      for (const r of x.rows) {
        const cur = impact.get(r.userId) || { name: r.name, from: 0, to: 0 };
        cur.from += r.fromCents; cur.to += r.toCents;
        impact.set(r.userId, cur);
      }
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {stale ? (
        <View style={[s.note, s.warn]}>
          <ThemedIcon ms="sync_problem" size={18} color={colors.warnText} />
          <Text style={[type.small, { flex: 1, color: colors.warnText }]}>{t('groupDetail.removeStale')}</Text>
        </View>
      ) : null}

      {resplit ? (
        <View style={{ gap: 10 }}>
          <Text style={type.body}>
            {t('groupDetail.removeResplit', { name, amount: fmt(Math.abs(preview.net_cents), currency), count: sum.expenses.length })}
          </Text>
          <Text style={type.kicker}>{t('se.remove.impact')}</Text>
          <View style={s.list}>
            {[...impact.entries()].map(([uid, r], i, arr) => {
              const delta = r.to - r.from;
              return (
                <View key={uid} style={[s.row, i < arr.length - 1 && s.rowLine]}>
                  <Avatar name={r.name} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.h3} numberOfLines={1}>{r.name}</Text>
                    <Text style={type.small}>{t('se.remove.was', { amount: fmt(r.from, currency) })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.amt, { color: delta > 0 ? groupTokens.borrowed : groupTokens.lent }]}>{fmt(r.to, currency)}</Text>
                    {delta !== 0 ? (
                      <Text style={[s.delta, { color: delta > 0 ? groupTokens.borrowed : groupTokens.lent }]}>
                        {delta > 0 ? '+' : '−'}{fmt(Math.abs(delta), currency)} {t('se.remove.share')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          {sum.expenses.map((x) => (
            <View key={x.id} style={s.exp}>
              <Row>
                <ThemedIcon ms="call_split" size={18} color={colors.primary} />
                <Text style={[type.h3, { flex: 1 }]} numberOfLines={1}>{x.title}</Text>
                <Text style={type.small}>{fmt(x.amountCents, currency)} · {t(`forms.expense.${x.method}`)}</Text>
              </Row>
              {x.rows.map((r) => (
                <Row key={r.userId} style={{ marginTop: 6 }}>
                  <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={type.small}>{fmt(r.fromCents, currency)}</Text>
                  <ThemedIcon ms="arrow_forward" size={14} color={colors.secondary} />
                  <Text style={[type.small, { fontWeight: '700', color: colors.text }]}>{fmt(r.toCents, currency)}</Text>
                </Row>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={[s.note, sum?.mode === 'blocked' || previewErr ? s.bad : null]}>
          <ThemedIcon
            ms={sum?.mode === 'blocked' || previewErr ? 'block' : sum?.mode === 'settled' ? 'check_circle' : 'info'}
            size={18}
            color={sum?.mode === 'blocked' || previewErr ? colors.danger : colors.primary}
          />
          <Text style={[type.body, { flex: 1 }]}>{String(message || '').replace(`${t('groupDetail.removeStale')}\n\n`, '')}</Text>
        </View>
      )}

      <Row style={{ marginTop: 14 }}>
        <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} onPress={close} disabled={busy} />
        <Button style={{ flex: 1 }} variant={danger ? 'danger' : 'primary'} busy={busy} disabled={confirmDisabled} title={confirmLabel} onPress={onConfirm} />
      </Row>
    </Sheet>
  );
}

const s = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.tile, backgroundColor: colors.paleTealBg, marginBottom: 10 },
  warn: { backgroundColor: colors.warnBg },
  bad: { backgroundColor: colors.dangerCardBg },
  list: { backgroundColor: colors.paleTealBg, borderRadius: radius.tile, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  amt: { fontSize: 15, fontWeight: '800' },
  delta: { fontSize: 11, fontWeight: '700' },
  exp: { padding: 12, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card },
});
