import { useEffect, useState } from 'react';
import { Button, Card, Group, Stack, Text, TextInput, Title, PasswordInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';

export function Profile() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [me, setMe] = useState(user || null);
  const [name, setName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [e, setE] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api.get('/api/v1/me').then((d) => { setMe(d); setUser(d); setName(d.display_name); setPhone(d.phone || ''); }).catch(setE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const d = await api.patch('/api/v1/me', { display_name: name, phone: phone || null });
      setMe(d); setUser(d);
      notifications.show({ title: 'Profile updated', color: 'teal' });
      setE(null);
    } catch (err) { setE(err); } finally { setSaving(false); }
  };

  const changePw = async (ev) => {
    ev.preventDefault();
    setPwBusy(true);
    try {
      await api.patch('/api/v1/me/password', { current_password: cur || null, new_password: next });
      setCur(''); setNext('');
      notifications.show({ title: 'Password changed', color: 'teal' });
      setE(null);
    } catch (err) { setE(err); } finally { setPwBusy(false); }
  };

  const del = () => {
    const mid = modals.openConfirmModal({
      title: 'Delete account',
      centered: true,
      children: <Text size="sm">Delete your account? Blocked while you hold a balance in any group.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        modals.updateModal(mid, { confirmProps: { color: 'red', loading: true } });
        try { await api.del('/api/v1/me'); modals.closeModal(mid); await logout(); nav('/login'); }
        catch (err) { modals.closeModal(mid); setE(err); }
      },
    });
  };

  return (
    <Shell>
      <Title order={2} mb="md">Profile</Title>
      <Err e={e} />
      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <form onSubmit={save}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">@{me?.username} · {me?.email} {me && !me.email_verified && '(unverified)'}</Text>
            <TextInput label="Display name" required value={name} onChange={(x) => setName(x.target.value)} />
            <TextInput label="Phone (optional)" value={phone} onChange={(x) => setPhone(x.target.value)} />
            <Group><Button type="submit" loading={saving}>Save profile</Button></Group>
          </Stack>
        </form>
      </Card>
      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <form onSubmit={changePw}>
          <Stack gap="sm">
            <Title order={4}>Change password</Title>
            <PasswordInput label="Current password (blank for Google-only accounts)" autoComplete="current-password" value={cur} onChange={(x) => setCur(x.target.value)} />
            <PasswordInput label="New password" description="8+ characters with a letter and a digit" autoComplete="new-password" value={next} onChange={(x) => setNext(x.target.value)} />
            <Group><Button type="submit" loading={pwBusy}>Change password</Button></Group>
          </Stack>
        </form>
      </Card>
      <Card withBorder shadow="sm" padding="md" radius="md">
        <Title order={4} mb="sm">Danger zone</Title>
        <Button color="red" variant="light" onClick={del}>Delete account</Button>
      </Card>
    </Shell>
  );
}
