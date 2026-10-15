import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar, Badge, Button, Card, Group, Modal, SimpleGrid, Skeleton, Stack, Text,
  TextInput, Title, Center,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { Net, displayNameOf, initialsOf, ChevronRight } from '../components/Net.jsx';

export function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [e, setE] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [cur, setCur] = useState('USD');
  const [creating, setCreating] = useState(false);
  const isMobile = useMediaQuery('(max-width: 36em)');

  const load = () => api.get('/api/v1/me/balances').then(setData).catch(setE);
  useEffect(() => { load(); }, []);

  const create = async (ev) => {
    ev.preventDefault();
    setCreating(true);
    try {
      const g = await api.post('/api/v1/groups', { name, currency: cur });
      const gid = g.group_id ?? g.group?.id; // create returns nested {group:{id}}
      if (!gid) {
        setE({ message: 'Server did not return a group id.' });
        return;
      }
      setOpen(false);
      setName('');
      nav(`/groups/${gid}`);
    } catch (err) { setE(err); } finally { setCreating(false); }
  };

  return (
    <Shell>
      <Title order={2} mb="md">Dashboard</Title>
      <Err e={e} />

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <Group gap="xs" mb="sm">
          <Text size="xl">💰</Text>
          <Title order={4}>Balances</Title>
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

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
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
          <Center mt="sm"><Button variant="light" onClick={() => setOpen(true)}>Create a group</Button></Center>
        </Card>
      )}
      <Stack gap="sm">
        {data?.groups.map((g) => (
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
              <Group gap="sm" wrap="nowrap">
                <Avatar color="teal" radius="xl">{initialsOf(g.name)}</Avatar>
                <div>
                  <Text fw={600}>{g.name}</Text>
                  <Group gap="xs" mt={2}>
                    <Badge size="xs" variant="light">{g.currency}</Badge>
                    {g.delinquent && <Badge size="xs" color="orange" variant="light">unsettled 30d+</Badge>}
                  </Group>
                </div>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <Net v={g.net_cents} c={g.currency} />
                <ChevronRight label={`View details for ${g.name}`} />
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mb="md">
        <Group gap="xs" mb="sm">
          <Text size="xl">⚡</Text>
          <Title order={4}>Quick actions</Title>
        </Group>
        <Button fullWidth onClick={() => setOpen(true)}>New group</Button>
      </Card>

      <Modal opened={open} onClose={() => setOpen(false)} title="New group" centered fullScreen={isMobile}>
        <form onSubmit={create}>
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
            description="ISO-4217 code, e.g. USD"
            required
            mt="sm"
            value={cur}
            onChange={(x) => setCur(x.target.value)}
          />
          <Button fullWidth mt="md" type="submit" loading={creating}>Create group</Button>
        </form>
        <Err e={e} />
      </Modal>
    </Shell>
  );
}
