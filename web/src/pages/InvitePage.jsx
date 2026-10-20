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
import { useT } from '../prefs.jsx';

// Single invitation hub: invite multiple people at once (emails and/or contacts)
// plus the shareable link. GroupDetail links here with one button.
export function InvitePage() {
  const t = useT();
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

  // Show the existing stable link (owner/treasurer only) without rotating.
  useEffect(() => {
    if (detail?.invite_link) setLink(detail.invite_link);
  }, [detail]);

  const inviteMany = async (ev) => {
    ev.preventDefault();
    const list = emails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { setE({ message: t('errors.needEmail') }); return; }
    setInviting(true);
    try {
      const r = await api.post(`/api/v1/groups/${id}/invites`, { emails: list });
      notifications.show({
        title: t('invite.sent'),
        message: `added: ${(r.added || []).join(', ') || '—'} · pending: ${(r.pending || []).join(', ') || '—'}`,
        color: 'teal',
      });
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
      notifications.show({ title: t('invite.memberAdded', { name }), color: 'teal' });
    } catch (err) { setE(err); }
  };

  const rotate = async () => {
    try {
      const r = await api.post(`/api/v1/groups/${id}/rotate-invite`, {});
      setLink(r.invite_link);
      notifications.show({ title: t('invite.rotated'), message: t('invite.rotatedHint'), color: 'teal' });
    } catch (err) { setE(err); }
  };

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">{t('common.backToGroup')}</Anchor>
      <Title order={2} mt="xs">
        {detail ? t('invite.toGroup', { name: detail.name }) : t('invite.title')}
      </Title>
      <Err e={e} />

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <form onSubmit={inviteMany}>
          <Stack gap="sm">
            <Title order={4}>{t('invite.byEmail')}</Title>
            <Textarea
              label={t('invite.emails')}
              description={t('invite.emailsHint')}
              placeholder={t('wizard.emailsPh')}
              minRows={3}
              value={emails}
              onChange={(x) => setEmails(x.target.value)}
            />
            <Group><Button type="submit" loading={inviting}>{t('invite.sendInvites')}</Button></Group>
          </Stack>
        </form>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <form onSubmit={searchContacts}>
          <Stack gap="sm">
            <Title order={4}>{t('invite.fromContacts')}</Title>
            <Group gap="xs" align="flex-end">
              <TextInput
                label={t('wizard.searchContacts')}
                placeholder={t('wizard.searchPh')}
                value={cq}
                onChange={(x) => setCq(x.target.value)}
                style={{ flex: 1 }}
              />
              <Button type="submit" variant="default" loading={searching}>{t('common.search')}</Button>
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
              <ActionIcon
                variant="light"
                title={t('invite.addNamed', { name: c.display_name })}
                onClick={() => addMember(c.user_id, c.display_name)}
              >
                +
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card shadow="sm" padding="md" radius="md" mt="md" className="invite-share-card">
        <Title order={4}>{t('invite.shareableLink')}</Title>
        {detail?.my_role === 'owner' && (
          <Button variant="light" color="teal" mt="sm" onClick={rotate}>
            {t('invite.newLinkRotates')}
          </Button>
        )}
        {link && (
          <>
            <Text size="xs" c="dimmed" mt="sm" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {link}
            </Text>
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Group gap="xs" mt="sm">
                  <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                    {copied ? t('common.copied') : t('invite.copyLink')}
                  </Button>
                  {navigator.share && (
                    <Button variant="light" color="teal" onClick={() => navigator.share({ url: link }).catch(() => {})}>
                      {t('invite.share')}
                    </Button>
                  )}
                </Group>
              )}
            </CopyButton>
          </>
        )}
      </Card>
    </Shell>
  );
}
