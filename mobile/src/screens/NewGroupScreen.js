// Frame 7 · New group wizard + invite (FR-3/4).
// Design: docs/mobile-design.html §7. Web parity: Dashboard wizard
// (state.openNew) + InvitePage + SharePage + JoinPage (/g/:token).
// API: POST /groups {name 3-50, currency, member_ids[], invite_emails[]}
// (max 50/group, 200/user; 1 currency, immutable after first expense) ->
// POST /groups/:id/members {user_ids[]} (any member, from contacts) ->
// POST /groups/:id/invites {emails[]} (email-only) ->
// invite_link https://app…/g/<token> + splitshare://g/<token> (deep link,
// expo-linking) + Share sheet. Join: POST /groups/join {token} (idempotent;
// 410 INVITE_ROTATED). Owner-only: remove/rotate/delete.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';
import { colors } from '../theme';

export default function NewGroupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState([]);
  const [picked, setPicked] = useState([]);
  const [emails, setEmails] = useState('');
  const [link, setLink] = useState(null);
  const [groupId, setGroupId] = useState(null);

  const search = async (v) => {
    setQ(v);
    if (!v) return setContacts([]);
    // Derived contacts: share ≥1 active group, <200ms p95.
    setContacts((await api.get(`/api/v1/contacts?q=${encodeURIComponent(v)}&limit=20`).catch(() => [])) || []);
  };

  const create = async () => {
    try {
      const g = await api.post('/api/v1/groups', {
        name, currency,
        member_ids: picked.map((p) => p.user_id),
        invite_emails: emails.split(',').map((e) => e.trim()).filter(Boolean),
      });
      const gid = g.group_id || g.group?.group_id || g.id;
      setGroupId(gid);
      setLink(g.invite_link || g.invite_token);
      Alert.alert('Created', 'Invite link ready — share it below.');
    } catch (e) {
      Alert.alert('Create failed', `${e.code || ''} ${e.message || ''}`);
    }
  };

  const share = async () => {
    if (!link) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(link.startsWith('http') ? link : `https://app/g/${link}`).catch(() => {});
    } else {
      Alert.alert('Invite link', String(link));
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>New group · 2/3</Text>
      <Text style={s.muted}>● ● ○ invite members · {currency} ▾ locked</Text>
      <TextInput style={s.inp} value={name} onChangeText={setName} placeholder="Group name (3–50)" />
      <View style={s.card}>
        <Text style={s.h}>Add from contacts 🔍</Text>
        <Text style={s.muted}>Derived: share ≥1 active group · &lt;200ms p95</Text>
        <TextInput style={s.inp} value={q} onChangeText={search} placeholder="search contacts" />
        <View style={s.chips}>
          {contacts.map((c) => (
            <Pressable key={c.user_id} style={s.chip} onPress={() => setPicked([...picked, c])}>
              <Text style={s.chipT}>+ {c.display_name}</Text>
            </Pressable>
          ))}
          {picked.map((c) => (
            <Text key={`p-${c.user_id}`} style={s.chipOn}>{c.display_name} ✓</Text>
          ))}
        </View>
        <TextInput style={s.inp} value={emails} onChangeText={setEmails} placeholder="✉ invite_emails[]: leo@…, kim@…" autoCapitalize="none" />
      </View>
      <View style={s.dark}>
        <Text style={s.darkH}>🔗 Invite link</Text>
        <Text style={s.kbd}>{link || 'created after save · splitshare://g/<token>'}</Text>
        <View style={s.row}>
          <Pressable style={s.btn} onPress={() => Alert.alert('Copied', String(link || ''))}><Text style={s.btnT}>Copy link</Text></Pressable>
          <Pressable style={[s.btn, s.btnSec]} onPress={share}><Text style={[s.btnT, s.btnSecT]}>Share sheet</Text></Pressable>
        </View>
        <Text style={s.darkSub}>Any member can invite · only owner removes / rotates / deletes</Text>
      </View>
      <Text style={s.muted}>Pending email auto-consumed ≤30d on register · join idempotent · removed shown as "Name (removed)"</Text>
      <Pressable style={s.btn} onPress={create}>
        <Text style={s.btnT}>Create group · {picked.length} members{groupId ? ' ✓' : ''}</Text>
      </Pressable>
      {groupId && (
        <Pressable style={s.ghost} onPress={() => navigation.navigate('GroupDetail', { id: groupId })}>
          <Text>Open group ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14, gap: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  muted: { fontSize: 11, color: colors.secondary },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12 },
  h: { fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipT: { fontSize: 11, fontWeight: '700' },
  chipOn: { backgroundColor: colors.lightTealBg, color: colors.darkTealText, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800' },
  dark: { backgroundColor: colors.darkHero, borderRadius: 16, padding: 12 },
  darkH: { color: '#fff', fontWeight: '800' },
  darkSub: { color: colors.muted, fontSize: 11, marginTop: 6 },
  kbd: { fontSize: 10, backgroundColor: colors.darkHero, color: colors.accentLight, fontFamily: 'monospace', marginVertical: 6 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btnT: { color: '#fff', fontWeight: '700' },
  btnSec: { backgroundColor: colors.lightTealBg },
  btnSecT: { color: colors.darkTealText },
  ghost: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 13, alignItems: 'center' },
});
