import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Box, Button, Center, Container, Divider, Grid, List, Paper,
  PasswordInput, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useAuth, Err } from '../auth.jsx';
import { api, setTokens } from '../api.js';

function AuthBrand({ compact }) {
  return (
    <>
      <Box
        w={compact ? 40 : 48}
        h={compact ? 40 : 48}
        mb={compact ? 'xs' : 'sm'}
        mt={compact ? undefined : 0}
        mx={compact ? 'auto' : undefined}
        style={{
          background: 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.35)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: compact ? 20 : 24,
        }}
        aria-hidden
      >
        S
      </Box>
      <Text fw={800} size={compact ? 20 : 26} className="brand-splitshare">SplitShare</Text>
      <Text size="sm" mt={4} style={{ opacity: 0.9 }}>
        {compact ? 'Split less. Settle smart.' : 'Split expenses with friends, settle up in seconds'}
      </Text>
    </>
  );
}

function AuthLayout({ children }) {
  return (
    <Container size={760} my={{ base: 'sm', sm: 'md' }} px={{ base: 'sm', sm: 'md' }} className="auth-container">
      <Center mih={{ base: 'auto', sm: 'calc(100vh - 140px)' }} className="auth-center">
        <Paper withBorder shadow="md" radius="lg" style={{ overflow: 'hidden', width: '100%' }} className="auth-paper">
          {/* Mobile brand banner: compact, matches mockup screen 1 */}
          <Box
            hiddenFrom="sm"
            p="sm"
            ta="center"
            c="white"
            className="auth-banner"
            style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}
          >
            <AuthBrand compact />
          </Box>
          <Grid gutter={0}>
            <Grid.Col span={{ base: 12, sm: 5 }} visibleFrom="sm">
              <Box
                p="xl"
                h="100%"
                c="white"
                style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)' }}
              >
                <AuthBrand />
                <List size="sm" mt="lg" spacing="sm">
                  <List.Item>Snap a receipt, split it any way you like</List.Item>
                  <List.Item>Fewest transfers, fully explained</List.Item>
                  <List.Item>Settle up and lock it in</List.Item>
                </List>
              </Box>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <Box p={{ base: 'md', sm: 'xl' }} className="auth-form">{children}</Box>
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
        <div>
          <Title order={3}>Welcome back 👋</Title>
          <Text size="sm" c="dimmed">Log in to sync your groups</Text>
        </div>
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
          {' · '}<Anchor component={Link} to="/forgot">Forgot password?</Anchor>
        </Text>
        <Text ta="center" size="xs" c="dimmed">
          username 3–30 a-z0-9_.- · password 8+ with a letter and a digit
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

export function Forgot() {
  const [email, setEmail] = useState('');
  const [e, setE] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try { await api.post('/api/v1/auth/forgot', { email }); setDone(true); setE(null); }
    catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="sm">
        <Title order={3}>Reset password</Title>
        {done
          ? <Text size="sm">If that email exists, a reset link is on its way (15 min, single use).</Text>
          : (
            <form onSubmit={go}>
              <Stack gap="sm">
                <TextInput label="Email" required value={email} onChange={(x) => setEmail(x.target.value)} />
                <Button fullWidth type="submit" loading={busy}>Send reset link</Button>
              </Stack>
            </form>
          )}
        <Err e={e} />
        <Text ta="center" size="sm"><Anchor component={Link} to="/login">Back to login</Anchor></Text>
      </Stack>
    </AuthLayout>
  );
}

export function Reset() {
  const { setUser } = useAuth();
  const { token } = useParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try {
      const d = await api.post('/api/v1/auth/reset', { token, new_password: pw });
      setTokens(d.access_token, d.refresh_token);
      setUser(d.user);
      nav('/');
    } catch (err) { setE(err); } finally { setBusy(false); }
  };
  return (
    <AuthLayout>
      <Stack gap="sm">
        <Title order={3}>New password</Title>
        <form onSubmit={go}>
          <Stack gap="sm">
            <PasswordInput label="New password" required description="8+ characters with a letter and a digit" value={pw} onChange={(x) => setPw(x.target.value)} />
            <Button fullWidth type="submit" loading={busy}>Set password</Button>
          </Stack>
        </form>
        <Err e={e} />
      </Stack>
    </AuthLayout>
  );
}

export function Verify() {
  const { token } = useParams();
  const [msg, setMsg] = useState('Verifying…');
  useEffect(() => {
    api.post('/api/v1/auth/verify-email', { token })
      .then(() => setMsg('Email verified — you can now join groups.'))
      .catch((err) => setMsg(`Verification failed: ${err.message}`));
  }, [token]);
  return (
    <AuthLayout>
      <Stack gap="sm">
        <Title order={3}>Email verification</Title>
        <Text size="sm">{msg}</Text>
        <Text ta="center" size="sm"><Anchor component={Link} to="/">Home</Anchor></Text>
      </Stack>
    </AuthLayout>
  );
}
