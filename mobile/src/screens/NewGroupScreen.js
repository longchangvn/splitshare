// Frame 7 · New group wizard + invite — FR-3/4 email-only.
// POST /groups {name 3-50, currency immutable, member_ids, invite_emails}
// POST /groups/:id/invites + POST /groups/:id/members — any-member invite.
// max 50/group, 200/user. Any-member invite; owner-only remove/rotate/delete.
// Pending email auto-consumed ≤30d. Join idempotent; rotated 410.
// UX polish: spinner buttons, validation messages.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Share as RnShare } from 'react-native';
import * as Sharing from 'expo-sharing';
import { api, groupIdOf } from '../api/client';
import { colors } from '../theme';
import { SpinButton, ErrText } from '../ui';

const CURS = ['USD', 'VND', 'EUR', 'JPY', 'GBP'];

export default function NewGroupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState([]);
  const [picked, setPicked] = useState([]);
  const [emails, setEmails] = useState('');
  const [link, setLink] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  const search = async (v) => {
    setQ(v);
    if (!v) return setContacts([]);
    try {
      const r = await api.get(`/api/v1/contacts?q=${encodeURIComponent(v)}&limit=20`);
      setContacts(Array.isArray(r) ? r : r.contacts || r.items || []);
    } catch { setContacts([]); }
  };

  const create = async () => {
    setE(null);
    if (name.trim().length < 3 || name.trim().length > 50) {
      return setE({ code: 'VALIDATION', message: 'Group name: 3–50 chars.' });
    }
    setBusy(true);
    try {
      const g = await api.post('/api/v1/groups', {
        name: name.trim(),
        currency,
        member_ids: picked.map((p) => p.user_id),
        invite_emails: emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
      });
      const gid = groupIdOf(g);
      setGroupId(gid);
      setLink(g.invite_link || g.invite_token || null);
      Alert.alert('Created', 'Invite link ready — share it below.');
    } catch (err) {
      setE(err);
      Alert.alert('Create failed', `${err.code || ''} ${err.message || ''}`);
    } finally { setBusy(false); }
  };

  const share = async () => {
    if (!link) return;
    const url = link.startsWith('http') ? link : `https://app/g/${link}`;
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(url).catch(() => Alert.alert('Invite link', url));
      else Alert.alert('Invite link', url);
    } catch { Alert.alert('Invite link', url); }
  };

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.title}>New group · 2-step</Text>
      <Text style={s.muted}>Step 1 name+currency · Step 2 invite · {currency} locked after first expense</Text>
      <TextInput style={s.inp} value={name} onChangeText={setName} placeholder="Group name (3–50)" maxLength={50} />
      <View style={s.chips}>
        {CURS.map((c) => (
          <Pressable key={c} style={[s.chip, currency === c && s.chipOn]} onPress={() => setCurrency(c)}>
            <Text style={s.chipT}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.h}>Add from contacts</Text>
        <Text style={s.muted}>Derived: share ≥1 active group · &lt;200ms p95</Text>
        <TextInput style={s.inp} value={q} onChangeText={search} placeholder="search contacts" />
        <View style={s.chips}>
          {contacts.map((c) => (
            <Pressable key={c.user_id} style={s.chip} onPress={() => {
              if (!picked.some((p) => p.user_id === c.user_id) && picked.length < 49) setPicked([...picked, c]);
            }}>
              <Text style={s.chipT}>+ {c.display_name}</Text>
            </Pressable>
          ))}
          {picked.map((c) => (
            <Pressable key={`p-${c.user_id}`} style={s.chipOn} onPress={() => setPicked(picked.filter((p) => p.user_id !== c.user_id))}>
              <Text style={s.chipT}>{c.display_name} ✓ (tap to remove)</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={emails} onChangeText={setEmails} placeholder="invite_emails[]: leo@…, kim@…" autoCapitalize="none" />
      </View>
      <View style={s.dark}>
        <Text style={s.darkH}>Invite link</Text>
        <Text style={s.kbd}>{link || 'created after save · splitshare://g/<token>'}</Text>
        <View style={s.row}>
          <Pressable style={s.btn} onPress={async () => {
            const url = String(link || '');
            try { await RnShare.share({ message: url, url }); }
            catch { Alert.alert('Invite link', url); }
          }}><Text style={s.btnT}>Copy link</Text></Pressable>
          <Pressable style={[s.btn, s.btnSec]} onPress={share}><Text style={[s.btnT, s.btnSecT]}>Share sheet</Text></Pressable>
        </View>
        <Text style={s.darkSub}>Any member can invite · only owner removes / rotates / deletes</Text>
      </View>
      <Text style={s.muted}>Pending email auto-consumed ≤30d on register · join idempotent · removed shown as "Name (removed)"</Text>
      <ErrText e={e} />
      <SpinButton title={`Create group · ${picked.length} member(s)`} busy={busy} onPress={create} />
      {groupId && (
        <Pressable style={s.ghost} onPress={() => navigation.navigate('GroupDetail', { id: groupId })}>
          <Text>Open group ›</Text>
        </Pressable>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  muted: { fontSize: 11, color: colors.secondary, marginTop: 4 },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 8 },
  h: { fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.lightTealBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipT: { fontSize: 11, fontWeight: '700' },
  dark: { backgroundColor: colors.darkHero, borderRadius: 16, padding: 12, marginTop: 8 },
  darkH: { color: '#fff', fontWeight: '800' },
  darkSub: { color: colors.muted, fontSize: 11, marginTop: 6 },
  kbd: { fontSize: 10, color: colors.accentLight, marginVertical: 6 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btnT: { color: '#fff', fontWeight: '700' },
  btnSec: { backgroundColor: colors.lightTealBg },
  btnSecT: { color: colors.darkTealText },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
});
