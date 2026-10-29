// Quick add (spec 005 task 1.3) — the ＋ tab. Pick people, a group, or both:
//   group            → straight to the expense form for that group
//   people           → auto-create a group named after them, then the expense
//   people + group   → prefilled New group wizard (members merged), then expense
// Fewer taps than the web modal: the picker and the CTA are one screen.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, groupIdOf } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, ErrorBanner, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { defaultGroupName, mergeMembers, resolveQuickAddFlow } from '../lib/quickAdd';
import { fmt } from '../lib/money';

export default function QuickAdd({ navigation }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, balances] = await Promise.all([
        api.get('/api/v1/contacts?limit=20').catch(() => []),
        api.get('/api/v1/me/balances').catch(() => ({ groups: [] })),
      ]);
      setContacts(Array.isArray(c) ? c : c.contacts || c.items || []);
      setGroups(balances.groups || []);
    } catch (err) { setError(err); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const search = async (value) => {
    setQuery(value);
    try {
      const rows = await api.get(`/api/v1/contacts?q=${encodeURIComponent(value)}&limit=20`);
      setContacts(Array.isArray(rows) ? rows : rows.contacts || rows.items || []);
    } catch { /* keep previous */ }
  };

  const togglePerson = (person) => {
    setPeople(people.some((p) => p.user_id === person.user_id)
      ? people.filter((p) => p.user_id !== person.user_id)
      : [...people, person]);
  };

  const flow = resolveQuickAddFlow(people.length, groupId);
  const hintKey = `quickAdd.hint.${flow || 'none'}`;
  const selectedGroup = groups.find((g) => g.group_id === groupId);

  const proceed = async () => {
    setError(null);
    if (flow === 'group') {
      navigation.navigate('AddExpense', { id: groupId });
      return;
    }
    if (flow === 'people') {
      setBusy(true);
      try {
        const created = await api.post('/api/v1/groups', {
          name: defaultGroupName(people, t('quickAdd.you')),
          currency: 'USD',
          member_ids: people.map((p) => p.user_id),
          invite_emails: [],
        });
        const id = groupIdOf(created);
        if (!id) { setError({ status: 500, code: 'VALIDATION', message: t('errors.noGroupId') }); return; }
        navigation.navigate('AddExpense', { id });
      } catch (err) { setError(err); } finally { setBusy(false); }
      return;
    }
    if (flow === 'people-and-group') {
      const members = mergeMembers(people, selectedGroup ? [].concat(selectedGroup.owner || []) : [], meId);
      navigation.navigate('NewGroup', {
        people,
        name: defaultGroupName([...people], t('quickAdd.you')),
        currency: selectedGroup?.currency || 'USD',
        merged: members,
      });
    }
  };

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('quickAdd.title')}</Text>
      <Text style={uiStyles.muted}>{t(hintKey)}</Text>

      <Card>
        <Text style={uiStyles.h}>{t('quickAdd.people')}</Text>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={search}
          placeholder={t('wizard.searchPh')}
          autoCapitalize="none"
          accessibilityLabel={t('quickAdd.peoplePh')}
        />
        <View style={s.chips}>
          {contacts.length === 0 && <Text style={uiStyles.muted}>{t('quickAdd.noContacts')}</Text>}
          {contacts.slice(0, 20).map((c) => (
            <Chip
              key={c.user_id}
              label={`${people.some((p) => p.user_id === c.user_id) ? '✓ ' : '＋ '}${c.display_name}`}
              selected={people.some((p) => p.user_id === c.user_id)}
              onPress={() => togglePerson(c)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('quickAdd.group')}</Text>
        <View style={s.chips}>
          <Chip label={t('quickAdd.noGroups')} selected={!groupId} onPress={() => setGroupId('')} />
          {groups.map((g) => (
            <Chip
              key={g.group_id}
              label={`${g.name} · ${fmt(g.net_cents, g.currency)}`}
              selected={groupId === g.group_id}
              onPress={() => setGroupId(g.group_id)}
              accessibilityLabel={`${g.name} ${fmt(g.net_cents, g.currency)}`}
            />
          ))}
        </View>
      </Card>

      <ErrorBanner error={error} />
      <SpinButton
        title={flow === 'group'
          ? t('groupDetail.addExpense')
          : flow === 'people' ? t('wizard.createGroup') : flow === 'people-and-group' ? t('common.continue') : t('quickAdd.title')}
        busy={busy}
        disabled={!flow}
        onPress={proceed}
      />
      {people.length > 0 && (
        <Text style={s.note}>
          {t('wizard.groupName')}: {defaultGroupName(people, t('quickAdd.you'))}
        </Text>
      )}
      <SpinButton title={t('dashboard.createGroup')} variant="ghost" onPress={() => navigation.navigate('NewGroup')} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, minHeight: 44, fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  note: { fontSize: 11, color: colors.secondary, textAlign: 'center', marginTop: 8 },
});
