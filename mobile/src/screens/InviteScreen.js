// Invite — web parity with pages/InvitePage.jsx + GroupDetail invite dialog:
// By email (POST /invites {emails}) · From contacts (GET /contacts, POST /members {user_ids})
// · Link (invite_link, copy/share via the native share sheet, owner can rotate).
import React, { useEffect, useRef, useState } from 'react';
import { View, Share, Platform, StyleSheet } from 'react-native';
import { Text } from '../typography';
import * as Clipboard from 'expo-clipboard';
import { api } from '../api/client';
import { useT } from '../i18n';
import { colors, type, radius } from '../theme';
import { Screen, Card, Segmented, Input, Field, Button, Avatar, ErrText, ConfirmSheet, toast } from '../ui';
import { ListRow, p as parts } from '../components/group/parts';
import { parseEmails } from '../components/group/helpers';
import { InviteResultList, toastInviteResults } from '../components/group/InviteResultList';
import { inviteRows } from '../shared/inviteResults';
import { fetchRemovalPreview, isStaleRemoval, removalPath } from '../shared/memberRemoval';
import RemoveMemberFlow from '../components/group/RemoveMemberFlow';
import { publicHandle } from '../auth/AuthContext';
import { activeTheme } from '../themes';
import { ThemedIcon } from '../components/ThemedIcon';
import InviteQr from '../themes/splitease/components/group/InviteQr';

export default function InviteScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const { features } = activeTheme();
  const [detail, setDetail] = useState(null);
  // SplitEase opens on the link + QR card (Stitch M33); classic on email.
  const [tab, setTab] = useState(features.inviteQr ? 'link' : 'email');
  const [emails, setEmails] = useState('');
  const [inviteResult, setInviteResult] = useState([]);
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [e, setE] = useState(null);
  const searchReq = useRef(0);

  const loadDetail = () => api.get(`/api/v1/groups/${id}`).then((g) => {
    const det = g?.group || g;
    setDetail(det);
    if (det?.invite_link) setLink(det.invite_link);
    if (det?.name) navigation.setOptions({ title: t('invite.toGroup', { name: det.name }) });
  });
  useEffect(() => {
    let live = true;
    loadDetail().catch((err) => { if (live) setE(err); });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty box: first 10 contacts (A–Z); typing: debounced "contains" search on name / username / email.
  // Rows flag who is already in this group (Remove vs Add); request counter drops stale responses.
  useEffect(() => {
    if (tab !== 'contacts') return undefined;
    const q = cq.trim();
    const url = `/api/v1/contacts?group_id=${id}&${q ? `q=${encodeURIComponent(q)}&limit=20` : 'limit=10'}`;
    const h = setTimeout(async () => {
      const r = ++searchReq.current;
      setBusy('search');
      try {
        const rows = await api.get(url);
        if (r === searchReq.current) { setContacts(Array.isArray(rows) ? rows : []); setSearched(true); setE(null); }
      } catch (err) { if (r === searchReq.current) setE(err); } finally { if (r === searchReq.current) setBusy(null); }
    }, q ? 350 : 0);
    return () => clearTimeout(h);
  }, [cq, tab, id]);

  const sendEmails = async () => {
    const list = parseEmails(emails);
    if (list.length === 0) { setE({ message: t('errors.needEmail') }); return; }
    setBusy('email'); setE(null); setInviteResult([]);
    try {
      const rows = inviteRows(await api.post(`/api/v1/groups/${id}/invites`, { emails: list }));
      setInviteResult(rows);
      toastInviteResults(t, rows);
      // Keep failed addresses in the box so "Send invites" retries just those.
      setEmails(rows.filter((r) => !r.emailSent).map((r) => r.email).join(', '));
    } catch (err) { setE(err); } finally { setBusy(null); }
  };

  const setInGroup = (uid, inGroup) =>
    setContacts((prev) => prev.map((c) => (c.user_id === uid ? { ...c, in_group: inGroup, group_role: inGroup ? 'member' : null } : c)));

  const addContact = async (c) => {
    setBusy(c.user_id); setE(null);
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [c.user_id] });
      toast({ title: t('invite.memberAdded', { name: c.display_name }), color: 'teal' });
      setInGroup(c.user_id, true);
      loadDetail().catch(() => {});
    } catch (err) { setE(err); } finally { setBusy(null); }
  };

  // Same removal flow as the People tab: server preview (re-split), confirm with its hash.
  const removeContact = async (c, preview) => {
    try {
      await api.del(removalPath(id, c.user_id, preview));
      toast({ title: t('invite.memberRemoved', { name: c.display_name }), color: 'teal' });
      setInGroup(c.user_id, false);
      loadDetail().catch(() => {});
    } catch (err) {
      if (isStaleRemoval(err)) throw err; // RemoveMemberFlow keeps the sheet open and reloads the preview
      setE(err);
    }
  };

  const rotate = async () => {
    setBusy('rotate'); setE(null);
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      setLink(r?.invite_link || '');
      toast({ title: t('invite.rotated'), message: t('invite.rotatedHint'), color: 'teal' });
    } catch (err) { setE(err); } finally { setBusy(null); setRotateOpen(false); }
  };

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({ message: t('m.group.linkShareMsg', { name: detail?.name || '', url: link }), url: link });
    } catch { /* dismissed */ }
  };

  // SplitEase: copy the link straight to the clipboard (Share stays available next to it).
  const copy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      toast({ title: t('se.invite.copied'), color: 'teal' });
    } catch { share(); }
  };

  const isOwner = detail?.my_role === 'owner';
  // Only the owner removes, and never the owner (server rules: GroupService.RemoveMemberAsync).
  const canRemove = (c) => isOwner && c.group_role !== 'owner';

  return (
    <Screen>
      <Segmented
        value={tab}
        onChange={(v) => { setTab(v); setE(null); }}
        options={[
          { value: 'email', label: t('invite.byEmail') },
          { value: 'contacts', label: t('invite.fromContacts') },
          { value: 'link', label: t('invite.inviteLink') },
        ]}
      />

      {tab === 'email' ? (
        <Card>
          <Field label={t('invite.emails')} hint={t('invite.emailsHint')} style={{ marginTop: 0 }}>
            <Input
              value={emails}
              onChangeText={setEmails}
              placeholder={t('wizard.emailsPh')}
              multiline
              numberOfLines={4}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </Field>
          <Button style={{ marginTop: 14 }} title={t('invite.sendInvites')} busy={busy === 'email'} onPress={sendEmails} />
          <InviteResultList rows={inviteResult} />
        </Card>
      ) : null}

      {tab === 'contacts' ? (
        <Card>
          <Field label={t('wizard.searchContacts')} style={{ marginTop: 0 }}>
            <Input value={cq} onChangeText={setCq} placeholder={t('wizard.searchPh')} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          </Field>
          <View style={{ marginTop: 6 }}>
            {!cq.trim() && contacts.length > 0 ? (
              <Text style={[type.small, { paddingTop: 6 }]}>{t('wizard.yourContacts')}</Text>
            ) : null}
            {contacts.map((c, i) => (
              <ListRow key={c.user_id} last={i === contacts.length - 1}>
                <Avatar name={c.display_name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.h3} numberOfLines={1}>{c.display_name}</Text>
                  {publicHandle(c.username) ? <Text style={parts.meta} numberOfLines={1}>@{c.username}</Text> : null}
                </View>
                {!c.in_group ? (
                  <Button small variant="soft" title={t('common.add')} busy={busy === c.user_id} accessibilityLabel={t('invite.addNamed', { name: c.display_name })} onPress={() => addContact(c)} />
                ) : canRemove(c) ? (
                  <Button small variant="ghost" title={t('common.remove')} accessibilityLabel={t('groupDetail.removeNamed', { name: c.display_name })} onPress={() => { setE(null); setRemoveTarget(c); }} />
                ) : (
                  <Text style={s.memberTag}>{t('common.member')}</Text>
                )}
              </ListRow>
            ))}
            {busy !== 'search' && searched && contacts.length === 0 ? (
              <Text style={[type.small, { paddingVertical: 12 }]}>
                {cq.trim() ? t('invite.noContacts') : t('wizard.noContacts')}
              </Text>
            ) : null}
            {busy === 'search' ? <Text style={[type.small, { paddingVertical: 12 }]}>{t('common.loading')}</Text> : null}
          </View>
        </Card>
      ) : null}

      {tab === 'link' && features.inviteQr ? (
        <>
          <Card>
            <View style={s.head}>
              <View style={s.icon}><ThemedIcon ms="link" size={20} color={colors.primary} /></View>
              <Text style={[type.h3, { flex: 1 }]}>{t('invite.inviteLink')}</Text>
            </View>
            {link ? (
              <>
                <Text style={[type.small, { marginTop: 8 }]}>{t('invite.linkBody')}</Text>
                <Text selectable numberOfLines={1} style={s.link}>{link}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Button style={{ flex: 1 }} title={t('invite.copyLink')} onPress={copy} />
                  <Button variant="ghost" title={t('invite.share')} onPress={share} />
                </View>
                {isOwner ? (
                  <Button style={{ marginTop: 10 }} small variant="ghost" title={t('invite.rotate')} busy={busy === 'rotate'} onPress={() => setRotateOpen(true)} />
                ) : null}
              </>
            ) : (
              <>
                <Text style={[type.body, { marginTop: 8 }]}>{t('invite.ownerOnlyLink')}</Text>
                {isOwner ? <Button style={{ marginTop: 12 }} variant="soft" title={t('invite.newLinkRotates')} busy={busy === 'rotate'} onPress={rotate} /> : null}
              </>
            )}
          </Card>
          <InviteQr link={link} />
        </>
      ) : null}

      {tab === 'link' && !features.inviteQr ? (
        <Card>
          {link ? (
            <>
              <Text style={type.body}>{t('invite.linkBody')}</Text>
              <Text selectable style={s.link}>{link}</Text>
              <Button style={{ marginTop: 12 }} title={`${t('invite.copyLink')} / ${t('invite.share')}`} onPress={share} />
              <Text style={[type.small, { marginTop: 6 }]}>{t('m.group.copyViaShare')}</Text>
              {isOwner ? (
                <Button style={{ marginTop: 12 }} variant="ghost" title={t('invite.rotate')} busy={busy === 'rotate'} onPress={() => setRotateOpen(true)} />
              ) : null}
            </>
          ) : (
            <>
              <Text style={type.body}>{t('invite.ownerOnlyLink')}</Text>
              {isOwner ? <Button style={{ marginTop: 12 }} variant="soft" title={t('invite.newLinkRotates')} busy={busy === 'rotate'} onPress={rotate} /> : null}
            </>
          )}
        </Card>
      ) : null}

      <ErrText e={e} />

      <RemoveMemberFlow
        target={removeTarget}
        detail={detail}
        members={detail?.members || []}
        onRemovalPreview={(m) => fetchRemovalPreview(api.get, id, m.user_id)}
        onRemove={removeContact}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmSheet
        visible={rotateOpen}
        title={t('invite.rotate')}
        message={t('invite.linkBody')}
        confirmLabel={t('invite.rotate')}
        busy={busy === 'rotate'}
        onClose={() => busy !== 'rotate' && setRotateOpen(false)}
        onConfirm={rotate}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  memberTag: { fontSize: 12, fontWeight: '700', color: colors.secondary, paddingHorizontal: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: radius.tile, backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center' },
  link: { marginTop: 10, padding: 12, borderRadius: radius.inp, backgroundColor: colors.chipBg, borderWidth: 1, borderColor: colors.line, fontSize: 13, color: colors.darkTealText, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
