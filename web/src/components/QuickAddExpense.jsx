import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Checkbox, Loader, Modal, MultiSelect, Radio, Stack, Text,
} from '@mantine/core';
import { api } from '../api.js';
import { Err, useAuth } from '../auth.jsx';
import { useT } from '../prefs.jsx';
import {
  ADD_EXPENSE_STATE, defaultGroupName, mergeMembers, resolveQuickAddFlow,
} from '../quickAdd.js';

const DEFAULT_CURRENCY = 'USD';

/** Floating "Add expense" button; GroupDetail uses it to open its own expense form. */
export function AddExpenseFab({ onClick, disabled = false }) {
  const t = useT();
  return (
    <button
      type="button"
      className="qa-fab no-print"
      onClick={onClick}
      disabled={disabled}
      aria-label={t('quickAdd.fab')}
      title={t('quickAdd.fab')}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="qa-fab-label">{t('quickAdd.fab')}</span>
    </button>
  );
}

/**
 * Floating "Add expense" button + who-picker (people and/or one group).
 * Flow 1 (people + group) is handed to the caller via onCreateGroup(members)
 * so the existing New-group wizard can be reused.
 */
export function QuickAddExpense({ onCreateGroup }) {
  const t = useT();
  const nav = useNavigate();
  const { user } = useAuth() || {};
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]); // user_id[]
  const [groupId, setGroupId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);

  const openPicker = async () => {
    setSelected([]); setGroupId(null); setE(null); setOpen(true);
    setLoading(true);
    try {
      const [c, g] = await Promise.all([
        api.get('/api/v1/contacts?limit=50'),
        api.get('/api/v1/groups'),
      ]);
      setContacts([...(c || [])]
        .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name))));
      setGroups([...(g || [])]
        .sort((a, b) => String(a.name).localeCompare(String(b.name))));
    } catch (err) { setE(err); } finally { setLoading(false); }
  };

  const toggle = (uid) => setSelected((cur) => (
    cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]));

  const people = selected.map((uid) => contacts.find((c) => c.user_id === uid)).filter(Boolean);
  const flow = resolveQuickAddFlow(people.length, groupId);

  const next = async () => {
    if (!flow || busy) return;
    setBusy(true); setE(null);
    try {
      if (flow === 'group') {
        setOpen(false);
        nav(`/groups/${groupId}`, { state: ADD_EXPENSE_STATE });
      } else if (flow === 'people') {
        const g = await api.post('/api/v1/groups', {
          name: defaultGroupName(people, t('quickAdd.you')),
          currency: DEFAULT_CURRENCY,
          member_ids: mergeMembers(people, [], user?.user_id).map((p) => p.user_id),
          invite_emails: [],
        });
        const gid = g.group_id ?? g.group?.id;
        if (!gid) { setE({ message: t('errors.noGroupId') }); return; }
        setOpen(false);
        nav(`/groups/${gid}`, { state: ADD_EXPENSE_STATE });
      } else {
        const d = await api.get(`/api/v1/groups/${groupId}`);
        setOpen(false);
        onCreateGroup?.(mergeMembers(people, d?.members || [], user?.user_id));
      }
    } catch (err) { setE(err); } finally { setBusy(false); }
  };

  return (
    <>
      <AddExpenseFab onClick={openPicker} />

      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        closeOnClickOutside={false}
        title={<span className="wizard-title-name">{t('quickAdd.title')}</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={520}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <div className="wizard-form qa-form">
          <div className="wizard-fields">
            <MultiSelect
              label={t('quickAdd.people')}
              placeholder={selected.length ? '' : t('quickAdd.peoplePh')}
              data={contacts.map((c) => ({ value: c.user_id, label: c.display_name }))}
              value={selected}
              onChange={setSelected}
              searchable
              clearable
              nothingFoundMessage={t('quickAdd.noContacts')}
              comboboxProps={{ withinPortal: true }}
            />
            <div className="qa-contacts" role="group" aria-label={t('quickAdd.allContacts')}>
              <div className="wizard-contacts-title">{t('quickAdd.allContacts')}</div>
              {loading && <Loader size="sm" m="sm" />}
              {!loading && contacts.length === 0 && (
                <Text size="xs" c="dimmed">{t('quickAdd.noContacts')}</Text>
              )}
              {!loading && contacts.map((c) => (
                <Checkbox
                  key={c.user_id}
                  className="qa-contact"
                  checked={selected.includes(c.user_id)}
                  onChange={() => toggle(c.user_id)}
                  label={(
                    <span className="qa-contact-copy">
                      <span className="qa-contact-name">{c.display_name}</span>
                      <span className="qa-contact-user">@{c.username}</span>
                    </span>
                  )}
                />
              ))}
            </div>
            {/* All groups as radios; "No group" clears the choice. Closed groups are read-only. */}
            <Radio.Group
              label={t('quickAdd.group')}
              value={groupId || ''}
              onChange={(v) => setGroupId(v || null)}
            >
              <div className="qa-groups">
                <Radio className="qa-group" value="" label={t('quickAdd.noGroup')} />
                {!loading && groups.length === 0 && (
                  <Text size="xs" c="dimmed">{t('quickAdd.noGroups')}</Text>
                )}
                {groups.map((g) => (
                  <Radio
                    key={g.group_id}
                    className="qa-group"
                    value={g.group_id}
                    disabled={g.status === 'closed'}
                    label={(
                      <span className="qa-contact-copy">
                        <span className="qa-contact-name">{g.name}</span>
                        <span className="qa-contact-user">
                          {g.currency}{g.status === 'closed' ? ` · ${t('groupStatus.closed')}` : ''}
                        </span>
                      </span>
                    )}
                  />
                ))}
              </div>
            </Radio.Group>
            <Text size="xs" c="dimmed">{t(`quickAdd.hint.${flow || 'none'}`)}</Text>
          </div>
          <Stack gap={0}>
            <Button className="wizard-primary" fullWidth onClick={next} loading={busy} disabled={!flow || loading}>
              {t('common.next')}
            </Button>
            <Err e={e} />
          </Stack>
        </div>
      </Modal>
    </>
  );
}
