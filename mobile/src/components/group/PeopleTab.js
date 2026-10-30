// People tab — web gd-people: pastel avatars, role + deposit tags, owner actions in a per-member sheet.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { fmt } from '../../api/client';
import { Card, Avatar, Sheet, ConfirmSheet, ErrText } from '../../ui';
import { isStaleRemoval, removalSummary } from '../../shared/memberRemoval';
import { ListRow, MenuRow, p as parts } from './parts';

const ROLE_TONE = {
  owner: ['#e8f7ef', '#0c7a4b'],
  treasurer: ['#eff6ff', '#1d4ed8'],
  member: ['#f1f5f9', '#475569'],
};

export default function PeopleTab({ detail, members, meId, onSetRole, onSetDeposit, onRemove, onRemovalPreview }) {
  const t = useT();
  const [target, setTarget] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [stale, setStale] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const isOwner = detail?.my_role === 'owner';
  const isEvent = detail?.mode === 'event';
  const canAct = isEvent || isOwner;

  // Same flow as web GroupDetail: load the server preview, confirm with its hash.
  useEffect(() => {
    setPreview(null);
    setPreviewErr(null);
    if (!confirmRemove) return undefined;
    let live = true;
    onRemovalPreview(confirmRemove).then((p) => { if (live) setPreview(p); }).catch((err) => { if (live) setPreviewErr(err); });
    return () => { live = false; };
  }, [confirmRemove, previewNonce]);

  const openRemove = (m) => { setStale(false); setConfirmRemove(m); };
  const closeRemove = () => { setConfirmRemove(null); setStale(false); };

  const removalMessage = () => {
    const name = confirmRemove.display_name;
    const notice = stale ? `${t('groupDetail.removeStale')}\n\n` : '';
    if (previewErr) return notice + (previewErr.message || String(previewErr));
    const sum = removalSummary(preview, (uid) => members.find((m) => m.user_id === uid)?.display_name || '?');
    if (sum.mode === 'loading') return notice + t('groupDetail.removeLoading');
    if (sum.mode === 'legacy') return notice + t('groupDetail.removeMemberBody', { name });
    if (sum.mode === 'settled') return notice + t('groupDetail.removeSettled', { name });
    if (sum.mode === 'blocked') return notice + [t('groupDetail.removeBlocked', { name }), ...sum.blockers.map((b) => `• ${b}`)].join('\n');
    const cur = preview.currency || detail?.currency;
    return notice + [
      t('groupDetail.removeResplit', { name, amount: fmt(Math.abs(preview.net_cents), cur), count: sum.expenses.length }),
      ...sum.expenses.map((x) => [
        `\n${x.title} · ${fmt(x.amountCents, cur)} · ${t(`forms.expense.${x.method}`)}`,
        ...x.rows.map((r) => `  ${r.name}: ${fmt(r.fromCents, cur)} → ${fmt(r.toCents, cur)}`),
      ].join('\n')),
    ].join('\n');
  };

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
              {actionable ? <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text> : null}
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
                onPress={() => { openRemove(target); setTarget(null); }}
              />
            ) : null}
            <ErrText e={e} />
          </View>
        ) : null}
      </Sheet>

      <ConfirmSheet
        visible={!!confirmRemove}
        title={t('groupDetail.removeMember')}
        message={confirmRemove ? removalMessage() : ''}
        confirmLabel={t('common.remove')}
        danger
        busy={busy}
        confirmDisabled={!preview?.can_remove}
        onClose={() => !busy && closeRemove()}
        onConfirm={async () => {
          if (!preview?.can_remove) return;
          setBusy(true);
          try {
            await onRemove(confirmRemove, preview);
            closeRemove();
          } catch (err) {
            if (!isStaleRemoval(err)) { closeRemove(); return; }
            setStale(true);
            setPreviewNonce((n) => n + 1);
          } finally { setBusy(false); }
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  tag: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  depOk: { backgroundColor: '#e8f7ef', color: '#0c7a4b' },
  depDue: { backgroundColor: '#fff7ed', color: '#c2410c' },
});
