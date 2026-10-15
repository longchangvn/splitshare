import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, CopyButton, Group, Modal, Select, SimpleGrid, Skeleton, Stack, Text,
  TextInput, Textarea, Title, Center,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { Net, displayNameOf, initialsOf, ChevronRight } from '../components/Net.jsx';

export function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [e, setE] = useState(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [cur, setCur] = useState('USD');
  const [tpl, setTpl] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState([]);
  const [emails, setEmails] = useState('');
  const [created, setCreated] = useState(null);
  const [creating, setCreating] = useState(false);
  const isMobile = useMediaQuery('(max-width: 36em)');

  const load = () => api.get('/api/v1/me/balances').then(setData).catch(setE);
  useEffect(() => { load(); }, []);

  // Consumed by the mobile tab bar: Add opens the wizard, #groups scrolls
  // to the group list (same state/hash pattern as GroupDetail copyFrom).
  const location = useLocation();
  useEffect(() => {
    if (location.state?.openNew) {
      openWizard();
      nav(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  useEffect(() => {
    if (location.hash === '#groups') {
      document.getElementById('groups')?.scrollIntoView({ block: 'start' });
    }
  }, [location.hash, data]);

  const openWizard = () => {
    setStep(1); setName(''); setTpl(''); setCq(''); setContacts([]);
    setPicked([]); setEmails(''); setCreated(null); setE(null); setOpen(true);
  };

  const searchContacts = async () => {
    setSearching(true);
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}&limit=20`)); setE(null); }
    catch (err) { setE(err); } finally { setSearching(false); }
  };

  const create = async (ev) => {
    ev.preventDefault();
    setCreating(true);
    try {
      const emailList = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      const memberIds = picked.map((p) => p.user_id);
      let g;
      let link = null;
      if (tpl) {
        g = await api.post('/api/v1/groups/from-template', { name, currency: cur, template: tpl });
        const gid0 = g.group_id ?? g.group?.id;
        if (!gid0) { setE({ message: 'Server did not return a group id.' }); return; }
        if (memberIds.length > 0) await api.post(`/api/v1/groups/${gid0}/members`, { user_ids: memberIds });
        if (emailList.length > 0) await api.post(`/api/v1/groups/${gid0}/invites`, { emails: emailList });
        try {
          const s = await api.post(`/api/v1/groups/${gid0}/share-link`, {});
          link = s.invite_link || s.link || null;
        } catch { link = null; }
      } else {
        g = await api.post('/api/v1/groups', {
          name, currency: cur, member_ids: memberIds, invite_emails: emailList,
        });
        link = g.invite_link || null;
      }
      const gid = g.group_id ?? g.group?.id; // create returns nested {group:{id}}
      if (!gid) {
        setE({ message: 'Server did not return a group id.' });
        return;
      }
      setCreated({ gid, link, name: g.group?.name || name });
      setStep(3);
      load();
    } catch (err) { setE(err); } finally { setCreating(false); }
  };

  // Greeting header (mockup screen 2): name + group count + first outstanding owe.
  const oweLine = (() => {
    if (!data) return null;
    const outs = Object.entries(data.totals).filter(([, t]) => t.owe_cents > 0);
    if (outs.length === 0) return 'all settled 🎉';
    const [c, t] = outs[0];
    return `owes ${fmt(t.owe_cents, c)}${outs.length > 1 ? ` + ${outs.length - 1} more` : ''}`;
  })();

  return (
    <Shell>
      <Title order={2}>Hi, {user?.display_name || 'there'} 👋</Title>
      <Text size="sm" c="dimmed" mb="md">
        {data ? `${data.groups.length} active group${data.groups.length === 1 ? '' : 's'}` : '…'}
        {oweLine ? ` · ${oweLine}` : ''}
      </Text>
      <Err e={e} />

      <Card
        shadow="sm"
        padding="md"
        radius="md"
        mb="md"
        style={{ background: '#0f172a', borderColor: '#0f172a', color: '#fff' }}
      >
        {!data && !e && <Skeleton height={92} radius="md" />}
        {data && Object.keys(data.totals).length === 0 && (
          <Text c="dimmed" size="sm">Nothing outstanding.</Text>
        )}
        {data && Object.entries(data.totals).map(([c, t]) => (
          <div key={c}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" tt="uppercase" c="dimmed">You owe · {c}</Text>
              {Object.keys(data.totals).length > 1 && (
                <Badge size="xs" variant="light">{c}</Badge>
              )}
            </Group>
            <Text size="xl" fw={800} mt={4} c={t.owe_cents > 0 ? 'red.3' : 'white'}>
              {fmt(t.owe_cents, c)}
            </Text>
            {t.owed_cents > 0 && (
              <Text size="sm" mt={2} c="teal.3">
                Owed to you {fmt(t.owed_cents, c)} · never summed across currencies
              </Text>
            )}
          </div>
        ))}
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <Group gap="xs" mb="sm">
          <Text size="xl">💰</Text>
          <Title order={4}>Balances by currency</Title>
        </Group>
        {!data && !e && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Skeleton height={92} radius="md" />
            <Skeleton height={92} radius="md" />
          </SimpleGrid>
        )}
        {data && Object.keys(data.totals).length === 0 && (
          <Text c="dimmed" size="sm">Nothing outstanding.</Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {data && Object.entries(data.totals).map(([c, t]) => (
          <Card key={c} withBorder shadow="sm" padding="md" radius="md">
            <Text size="sm" c="dimmed">{c}</Text>
            <Group gap="lg" mt="xs">
              <div>
                <Text size="xs" c="dimmed">You owe</Text>
                <Text size="xl" fw={700} c="red">{fmt(t.owe_cents, c)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Owed to you</Text>
                <Text size="xl" fw={700} c="teal">{fmt(t.owed_cents, c)}</Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md" id="groups" style={{ scrollMarginTop: 72 }}>
        <Group gap="xs" mb="sm">
          <Text size="xl">👥</Text>
          <Title order={4}>Groups</Title>
        </Group>
        {!data && !e && (
          <Stack gap="sm">
            <Skeleton height={64} radius="md" />
            <Skeleton height={64} radius="md" />
            <Skeleton height={64} radius="md" />
          </Stack>
        )}
      {data && data.groups.length === 0 && (
        <Card withBorder padding="lg" radius="md">
          <Text ta="center" c="dimmed">No groups yet — create one to get started.</Text>
          <Center mt="sm"><Button variant="light" onClick={openWizard}>Create a group</Button></Center>
        </Card>
      )}
      <Stack gap="sm">
        {data && Object.entries(
          (data?.groups || []).reduce((acc, g) => {
            (acc[g.currency] = acc[g.currency] || []).push(g);
            return acc;
          }, {}),
        ).map(([c, list]) => (
          <div key={c}>
            <Text size="sm" fw={600} mb="xs" c="dimmed">
              {c} · {list.length} group{list.length === 1 ? '' : 's'}
            </Text>
            <Stack gap="sm">
              {list.map((g) => (
                <Card
                  key={g.group_id}
                  withBorder
                  shadow="xs"
                  padding="sm"
                  radius="md"
                  className="tap-card"
                  tabIndex={0}
                  role="link"
                  aria-label={`View details for ${g.name}`}
                  onClick={() => nav(`/groups/${g.group_id}`)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      nav(`/groups/${g.group_id}`);
                    }
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Avatar color="teal" radius="md">{initialsOf(g.name)}</Avatar>
                      <div style={{ minWidth: 0 }}>
                        <Text fw={600} truncate>{g.name}</Text>
                        <Group gap="xs" mt={2}>
                          <Badge size="xs" variant="light">{g.currency}</Badge>
                          {g.delinquent && <Badge size="xs" color="orange" variant="light">unsettled 30d+</Badge>}
                          {g.net_cents === 0 && <Badge size="xs" color="teal" variant="light">settled</Badge>}
                          {g.net_cents !== 0 && (
                            <Badge size="xs" color={g.net_cents < 0 ? 'red' : 'teal'} variant="light">
                              {g.net_cents < 0 ? 'owe' : 'owed'}
                            </Badge>
                          )}
                        </Group>
                      </div>
                    </Group>
                    <Group gap="xs" wrap="nowrap" style={{ flex: 'none' }}>
                      <Net v={g.net_cents} c={g.currency} />
                      <ChevronRight label={`View details for ${g.name}`} />
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        ))}
      </Stack>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <Group gap="xs" mb="sm">
          <Text size="xl">⚡</Text>
          <Title order={4}>Quick actions</Title>
        </Group>
        <Button fullWidth onClick={openWizard}>New group</Button>
      </Card>

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={step < 3 ? `New group · ${step}/3` : 'Group created'}
        centered
        fullScreen={isMobile && step < 3}
      >
        {step === 1 && (
          <form onSubmit={(ev) => { ev.preventDefault(); setStep(2); }}>
            <TextInput
              label="Group name"
              placeholder="Trip to Alps"
              description="3–50 characters"
              required
              value={name}
              onChange={(x) => setName(x.target.value)}
            />
            <TextInput
              label="Currency"
              description="ISO-4217 code, e.g. USD — locked after the first expense"
              required
              mt="sm"
              value={cur}
              onChange={(x) => setCur(x.target.value.toUpperCase())}
            />
            <Select
              label="Template (optional)"
              description="Roommates seeds rent/wifi drafts · beach-trip sets a budget · wedding sets event fee"
              mt="sm"
              clearable
              value={tpl}
              onChange={(v) => setTpl(v || '')}
              data={[
                { value: 'roommates', label: 'Roommates' },
                { value: 'beach-trip', label: 'Beach trip' },
                { value: 'wedding', label: 'Wedding / event' },
              ]}
            />
            <Button fullWidth mt="md" type="submit">Continue</Button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={create}>
            <Stack gap="sm">
              <div>
                <Title order={5}>Invite members</Title>
                <Text size="xs" c="dimmed">Contacts share a group with you · email invites auto-join on register (30d)</Text>
              </div>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  label="Search contacts"
                  placeholder="Name, username or email"
                  value={cq}
                  onChange={(x) => setCq(x.target.value)}
                  style={{ flex: 1 }}
                />
                <Button variant="default" onClick={searchContacts} loading={searching}>Search</Button>
              </Group>
              {contacts.length > 0 && (
                <Stack gap="xs">
                  {contacts.map((c) => {
                    const on = picked.some((p) => p.user_id === c.user_id);
                    return (
                      <Group key={c.user_id} justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap">
                          <Avatar color="teal" radius="xl" size="sm">{initialsOf(c.display_name)}</Avatar>
                          <Text size="sm">{c.display_name} <Text span c="dimmed">@{c.username}</Text></Text>
                        </Group>
                        <Button
                          size="xs"
                          variant={on ? 'filled' : 'light'}
                          color="teal"
                          onClick={() => setPicked(on
                            ? picked.filter((p) => p.user_id !== c.user_id)
                            : [...picked, c])}
                        >
                          {on ? '✓' : '+'}
                        </Button>
                      </Group>
                    );
                  })}
                </Stack>
              )}
              {picked.length > 0 && (
                <Group gap="xs">
                  {picked.map((p) => (
                    <Badge key={p.user_id} variant="filled" color="teal" pr={4}
                      rightSection={<Text span size="xs" style={{ cursor: 'pointer' }} onClick={() => setPicked(picked.filter((x) => x.user_id !== p.user_id))}>✕</Text>}>
                      {p.display_name}
                    </Badge>
                  ))}
                </Group>
              )}
              <Textarea
                label="Or invite by email"
                description="Separate with commas, spaces or new lines"
                placeholder="a@example.com, b@example.com"
                minRows={2}
                value={emails}
                onChange={(x) => setEmails(x.target.value)}
              />
              <Group gap="xs" grow>
                <Button variant="default" onClick={() => setStep(1)}>Back</Button>
                <Button type="submit" loading={creating}>Create group{picked.length + emails.split(/[\s,;]+/).filter(Boolean).length > 0 ? ` · ${picked.length + emails.split(/[\s,;]+/).filter(Boolean).length} invite(s)` : ''}</Button>
              </Group>
            </Stack>
          </form>
        )}
        {step === 3 && created && (
          <Stack gap="sm">
            <Text size="sm">🎉 <b>{created.name}</b> is ready.</Text>
            {created.link ? (
              <Card shadow="sm" padding="sm" radius="md" style={{ background: '#0f172a', borderColor: '#0f172a' }}>
                <Text size="sm" fw={600} c="white">🔗 Invite link</Text>
                <Text size="xs" c="dimmed" mt={2} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {created.link}
                </Text>
                <CopyButton value={created.link}>
                  {({ copied, copy }) => (
                    <Button size="xs" mt="xs" color={copied ? 'teal' : 'blue'} onClick={copy}>
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                  )}
                </CopyButton>
              </Card>
            ) : (
              <Text size="sm" c="dimmed">Invite members from the group page.</Text>
            )}
            <Button fullWidth onClick={() => { setOpen(false); nav(`/groups/${created.gid}`); }}>
              Open group
            </Button>
          </Stack>
        )}
        <Err e={e} />
      </Modal>
    </Shell>
  );
}
