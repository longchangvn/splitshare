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
  const [handles, setHandles] = useState([]);
  const [hLabel, setHLabel] = useState('');
  const [hDetails, setHDetails] = useState('');

  useEffect(() => {
    api.get('/api/v1/me').then((d) => { setMe(d); setUser(d); setName(d.display_name); setPhone(d.phone || ''); }).catch(setE);
    api.get('/api/v1/me/handles').then(setHandles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addHandle = async (ev) => {
    ev.preventDefault();
    try {
      const h = await api.post('/api/v1/me/handles', { label: hLabel, details: hDetails });
      setHandles([...handles, h]);
      setHLabel(''); setHDetails('');
    } catch (err) { setE(err); }
  };
  const delHandle = async (hid) => {
    try { await api.del(`/api/v1/me/handles/${hid}`); setHandles(handles.filter((h) => h.handle_id !== hid)); }
    catch (err) { setE(err); }
  };

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
      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <Title order={4} mb="sm">Payment accounts</Title>
        <Text size="sm" c="dimmed" mb="sm">Shown to group mates on the settle sheet so they pay to the right place.</Text>
        <Stack gap="xs" mb="sm">
          {handles.map((h) => (
            <Group key={h.handle_id} justify="space-between" wrap="nowrap">
              <Text size="sm"><b>{h.label}</b>: {h.details}</Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => delHandle(h.handle_id)}>Remove</Button>
            </Group>
          ))}
          {handles.length === 0 && <Text size="sm" c="dimmed">None yet.</Text>}
        </Stack>
        <form onSubmit={addHandle}>
          <Group gap="xs" align="flex-end">
            <TextInput label="Label" placeholder="Vietcombank" required value={hLabel} onChange={(x) => setHLabel(x.target.value)} style={{ flex: 1 }} />
            <TextInput label="Details" placeholder="Account no / QR text" required value={hDetails} onChange={(x) => setHDetails(x.target.value)} style={{ flex: 2 }} />
            <Button type="submit">Add</Button>
          </Group>
        </form>
      </Card>
      <Card withBorder shadow="sm" padding="md" radius="md">
        <Title order={4} mb="sm">Danger zone</Title>
        <Button color="red" variant="light" onClick={del}>Delete account</Button>
      </Card>
    </Shell>
  );
}
