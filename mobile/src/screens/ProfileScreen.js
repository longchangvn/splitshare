// Profile — web parity: web/src/pages/Profile.jsx.
// Tabs: Account (PATCH /me) · Password (PATCH /me/password) · Payments (GET/POST/DELETE /me/handles)
// · Danger (DELETE /me, 422 HAS_OPEN_BALANCE). Logout via confirm sheet. Dev-only API URL card.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, type } from '../theme';
import { useAuth } from '../auth/AuthContext';
import {
  Screen, Card, Row, Avatar, Badge, Button, Segmented, Field, Input, ConfirmSheet, Skeleton, toast, DevApiUrlCard,
} from '../ui';
import { useT } from '../i18n';
import { AccountErr, PasswordInput, a } from '../components/account/AccountKit';

export default function ProfileScreen() {
  const t = useT();
  const { user, setUser, logout, refreshMe } = useAuth();
  const [tab, setTab] = useState('account');
  const [e, setE] = useState(null);

  useFocusEffect(useCallback(() => { refreshMe(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const confirmLogout = async () => {
    setLogoutBusy(true);
    try { await logout(); } catch (err) { setLogoutOpen(false); setE(err); setLogoutBusy(false); }
  };

  const tabs = [
    { value: 'account', label: t('profile.tabAccount') },
    { value: 'password', label: t('profile.tabPassword') },
    { value: 'payments', label: t('profile.tabPayments') },
    { value: 'danger', label: t('profile.tabDanger') },
  ];

  return (
    <Screen>
      <Card>
        <Row gap={12}>
          <Avatar name={user?.display_name || user?.username} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={type.h1} numberOfLines={1}>{user?.display_name || user?.username || '…'}</Text>
            <Text style={type.small} numberOfLines={1}>@{user?.username || '…'}{user?.email ? ` · ${user.email}` : ''}</Text>
            {user ? (
              <View style={{ marginTop: 6 }}>
                <Badge
                  kind={user.email_verified ? 'settled' : 'nudge'}
                  label={user.email_verified ? t('shell.emailVerified') : t('shell.emailNotVerified')}
                />
              </View>
            ) : null}
          </View>
        </Row>
      </Card>

      <Segmented options={tabs} value={tab} onChange={(v) => { setTab(v); setE(null); }} />
      <AccountErr e={e} style={{ marginTop: 0 }} />

      {tab === 'account' ? <AccountTab user={user} setUser={setUser} onError={setE} /> : null}
      {tab === 'password' ? <PasswordTab onError={setE} /> : null}
      {tab === 'payments' ? <PaymentsTab onError={setE} /> : null}
      {tab === 'danger' ? <DangerTab onError={setE} logout={logout} /> : null}

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

function AccountTab({ user, setUser, onError }) {
  const t = useT();
  const [name, setName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState(null);

  useEffect(() => {
    if (user) { setName(user.display_name || ''); setPhone(user.phone || ''); }
  }, [user?.user_id, user?.display_name, user?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (saving) return;
    const n = name.trim();
    setFieldErr(null); onError(null);
    if (!n || n.length > 50) return setFieldErr(t('m.account.displayNameRule'));
    setSaving(true);
    try {
      const d = await api.patch('/api/v1/me', { display_name: n, phone: phone.trim() || null });
      if (d && typeof d === 'object') setUser(d);
      toast({ title: t('profile.updated'), color: 'teal' });
    } catch (err) { onError(err); } finally { setSaving(false); }
  };

  return (
    <Card>
      {!user ? <Skeleton h={46} /> : (
        <>
          <Field label={t('profile.displayName')} error={fieldErr} hint={t('m.account.displayNameRule')} style={{ marginTop: 0 }}>
            <Input value={name} onChangeText={setName} maxLength={50} error={!!fieldErr} accessibilityLabel={t('profile.displayName')} />
          </Field>
          <Field label={t('profile.phone')}>
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel={t('profile.phone')} />
          </Field>
          <Button style={{ marginTop: 16 }} icon="✓" title={saving ? t('profile.saving') : t('profile.saveProfile')} busy={saving} onPress={save} />
        </>
      )}
    </Card>
  );
}

function PasswordTab({ onError }) {
  const t = useT();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const change = async () => {
    if (busy || !next) return;
    onError(null);
    setBusy(true);
    try {
      // current_password may be blank for Google-only accounts (web sends null).
      await api.patch('/api/v1/me/password', { current_password: cur || null, new_password: next });
      setCur(''); setNext('');
      toast({ title: t('profile.passwordChanged'), color: 'teal' });
    } catch (err) { onError(err); } finally { setBusy(false); }
  };
  return (
    <Card>
      <Text style={[type.small, { marginBottom: 4 }]}>{t('profile.passwordHint')}</Text>
      <Field label={t('profile.currentPassword')}>
        <PasswordInput value={cur} onChangeText={setCur} autoComplete="current-password" />
      </Field>
      <Field label={t('profile.newPassword')} hint={t('m.account.passwordRule')}>
        <PasswordInput value={next} onChangeText={setNext} autoComplete="new-password" />
      </Field>
      <Button style={{ marginTop: 16 }} icon="🔒" title={busy ? t('profile.saving') : t('profile.changePassword')} busy={busy} disabled={!next} onPress={change} />
    </Card>
  );
}

function PaymentsTab({ onError }) {
  const t = useT();
  const [handles, setHandles] = useState(null);
  const [label, setLabel] = useState('');
  const [details, setDetails] = useState('');
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.get('/api/v1/me/handles')
      .then((rows) => { if (live) setHandles(Array.isArray(rows) ? rows : []); })
      .catch((err) => { if (live) { setHandles([]); onError(err); } });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (adding || !label.trim() || !details.trim()) return;
    onError(null);
    setAdding(true);
    try {
      const h = await api.post('/api/v1/me/handles', { label: label.trim(), details: details.trim() });
      setHandles((p) => [...(p || []), h]);
      setLabel(''); setDetails('');
      toast({ title: t('m.account.handleAdded'), color: 'teal' });
    } catch (err) { onError(err); } finally { setAdding(false); }
  };

  const remove = async () => {
    if (!target) return;
    setDelBusy(true);
    try {
      await api.del(`/api/v1/me/handles/${target.handle_id}`);
      setHandles((p) => (p || []).filter((h) => h.handle_id !== target.handle_id));
      toast({ title: t('m.account.handleRemoved'), color: 'teal' });
      setTarget(null);
    } catch (err) { setTarget(null); onError(err); } finally { setDelBusy(false); }
  };

  return (
    <Card>
      <Text style={type.small}>{t('profile.paymentsHint')}</Text>
      <View style={{ marginTop: 8 }}>
        {handles === null ? <Skeleton h={40} /> : null}
        {handles?.length === 0 ? <Text style={[type.body, { color: colors.secondary, paddingVertical: 8 }]}>{t('profile.noHandles')}</Text> : null}
        {(handles || []).map((h, i) => (
          <View key={h.handle_id}>
            {i > 0 ? <View style={a.sep} /> : null}
            <Row style={{ paddingVertical: 10, minHeight: 48 }}>
              <View style={{ flex: 1 }}>
                <Text style={type.h3} numberOfLines={1}>{h.label}</Text>
                <Text style={type.small} numberOfLines={2} selectable>{h.details}</Text>
              </View>
              <Pressable
                onPress={() => setTarget(h)}
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`${t('common.remove')} ${h.label}`}
              >
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>{t('common.remove')}</Text>
              </Pressable>
            </Row>
          </View>
        ))}
      </View>
      <View style={[a.sep, { marginTop: 8 }]} />
      <Text style={[type.h3, { marginTop: 12 }]}>{t('m.account.addHandle')}</Text>
      <Field label={t('profile.handleLabel')}>
        <Input value={label} onChangeText={setLabel} maxLength={64} placeholder={t('profile.handleLabelPh')} accessibilityLabel={t('profile.handleLabel')} />
      </Field>
      <Field label={t('profile.handleDetails')}>
        <Input value={details} onChangeText={setDetails} maxLength={280} autoCapitalize="none" placeholder={t('profile.handleDetailsPh')} accessibilityLabel={t('profile.handleDetails')} />
      </Field>
      <Button style={{ marginTop: 16 }} icon="＋" title={t('common.add')} busy={adding} disabled={!label.trim() || !details.trim()} onPress={add} />

      <ConfirmSheet
        visible={!!target}
        title={t('m.account.removeHandle')}
        message={t('m.account.removeHandleBody', { label: target?.label || '' })}
        confirmLabel={t('common.remove')}
        danger
        busy={delBusy}
        onConfirm={remove}
        onClose={() => !delBusy && setTarget(null)}
      />
    </Card>
  );
}

function DangerTab({ onError, logout }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const del = async () => {
    setBusy(true); setErr(null);
    try {
      await api.del('/api/v1/me');
      toast({ title: t('m.account.deleted'), color: 'teal' });
      await logout().catch(() => {});
    } catch (x) {
      setBusy(false);
      setOpen(false);
      setErr(x);
      onError(null);
    }
  };
  return (
    <Card style={{ borderColor: colors.dangerCardBorder }}>
      <Text style={type.body}>{t('profile.deleteAccountHint')}</Text>
      <AccountErr e={err} />
      <Button style={{ marginTop: 14 }} variant="danger" icon="🗑" title={t('profile.deleteAccount')} onPress={() => { setErr(null); setOpen(true); }} />
      <ConfirmSheet
        visible={open}
        title={t('profile.deleteAccount')}
        message={t('profile.deleteAccountBody')}
        confirmLabel={t('common.delete')}
        danger
        busy={busy}
        onConfirm={del}
        onClose={() => !busy && setOpen(false)}
      />
    </Card>
  );
}
