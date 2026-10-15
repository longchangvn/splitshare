import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ActionIcon, Anchor, Avatar, Button, Card, CopyButton, Group, Stack,
  Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { initialsOf } from '../components/Net.jsx';

// Single invitation hub: invite multiple people at once (emails and/or contacts)
// plus the shareable link. GroupDetail links here with one button.
export function InvitePage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [emails, setEmails] = useState('');
  const [cq, setCq] = useState('');
  const [contacts, setContacts] = useState([]);
  const [link, setLink] = useState('');
  const [e, setE] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get(`/api/v1/groups/${id}`).then(setDetail).catch(setE);
  }, [id]);

  const inviteMany = async (ev) => {
    ev.preventDefault();
    const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { setE({ message: 'Enter at least one email.' }); return; }
    setInviting(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      notifications.show({ title: 'Invites sent', message: `added: ${(r.added || []).join(', ') || '—'} · pending: ${(r.pending || []).join(', ') || '—'}`, color: 'teal' });
      setEmails('');
      setE(null);
    } catch (err) { setE(err); } finally { setInviting(false); }
  };

  const searchContacts = async (ev) => {
    ev.preventDefault();
    setSearching(true);
    try { setContacts(await api.get(`/api/v1/contacts?q=${encodeURIComponent(cq)}`)); setE(null); }
    catch (err) { setE(err); } finally { setSearching(false); }
  };

  const addMember = async (uid, name) => {
    try {
      await api.post(`/api/v1/groups/${id}/members`, { user_ids: [uid] });
      notifications.show({ title: `${name} added`, color: 'teal' });
    } catch (err) { setE(err); }
  };

  const rotate = async () => {
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      setLink(r.invite_link);
    } catch (err) { setE(err); }
  };

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">← Back to group</Anchor>
      <Title order={2} mt="xs">{detail ? `Invite to ${detail.name}` : 'Invite'}</Title>
      <Err e={e} />

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <form onSubmit={inviteMany}>
          <Stack gap="sm">
            <Title order={4}>Invite multiple people by email</Title>
            <Textarea
              label="Emails"
              description="Separate with commas, spaces or new lines"
              placeholder="a@example.com, b@example.com"
              minRows={3}
              value={emails}
              onChange={(x) => setEmails(x.target.value)}
            />
            <Group><Button type="submit" loading={inviting}>Send invites</Button></Group>
          </Stack>
        </form>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <form onSubmit={searchContacts}>
          <Stack gap="sm">
            <Title order={4}>Add from contacts</Title>
            <Group gap="xs" align="flex-end">
              <TextInput
                label="Search contacts"
                placeholder="Name, username or email"
                value={cq}
                onChange={(x) => setCq(x.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" variant="default" loading={searching}>Search</Button>
            </Group>
          </Stack>
        </form>
        <Stack gap="xs" mt="sm">
          {contacts.map((c) => (
            <Group key={c.user_id} justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <Avatar color="blue" radius="xl" size="sm">{initialsOf(c.display_name)}</Avatar>
                <Text size="sm">{c.display_name} <Text span c="dimmed">@{c.username}</Text></Text>
              </Group>
              <ActionIcon variant="light" title={`Add ${c.display_name}`} onClick={() => addMember(c.user_id, c.display_name)}>+</ActionIcon>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Title order={4} mb="sm">Shareable link</Title>
        {detail?.my_role === 'owner' && <Button variant="default" onClick={rotate}>New invite link (rotates, kills old)</Button>}
        {(link) && (
          <>
            <TextInput readOnly mt="sm" value={link} />
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Button fullWidth mt="sm" color={copied ? 'teal' : 'blue'} onClick={copy}>
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              )}
            </CopyButton>
          </>
        )}
      </Card>
    </Shell>
  );
}
