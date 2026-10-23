import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor, Badge, Button, Card, Code, Group, Image, List, Modal, Stack,
  Text, TextInput, Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { displayNameOf } from '../components/Net.jsx';
import { ExpenseForm } from '../components/Forms.jsx';
import { categoryLabelForKey } from '../categories.js';
import { useT } from '../prefs.jsx';

const statusColor = (s) => (s === 'LOCKED' ? 'gray' : s === 'OPEN' ? 'teal' : 'blue');

export function ExpenseDetail() {
  const t = useT();
  const { user } = useAuth();
  const { id, eid } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groupCur, setGroupCur] = useState('');
  const [myRole, setMyRole] = useState(null);
  const [edit, setEdit] = useState(false);
  const [e, setE] = useState(null);
  const wantEdit = !!location.state?.openEdit;

  const load = async () => {
    try {
      const [det, g, cats] = await Promise.all([
        api.get(`/api/v1/expenses/${eid}`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
        api.get(`/api/v1/groups/${id}/categories`).catch(() => []),
      ]);
      setD(det);
      setCategories(Array.isArray(cats) ? cats : []);
      if (g) {
        setMembers(g.members);
        setGroupCur(g.currency || '');
        setMyRole(g.my_role || null);
      }
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
  const fileRef = useRef(null);
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
  const pickFile = () => {
    setE(null);
    fileRef.current?.click();
  };
  const onFilePicked = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = ''; // reset so the same file can be picked again
    await upload(file);
  };
  const upload = async (file) => {
    if (!file || uploading) return;
    if (file.size > 10 * 1024 * 1024) {
      setE({ message: `${file.name}: over 10MB.` });
      return;
    }
    const form = new FormData();
    form.append('file', file, file.name);
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

  const x = d?.expense;
  const canModify = !!x
    && String(x.status || '').toUpperCase() === 'OPEN'
    && (myRole === 'owner' || myRole === 'treasurer' || (!!user?.user_id && x.created_by === user.user_id));

  useEffect(() => {
    if (wantEdit && canModify) setEdit(true);
  }, [wantEdit, canModify]);

  if (!d || !x) {
    return (
      <Shell>
        <Text c="dimmed">{t('common.loading')}</Text>
        <Err e={e} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Anchor component={Link} to={`/groups/${id}`} size="sm">{t('common.backToGroup')}</Anchor>
      <Card withBorder shadow="sm" padding="md" radius="md" mt="xs">
        <Group gap="sm" mb="xs">
          <Title order={2}>{x.title}</Title>
          <Badge color={statusColor(x.status)} variant="light">
            {String(x.status || '').toUpperCase() === 'LOCKED'
              ? t('groupDetail.statusLocked')
              : String(x.status || '').toUpperCase() === 'OPEN'
                ? t('groupDetail.statusOpen')
                : x.status}
          </Badge>
        </Group>
        {x.description && <Text mb="sm">{x.description}</Text>}
        <Text size="sm" mb="sm">{t('expense.paidBy')} <b>{displayNameOf(members, x.payer_id)}</b> · <b>{fmt(x.amount_cents, '')}</b></Text>
        <Group gap="xs" mb="sm">
          {x.category && <Badge variant="light">{categoryLabelForKey(x.category, categories, t)}</Badge>}
          {x.spent_at && <Badge variant="light">{String(x.spent_at).slice(0, 10)}</Badge>}
        </Group>
        {((x.tax_cents > 0 || x.tip_cents > 0 || x.fee_cents > 0) || x.orig_currency || (x.guests || []).length > 0) && (
          <Text size="sm" mb="sm" c="dimmed">
            {x.tax_cents > 0 && <>tax {fmt(x.tax_cents, '')} </>}
            {x.tip_cents > 0 && <>tip {fmt(x.tip_cents, '')} </>}
            {x.fee_cents > 0 && <>fee {fmt(x.fee_cents, '')} </>}
            {x.orig_currency && <>· paid {(x.orig_amount_cents / 100).toFixed(2)} {x.orig_currency} @ {x.fx_rate} </>}
            {(x.guests || []).length > 0 && (
              <>· guests: {(x.guests || []).map((g) => `${g.label} (${fmt(g.share_cents, '')} via ${displayNameOf(members, g.covered_by)})`).join(', ')}</>
            )}
          </Text>
        )}
        <Err e={e} />
        <Group gap="sm">
          {canModify && (
            <Button variant="light" onClick={() => setEdit(true)}>
              {t('groupDetail.editExpense')}
            </Button>
          )}
          {canModify && (
            <Button variant="light" color="red" onClick={del}>{t('common.delete')}</Button>
          )}
          <Button
            variant="light"
            color="teal"
            onClick={() => nav(`/groups/${id}`, { state: { copyFrom: x } })}
          >
            {t('groupDetail.copyExpense')}
          </Button>
        </Group>
      </Card>

      <Modal
        opened={edit && canModify}
        onClose={() => setEdit(false)}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">{t('groupDetail.editExpense')}</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={560}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <ExpenseForm
          key={x.expense_id}
          groupId={id}
          members={members}
          existing={x}
          currency={groupCur}
          onDone={() => { setEdit(false); load(); }}
        />
      </Modal>

      <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
        <Title order={4} mb="sm">{t('expense.splits')}</Title>
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
          <Title order={4}>{t('expense.receipts')}</Title>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={onFilePicked}
          />
          <Button size="xs" loading={uploading} onClick={pickFile}>{t('expense.uploadReceipt')}</Button>
        </Group>
        {x.images.length === 0 && <Text size="sm" c="dimmed">{t('expense.noReceipts')}</Text>}
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

      <details style={{ marginTop: 12 }}>
        <summary><Title order={4} style={{ display: 'inline' }}>History ({d.audit.length})</Title></summary>
        {d.audit.length === 0 && <Text size="sm" c="dimmed">No changes recorded.</Text>}
        <List size="sm" spacing="xs" mt="sm">
          {d.audit.map((a, i) => (
            <List.Item key={i}>
              <Text size="xs" c="dimmed">{a.at}</Text>
              <Code block mt={2}>{JSON.stringify(a.diff)}</Code>
            </List.Item>
          ))}
        </List>
      </details>

      <Comments eid={eid} members={members} />
    </Shell>
  );
}

function Comments({ eid, members }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/api/v1/expenses/${eid}/comments`).then(setItems).catch(setE);
  useEffect(() => { load(); }, [eid]);
  const send = async (ev) => {
    ev.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    try { await api.post(`/api/v1/expenses/${eid}/comments`, { body: body.trim() }); setBody(''); load(); }
    catch (err) { setE(err); } finally { setBusy(false); }
  };
  const del = async (cid) => {
    try { await api.del(`/api/v1/comments/${cid}`); load(); } catch (err) { setE(err); }
  };
  return (
    <Card withBorder shadow="sm" padding="md" radius="md" mt="md">
      <Title order={4} mb="sm">Comments ({items.length})</Title>
      <Err e={e} />
      <Stack gap="xs" mb="sm">
        {items.map((c) => (
          <Group key={c.comment_id} justify="space-between" wrap="nowrap" align="flex-start">
            <div>
              <Text size="sm"><b>{displayNameOf(members, c.author_id)}</b> <Text span size="xs" c="dimmed">{new Date(c.created_at).toLocaleString()}</Text></Text>
              <Text size="sm">{c.body}</Text>
            </div>
            <Button size="xs" variant="subtle" color="red" onClick={() => del(c.comment_id)}>Delete</Button>
          </Group>
        ))}
        {items.length === 0 && <Text size="sm" c="dimmed">{t('expense.noComments')}</Text>}
      </Stack>
      <form onSubmit={send}>
        <Group gap="xs" align="flex-end">
          <TextInput placeholder="Ask about this bill…" value={body} onChange={(x) => setBody(x.target.value)} style={{ flex: 1 }} />
          <Button type="submit" size="sm" loading={busy}>Send</Button>
        </Group>
      </form>
    </Card>
  );
}

// Images are auth-gated: fetch as blob with the Bearer token.
function ImgView({ id, mime, size }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/v1/images/${id}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('ss_at')}` } });
        if (!r.ok) { if (live) setErr(`load failed (${r.status})`); return; }
        const blob = await r.blob();
        if (live) setUrl(URL.createObjectURL(blob));
      } catch (e) { if (live) setErr(String(e?.message || e)); }
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (err) return <Text size="xs" c="red">{mime} {(size / 1024).toFixed(1)}KB · {err}</Text>;
  if (!url) return <Text size="xs" c="dimmed">{mime} {(size / 1024).toFixed(1)}KB…</Text>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <Image src={url} alt="receipt" w={120} radius="md" />
    </a>
  );
}

export function JoinPage() {
  const t = useT();
  const { token } = useParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState(t('expense.joining'));
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
        <Anchor component={Link} to="/" size="sm">{t('common.home')}</Anchor>
      </Card>
    </Shell>
  );
}
