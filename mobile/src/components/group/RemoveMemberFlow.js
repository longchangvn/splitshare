// Member-removal confirm shared by People tab and Invite: loads the server preview, confirms with
// its hash, and on STALE_LEDGER keeps the sheet open and reloads the preview (web GroupDetail parity).
import React, { useEffect, useState } from 'react';
import { activeTheme } from '../../themes';
import RemovalPreviewSheet from '../../themes/splitease/components/group/RemovalPreviewSheet';
import { useT } from '../../i18n';
import { fmt } from '../../api/client';
import { ConfirmSheet } from '../../ui';
import { isStaleRemoval, removalSummary } from '../../shared/memberRemoval';

/**
 * @param target   member to remove ({ user_id, display_name }) — null hides the sheet.
 * @param members  group members (names for the re-split rows).
 * @param onRemovalPreview (member) => Promise<preview>
 * @param onRemove (member, preview) => Promise; throw STALE_LEDGER to reload, anything else closes.
 */
export default function RemoveMemberFlow({ target, detail, members, onRemovalPreview, onRemove, onClose }) {
  const t = useT();
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setStale(false); }, [target]);
  useEffect(() => {
    setPreview(null);
    setPreviewErr(null);
    if (!target) return undefined;
    let live = true;
    onRemovalPreview(target).then((p) => { if (live) setPreview(p); }).catch((err) => { if (live) setPreviewErr(err); });
    return () => { live = false; };
  }, [target, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = () => {
    const name = target.display_name;
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

  const confirm = {
    visible: !!target,
    title: t('groupDetail.removeMember'),
    message: target ? message() : '',
    confirmLabel: t('common.remove'),
    danger: true,
    busy,
    confirmDisabled: !preview?.can_remove,
    onClose: () => !busy && onClose(),
    onConfirm: async () => {
      if (!preview?.can_remove) return;
      setBusy(true);
      try {
        await onRemove(target, preview);
        onClose();
      } catch (err) {
        if (!isStaleRemoval(err)) { onClose(); return; }
        setStale(true);
        setNonce((n) => n + 1);
      } finally { setBusy(false); }
    },
  };

  // Classic: text ConfirmSheet. SplitEase (features.removalPreview): structured re-split preview.
  if (!activeTheme().features.removalPreview) return <ConfirmSheet {...confirm} />;
  return (
    <RemovalPreviewSheet
      {...confirm}
      name={target?.display_name}
      preview={preview}
      previewErr={previewErr}
      stale={stale}
      members={members}
      currency={preview?.currency || detail?.currency}
    />
  );
}
