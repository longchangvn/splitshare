// People tab — web gd-people: pastel avatars, role + deposit tags, owner actions in a per-member sheet.
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../typography';
import { type, groupTokens } from '../../theme';
import { useT } from '../../i18n';
import { Card, Avatar, Sheet, ErrText } from '../../ui';
import { ListRow, MenuRow, Chevron, p as parts } from './parts';
import RemoveMemberFlow from './RemoveMemberFlow';

const ROLE_TONE = groupTokens.roleTone;

export default function PeopleTab({ detail, members, meId, onSetRole, onSetDeposit, onRemove, onRemovalPreview }) {
  const t = useT();
  const [target, setTarget] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const isOwner = detail?.my_role === 'owner';
  const isEvent = detail?.mode === 'event';
  const canAct = isEvent || isOwner;

  const roleLabel = (r) => (r === 'owner' ? t('common.owner') : r === 'treasurer' ? t('common.treasurer') : t('common.member'));

  const run = async (fn) => {
    setBusy(true); setE(null);
    try { await fn(); setTarget(null); } catch (err) { setE(err); } finally { setBusy(false); }
  };

  return (
    <>
      <Card style={{ paddingVertical: 4 }}>
        {members.map((m, i) => {
          const [rbg, rfg] = ROLE_TONE[m.role] || ROLE_TONE.member;
          const actionable = canAct && (isEvent || (isOwner && m.role !== 'owner'));
          return (
            <ListRow
              key={m.user_id}
              last={i === members.length - 1}
              onPress={actionable ? () => { setE(null); setTarget(m); } : undefined}
              accessibilityLabel={actionable ? t('m.group.manageMember', { name: m.display_name }) : undefined}
            >
              <Avatar name={m.display_name || m.username} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={type.h3} numberOfLines={1}>{m.display_name}{m.user_id === meId ? ` · ${t('m.group.you')}` : ''}</Text>
                  {isEvent ? (
                    <Text style={[s.tag, m.deposit_paid ? s.depOk : s.depDue]}>{m.deposit_paid ? t('groupDetail.depositPaid') : t('groupDetail.depositDue')}</Text>
                  ) : null}
                </View>
                {m.username ? <Text style={parts.meta} numberOfLines={1}>@{m.username}</Text> : null}
              </View>
              <Text style={[s.tag, { backgroundColor: rbg, color: rfg }]}>{roleLabel(m.role)}</Text>
              {actionable ? <Chevron /> : null}
            </ListRow>
          );
        })}
      </Card>

      <Sheet visible={!!target} onClose={() => !busy && setTarget(null)} title={target?.display_name}>
        {target ? (
          <View>
            {isEvent ? (
              <MenuRow
                label={target.deposit_paid ? t('groupDetail.unmarkDeposit') : t('groupDetail.markDeposit')}
                disabled={busy}
                onPress={() => run(() => onSetDeposit(target.user_id, !target.deposit_paid))}
              />
            ) : null}
            {isOwner && target.role !== 'owner' ? (
              <MenuRow
                label={target.role === 'treasurer' ? t('groupDetail.removeTreasurer') : t('groupDetail.makeTreasurer')}
                disabled={busy}
                onPress={() => run(() => onSetRole(target.user_id, target.role === 'treasurer' ? 'member' : 'treasurer'))}
              />
            ) : null}
            {isOwner && target.role !== 'owner' ? (
              <MenuRow
                last
                danger
                label={t('groupDetail.removeNamed', { name: target.display_name })}
                disabled={busy}
                onPress={() => { setConfirmRemove(target); setTarget(null); }}
              />
            ) : null}
            <ErrText e={e} />
          </View>
        ) : null}
      </Sheet>

      <RemoveMemberFlow
        target={confirmRemove}
        detail={detail}
        members={members}
        onRemovalPreview={onRemovalPreview}
        onRemove={onRemove}
        onClose={() => setConfirmRemove(null)}
      />
    </>
  );
}

const s = StyleSheet.create({
  tag: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  depOk: { backgroundColor: groupTokens.tagOn[0], color: groupTokens.tagOn[1] },
  depDue: { backgroundColor: groupTokens.tagDue[0], color: groupTokens.tagDue[1] },
});
