// Expense detail — web parity: web/src/pages/ExpenseDetail.jsx.
// Summary + category tile, splits, receipts (authenticated thumbnails, full-screen viewer,
// upload/delete while OPEN), readable audit history, comments.
// Editing opens AddExpense { id, expenseId }, which loads the expense and PATCHes with
// expected_version after a live preview-edit (STALE_VERSION / EXPENSE_LOCKED handled there and
// on delete here). Archived (LOCKED) expenses offer a prefilled copy as the correction path.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, Image, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, fmt, displayNameOf, authHeaders } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, radius, type, CATEGORY_META } from '../theme';
import {
  Screen, Card, Row, Button, Badge, Avatar, AuthImage, ConfirmSheet, Input, SkeletonCard,
  ErrText, toast,
} from '../ui';
import { categoryLabelForKey } from '../shared/categories';
import {
  chooseSource, pickImages, compressForUpload, uploadImage, isTooBig,
} from '../receipt';
import { MAX_STAGED, auditLines, saveErrorKey } from '../components/expense/formLogic';

export default function ExpenseDetailScreen({ route, navigation }) {
  const t = useT();
  const { user } = useAuth() || {};
  const meId = user?.user_id;
  const { groupId, expenseId } = route.params || {};
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groupCur, setGroupCur] = useState('');
  const [myRole, setMyRole] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [e, setE] = useState(null);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingImg, setDeletingImg] = useState(null);
  const [viewer, setViewer] = useState(null); // image id shown full screen
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [det, g, cats] = await Promise.all([
        api.get(`/api/v1/expenses/${expenseId}`),
        api.get(`/api/v1/groups/${groupId}`).catch(() => null),
        api.get(`/api/v1/groups/${groupId}/categories`).catch(() => []),
      ]);
      setD(det);
      setCategories(Array.isArray(cats) ? cats : []);
      const grp = g?.group ? { ...g, ...g.group } : g;
      if (grp) {
        setMembers(grp.members || []);
        setGroupCur(grp.currency || '');
        setMyRole(grp.my_role || null);
      }
      setE(null);
    } catch (err) { setE(err); }
  }, [expenseId, groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const x = d?.expense;
  useEffect(() => {
    if (x?.title) navigation.setOptions({ title: x.title });
  }, [navigation, x?.title]);

  const money = (cents) => fmt(cents, groupCur);
  const nameOf = (id) => displayNameOf(members, id);
  const status = String(x?.status || '').toUpperCase();
  const isOpen = status === 'OPEN';
  const isLocked = status === 'LOCKED';
  const canModify = !!x && isOpen
    && (myRole === 'owner' || myRole === 'treasurer' || (!!meId && x.created_by === meId));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const r = await api.del(`/api/v1/expenses/${expenseId}`);
      const unsettled = r?.unsettled_user_ids || [];
      setDelOpen(false);
      toast({
        title: t('m.expense.deleted'),
        message: unsettled.length > 0 ? t('m.expense.unsettledNames', { names: unsettled.map(nameOf).join(', ') }) : undefined,
        color: unsettled.length > 0 ? 'orange' : 'teal',
      });
      navigation.goBack();
    } catch (err) {
      setDelOpen(false);
      // EXPENSE_LOCKED: archived meanwhile → reload so the correction path shows.
      if (err?.code === 'EXPENSE_LOCKED') load();
      setE(err);
    } finally {
      setDeleting(false);
    }
  };

  const copy = () => navigation.navigate('AddExpense', { id: groupId, copyFrom: x });
  const edit = () => navigation.navigate('AddExpense', { id: groupId, expenseId });

  const upload = async () => {
    if (uploading) return;
    setE(null);
    const src = await chooseSource({
      title: t('expense.uploadReceipt'),
      camera: t('m.expense.camera'),
      library: t('m.expense.library'),
      cancel: t('common.cancel'),
    });
    if (!src) return;
    let file;
    try {
      const r = await pickImages(src, { multiple: false, limit: 1 });
      if (r.denied) { toast({ message: t('m.expense.cameraDenied'), color: 'orange' }); return; }
      file = r.files[0];
    } catch { return; }
    if (!file) return;
    if (isTooBig(file)) {
      setE({ message: t('forms.expense.over10mb', { name: file.name }) });
      return;
    }
    setUploading(true);
    try {
      await uploadImage(expenseId, await compressForUpload(file));
      toast({ title: t('expense.receiptUploaded'), color: 'teal' });
      load();
    } catch (err) { setE(err); } finally { setUploading(false); }
  };

  const delImg = async (iid) => {
    if (deletingImg) return;
    setDeletingImg(iid);
    try {
      await api.del(`/api/v1/images/${iid}`);
      if (viewer === iid) setViewer(null);
      load();
    } catch (err) { setE(err); } finally { setDeletingImg(null); }
  };

  if (!d || !x) {
    return (
      <Screen>
        {e ? (
          <>
            <ErrText e={e} />
            <Button variant="ghost" title={t('m.retry')} onPress={load} />
          </>
        ) : (
          <><SkeletonCard /><SkeletonCard /></>
        )}
      </Screen>
    );
  }

  const meta = CATEGORY_META[x.category] || CATEGORY_META.other;
  const tileEmoji = (x.images || []).length > 0 ? '🧾' : meta.emoji;
  const guests = x.guests || [];
  const images = x.images || [];
  const audit = d.audit || [];
  const extras = [];
  if (x.tax_cents > 0) extras.push(`${t('expense.tax')} ${money(x.tax_cents)}`);
  if (x.tip_cents > 0) extras.push(`${t('expense.tip')} ${money(x.tip_cents)}`);
  if (x.fee_cents > 0) extras.push(`${t('expense.fee')} ${money(x.fee_cents)}`);
  if (x.orig_currency) {
    extras.push(t('m.expense.fxPaid', {
      amount: ((x.orig_amount_cents || 0) / 100).toFixed(2), currency: x.orig_currency, rate: x.fx_rate,
    }));
  }
  if (guests.length > 0) {
    extras.push(`${t('expense.guests')}: ${guests.map((g) => t('m.expense.guestVia', {
      label: g.label, amount: money(g.share_cents), name: nameOf(g.covered_by),
    })).join(', ')}`);
  }
  const errKey = saveErrorKey(e);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Card>
        <Row style={{ alignItems: 'flex-start' }} gap={12}>
          <View style={[s.tile, { backgroundColor: meta.color }]} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={{ fontSize: 24 }}>{tileEmoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.h1}>{x.title}</Text>
            <Badge
              kind={isLocked ? 'comment' : isOpen ? 'settled' : 'payment'}
              label={isLocked ? t('groupDetail.statusLocked') : isOpen ? t('groupDetail.statusOpen') : x.status}
            />
          </View>
        </Row>
        {x.description ? <Text style={[type.body, { marginTop: 10 }]}>{x.description}</Text> : null}
        <Text style={[type.body, { marginTop: 10 }]}>
          {t('expense.paidBy')} <Text style={s.b}>{nameOf(x.payer_id)}</Text> · <Text style={s.b}>{money(x.amount_cents)}</Text>
        </Text>
        <Row style={{ marginTop: 8, flexWrap: 'wrap' }} gap={6}>
          {x.category ? <Badge kind="join" label={`${meta.emoji} ${categoryLabelForKey(x.category, categories, t)}`} /> : null}
          {x.spent_at ? <Badge kind="comment" label={String(x.spent_at).slice(0, 10)} /> : null}
        </Row>
        {extras.length > 0 ? <Text style={[type.small, { marginTop: 8 }]}>{extras.join(' · ')}</Text> : null}

        {errKey ? <Text style={s.err}>{t(errKey)}</Text> : <ErrText e={e} />}

        <Row style={{ marginTop: 14, flexWrap: 'wrap' }}>
          {canModify ? <Button small variant="soft" title={t('groupDetail.editExpense')} onPress={edit} /> : null}
          {canModify ? <Button small variant="ghost" style={{ borderColor: colors.dangerCardBorder }} title={t('common.delete')} onPress={() => setDelOpen(true)} /> : null}
          <Button small variant="ghost" title={t('groupDetail.copyExpense')} onPress={copy} />
        </Row>
      </Card>

      {isLocked ? (
        <Card tone="groups">
          <Text style={type.h3}>{t('m.expense.lockedTitle')}</Text>
          <Text style={[type.small, { marginTop: 4 }]}>{t('m.expense.lockedHint')}</Text>
          <Button small style={{ marginTop: 10, alignSelf: 'flex-start' }} title={t('m.expense.correction')} onPress={copy} />
        </Card>
      ) : null}

      <Card>
        <Text style={[type.h2, { marginBottom: 6 }]}>{t('expense.splits')}</Text>
        {(x.splits || []).map((sp) => (
          <Row key={sp.user_id} style={s.splitRow} gap={10}>
            <Avatar name={nameOf(sp.user_id)} size={32} />
            <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{nameOf(sp.user_id)}</Text>
            <Text style={type.h3}>{money(sp.share_cents)}</Text>
          </Row>
        ))}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>{t('expense.receipts')} ({images.length}/{MAX_STAGED})</Text>
          {isOpen ? (
            <Button
              small
              variant="soft"
              busy={uploading}
              disabled={images.length >= MAX_STAGED}
              title={t('expense.uploadReceipt')}
              onPress={upload}
            />
          ) : null}
        </Row>
        {images.length === 0 ? <Text style={[type.small, { marginTop: 8 }]}>{t('expense.noReceipts')}</Text> : null}
        <View style={s.grid}>
          {images.map((img) => (
            <View key={img.image_id} style={{ alignItems: 'center', gap: 4 }}>
              <Pressable
                onPress={() => setViewer(img.image_id)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${t('expense.receipts')} ${img.mime || ''}`}
              >
                <AuthImage imageId={img.image_id} style={s.thumb} />
              </Pressable>
              {isOpen ? (
                <Pressable
                  onPress={() => delImg(img.image_id)}
                  disabled={!!deletingImg}
                  hitSlop={8}
                  style={s.imgDel}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  {deletingImg === img.image_id
                    ? <ActivityIndicator size="small" color={colors.danger} />
                    : <Text style={s.danger}>{t('common.delete')}</Text>}
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Pressable
          onPress={() => setHistoryOpen((o) => !o)}
          style={s.summary}
          accessibilityRole="button"
          accessibilityState={{ expanded: historyOpen }}
        >
          <Text style={[type.h2, { flex: 1 }]}>{t('expense.history', { count: audit.length })}</Text>
          <Text style={{ color: colors.secondary }}>{historyOpen ? '▴' : '▾'}</Text>
        </Pressable>
        {historyOpen && audit.length === 0 ? <Text style={[type.small, { marginTop: 6 }]}>{t('expense.noHistory')}</Text> : null}
        {historyOpen && audit.map((a, i) => {
          const lines = auditLines(a.diff, {
            fmtCents: money,
            nameOf,
            categoryOf: (k) => (k ? categoryLabelForKey(k, categories, t) : ''),
          }, t);
          return (
            <View key={i} style={s.audit}>
              <Text style={type.small}>
                {a.actor_id ? `${nameOf(a.actor_id)} · ` : ''}{a.at ? new Date(a.at).toLocaleString() : ''}
              </Text>
              {lines.length === 0
                ? <Text style={type.body}>{t('m.expense.audit.noFieldChanges')}</Text>
                : lines.map((l, j) => <Text key={j} style={type.body}>{l}</Text>)}
            </View>
          );
        })}
      </Card>

      <Comments eid={expenseId} members={members} meId={meId} isOwner={myRole === 'owner'} />

      <ConfirmSheet
        visible={delOpen}
        title={t('expense.deleteTitle')}
        message={t('expense.deleteBody')}
        confirmLabel={t('common.delete')}
        danger
        busy={deleting}
        onClose={() => { if (!deleting) setDelOpen(false); }}
        onConfirm={doDelete}
      />

      <ImageViewer imageId={viewer} onClose={() => setViewer(null)} closeLabel={t('common.close')} />
    </Screen>
  );
}

function Comments({ eid, members, meId, isOwner }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(() => api.get(`/api/v1/expenses/${eid}/comments`)
    .then((r) => { setItems(Array.isArray(r) ? r : []); setE(null); })
    .catch(setE), [eid]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/expenses/${eid}/comments`, { body: body.trim() });
      setBody('');
      load();
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  const del = async (cid) => {
    if (deleting) return;
    setDeleting(cid);
    try { await api.del(`/api/v1/comments/${cid}`); load(); } catch (err) { setE(err); } finally { setDeleting(null); }
  };

  return (
    <Card>
      <Text style={[type.h2, { marginBottom: 6 }]}>{t('expense.comments', { count: items.length })}</Text>
      <ErrText e={e} />
      {items.map((c) => {
        const name = c.author_name || displayNameOf(members, c.author_id);
        const canDelete = (!!meId && c.author_id === meId) || isOwner;
        return (
          <Row key={c.comment_id} style={s.comment} gap={10}>
            <Avatar name={name} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>
                {name} <Text style={type.small}>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</Text>
              </Text>
              <Text style={type.body}>{c.body}</Text>
            </View>
            {canDelete ? (
              <Pressable
                onPress={() => del(c.comment_id)}
                disabled={!!deleting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.delete')}
              >
                {deleting === c.comment_id
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <Text style={s.danger}>{t('common.delete')}</Text>}
              </Pressable>
            ) : null}
          </Row>
        );
      })}
      {items.length === 0 ? <Text style={type.small}>{t('expense.noComments')}</Text> : null}
      <Row style={{ marginTop: 10 }}>
        <Input
          style={{ flex: 1 }}
          placeholder={t('expense.commentPh')}
          value={body}
          onChangeText={setBody}
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={send}
          accessibilityLabel={t('expense.commentPh')}
        />
        <Button small title={t('common.send')} busy={busy} disabled={!body.trim()} onPress={send} />
      </Row>
    </Card>
  );
}

// Full-screen receipt viewer (contain fit). Uses Bearer headers like ui.AuthImage.
function ImageViewer({ imageId, onClose, closeLabel }) {
  const insets = useSafeAreaInsets();
  const [headers, setHeaders] = useState(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    authHeaders().then((h) => { if (live.current) setHeaders(h); });
    return () => { live.current = false; };
  }, []);
  return (
    <Modal visible={!!imageId} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.viewer}>
        {imageId && headers ? (
          <Image
            source={{ uri: api.imageUrl(imageId), headers }}
            style={{ flex: 1, width: '100%' }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ) : <ActivityIndicator color="#fff" style={{ flex: 1 }} />}
        <Pressable
          onPress={onClose}
          style={[s.viewerClose, { top: insets.top + 12 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tile: { width: 52, height: 52, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  b: { fontWeight: '700', color: colors.text },
  err: { fontSize: 13, color: colors.danger, marginTop: 8, fontWeight: '600' },
  splitRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  thumb: { width: 96, height: 96, borderRadius: radius.thumb },
  imgDel: { minHeight: 32, justifyContent: 'center' },
  danger: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  summary: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  audit: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
  comment: { alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerClose: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
});
