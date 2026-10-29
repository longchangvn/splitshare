// Quick "Add expense" picker — native port of web/src/components/QuickAddExpense.jsx.
// Pick people and/or one group; resolveQuickAddFlow decides what Next does:
//   group only     → AddExpense for that group
//   people only    → POST /groups (auto-named, USD) → AddExpense
//   people + group → GET /groups/:id members → NewGroup wizard prefilled (forExpense)
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api, groupIdOf } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Avatar, Button, Card, CheckRow, ErrText, Field, Input, Screen, Skeleton } from '../ui';
import { defaultGroupName, mergeMembers, resolveQuickAddFlow } from '../shared/quickAdd';
import { DEFAULT_CURRENCY, asList, sortByName } from '../components/home/homeUtils';

export default function QuickAddScreen({ navigation }) {
  const t = useT();
  const { user } = useAuth() || {};
  const meId = user?.user_id || user?.id || null;
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]); // user_id[]
  const [groupId, setGroupId] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [c, g] = await Promise.all([api.get('/api/v1/contacts?limit=50'), api.get('/api/v1/groups')]);
        if (!live) return;
        setContacts(sortByName(asList(c, 'items', 'contacts')));
        setGroups(sortByName(asList(g, 'items', 'groups'), 'name'));
      } catch (err) { if (live) setE(err); } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, []);

  const toggle = (uid) => setSelected((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));
  const people = selected.map((uid) => contacts.find((c) => c.user_id === uid)).filter(Boolean);
  const flow = resolveQuickAddFlow(people.length, groupId);
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? contacts.filter((c) => `${c.display_name || ''} ${c.username || ''}`.toLowerCase().includes(needle))
    : contacts;

  const next = async () => {
    if (!flow || busy) return;
    setBusy(true); setE(null);
    try {
      if (flow === 'group') {
        navigation.replace('AddExpense', { id: groupId });
      } else if (flow === 'people') {
        const g = await api.post('/api/v1/groups', {
          name: defaultGroupName(people, t('quickAdd.you')),
          currency: DEFAULT_CURRENCY,
          member_ids: mergeMembers(people, [], meId).map((p) => p.user_id),
          invite_emails: [],
        });
        const gid = groupIdOf(g);
        if (!gid) { setE({ message: t('errors.noGroupId') }); return; }
        navigation.replace('AddExpense', { id: gid });
      } else {
        const d = await api.get(`/api/v1/groups/${groupId}`);
        navigation.replace('NewGroup', { prefillMembers: mergeMembers(people, d?.members || [], meId), forExpense: true });
      }
    } catch (err) { setE(err); } finally { setBusy(false); }
  };

  return (
    <Screen
      footer={(
        <View style={{ gap: 6 }}>
          <Text style={[type.small, { textAlign: 'center' }]} accessibilityLiveRegion="polite">{t(`quickAdd.hint.${flow || 'none'}`)}</Text>
          <ErrText e={e} />
          <Button title={t('common.next')} busy={busy} disabled={!flow || loading} onPress={next} />
        </View>
      )}
    >
      <Card>
        <Text style={type.h2}>{t('quickAdd.people')}</Text>
        {people.length > 0 ? (
          <View style={s.chips}>
            {people.map((p) => (
              <Pressable
                key={p.user_id}
                style={s.sel}
                onPress={() => toggle(p.user_id)}
                accessibilityRole="button"
                accessibilityLabel={`${t('common.remove')} ${p.display_name}`}
              >
                <Avatar name={p.display_name} size={22} />
                <Text style={s.selT} numberOfLines={1}>{p.display_name}</Text>
                <Text style={s.selX}>✕</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[type.small, { marginTop: 4 }]}>{t('quickAdd.peoplePh')}</Text>
        )}
        <Field label={t('m.home.searchPeople')}>
          <Input
            value={q}
            onChangeText={setQ}
            placeholder={t('quickAdd.peoplePh')}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('m.home.searchPeople')}
          />
        </Field>
        <View style={s.box}>
          <View style={s.boxHead}>
            <Text style={s.boxTitle}>{t('quickAdd.allContacts')}</Text>
            {selected.length ? <Text style={s.boxCount}>{t('m.home.selected', { count: selected.length })}</Text> : null}
          </View>
          {loading ? <View style={{ gap: 10, paddingVertical: 6 }}><Skeleton h={18} /><Skeleton h={18} w="70%" /></View> : null}
          {!loading && contacts.length === 0 ? <Text style={type.small}>{t('quickAdd.noContacts')}</Text> : null}
          {!loading && contacts.length > 0 && visible.length === 0 ? <Text style={type.small}>{t('m.home.noMatches')}</Text> : null}
          {!loading ? visible.map((c) => (
            <CheckRow
              key={c.user_id}
              label={c.display_name}
              sub={c.username ? `@${c.username}` : null}
              checked={selected.includes(c.user_id)}
              onPress={() => toggle(c.user_id)}
            />
          )) : null}
        </View>
      </Card>

      <Card>
        <Text style={type.h2}>{t('quickAdd.group')}</Text>
        <View accessibilityRole="radiogroup" style={{ marginTop: 6 }}>
          <RadioRow label={t('quickAdd.noGroup')} checked={!groupId} onPress={() => setGroupId(null)} />
          {loading ? <Skeleton h={18} style={{ marginVertical: 10 }} /> : null}
          {!loading && groups.length === 0 ? <Text style={[type.small, { paddingVertical: 8 }]}>{t('quickAdd.noGroups')}</Text> : null}
          {groups.map((g) => {
            const closed = g.status === 'closed';
            return (
              <RadioRow
                key={g.group_id}
                label={g.name}
                sub={`${g.currency || ''}${closed ? ` · ${t('groupStatus.closed')}` : ''}`}
                checked={groupId === g.group_id}
                disabled={closed}
                onPress={() => setGroupId(g.group_id)}
              />
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

function RadioRow({ label, sub, checked, disabled, onPress }) {
  return (
    <Pressable
      style={[s.radioRow, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!checked, disabled: !!disabled }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
    >
      <View style={[s.radio, checked && s.radioOn]}>{checked ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.h3} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={type.small} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, borderRadius: 999, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, minHeight: 32, maxWidth: '100%' },
  selT: { fontSize: 13, fontWeight: '700', color: colors.primaryText, flexShrink: 1 },
  selX: { fontSize: 11, color: colors.primaryText, fontWeight: '800' },
  box: { borderWidth: 1, borderColor: '#e4ebe7', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  boxHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  boxTitle: { fontSize: 13, fontWeight: '700', color: colors.secondary },
  boxCount: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#f1f6f3' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
});
