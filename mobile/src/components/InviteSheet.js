// Invite hub (spec 005 task 2.7) — email, contacts and link tabs. Copy writes
// the link to the clipboard (web parity), Share opens the native sheet, and the
// rotate action warns that the old link dies.
import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, ErrorBanner, Segmented, Sheet, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';

const TABS = [
  { value: 'email', key: 'invite.byEmail' },
  { value: 'contacts', key: 'invite.fromContacts' },
  { value: 'link', key: 'invite.inviteLink' },
];

export default function InviteSheet({ visible, onClose, group, onChanged }) {
  const t = useT();
  const [tab, setTab] = useState('email');
  const [emails, setEmails] = useState('');
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [link, setLink] = useState(group?.invite_link || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');

  const canManageLink = group?.my_role === 'owner' || group?.my_role === 'treasurer';

  const searchContacts = async (value) => {
    setQuery(value);
    if (!value.trim()) { setContacts([]); return; }
    try {
      const rows = await api.get(`/api/v1/contacts?q=${encodeURIComponent(value)}&limit=20`);
      setContacts(Array.isArray(rows) ? rows : rows.contacts || rows.items || []);
    } catch { setContacts([]); }
  };

  const sendEmails = async () => {
    const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (list.length === 0) { setError({ status: 422, code: 'VALIDATION', message: t('errors.needEmail') }); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/api/v1/groups/${group.group_id}/invites`, { emails: list });
      setNote(t('invite.sent'));
      setEmails('');
      if ((res?.pending || []).length) setNote(`${t('invite.sent')} · ${res.pending.length}`);
      onChanged?.();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const addContact = async (contact) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/groups/${group.group_id}/members`, { user_ids: [contact.user_id] });
      setNote(t('invite.memberAdded', { name: contact.display_name }));
      onChanged?.();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const shareUrl = (value) => {
    const raw = String(value || '');
    if (!raw) return '';
    return /^https?:\/\//.test(raw) ? raw : raw.startsWith('splitshare://') ? raw : `https://app/g/${raw}`;
  };

  const copyLink = async () => {
    const url = shareUrl(link);
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setNote(t('m.invite.copied'));
  };

  const shareLink = async () => {
    const url = shareUrl(link);
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch { await Clipboard.setStringAsync(url); setNote(t('m.invite.copied')); }
  };

  const rotate = () => {
    Alert.alert(t('invite.rotate'), t('invite.linkBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('invite.rotate'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.post(`/api/v1/groups/${group.group_id}/rotate-invite`, {});
            setLink(res.invite_link || res.invite_token || '');
            setNote(`${t('invite.rotated')} — ${t('invite.rotatedHint')}`);
          } catch (err) { setError(err); } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('invite.toGroup', { name: group?.name || '' })}>
      <Segmented options={TABS.map((x) => ({ value: x.value, label: t(x.key) }))} value={tab} onChange={setTab} />

      {tab === 'email' && (
        <Card style={{ marginTop: 10 }}>
          <Text style={uiStyles.h}>{t('invite.emails')}</Text>
          <Text style={uiStyles.muted}>{t('invite.emailsHint')}</Text>
          <TextInput
            style={s.input}
            value={emails}
            onChangeText={setEmails}
            placeholder={t('wizard.emailsPh')}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <SpinButton title={t('invite.sendInvites')} busy={busy} onPress={sendEmails} />
        </Card>
      )}

      {tab === 'contacts' && (
        <Card style={{ marginTop: 10 }}>
          <Text style={uiStyles.h}>{t('invite.searchYourContacts')}</Text>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={searchContacts}
            placeholder={t('wizard.searchPh')}
            autoCapitalize="none"
          />
          {contacts.length === 0 && <Text style={uiStyles.muted}>{t('invite.noContacts')}</Text>}
          <View style={s.chips}>
            {contacts.map((c) => (
              <Chip
                key={c.user_id}
                label={`＋ ${c.display_name}`}
                onPress={() => addContact(c)}
                accessibilityLabel={t('invite.addNamed', { name: c.display_name })}
              />
            ))}
          </View>
        </Card>
      )}

      {tab === 'link' && (
        <Card style={{ marginTop: 10 }}>
          <Text style={uiStyles.h}>{t('invite.shareableLink')}</Text>
          <Text style={uiStyles.muted}>{t('invite.linkHint')}</Text>
          <Text style={s.link} selectable>{shareUrl(link) || '—'}</Text>
          {!canManageLink && <Text style={uiStyles.muted}>{t('invite.ownerOnlyLink')}</Text>}
          <Pressable style={s.copy} onPress={copyLink} accessibilityRole="button">
            <Text style={s.copyT}>{t('invite.copyLink')}</Text>
          </Pressable>
          <SpinButton title={t('invite.share')} variant="ghost" onPress={shareLink} />
          {canManageLink && (
            <SpinButton title={t('invite.rotate')} variant="ghost" busy={busy} onPress={rotate} />
          )}
        </Card>
      )}

      {!!note && <Text style={s.note}>{note}</Text>}
      <ErrorBanner error={error} />
      <SpinButton title={t('common.close')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, minHeight: 44, fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  link: {
    fontSize: 11, color: colors.darkTealText, backgroundColor: colors.paleTealBg,
    borderRadius: 10, padding: 10, marginTop: 10,
  },
  copy: {
    backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center',
    marginTop: 10, minHeight: 44, justifyContent: 'center',
  },
  copyT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  note: { fontSize: 12, color: colors.owedText, fontWeight: '700', marginTop: 10 },
});
