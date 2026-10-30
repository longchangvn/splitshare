// Settings tab — web parity: web/src/pages/Settings.jsx (group template catalog) plus the
// web Shell account block + language picker, a link to Offline & notifications, and logout.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { colors, type } from '../theme';
import {
  Screen, Card, Row, Avatar, Badge, Button, SectionHeader, Field, Input, Sheet, ConfirmSheet, toast, DevApiUrlCard,
} from '../ui';
import { usePrefs, useT } from '../i18n';
import { getTemplates, saveTemplate, deleteTemplate, subscribeCatalogs } from '../settingsStore';
import { AccountErr, LinkRow, a } from '../components/account/AccountKit';

export default function SettingsScreen({ navigation }) {
  const t = useT();
  const { locale, setLocale, locales, localeMeta } = usePrefs();
  const { user, logout } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [e, setE] = useState(null);

  // Template add/edit sheet.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tplLabel, setTplLabel] = useState('');
  const [tplKey, setTplKey] = useState('');
  const [formErr, setFormErr] = useState(null);
  const [formBusy, setFormBusy] = useState(false);

  // Delete confirm.
  const [target, setTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  // Logout confirm.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const load = useCallback(() => { getTemplates().then(setTemplates).catch(() => {}); }, []);
  useEffect(() => { load(); return subscribeCatalogs(load); }, [load]);
  useFocusEffect(load);

  const openAdd = () => { setEditing(null); setTplLabel(''); setTplKey(''); setFormErr(null); setFormOpen(true); };
  const openEdit = (item) => { setEditing(item); setTplLabel(item.label); setTplKey(item.key); setFormErr(null); setFormOpen(true); };

  const submit = async () => {
    if (formBusy) return;
    setFormBusy(true); setFormErr(null);
    try {
      setTemplates(await saveTemplate({ id: editing?.id, key: tplKey, label: tplLabel }));
      setFormOpen(false);
      toast({ title: editing ? t('settings.templateUpdated') : t('settings.templateAdded'), color: 'teal' });
    } catch (err) {
      setFormErr({ friendly: true, message: err.message || String(err) });
    } finally { setFormBusy(false); }
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDelBusy(true);
    try {
      setTemplates(await deleteTemplate(target.id));
      toast({ title: t('settings.templateDeleted'), color: 'teal' });
      setTarget(null);
    } catch (err) {
      setTarget(null);
      setE({ friendly: true, message: err.message || String(err) });
    } finally { setDelBusy(false); }
  };

  const confirmLogout = async () => {
    setLogoutBusy(true);
    try { await logout(); } catch (err) { setLogoutOpen(false); setLogoutBusy(false); setE(err); }
  };

  const name = user?.display_name || user?.username || '';

  return (
    <Screen contentStyle={{ paddingBottom: 150 }}>
      <View style={{ marginTop: 4 }}>
        <Text style={type.title} accessibilityRole="header">{t('settings.title')}</Text>
        <Text style={type.small}>{t('settings.subtitle')}</Text>
      </View>
      <AccountErr e={e} style={{ marginTop: 0 }} />

      {/* Account block (web Shell sidebar account) */}
      <Card onPress={() => navigation.navigate('Profile')} accessibilityLabel={t('shell.accountNamed', { name })}>
        <Row gap={12}>
          <Avatar name={name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={type.h2} numberOfLines={1}>{name || '…'}</Text>
            {user?.email ? <Text style={type.small} numberOfLines={1}>{user.email}</Text> : null}
            {user ? (
              <View style={{ marginTop: 6 }}>
                <Badge
                  kind={user.email_verified ? 'settled' : 'nudge'}
                  label={user.email_verified ? t('shell.emailVerified') : t('shell.emailNotVerified')}
                />
              </View>
            ) : null}
          </View>
          <Text style={a.chev}>›</Text>
        </Row>
      </Card>

      {/* Language */}
      <SectionHeader title={t('shell.language')} />
      <Card style={{ paddingVertical: 4 }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('shell.chooseLanguage')}>
          {locales.map((l, i) => {
            const on = l === locale;
            const meta = localeMeta?.[l] || {};
            return (
              <View key={l}>
                {i > 0 ? <View style={a.sep} /> : null}
                <Pressable
                  style={({ pressed }) => [a.linkRow, pressed && { opacity: 0.7 }]}
                  onPress={() => setLocale(l)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={meta.native || l}
                >
                  <View style={[langCode, on && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: on ? '#fff' : colors.secondary }}>{meta.code || l.toUpperCase()}</Text>
                  </View>
                  <Text style={[type.h3, { flex: 1 }]}>{meta.native || meta.label || l}</Text>
                  {on ? <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>✓</Text> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Group templates (web Settings templates tab) */}
      <SectionHeader title={t('m.account.templates')} action={`＋ ${t('common.add')}`} onAction={openAdd} />
      <Card style={{ paddingVertical: 4 }}>
        <Text style={[type.small, { paddingTop: 10 }]}>{t('settings.templatesCount', { count: templates.length })}</Text>
        {templates.length === 0 ? (
          <Text style={[type.body, { color: colors.secondary, paddingVertical: 12 }]}>{t('settings.noTemplates')}</Text>
        ) : null}
        {templates.map((tpl, i) => (
          <View key={tpl.id}>
            {i > 0 ? <View style={a.sep} /> : null}
            <Row style={{ paddingVertical: 8, minHeight: 52 }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h3} numberOfLines={1}>{tpl.label}</Text>
                <Text style={type.small} numberOfLines={1}>{tpl.key}</Text>
              </View>
              <IconBtn label={`${t('common.edit')} ${tpl.label}`} glyph="✎" onPress={() => openEdit(tpl)} />
              <IconBtn label={`${t('common.delete')} ${tpl.label}`} glyph="🗑" danger onPress={() => { setE(null); setTarget(tpl); }} />
            </Row>
          </View>
        ))}
      </Card>

      {/* System */}
      <Card style={{ paddingVertical: 4 }}>
        <LinkRow title={t('m.settings.offlinePush')} sub={t('m.account.offlinePushSub')} onPress={() => navigation.navigate('System')} />
        <View style={a.sep} />
        <LinkRow title={t('m.account.viewProfile')} onPress={() => navigation.navigate('Profile')} />
      </Card>

      <Button variant="ghost" title={`⎋  ${t('profile.logOut')}`} onPress={() => setLogoutOpen(true)} style={{ borderColor: colors.dangerCardBorder }} />
      <DevApiUrlCard />

      <Sheet
        visible={formOpen}
        onClose={() => !formBusy && setFormOpen(false)}
        title={editing ? t('settings.editTemplate') : t('settings.addTemplate')}
      >
        <Field label={t('settings.templateLabel')} style={{ marginTop: 0 }}>
          <Input value={tplLabel} onChangeText={setTplLabel} placeholder={t('settings.templateLabelPh')} accessibilityLabel={t('settings.templateLabel')} />
        </Field>
        <Field label={t('settings.templateKey')} hint={t('settings.templateKeyHint')}>
          <Input
            value={tplKey}
            onChangeText={setTplKey}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('settings.templateKeyPh')}
            accessibilityLabel={t('settings.templateKey')}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Field>
        <AccountErr e={formErr} />
        <Button
          style={{ marginTop: 16, marginBottom: 4 }}
          title={editing ? t('common.saveChanges') : t('settings.addTemplate')}
          busy={formBusy}
          onPress={submit}
        />
      </Sheet>

      <ConfirmSheet
        visible={!!target}
        title={t('settings.deleteTemplate')}
        message={t('settings.deleteTemplateBody', { label: target?.label || '' })}
        confirmLabel={t('common.delete')}
        danger
        busy={delBusy}
        onConfirm={confirmDelete}
        onClose={() => !delBusy && setTarget(null)}
      />
      <ConfirmSheet
        visible={logoutOpen}
        title={t('profile.logoutTitle')}
        message={t('profile.logoutBody')}
        confirmLabel={t('profile.logOut')}
        danger
        busy={logoutBusy}
        onConfirm={confirmLogout}
        onClose={() => !logoutBusy && setLogoutOpen(false)}
      />
    </Screen>
  );
}

const langCode = {
  minWidth: 36, height: 28, borderRadius: 999, borderWidth: 1, borderColor: colors.line,
  backgroundColor: colors.chipBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
};

function IconBtn({ glyph, label, onPress, danger }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [{
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: danger ? colors.dangerCardBg : colors.chipBg,
      }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={{ fontSize: 16, color: danger ? colors.danger : colors.text }}>{glyph}</Text>
    </Pressable>
  );
}
