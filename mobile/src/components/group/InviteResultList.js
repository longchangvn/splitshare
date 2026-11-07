// Per-address email-invite outcome — web parity with components/InviteResults.jsx.
// Rows come from shared/inviteResults.js (email_sent=true only when the provider accepted).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type } from '../../theme';
import { toast } from '../../ui';
import { useT } from '../../i18n';
import { inviteRowMessage, inviteSummary, inviteSummaryMessage } from '../../shared/inviteResults';

const TONE = { success: colors.primaryText, partial: colors.warn, error: colors.danger, empty: colors.secondary };
const TOAST = { success: 'teal', partial: 'orange', error: 'red' };

export function toastInviteResults(t, rows) {
  const summary = inviteSummary(rows);
  if (summary.tone === 'empty') return;
  const m = inviteSummaryMessage(summary);
  toast({
    title: t(m.key, m.vars),
    message: summary.failed > 0 ? t('invite.retryHint') : undefined,
    color: TOAST[summary.tone],
  });
}

export function InviteResultList({ rows, style }) {
  const t = useT();
  if (!rows?.length) return null;
  const summary = inviteSummary(rows);
  const head = inviteSummaryMessage(summary);
  return (
    <View style={[s.wrap, style]} accessibilityLiveRegion="polite">
      <Text style={[type.h3, { color: TONE[summary.tone] }]}>{t(head.key, head.vars)}</Text>
      {rows.map((r) => {
        const m = inviteRowMessage(r);
        const detail = m.detailKey ? t(m.detailKey) : m.detail;
        return (
          <View key={r.email} style={s.row} accessible accessibilityLabel={`${r.email}. ${t(m.key)}${detail ? `. ${detail}` : ''}`}>
            <View style={[s.dot, { backgroundColor: r.emailSent ? colors.primarySoft : colors.dangerCardBg }]}>
              <Text style={[s.dotT, { color: r.emailSent ? colors.primaryText : colors.danger }]}>{r.emailSent ? '✓' : '!'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={type.body} numberOfLines={1}>{r.email}</Text>
              <Text style={[type.small, !r.emailSent && { color: colors.danger }]}>
                {t(m.key)}{detail ? ` — ${detail}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
      {summary.failed > 0 ? <Text style={type.small}>{t('invite.retryHint')}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dotT: { fontSize: 12, fontWeight: '800' },
});
