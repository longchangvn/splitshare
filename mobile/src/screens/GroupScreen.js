// Frame 3 · Group — FR-10/11. Web parity: GroupDetail ledger/people tabs.
// B-proposed action hierarchy (UX polish): 1 teal CTA + quiet Invite row +
// Group settings··· two-tap destructives. Skeletons + spinner buttons throughout.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, TextInput, Alert, Modal, ScrollView, ActivityIndicator, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { api, fmt, groupIdOf, displayNameOf } from '../api/client';
import { colors } from '../theme';
import { SkeletonCard, SpinButton, ErrText, NetBadge, Avatar } from '../ui';

const TABS = ['Ledger', 'Settle', 'Members', 'Photos'];

export function GroupsScreen({ navigation }) {
  const [groups, setGroups] = useState(null);
  useFocusEffect(useCallback(() => {
    (async () => {
      try { setGroups((await api.get('/api/v1/me/balances')).groups || []); }
      catch { setGroups([]); }
    })();
  }, []));
  if (!groups) return <View style={s.wrap}>{[0, 1].map((i) => <SkeletonCard key={i} />)}</View>;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 14 }}
      data={groups}
      keyExtractor={(g) => g.group_id}
      ListEmptyComponent={<Text style={s.muted}>No groups yet — tap Add.</Text>}
      renderItem={({ item: g }) => (
        <Pressable style={s.card} onPress={() => navigation.navigate('GroupDetail', { id: g.group_id })}>
          <Text style={s.h}>{g.name}</Text>
          <Text style={s.muted}>{g.currency} · {fmt(Math.abs(g.net_cents), g.currency)}</Text>
        </Pressable>
      )}
    />
  );
}

export default function GroupDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [group, setGroup] = useState(null);
  const [me, setMe] = useState(null);
  const [plan, setPlan] = useState(null);
  const [tab, setTab] = useState('Ledger');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  // Archive view: default scope is active (OPEN); LOCKED = Archived.
  const [fStatus, setFStatus] = useState('OPEN');
  const [showF, setShowF] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [e, setE] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setE(null);
    try {
      const [g, m, l, p] = await Promise.all([
        api.get(`/api/v1/groups/${id}`),
        api.get(`/api/v1/groups/${id}/me`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?limit=100${qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : ''}${fStatus ? `&status=${fStatus}` : ''}`).catch(() => ({ items: [] })),
        api.get(`/api/v1/groups/${id}/settlement`).catch(() => null),
      ]);
      setGroup(g.group || g); setMe(m); setItems(l.items || []); setPlan(p);
    } catch (err) { setE(err); } finally { setLoading(false); }
  }, [id, qDebounced, fStatus]);
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const members = group?.members || [];
  const isOwner = group?.my_role === 'owner' || group?.my_role === 'Owner';
  const currency = group?.currency || 'USD';

  const doLeave = async () => {
    setBusy(true);
    try {
      await api.post(`/api/v1/groups/${id}/leave`, {});
      navigation.goBack();
    } catch (err) {
      Alert.alert('Cannot leave', err.code === 'HAS_OPEN_BALANCE' ? `Settle first: ${err.message}` : `${err.code} ${err.message}`);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    Alert.alert('Delete group?', 'Only if zero expenses or fully settled.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/groups/${id}`);
            navigation.navigate('Main', { screen: 'Groups' });
          } catch (err) { Alert.alert('Delete failed', `${err.code} ${err.message}`); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  const doRemove = (uid, name) => {
    Alert.alert('Remove member?', `${name} — blocked if net ≠ 0.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.del(`/api/v1/groups/${id}/members/${uid}`);
            load();
          } catch (err) {
            Alert.alert('Blocked', err.code === 'HAS_OPEN_BALANCE' ? `Settle first: ${err.message}` : `${err.code} ${err.message}`);
          }
        },
      },
    ]);
  };

  return (
    <View style={s.wrap}>
      {loading && !group ? (
        <><SkeletonCard /><SkeletonCard /></>
      ) : (
        <>
          <Text style={s.title}>{group?.name || '…'} · {currency}</Text>
          <Text style={s.muted}>{currency} · 1 currency locked · {members.length} members</Text>
          {me && (
            <View style={[s.card, me.net_cents < 0 && s.danger]}>
              <Text style={s.h}>
                {me.net_cents === 0 ? 'Settled' : me.net_cents < 0 ? `You owe ${fmt(-me.net_cents, currency)}` : `You are owed ${fmt(me.net_cents, currency)}`}
              </Text>
            </View>
          )}
          <ErrText e={e} />
          <View style={s.seg}>
            {TABS.map((t) => (
              <Pressable key={t} style={[s.segI, tab === t && s.segOn]} onPress={() => {
                if (t === 'Settle') return navigation.navigate('Settlement', { id });
                setTab(t);
              }}>
                <Text style={s.segT}>{t}{t === 'Settle' ? ` (${plan?.transfers?.length ?? '…' })` : ''}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'Ledger' && (
            <>
              <View style={s.frow}>
                <TextInput style={[s.inp, { flex: 1 }]} value={q} onChangeText={setQ} placeholder="Filter — title · payer · $ · date" />
                <Pressable style={s.fbtn} onPress={() => setShowF(!showF)}>
                  <Text>⧩{(fStatus && fStatus !== 'OPEN' ? '•' : '')}</Text>
                </Pressable>
              </View>
              {showF && (
                <View style={s.fcard}>
                  {[['OPEN', 'Active'], ['LOCKED', 'Archived']].map(([st, label]) => (
                    <Pressable key={st} style={[s.chip, fStatus === st && s.chipOn]} onPress={() => setFStatus(st)}>
                      <Text style={s.chipT}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
                {items.map((it, i) => {
                  const isPay = (it.kind || it.type) === 'payment';
                  const eid = it.expense_id || it.id;
                  return (
                    <Pressable
                      key={`${it.kind || it.type}-${it.id || it.expense_id || it.payment_id || i}`}
                      style={s.card}
                      onPress={() => {
                        if (!isPay && eid) navigation.navigate('ExpenseDetail', { groupId: id, expenseId: eid });
                      }}
                    >
                      <View style={s.row}>
                        <Text style={s.h}>{it.title || (isPay ? `${displayNameOf(members, it.from_user_id)} → ${displayNameOf(members, it.to_user_id)}` : 'Expense')}</Text>
                        <Text style={s.amt}>{fmt(it.amount_cents ?? 0, currency)}</Text>
                      </View>
                      <View style={s.row}>
                        <Text style={s.muted}>
                          {it.status === 'LOCKED' ? 'Archived · snapshot' : `my share ${fmt(it.my_share_cents || it.share_cents || 0, currency)}`}
                          {it.has_image ? ' · 🧾' : ''}
                        </Text>
                        <Text style={it.status === 'LOCKED' ? s.bLock : s.bOpen}>{it.status === 'LOCKED' ? 'ARCHIVED' : 'ACTIVE'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {!loading && items.length === 0 && (
                  <View style={s.card}>
                    {fStatus === 'LOCKED' ? (
                      <>
                        <Text style={s.h}>The archive is empty — settled entries will appear here.</Text>
                        <Pressable style={[s.quiet, { marginTop: 8 }]} onPress={() => setFStatus('OPEN')}>
                          <Text style={s.quietT}>View active</Text>
                        </Pressable>
                      </>
                    ) : plan && (plan.transfers || []).length === 0 ? (
                      <>
                        <Text style={s.h}>All settled 🎉</Text>
                        <Text style={s.muted}>Everyone is even — active entries are cleared out.</Text>
                        <Pressable style={[s.quiet, { marginTop: 8 }]} onPress={() => setFStatus('LOCKED')}>
                          <Text style={s.quietT}>View archive</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Text style={s.muted}>No active entries — add an expense or payment to get started.</Text>
                    )}
                  </View>
                )}
              </ScrollView>
            </>
          )}

          {tab === 'Members' && (
            <ScrollView style={{ flex: 1 }}>
              {members.map((m) => (
                <View key={m.user_id} style={s.card}>
                  <View style={s.row}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Avatar name={m.display_name} />
                      <View>
                        <Text style={s.h}>{m.display_name}{m.removed ? ' (removed)' : ''}</Text>
                        <Text style={s.muted}>@{m.username} · {m.role}</Text>
                      </View>
                    </View>
                    {isOwner && <Pressable onPress={() => doRemove(m.user_id, m.display_name)}><Text style={s.dangerT}>Remove</Text></Pressable>}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {tab === 'Photos' && (
            <View style={s.card}>
              <Text style={s.h}>Receipts</Text>
              <Text style={s.muted}>Open an expense to view its 0–5 photos. EXIF GPS stripped server-side.</Text>
            </View>
          )}

          {/* B-proposed action hierarchy: 1 CTA + quiet row + ··· settings */}
          <Pressable style={s.btn} onPress={() => navigation.navigate('AddExpense', { id })}>
            <Text style={s.btnT}>＋ New expense / payment</Text>
          </Pressable>
          <View style={s.quietRow}>
            <Pressable style={s.quiet} onPress={() => setInviteOpen(true)}><Text style={s.quietT}>Invite</Text></Pressable>
            <Pressable style={s.quiet} onPress={() => navigation.navigate('Settlement', { id })}><Text style={s.quietT}>Settle</Text></Pressable>
            <Pressable style={s.quiet} onPress={() => setSettingsOpen(!settingsOpen)}><Text style={s.quietT}>Group settings ···</Text></Pressable>
          </View>
          {settingsOpen && (
            <View style={s.card}>
              <Pressable style={s.setRow} onPress={() => { setSettingsOpen(false); navigation.navigate('Pay', { id }); }}>
                <Text>Record payment ›</Text>
              </Pressable>
              <Pressable style={s.setRow} onPress={doLeave} disabled={busy}>
                <Text>Leave group</Text>
              </Pressable>
              {isOwner && (
                <Pressable style={s.setRow} onPress={doDelete} disabled={busy}>
                  <Text style={s.dangerT}>Delete group (owner)</Text>
                </Pressable>
              )}
              {busy && <ActivityIndicator />}
            </View>
          )}
        </>
      )}

      <InviteSheet visible={inviteOpen} onClose={() => { setInviteOpen(false); load(); }} groupId={id} isOwner={isOwner} inviteLink={group?.invite_link} />
    </View>
  );
}

function InviteSheet({ visible, onClose, groupId, isOwner, inviteLink }) {
  const [emails, setEmails] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [link, setLink] = useState(inviteLink || '');
  const [busy, setBusy] = useState(false);

  const search = async (v) => {
    setCq(v);
    if (!v) return setContacts([]);
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(v)}&limit=20`)); }
    catch { setContacts([]); }
  };

  const sendEmails = async () => {
    setBusy(true);
    try {
      const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      await api.post(`/api/v1/groups/${groupId}/invites`, { emails: list });
      Alert.alert('Invited', `${list.length} email(s) invited.`);
      setEmails('');
    } catch (e) { Alert.alert('Invite failed', `${e.code} ${e.message}`); }
    finally { setBusy(false); }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/v1/groups/${groupId}/rotate-invite`, {});
      setLink(r.invite_link || r.invite_token || '');
    } catch (e) { Alert.alert('Rotate failed', `${e.code} ${e.message}`); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        <ScrollView style={s.sheet}>
          <Text style={s.h}>Invite · any member can invite</Text>
          <Text style={s.muted}>By email (email-only V1)</Text>
          <TextInput style={s.inp} value={emails} onChangeText={setEmails} placeholder="leo@…, kim@…" autoCapitalize="none" />
          <SpinButton title="Send invites" busy={busy} onPress={sendEmails} />
          <Text style={[s.h, { marginTop: 10 }]}>From contacts</Text>
          <TextInput style={s.inp} value={cq} onChangeText={search} placeholder="search contacts" />
          {contacts.map((c) => (
            <Pressable key={c.user_id} style={s.card} onPress={async () => {
              try {
                await api.post(`/api/v1/groups/${groupId}/members`, { user_ids: [c.user_id] });
                Alert.alert('Added', c.display_name);
              } catch (e) { Alert.alert('Add failed', `${e.code} ${e.message}`); }
            }}>
              <Text>+ {c.display_name} (@{c.username})</Text>
            </Pressable>
          ))}
          <Text style={[s.h, { marginTop: 10 }]}>Link</Text>
          <Text style={s.kbd}>{link || '—'}</Text>
          <View style={s.row}>
            <Pressable style={s.quiet} onPress={async () => {
              const url = String(link || '');
              try { await Share.share({ message: url, url }); }
              catch { Alert.alert('Invite link', url); }
            }}><Text>Copy</Text></Pressable>
            {isOwner && <Pressable style={s.quiet} onPress={rotate}><Text>Rotate (owner)</Text></Pressable>}
            <Pressable style={s.quiet} onPress={async () => {
              const url = String(link || '');
              if (await Sharing.isAvailableAsync().catch(() => false)) {
                await Sharing.shareAsync(url.startsWith('http') ? url : url).catch(() => Alert.alert('Invite link', url));
              } else Alert.alert('Invite link', url);
            }}><Text>Share</Text></Pressable>
          </View>
          <SpinButton title="Done" busy={false} variant="ghost" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14, gap: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
  danger: { backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder },
  dangerT: { color: colors.debtorText, fontWeight: '700' },
  h: { fontSize: 13, fontWeight: '800' },
  amt: { fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  frow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  fbtn: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  fcard: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { backgroundColor: colors.openBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.lightTealBg },
  chipT: { fontSize: 11, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: 10, padding: 3, gap: 3 },
  segI: { flex: 1, padding: 7, borderRadius: 8, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '700', color: colors.darkTealText },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 12 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44 },
  btnT: { color: '#fff', fontWeight: '700' },
  quietRow: { flexDirection: 'row', gap: 8 },
  quiet: { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: '#fff' },
  quietT: { fontWeight: '700', fontSize: 12 },
  setRow: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, minHeight: 44, justifyContent: 'center' },
  bOpen: { fontSize: 10, fontWeight: '800', backgroundColor: colors.openBg, color: colors.openText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '88%' },
  kbd: { fontSize: 10, color: colors.darkTealText, marginVertical: 6 },
});
