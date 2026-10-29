// You / Profile (spec 005 tasks 5.1, 5.2) — account, payment handles CRUD,
// language (EN/VI only, D4), password, delete account and logout with confirm.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Avatar, Card, Chip, ErrorBanner, PressableRow, SpinButton, uiStyles,
} from '../ui';
import { usePrefs, useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { unregisterPush } from '../push/notifications';

export default function ProfileScreen({ navigation }) {
  const t = useT();
  const { locale, setLocale } = usePrefs();
  const { user, logout, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [handles, setHandles] = useState([]);
  const [handleLabel, setHandleLabel] = useState('');
  const [handleDetails, setHandleDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadHandles = useCallback(async () => {
    try {
      const rows = await api.get('/api/v1/me/handles');
      setHandles(Array.isArray(rows) ? rows : []);
    } catch { setHandles([]); }
  }, []);

  useFocusEffect(useCallback(() => {
    refreshMe();
    loadHandles();
  }, [loadHandles]));

  React.useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setPhone(user.phone || '');
    }
  }, [user?.user_id]);

  const saveProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/api/v1/me', { display_name: displayName.trim(), phone: phone.trim() || null });
      await refreshMe();
      Alert.alert(t('profile.updated'), '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const changePassword = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/api/v1/me/password', {
        ...(currentPassword ? { current_password: currentPassword } : {}),
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert(t('profile.passwordChanged'), '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const addHandle = async () => {
    if (!handleLabel.trim() || !handleDetails.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/me/handles', { label: handleLabel.trim(), details: handleDetails.trim() });
      setHandleLabel('');
      setHandleDetails('');
      await loadHandles();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const removeHandle = async (handle) => {
    setBusy(true);
    try {
      await api.del(`/api/v1/me/handles/${handle.handle_id || handle.id}`);
      await loadHandles();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const deleteAccount = () => {
    Alert.alert(t('profile.deleteAccount'), t('profile.deleteAccountBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccount'),
        style: 'destructive',
        onPress: async () => {
          try {
            await unregisterPush();
            await api.del('/api/v1/me');
            await logout();
          } catch (err) {
            setError(err.code === 'HAS_OPEN_BALANCE'
              ? { ...err, message: t('m.errors.openBalance') }
              : err);
          }
        },
      },
    ]);
  };

  const doLogout = () => {
    Alert.alert(t('profile.logoutTitle'), t('profile.logoutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logOut'),
        style: 'destructive',
        onPress: async () => {
          await unregisterPush().catch(() => {});
          await logout();
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={s.row}>
          <Avatar name={user?.display_name || user?.username} size={48} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.name}>{user?.display_name || '…'}</Text>
            <Text style={uiStyles.muted}>@{user?.username || '…'}</Text>
            <Text style={uiStyles.muted}>
              {user?.email || ''}{user?.email_verified ? ` · ${t('shell.emailVerified')}` : ` · ${t('shell.emailNotVerified')}`}
            </Text>
          </View>
        </View>
        {!user?.email_verified && (
          <PressableRow
            title={t('auth.emailVerification')}
            onPress={() => navigation.navigate('VerifyEmail')}
            chevron={false}
          />
        )}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('profile.tabAccount')}</Text>
        <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} placeholder={t('profile.displayName')} maxLength={50} />
        <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder={t('profile.phone')} />
        <SpinButton title={busy ? t('profile.saving') : t('profile.saveProfile')} busy={busy} onPress={saveProfile} />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('profile.tabPayments')}</Text>
        <Text style={uiStyles.muted}>{t('profile.paymentsHint')}</Text>
        {handles.length === 0 && <Text style={uiStyles.muted}>{t('profile.noHandles')}</Text>}
        {handles.map((h) => (
          <View key={h.handle_id || h.id} style={s.handleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.handleLabel}>{h.label}</Text>
              <Text style={uiStyles.muted}>{h.details}</Text>
            </View>
            <Text style={s.remove} onPress={() => removeHandle(h)} accessibilityRole="button">
              {t('common.remove')}
            </Text>
          </View>
        ))}
        <TextInput style={s.input} value={handleLabel} onChangeText={setHandleLabel} placeholder={t('profile.handleLabelPh')} maxLength={64} />
        <TextInput style={s.input} value={handleDetails} onChangeText={setHandleDetails} placeholder={t('profile.handleDetailsPh')} maxLength={280} />
        <SpinButton title={t('common.add')} variant="ghost" busy={busy} onPress={addHandle} />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('m.profile.locale')}</Text>
        <Text style={uiStyles.muted}>{t('m.profile.localeHint')}</Text>
        <View style={s.chips}>
          <Chip label="English" selected={locale === 'en'} onPress={() => setLocale('en')} />
          <Chip label="Tiếng Việt" selected={locale === 'vi'} onPress={() => setLocale('vi')} />
        </View>
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('profile.tabPassword')}</Text>
        <Text style={uiStyles.muted}>{t('profile.passwordHint')}</Text>
        <TextInput style={s.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder={t('profile.currentPassword')} />
        <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder={t('profile.newPassword')} />
        <Text style={uiStyles.muted}>{t('profile.passwordRule')}</Text>
        <SpinButton title={t('profile.changePassword')} variant="ghost" busy={busy} onPress={changePassword} />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('settings.title')}</Text>
        <PressableRow title={t('settings.tab.template')} onPress={() => navigation.navigate('Settings')} />
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('profile.tabDanger')}</Text>
        <Text style={uiStyles.muted}>{t('profile.deleteAccountHint')}</Text>
        <SpinButton title={t('profile.deleteAccount')} variant="ghost" onPress={deleteAccount} />
        <SpinButton title={t('profile.logOut')} variant="danger" onPress={doLogout} />
      </Card>

      <ErrorBanner error={error} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '800' },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, minHeight: 44, fontSize: 14,
  },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 44 },
  handleLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  remove: { fontSize: 12, fontWeight: '700', color: colors.debtorText, paddingVertical: 8, paddingHorizontal: 6 },
});
