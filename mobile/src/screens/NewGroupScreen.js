// New group — native port of the web New-group wizard (GroupWizard / GroupCreated
// in web/src/pages/Dashboard.jsx).
// Step 1: name (3–50) + template (catalog labels, free text or None).
// Step 2: invite by email, search contacts, "Your contacts" (top 20 by name).
// Create: template → POST /groups/from-template, then /members, /invites, /share-link;
//         no template → POST /groups {name, currency, member_ids, invite_emails}.
// Params: prefillMembers (quick-add Flow 1) preselects people; forExpense → AddExpense.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import { api, groupIdOf } from '../api/client';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Button, Card, ChipRow, ErrText, Field, Input, Row, Screen } from '../ui';
import { getTemplates, subscribeCatalogs } from '../settingsStore';
import { resolveTemplateKey } from '../shared/wizardUtils';
import { PersonRow } from '../components/home/parts';
import {
  DEFAULT_CURRENCY, asList, boxContacts, nameOk as isNameOk, parseEmails, sortByName,
} from '../components/home/homeUtils';

const TOTAL_STEPS = 2;

export default function NewGroupScreen({ navigation, route }) {
  const t = useT();
  const prefill = Array.isArray(route?.params?.prefillMembers) ? route.params.prefillMembers : [];
  const forExpense = !!route?.params?.forExpense;

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState('');
  const [templates, setTemplates] = useState([]);
  const [emails, setEmails] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [myContacts, setMyContacts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(prefill);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [e, setE] = useState(null);

  // Template catalog (device-local, async) + live updates from Settings.
  useEffect(() => {
    let live = true;
    const refresh = () => getTemplates().then((list) => { if (live) setTemplates(list || []); }).catch(() => {});
    refresh();
    const off = subscribeCatalogs(refresh);
    return () => { live = false; off(); };
  }, []);

  // "Your contacts" box — top 20, sorted by display name. Non-fatal on failure.
  useEffect(() => {
    let live = true;
    api.get('/api/v1/contacts?limit=20')
      .then((list) => { if (live) setMyContacts(sortByName(asList(list, 'items', 'contacts'))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: created ? t('wizard.groupCreated') : t('wizard.newGroup') });
  }, [created, navigation, t]);

  const nameValid = isNameOk(name);
  const noneLabel = t('common.none');
  const templateOptions = [noneLabel, ...templates.map((x) => x.label)];
  const chipValue = tpl.trim() === '' ? noneLabel : tpl;

  const toggle = (c) => setPicked((cur) => (cur.some((p) => p.user_id === c.user_id)
    ? cur.filter((p) => p.user_id !== c.user_id)
    : [...cur, c]));
  const isPicked = (c) => picked.some((p) => p.user_id === c.user_id);

  const searchContacts = async () => {
    setSearching(true);
    try {
      const r = await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}&limit=20`);
      setContacts(asList(r, 'items', 'contacts'));
      setE(null);
    } catch (err) { setE(err); } finally { setSearching(false); }
  };

  const create = async () => {
    if (!nameValid || creating) return;
    setCreating(true); setE(null);
    try {
      const emailList = parseEmails(emails);
      const memberIds = picked.map((p) => p.user_id);
      const tplKey = resolveTemplateKey(templates, tpl, noneLabel);
      const tplLabel = tplKey ? (templates.find((x) => x.key === tplKey)?.label || tplKey) : '';
      const trimmed = name.trim();
      let g;
      let link = null;
      if (tplKey) {
        g = await api.post('/api/v1/groups/from-template', { name: trimmed, currency: DEFAULT_CURRENCY, template: tplKey });
        const gid0 = groupIdOf(g);
        if (!gid0) { setE({ message: t('errors.noGroupId') }); return; }
        if (memberIds.length > 0) await api.post(`/api/v1/groups/${gid0}/members`, { user_ids: memberIds });
        if (emailList.length > 0) await api.post(`/api/v1/groups/${gid0}/invites`, { emails: emailList });
        try {
          const sl = await api.post(`/api/v1/groups/${gid0}/share-link`, {});
          link = sl?.invite_link || sl?.link || null;
        } catch { link = null; }
      } else {
        g = await api.post('/api/v1/groups', {
          name: trimmed,
          currency: DEFAULT_CURRENCY,
          member_ids: memberIds,
          invite_emails: emailList,
        });
        link = g?.invite_link || null;
      }
      const gid = groupIdOf(g);
      if (!gid) { setE({ message: t('errors.noGroupId') }); return; }
      if (forExpense) {
        navigation.replace('AddExpense', { id: gid });
        return;
      }
      setCreated({
        gid,
        link,
        name: g?.group?.name || trimmed,
        currency: DEFAULT_CURRENCY,
        template: tplLabel,
        people: [...picked.map((p) => p.display_name), ...emailList],
      });
    } catch (err) { setE(err); } finally { setCreating(false); }
  };

  const shareLink = async () => {
    if (!created?.link) return;
    try { await Share.share({ message: created.link, url: created.link }); } catch { /* user dismissed */ }
  };

  if (created) {
    return (
      <Screen
        footer={(
          <View style={{ gap: 10 }}>
            {created.link ? <Button variant="ghost" title={t('m.home.shareInviteLink')} onPress={shareLink} /> : null}
            <Button title={t('wizard.openGroup')} onPress={() => navigation.replace('GroupDetail', { id: created.gid })} />
          </View>
        )}
      >
        <View style={s.success}>
          <View style={s.happy}><View style={s.happyIn}><Text style={s.happyT}>☺</Text></View></View>
          <Text style={s.doneName} accessibilityRole="header">{created.name}</Text>
          <View style={s.pills}>
            <Text style={s.pill}>{created.currency}</Text>
            {created.template ? <Text style={s.pill}>{created.template}</Text> : null}
          </View>
          {created.people.length > 0 ? <Text style={s.people}>{created.people.join(', ')}</Text> : null}
        </View>
        {created.link ? (
          <Card>
            <Text style={type.kicker}>{t('m.home.inviteLink')}</Text>
            <Text style={[type.body, { marginTop: 6 }]} selectable numberOfLines={2}>{created.link}</Text>
          </Card>
        ) : null}
      </Screen>
    );
  }

  const box = boxContacts(picked, myContacts);

  return (
    <Screen
      footer={(
        <View style={{ gap: 6 }}>
          <ErrText e={e} />
          {step === 1 ? (
            <Button title={t('common.continue')} disabled={!nameValid} onPress={() => nameValid && setStep(2)} />
          ) : (
            <Row gap={10}>
              <Button style={{ flex: 1 }} variant="ghost" title={t('common.back')} disabled={creating} onPress={() => setStep(1)} />
              <Button
                style={{ flex: 1 }}
                title={forExpense ? t('common.next') : t('wizard.createGroup')}
                busy={creating}
                disabled={!nameValid}
                onPress={create}
              />
            </Row>
          )}
        </View>
      )}
    >
      <View style={s.steps} accessibilityLabel={t('m.home.step', { n: step, total: TOTAL_STEPS })}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View key={i} style={[s.stepBar, i < step && s.stepOn]} />
        ))}
      </View>
      <Text style={type.small}>{t('m.home.step', { n: step, total: TOTAL_STEPS })}</Text>

      {step === 1 ? (
        <Card>
          <Text style={type.h2}>{t('wizard.groupDetails')}</Text>
          <Field label={t('wizard.groupName')} hint={t('m.home.nameRule')}>
            <Input
              value={name}
              onChangeText={setName}
              placeholder={t('wizard.groupNamePh')}
              maxLength={50}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => nameValid && setStep(2)}
              accessibilityLabel={t('wizard.groupName')}
            />
          </Field>
          <Field label={t('wizard.template')}>
            <ChipRow
              options={templateOptions.map((label) => ({ value: label, label }))}
              value={chipValue}
              onChange={(v) => setTpl(v === noneLabel ? '' : v)}
            />
            <Input
              style={{ marginTop: 10 }}
              value={tpl}
              onChangeText={setTpl}
              placeholder={t('m.home.templateFree')}
              autoCapitalize="none"
              accessibilityLabel={t('wizard.template')}
            />
          </Field>
        </Card>
      ) : (
        <Card>
          <Text style={type.h2}>{t('wizard.inviteMember')}</Text>
          <Field label={t('wizard.inviteByEmail')}>
            <Input
              value={emails}
              onChangeText={setEmails}
              placeholder={t('wizard.emailsPh')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              multiline
              style={{ minHeight: 70, textAlignVertical: 'top' }}
              accessibilityLabel={t('wizard.inviteByEmail')}
            />
          </Field>
          <Field label={t('wizard.searchContacts')}>
            <Row gap={8}>
              <Input
                style={{ flex: 1 }}
                value={cq}
                onChangeText={setCq}
                placeholder={t('wizard.searchPh')}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={searchContacts}
                accessibilityLabel={t('wizard.searchContacts')}
              />
              <Button variant="ghost" title={t('common.search')} busy={searching} onPress={searchContacts} />
            </Row>
          </Field>
          {contacts.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {contacts.map((c, i) => (
                <PersonRow key={c.user_id} person={c} on={isPicked(c)} onToggle={() => toggle(c)} last={i === contacts.length - 1} />
              ))}
            </View>
          ) : null}
          <View style={s.box}>
            <Text style={s.boxTitle}>{t('wizard.yourContacts')}</Text>
            {box.length === 0 ? (
              <Text style={type.small}>{t('wizard.noContacts')}</Text>
            ) : box.map((c, i) => (
              <PersonRow key={c.user_id} person={c} on={isPicked(c)} onToggle={() => toggle(c)} last={i === box.length - 1} />
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  stepOn: { backgroundColor: colors.primary },
  box: { borderWidth: 1, borderColor: '#e4ebe7', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  boxTitle: { fontSize: 13, fontWeight: '700', color: colors.secondary, marginBottom: 4 },
  success: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  happy: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#e7f6ee', alignItems: 'center', justifyContent: 'center' },
  happyIn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  happyT: { color: '#fff', fontSize: 24, marginTop: -2 },
  doneName: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: colors.text, textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  pill: { backgroundColor: '#f2f4f3', color: colors.text, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, fontWeight: '600', overflow: 'hidden' },
  people: { color: '#5c6560', fontSize: 14, textAlign: 'center' },
});
