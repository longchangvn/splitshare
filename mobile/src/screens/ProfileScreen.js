// Frame 8b · You/Profile — FR-1 account. Web parity: Profile.jsx (V1 subset).
// GET/PATCH /me, PATCH /me/password, DELETE /me (422 HAS_OPEN_BALANCE), logout.
// Handles (trip-pack) are OUT of scope.
import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { SpinButton, ErrText, Avatar } from '../ui';

export default function ProfileScreen() {
  const { user, logout, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  useFocusEffect(useCallback(() => {
    refreshMe();
  }, []));

  React.useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setPhone(user.phone || '');
    }
  }, [user?.user_id]);

  const save = async () => {
    setBusy(true); setE(null);
    try {
      await api.patch('/api/v1/me', { display_name: displayName.trim(), phone: phone.trim() || null });
      await refreshMe();
      Alert.alert('Saved', 'Profile updated.');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };

  const changePw = async () => {
    setBusy(true); setE(null);
    try {
      await api.patch('/api/v1/me/password', {
        ...(cur ? { current_password: cur } : {}),
        new_password: next,
      });
      setCur(''); setNext('');
      Alert.alert('Saved', 'Password changed.');
    } catch (err) { setE(err); Alert.alert('Failed', `${err.code} ${err.message}`); }
    finally { setBusy(false); }
  };

  const del = () => {
    Alert.alert('Delete account?', 'Blocked if any group net ≠ 0.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.del('/api/v1/me');
            await logout();
          } catch (err) {
            Alert.alert('Blocked', err.code === 'HAS_OPEN_BALANCE' ? `Settle first: ${err.message}` : `${err.code} ${err.message}`);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <View style={s.row}>
          <Avatar name={user?.display_name || user?.username} size={44} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.h}>@{user?.username || '…'} · {user?.display_name || ''}</Text>
            <Text style={s.muted}>{user?.email || ''}{user?.email_verified ? ' ✓ verified' : ' ! unverified'}</Text>
          </View>
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Account</Text>
        <TextInput style={s.inp} value={displayName} onChangeText={setDisplayName} placeholder="display name (1-50)" maxLength={50} />
        <TextInput style={s.inp} value={phone} onChangeText={setPhone} placeholder="phone (optional)" />
        <SpinButton title="Save" busy={busy} onPress={save} />
      </View>
      <View style={s.card}>
        <Text style={s.h}>Password</Text>
        <Text style={s.muted}>Blank current = Google-only account</Text>
        <TextInput style={s.inp} value={cur} onChangeText={setCur} secureTextEntry placeholder="current password (blank if Google-only)" />
        <TextInput style={s.inp} value={next} onChangeText={setNext} secureTextEntry placeholder="new password (8+ letter+digit)" />
        <SpinButton title="Change password" busy={busy} variant="ghost" onPress={changePw} />
      </View>
      <View style={s.card}>
        <Text style={s.h}>Danger</Text>
        <SpinButton title="Delete account" busy={false} variant="ghost" onPress={del} />
        <SpinButton title="Log out" busy={false} variant="ghost" onPress={logout} />
      </View>
      <ErrText e={e} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  inp: { backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
});
