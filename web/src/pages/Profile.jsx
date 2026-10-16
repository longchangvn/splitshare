import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Tabs, Text, TextInput, Title, PasswordInput } from '@mantine/core';
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
  const [tab, setTab] = useState('account');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

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

  const confirmLogout = async () => {
    setLogoutBusy(true);
    try {
      await logout();
      setLogoutOpen(false);
      nav('/login');
    } catch (err) {
      setLogoutOpen(false);
      setE(err);
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <Shell>
      <div className="profile-layout">
        <Group justify="space-between" align="center" mb="md" wrap="nowrap">
          <Title order={2}>Profile</Title>
          <button type="button" className="gd-action-btn is-danger profile-logout-btn" onClick={() => setLogoutOpen(true)}>
            <LogoutIcon />
            <span>Log out</span>
          </button>
        </Group>
        <Err e={e} />
        <Tabs value={tab} onChange={setTab} className="profile-tabs">
          <div className="tab-rail profile-tab-rail">
            <Tabs.List>
              <Tabs.Tab value="account">Account</Tabs.Tab>
              <Tabs.Tab value="password">Password</Tabs.Tab>
              <Tabs.Tab value="payments">Payments</Tabs.Tab>
              <Tabs.Tab value="danger">Danger</Tabs.Tab>
            </Tabs.List>
          </div>

          <Tabs.Panel value="account" className="profile-panel">
            <form onSubmit={save}>
              <Stack gap="sm">
                <Text size="sm" c="dimmed">@{me?.username} · {me?.email} {me && !me.email_verified && '(unverified)'}</Text>
                <TextInput label="Display name" required value={name} onChange={(x) => setName(x.target.value)} />
                <TextInput label="Phone (optional)" value={phone} onChange={(x) => setPhone(x.target.value)} />
                <button type="submit" className="gd-action-btn profile-primary-btn" disabled={saving}>
                  <ProfileIcon name="save" />
                  <span>{saving ? 'Saving…' : 'Save profile'}</span>
                </button>
              </Stack>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="password" className="profile-panel">
            <form onSubmit={changePw}>
              <Stack gap="sm">
                <Text size="sm" c="dimmed">Update the password you use to sign in.</Text>
                <PasswordInput label="Current password (blank for Google-only accounts)" autoComplete="current-password" value={cur} onChange={(x) => setCur(x.target.value)} />
                <PasswordInput label="New password" description="8+ characters with a letter and a digit" autoComplete="new-password" value={next} onChange={(x) => setNext(x.target.value)} />
                <button type="submit" className="gd-action-btn profile-primary-btn" disabled={pwBusy}>
                  <ProfileIcon name="lock" />
                  <span>{pwBusy ? 'Saving…' : 'Change password'}</span>
                </button>
              </Stack>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="payments" className="profile-panel">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">Shown to group mates on the settle sheet so they pay to the right place.</Text>
              <Stack gap="xs">
                {handles.map((h) => (
                  <Group key={h.handle_id} justify="space-between" wrap="nowrap">
                    <Text size="sm"><b>{h.label}</b>: {h.details}</Text>
                    <button type="button" className="gd-action-btn is-danger" onClick={() => delHandle(h.handle_id)}>
                      <ProfileIcon name="trash" />
                      <span>Remove</span>
                    </button>
                  </Group>
                ))}
                {handles.length === 0 && <Text size="sm" c="dimmed">None yet.</Text>}
              </Stack>
              <form className="profile-handle-form" onSubmit={addHandle}>
                <TextInput label="Label" placeholder="Vietcombank" required value={hLabel} onChange={(x) => setHLabel(x.target.value)} />
                <TextInput label="Details" placeholder="Account no / QR text" required value={hDetails} onChange={(x) => setHDetails(x.target.value)} />
                <button type="submit" className="gd-action-btn profile-primary-btn">
                  <ProfileIcon name="plus" />
                  <span>Add</span>
                </button>
              </form>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="danger" className="profile-panel">
            <Stack gap="sm">
              <Text size="sm" c="dimmed">Delete your account permanently. Blocked while you hold a balance in any group.</Text>
              <button type="button" className="gd-action-btn is-danger profile-primary-btn" onClick={del}>
                <ProfileIcon name="trash" />
                <span>Delete account</span>
              </button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </div>

      <Modal
        opened={logoutOpen}
        onClose={() => !logoutBusy && setLogoutOpen(false)}
        closeOnClickOutside={!logoutBusy}
        title={<span className="wizard-title-name">Log out</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={420}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form confirm-dialog">
          <Text className="confirm-dialog-text">
            Log out of SplitShare? You can sign back in anytime.
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setLogoutOpen(false)} disabled={logoutBusy}>
              Cancel
            </Button>
            <Button className="wizard-primary is-danger" loading={logoutBusy} onClick={confirmLogout}>
              Log out
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>
    </Shell>
  );
}

function LogoutIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 8l4 4-4 4M9.5 12H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIcon({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'save') {
    return (
      <svg {...common} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H16l3 3v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-13Z" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 4v4.5h7V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (name === 'lock') {
    return (
      <svg {...common} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }
  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6.5 7v11.2A1.8 1.8 0 0 0 8.3 20h7.4a1.8 1.8 0 0 0 1.8-1.8V7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
