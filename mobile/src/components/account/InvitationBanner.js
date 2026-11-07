// Marker shown on every screen reached from an invitation link (emailed
// invite/<token> or shared g/<token>) — web parity with components/InvitationBanner.jsx:
// the group, who invited, and who is invited.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';

function Row({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export function InvitationBanner({ inviter, group, memberCount, email, style }) {
  const t = useT();
  const a11y = [
    t('invitation.badge'),
    `${t('invitation.groupLabel')}: ${group}`,
    inviter ? `${t('invitation.invitedByLabel')}: ${inviter}` : null,
    email ? `${t('invitation.inviteeLabel')}: ${email}` : null,
  ].filter(Boolean).join('. ');
  return (
    <View style={[s.banner, style]} accessible accessibilityRole="summary" accessibilityLabel={a11y}>
      <View style={s.icon}><Text style={s.iconT}>✉</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.badge}>{t('invitation.badge')}</Text>
        <Text style={[type.small, { marginTop: 8 }]}>{t('invitation.groupLabel')}</Text>
        <Text style={s.group}>{group}</Text>
        {memberCount != null ? (
          <Text style={[type.small, { marginBottom: 6 }]}>{t('invitation.members', { count: memberCount })}</Text>
        ) : null}
        {inviter ? <Row label={t('invitation.invitedByLabel')} value={inviter} /> : null}
        {email ? <Row label={t('invitation.inviteeLabel')} value={email} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 16,
    backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.accentLight,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  iconT: { color: '#fff', fontSize: 16, fontWeight: '800' },
  badge: {
    alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    backgroundColor: '#fff', color: colors.primaryText, fontSize: 11, fontWeight: '800', letterSpacing: 0.3,
  },
  group: { fontSize: 18, fontWeight: '800', color: colors.text, lineHeight: 23 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'baseline', marginTop: 2 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: colors.secondary, minWidth: 72 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
});
