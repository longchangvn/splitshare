import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Anchor, Box, Button, Center, Container, Divider, Grid, List, Paper,
  PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';

function AuthLayout({ children }) {
  return (
    <Container size={720} my="md">
      <Center mih="calc(100vh - 140px)">
        <Paper withBorder shadow="md" radius="lg" style={{ overflow: 'hidden', width: '100%' }}>
          <Grid gutter={0}>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <Box
                p="xl"
                h="100%"
                c="white"
                style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}
              >
                <Text fw={800} size={26}>SplitShare</Text>
                <Text size="sm" mt={4} style={{ opacity: 0.9 }}>
                  Split expenses with friends, settle up in seconds
                </Text>
                <List size="sm" mt="lg" spacing="sm" visibleFrom="sm">
                  <List.Item>Snap a receipt, split it any way you like</List.Item>
                  <List.Item>Fewest transfers, fully explained</List.Item>
                  <List.Item>Settle up and lock it in</List.Item>
                </List>
              </Box>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <Box p="xl">{children}</Box>
            </Grid.Col>
          </Grid>
        </Paper>
      </Center>
    </Container>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await login(id, pw); nav('/'); } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="sm">
        <Title order={3}>Log in</Title>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput label="Username or email" required autoFocus autoComplete="username" name="username" value={id} onChange={(x) => setId(x.target.value)} />
            <PasswordInput label="Password" required autoComplete="current-password" name="password" value={pw} onChange={(x) => setPw(x.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && !busy) ev.currentTarget.form?.requestSubmit(); }} />
            <Button fullWidth type="submit" loading={busy}>Log in</Button>
          </Stack>
        </form>
        <Err e={e} />
        <Divider label="or" labelPosition="center" />
        <GoogleBtn />
        <Text ta="center" size="sm">
          No account? <Anchor component={Link} to="/register">Register</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', email: '', display_name: '', password: '' });
  const [e, setE] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const d = await register(f.username, f.email, f.display_name, f.password);
      setDone(d);
      nav('/');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  const set = (k) => (x) => setF({ ...f, [k]: x.target.value });
  return (
    <AuthLayout>
      <Stack gap="sm">
        <Title order={3}>Create your account</Title>
        <form onSubmit={go}>
          <Stack gap="sm">
            <TextInput label="Username" required value={f.username} onChange={set('username')} />
            <TextInput label="Email" required value={f.email} onChange={set('email')} />
            <TextInput label="Display name" required value={f.display_name} onChange={set('display_name')} />
            <PasswordInput
              label="Password"
              required
              description="8+ characters with a letter and a digit"
              value={f.password}
              onChange={set('password')}
            />
            <Button fullWidth type="submit" loading={busy}>Register</Button>
          </Stack>
        </form>
        <Err e={e} />
        {done && done.auto_joined_groups?.length > 0 && (
          <Text size="sm">Auto-joined {done.auto_joined_groups.length} group(s) from email invites.</Text>
        )}
        <Text ta="center" size="sm">
          <Anchor component={Link} to="/login">Back to login</Anchor>
        </Text>
      </Stack>
    </AuthLayout>
  );
}

function GoogleBtn() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [e, setE] = useState(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return <Text size="sm" c="dimmed" ta="center">Google login needs VITE_GOOGLE_CLIENT_ID</Text>;
  const start = () => {
    // eslint-disable-next-line no-undef
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          const d = await api.post('/api/v1/auth/google', { id_token: resp.credential });
          setTokens(d.access_token, d.refresh_token);
          setUser(d.user);
          nav('/');
        } catch (err) { setE(err); }
      },
    });
    // eslint-disable-next-line no-undef
    google.accounts.id.prompt();
  };
  return (
    <>
      <Button fullWidth variant="light" onClick={start}>Continue with Google</Button>
      <Err e={e} />
    </>
  );
}
