import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Badge, Button, Card, Code, FileButton, Group, Image, List, Stack,
  Text, Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { displayNameOf } from '../components/Net.jsx';
import { ExpenseForm } from '../components/Forms.jsx';

const statusColor = (s) => (s === 'LOCKED' ? 'gray' : s === 'OPEN' ? 'teal' : 'blue');

export function ExpenseDetail() {
  const { id, eid } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);
  const [edit, setEdit] = useState(!!location.state?.openEdit);
  const [e, setE] = useState(null);

  const load = async () => {
    try {
      const [det, g] = await Promise.all([
        api.get(`/api/v1/expenses/${eid}`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
      ]);
      setD(det);
      if (g) setMembers(g.members);
    } catch (err) { setE(err); }
  };
  useEffect(() => { load(); }, [eid]);

  const del = () => {
    const mid = modals.openConfirmModal({
      title: 'Delete expense',
      centered: true,
      children: <Text size="sm">Delete this expense? Balances recompute.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        modals.updateModal(mid, { confirmProps: { color: 'red', loading: true } });
        try { await api.del(`/api/v1/expenses/${eid}`); modals.closeModal(mid); nav(`/groups/${id}`); }
        catch (err) { modals.closeModal(mid); setE(err); }
      },
    });
  };
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file || uploading) return;
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      await api.postForm(`/api/v1/expenses/${eid}/images`, form);
      notifications.show({ title: 'Receipt uploaded', color: 'teal' });
      load();
    } catch (err) { setE(err); } finally { setUploading(false); }
  };
  const [deletingImg, setDeletingImg] = useState(null);
  const delImg = async (iid) => {
    if (deletingImg) return;
    setDeletingImg(iid);
    try { await api.del(`/api/v1/images/${iid}`); load(); } catch (err) { setE(err); } finally { setDeletingImg(null); }
  };

  if (!d) {
    return (
      <Shell>
        <Text c="dimmed">Loading…</Text>
        <Err e={e} />
      </Shell>
    );
  }
  const x = d.expense;
  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">← Back to group</Anchor>
      <Card withBorder shadow="sm" padding="md" radius="md" mt="xs">
        <Group gap="sm" mb="xs">
          <Title order={2}>{x.title}</Title>
          <Badge color={statusColor(x.status)} variant="light">{x.status}</Badge>
        </Group>
        {x.description && <Text mb="sm">{x.description}</Text>}
        <Text size="sm" mb="sm">Paid by <b>{displayNameOf(members, x.payer_id)}</b></Text>
        <Group gap="xs" mb="sm">
          <Badge variant="outline">Total {fmt(x.amount_cents, '')}</Badge>
          <Badge variant="outline">v{x.version}</Badge>
          <Badge variant="outline">settlement v{d.settlement_version}</Badge>
        </Group>
        <Err e={e} />
        <Group gap="sm">
          <Button variant="light" onClick={() => setEdit(!edit)}>
            {edit ? 'Close editor' : 'Edit'}
          </Button>
          <Button variant="light" color="red" onClick={del}>Delete</Button>
          <Button
            variant="light"
            color="teal"
            onClick={() => nav(`/groups/${id}`, { state: { copyFrom: x } })}
          >
            Copy
          </Button>
        </Group>
      </Card>

      {edit && (
        <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
          <ExpenseForm
            groupId={id}
            members={members}
            existing={x}
            onDone={() => { setEdit(false); load(); }}
          />
        </Card>
      )}

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Title order={4} mb="sm">Splits</Title>
        <List size="sm" spacing="xs">
          {x.splits.map((s) => (
            <List.Item key={s.user_id}>
              {displayNameOf(members, s.user_id)}: <b>{fmt(s.share_cents, '')}</b>
            </List.Item>
          ))}
        </List>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Receipts</Title>
          <FileButton onChange={upload} accept="image/*" disabled={uploading}>
            {(props) => <Button size="xs" {...props} loading={uploading}>Upload receipt</Button>}
          </FileButton>
        </Group>
        {x.images.length === 0 && <Text size="sm" c="dimmed">No receipts attached.</Text>}
        <Group gap="sm">
          {x.images.map((i) => (
            <Stack key={i.image_id} gap={4} align="center">
              <ImgView id={i.image_id} mime={i.mime} size={i.size_bytes} />
              <Button size="xs" variant="subtle" color="red" mih={44}
                loading={deletingImg === i.image_id} onClick={() => delImg(i.image_id)}>
                Delete
              </Button>
            </Stack>
          ))}
        </Group>
      </Card>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Title order={4} mb="sm">History</Title>
        {d.audit.length === 0 && <Text size="sm" c="dimmed">No changes recorded.</Text>}
        <List size="sm" spacing="xs">
          {d.audit.map((a, i) => (
            <List.Item key={i}>
              <Text size="xs" c="dimmed">{a.at}</Text>
              <Code block mt={2}>{JSON.stringify(a.diff)}</Code>
            </List.Item>
          ))}
        </List>
      </Card>
    </Shell>
  );
}

// Images are auth-gated: fetch as blob with the Bearer token.
function ImgView({ id, mime, size }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await fetch(`/api/v1/images/${id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('ss_at')}` } });
      if (!r.ok) return;
      const blob = await r.blob();
      if (live) setUrl(URL.createObjectURL(blob));
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!url) return <Text size="xs" c="dimmed">{mime} {(size / 1024).toFixed(1)}KB…</Text>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <Image src={url} alt="receipt" w={120} radius="md" />
    </a>
  );
}

export function JoinPage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState('Joining…');
  useEffect(() => {
    api.post('/api/v1/groups/join', { token })
      .then((r) => {
        const gid = r.group_id ?? r.group?.id;
        if (!gid) { setMsg('Join failed: server did not return a group id.'); return; }
        nav(`/groups/${gid}`);
      })
      .catch((err) => setMsg(`Join failed: ${err.code || ''} ${err.message}`));
  }, [token, nav]);
  return (
    <Shell>
      <Card withBorder shadow="sm" padding="lg" radius="md">
        <Text>{msg}</Text>
        <Anchor component={Link} to="/" size="sm">Home</Anchor>
      </Card>
    </Shell>
  );
}
