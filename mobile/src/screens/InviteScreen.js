// Invite — web parity with pages/InvitePage.jsx + GroupDetail invite dialog:
// By email (POST /invites {emails}) · From contacts (GET /contacts, POST /members {user_ids})
// · Link (invite_link, copy/share via the native share sheet, owner can rotate).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Share, Platform, StyleSheet } from 'react-native';
import { api } from '../api/client';
import { useT } from '../i18n';
import { colors, type, radius } from '../theme';
import { Screen, Card, Segmented, Input, Field, Button, Avatar, ErrText, ConfirmSheet, toast } from '../ui';
import { ListRow, p as parts } from '../components/group/parts';
import { parseEmails } from '../components/group/helpers';

export default function InviteScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('email');
  const [emails, setEmails] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [added, setAdded] = useState([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [e, setE] = useState(null);
  const searchReq = useRef(0);

  useEffect(() => {
    let live = true;
    api.get(`/api/v1/groups/${id}`).then((g) => {
      if (!live) return;
      const det = g?.group || g;
      setDetail(det);
      if (det?.invite_link) setLink(det.invite_link);
      if (det?.name) navigation.setOptions({ title: t('invite.toGroup', { name: det.name }) });
    }).catch((err) => { if (live) setE(err); });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced contact search; request counter drops stale responses.
  useEffect(() => {
    if (tab !== 'contacts') return undefined;
    const q = cq.trim();
    if (!q) { setContacts([]); setSearched(false); return undefined; }
    const h = setTimeout(async () => {
      const r = ++searchReq.current;
      setBusy('search');
      try {
        const rows = await api.get(`/api/v1/contacts?q=${encodeURIComponent(q)}&limit=20`);
        if (r === searchReq.current) { setContacts(Array.isArray(rows) ? rows : []); setSearched(true); setE(null); }
      } catch (err) { if (r === searchReq.current) setE(err); } finally { if (r === searchReq.current) setBusy(null); }
    }, 350);
    return () => clearTimeout(h);
  }, [cq, tab]);

  const sendEmails = async () => {
    const list = parseEmails(emails);
    if (list.length === 0) { setE({ message: t('errors.needEmail') }); return; }
    setBusy('email'); setE(null);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      toast({
        title: t('invite.sent'),
        message: t('m.group.inviteResult', { added: (r?.added || []).join(', ') || '—', pending: (r?.pending || []).join(', ') || '—' }),
        color: 'teal',
      });
      setEmails('');
    } catch (err) { setE(err); } finally { setBusy(null); }
  };

  const addContact = async (c) => {
    setBusy(c.user_id); setE(null);
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [c.user_id] });
      toast({ title: t('invite.memberAdded', { name: c.display_name }), color: 'teal' });
      setAdded((prev) => [...prev, c.user_id]);
    } catch (err) { setE(err); } finally { setBusy(null); }
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

  const isOwner = detail?.my_role === 'owner';
  const visibleContacts = contacts.filter((c) => !added.includes(c.user_id));

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
        </Card>
      ) : null}

      {tab === 'contacts' ? (
        <Card>
          <Field label={t('wizard.searchContacts')} style={{ marginTop: 0 }}>
            <Input value={cq} onChangeText={setCq} placeholder={t('wizard.searchPh')} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          </Field>
          <View style={{ marginTop: 6 }}>
            {visibleContacts.map((c, i) => (
              <ListRow key={c.user_id} last={i === visibleContacts.length - 1}>
                <Avatar name={c.display_name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.h3} numberOfLines={1}>{c.display_name}</Text>
                  {c.username ? <Text style={parts.meta} numberOfLines={1}>@{c.username}</Text> : null}
                </View>
                <Button small variant="soft" title={t('common.add')} busy={busy === c.user_id} accessibilityLabel={t('invite.addNamed', { name: c.display_name })} onPress={() => addContact(c)} />
              </ListRow>
            ))}
            {busy !== 'search' && visibleContacts.length === 0 ? (
              <Text style={[type.small, { paddingVertical: 12 }]}>
                {cq.trim() && searched ? t('invite.noContacts') : t('invite.searchYourContacts')}
              </Text>
            ) : null}
            {busy === 'search' ? <Text style={[type.small, { paddingVertical: 12 }]}>{t('common.loading')}</Text> : null}
          </View>
        </Card>
      ) : null}

      {tab === 'link' ? (
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
  link: { marginTop: 10, padding: 12, borderRadius: radius.inp, backgroundColor: colors.chipBg, borderWidth: 1, borderColor: colors.line, fontSize: 13, color: colors.darkTealText, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
