// Settings tab: web Shell account block + language picker, a link to Offline & notifications,
// and logout. (Group templates were removed from the product.)
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, type } from '../theme';
import {
  Screen, Card, Row, Avatar, Badge, Button, SectionHeader, ConfirmSheet, DevApiUrlCard,
} from '../ui';
import { usePrefs, useT } from '../i18n';
import { AccountErr, LinkRow, a } from '../components/account/AccountKit';

export default function SettingsScreen({ navigation }) {
  const t = useT();
  const { locale, setLocale, locales, localeMeta } = usePrefs();
  const { user, logout } = useAuth();
  const [e, setE] = useState(null);

  // Logout confirm.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

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

      {/* System */}
      <Card style={{ paddingVertical: 4 }}>
        <LinkRow title={t('m.settings.offlinePush')} sub={t('m.account.offlinePushSub')} onPress={() => navigation.navigate('System')} />
        <View style={a.sep} />
        <LinkRow title={t('m.account.viewProfile')} onPress={() => navigation.navigate('Profile')} />
      </Card>

      <Button variant="ghost" title={`⎋  ${t('profile.logOut')}`} onPress={() => setLogoutOpen(true)} style={{ borderColor: colors.dangerCardBorder }} />
      <DevApiUrlCard />

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
