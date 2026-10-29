// People tab (spec 005 task 2.5) — roles (make/remove treasurer), event-mode
// deposit toggle, remove with confirmation. Owner-only actions are hidden for
// members, matching the API's permission checks.
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme';
import { Avatar, Card, ErrorBanner, PressableRow, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';

export default function PeopleTab({ group, onChanged }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const isOwner = group?.my_role === 'owner';
  const eventMode = group?.mode === 'event';
  const members = group?.members || [];

  const run = async (uid, fn, successMessage) => {
    setBusyId(uid);
    setError(null);
    try {
      await fn();
      if (successMessage) Alert.alert(successMessage, '');
      onChanged?.();
    } catch (err) {
      setError(err);
      Alert.alert(
        t('errors.genericTitle'),
        err.code === 'HAS_OPEN_BALANCE' ? t('m.errors.openBalance') : err.message,
      );
    } finally { setBusyId(null); }
  };

  const setRole = (member) => {
    const nextRole = member.role === 'treasurer' ? 'member' : 'treasurer';
    Alert.alert(
      nextRole === 'treasurer' ? t('groupDetail.makeTreasurer') : t('groupDetail.removeTreasurer'),
      member.display_name,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.yes'),
          onPress: () => run(member.user_id, () => api.patch(`/api/v1/groups/${group.group_id}/members/${member.user_id}`, { role: nextRole }),
            t('groupDetail.roleUpdated', { role: nextRole })),
        },
      ],
    );
  };

  const toggleDeposit = (member) =>
    run(member.user_id, () => api.patch(`/api/v1/groups/${group.group_id}/members/${member.user_id}/deposit`, { paid: !member.deposit_paid }));

  const remove = (member) => {
    Alert.alert(
      t('groupDetail.removeMember'),
      t('groupDetail.removeMemberBody', { name: member.display_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: () => run(member.user_id, () => api.del(`/api/v1/groups/${group.group_id}/members/${member.user_id}`)),
        },
      ],
    );
  };

  return (
    <View>
      <Card>
        <Text style={uiStyles.h}>{t('common.members')} ({members.length})</Text>
        {members.map((m) => {
          const isMe = m.user_id === meId;
          const roleLabel = m.role === 'owner' ? t('common.owner') : m.role === 'treasurer' ? t('common.treasurer') : t('common.member');
          return (
            <View key={m.user_id} style={s.member}>
              <View style={s.memberHead}>
                <Avatar name={m.display_name} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.name}>{m.display_name}{isMe ? ` · ${t('quickAdd.you')}` : ''}{m.removed ? ' (removed)' : ''}</Text>
                  <Text style={s.meta}>@{m.username} · {roleLabel}</Text>
                </View>
              </View>

              {eventMode && (
                <View style={s.switchRow}>
                  <Text style={s.switchLabel}>{m.deposit_paid ? t('groupDetail.depositPaid') : t('groupDetail.depositDue')}</Text>
                  <Switch
                    value={!!m.deposit_paid}
                    onValueChange={() => toggleDeposit(m)}
                    disabled={busyId === m.user_id}
                    accessibilityLabel={`${t('groupDetail.markDeposit')} ${m.display_name}`}
                  />
                </View>
              )}

              {isOwner && !isMe && m.role !== 'owner' && (
                <>
                  <PressableRow
                    title={m.role === 'treasurer' ? t('groupDetail.removeTreasurer') : t('groupDetail.makeTreasurer')}
                    onPress={() => setRole(m)}
                    chevron={false}
                  />
                  <PressableRow
                    title={t('groupDetail.removeNamed', { name: m.display_name })}
                    onPress={() => remove(m)}
                    destructive
                    chevron={false}
                  />
                </>
              )}
            </View>
          );
        })}
        <Text style={s.footnote}>{t('groupDetail.depositPaid')} · {t('groupDetail.makeTreasurer')}</Text>
      </Card>
      <ErrorBanner error={error} />
    </View>
  );
}

const s = StyleSheet.create({
  member: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  memberHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, minHeight: 44 },
  switchLabel: { fontSize: 12, color: colors.text },
  footnote: { fontSize: 10, color: colors.muted, marginTop: 10 },
});
