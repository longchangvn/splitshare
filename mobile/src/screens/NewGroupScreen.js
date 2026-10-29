// New group (spec 005 task 1.4) — two-step wizard: details, then people.
// Template labels come from the local catalogue (Settings) and resolve to the
// key sent to POST /groups/from-template. Success offers copy + open + the
// quick-add continuation into an expense.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { api, groupIdOf } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, ErrorBanner, Field, PressableRow, Segmented, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { getCatalogs, resolveTemplateKey } from '../lib/templates';

const CURRENCIES = ['USD', 'VND', 'EUR', 'GBP', 'JPY'];

export default function NewGroupScreen({ route, navigation }) {
  const params = route.params || {};
  const t = useT();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(params.name || '');
  const [currency, setCurrency] = useState(params.currency || 'USD');
  const [template, setTemplate] = useState('');
  const [templates, setTemplates] = useState([]);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [picked, setPicked] = useState(params.people || []);
  const [emails, setEmails] = useState('');
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getCatalogs().then((c) => setTemplates(c.templates)).catch(() => {}); }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const rows = await api.get('/api/v1/contacts?limit=20');
        setContacts(Array.isArray(rows) ? rows : rows.contacts || rows.items || []);
      } catch { /* contacts are optional */ }
    })();
  }, []));

  const search = async (value) => {
    setQuery(value);
    if (!value.trim()) {
      try {
        const rows = await api.get('/api/v1/contacts?limit=20');
        setContacts(Array.isArray(rows) ? rows : rows.contacts || rows.items || []);
      } catch { setContacts([]); }
      return;
    }
    try {
      const rows = await api.get(`/api/v1/contacts?q=${encodeURIComponent(value)}&limit=20`);
      setContacts(Array.isArray(rows) ? rows : rows.contacts || rows.items || []);
    } catch { setContacts([]); }
  };

  const togglePerson = (person) => {
    if (picked.some((p) => p.user_id === person.user_id)) {
      setPicked(picked.filter((p) => p.user_id !== person.user_id));
    } else if (picked.length < 49) {
      setPicked([...picked, person]);
    }
  };

  const goStep2 = () => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      setError({ status: 422, code: 'VALIDATION', message: t('wizard.groupName') });
      return;
    }
    setError(null);
    setStep(2);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const emailList = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const templateKey = resolveTemplateKey(templates, template, t('common.none'));
      let g;
      if (templateKey) {
        g = await api.post('/api/v1/groups/from-template', {
          name: name.trim(),
          currency,
          template: templateKey,
        });
      } else {
        g = await api.post('/api/v1/groups', {
          name: name.trim(),
          currency,
          member_ids: picked.map((p) => p.user_id),
          invite_emails: emailList,
        });
      }
      const groupId = groupIdOf(g);
      if (emailList.length > 0 && !templateKey && groupId) {
        await api.post(`/api/v1/groups/${groupId}/invites`, { emails: emailList }).catch(() => {});
      }
      if (templateKey && picked.length > 0 && groupId) {
        await api.post(`/api/v1/groups/${groupId}/members`, { user_ids: picked.map((p) => p.user_id) }).catch(() => {});
      }
      setCreated({
        group_id: groupId,
        name: name.trim(),
        invite_link: g?.invite_link || g?.invite_token || '',
        added: g?.added_members ?? picked.length,
        pending: g?.pending_invites ?? emailList.length,
      });
    } catch (err) {
      setError(err);
    } finally { setBusy(false); }
  };

  const inviteUrl = (link) => {
    const raw = String(link || '');
    if (!raw) return '';
    return /^https?:\/\//.test(raw) ? raw : raw.startsWith('splitshare://') ? raw : `https://app/g/${raw}`;
  };

  if (created) {
    return (
      <ScrollView style={s.wrap}>
        <Card style={s.successCard}>
          <Text style={s.successT}>{t('wizard.groupCreated')} 🎉</Text>
          <Text style={s.successName}>{created.name}</Text>
          <Text style={uiStyles.muted}>
            {t('groupDetail.membersCount', { count: created.added + 1, unit: created.added + 1 === 1 ? t('common.person') : t('common.people') })}
            {created.pending > 0 ? ` · ${created.pending} ${t('invite.sent').toLowerCase()}` : ''}
          </Text>
        </Card>
        {!!created.invite_link && (
          <Card>
            <Text style={uiStyles.h}>{t('wizard.copyInviteLink')}</Text>
            <Text style={s.link} selectable>{inviteUrl(created.invite_link)}</Text>
            <SpinButton
              title={copied ? t('common.copied') : t('invite.copyLink')}
              onPress={async () => {
                await Clipboard.setStringAsync(inviteUrl(created.invite_link));
                setCopied(true);
              }}
            />
            <SpinButton
              title={t('invite.share')}
              variant="ghost"
              onPress={() => Share.share({ message: inviteUrl(created.invite_link), url: inviteUrl(created.invite_link) }).catch(() => {})}
            />
          </Card>
        )}
        <SpinButton
          title={t('wizard.openGroup')}
          onPress={() => navigation.navigate('GroupDetail', { id: created.group_id })}
        />
        {created.group_id && (
          <SpinButton
            title={`＋ ${t('groupDetail.addExpense')}`}
            variant="ghost"
            onPress={() => navigation.navigate('AddExpense', { id: created.group_id })}
          />
        )}
        <SpinButton title={t('common.home')} variant="ghost" onPress={() => navigation.navigate('Main', { screen: 'Home' })} />
        <View style={{ height: 24 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('wizard.newGroup')}</Text>
      <Text style={uiStyles.muted}>
        {step === 1 ? t('wizard.groupDetails') : t('wizard.inviteMember')} · {currency}
      </Text>
      <View style={{ marginVertical: 10 }}>
        <Segmented
          options={[{ value: 1, label: '1 · ' + t('wizard.groupDetails') }, { value: 2, label: '2 · ' + t('wizard.inviteMember') }]}
          value={step}
          onChange={(next) => (next === 1 ? setStep(1) : goStep2())}
        />
      </View>

      {step === 1 && (
        <>
          <Card>
            <Field label={t('wizard.groupName')}>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder={t('wizard.groupNamePh')}
                maxLength={50}
                autoFocus
              />
            </Field>
            <Field label={t('wizard.currency')}>
              <View style={s.chips}>
                {CURRENCIES.map((c) => (
                  <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
                ))}
              </View>
            </Field>
            <Field label={t('wizard.template')} hint={t('settings.templateKeyHint')}>
              <View style={s.chips}>
                <Chip label={t('common.none')} selected={!template} onPress={() => setTemplate('')} />
                {templates.map((tpl) => (
                  <Chip key={tpl.key} label={tpl.label} selected={template === tpl.label} onPress={() => setTemplate(tpl.label)} />
                ))}
              </View>
            </Field>
          </Card>
          <ErrorBanner error={error} />
          <SpinButton title={t('common.continue')} onPress={goStep2} />
        </>
      )}

      {step === 2 && (
        <>
          {picked.length > 0 && (
            <Card>
              <Text style={uiStyles.h}>{t('common.members')} ({picked.length + 1})</Text>
              <View style={s.chips}>
                <Chip label={t('quickAdd.you')} selected />
                {picked.map((p) => (
                  <Chip key={p.user_id} label={`${p.display_name} ✓`} selected onPress={() => togglePerson(p)} />
                ))}
              </View>
            </Card>
          )}
          <Card>
            <Text style={uiStyles.h}>{t('wizard.yourContacts')}</Text>
            <TextInput
              style={s.input}
              value={query}
              onChangeText={search}
              placeholder={t('wizard.searchPh')}
              autoCapitalize="none"
            />
            <View style={s.chips}>
              {contacts.length === 0 && <Text style={uiStyles.muted}>{t('wizard.noContacts')}</Text>}
              {contacts.slice(0, 20).map((c) => (
                <Chip
                  key={c.user_id}
                  label={`${picked.some((p) => p.user_id === c.user_id) ? '✓ ' : '＋ '}${c.display_name}`}
                  selected={picked.some((p) => p.user_id === c.user_id)}
                  onPress={() => togglePerson(c)}
                  accessibilityLabel={t('invite.addNamed', { name: c.display_name })}
                />
              ))}
            </View>
          </Card>
          <Card>
            <Text style={uiStyles.h}>{t('wizard.inviteByEmail')}</Text>
            <TextInput
              style={s.input}
              value={emails}
              onChangeText={setEmails}
              placeholder={t('wizard.emailsPh')}
              autoCapitalize="none"
              multiline
            />
          </Card>
          <ErrorBanner error={error} />
          <SpinButton
            title={busy ? t('profile.saving') : t('wizard.createGroup')}
            busy={busy}
            onPress={create}
          />
          <SpinButton title={t('common.back')} variant="ghost" onPress={() => setStep(1)} />
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, minHeight: 44, fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  link: { fontSize: 11, color: colors.darkTealText, backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 10, marginVertical: 8 },
  successCard: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
  successT: { fontSize: 16, fontWeight: '800', color: colors.primary },
  successName: { fontSize: 20, fontWeight: '800', marginVertical: 4 },
});
