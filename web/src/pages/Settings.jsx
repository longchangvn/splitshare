import { useEffect, useState } from 'react';
import {
  Button, Group, Modal, Tabs, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import {
  deleteCurrency, deleteTemplate, getCurrencies, getTemplates,
  saveCurrency, saveTemplate, subscribeCatalogs,
} from '../settingsStore.js';
import { onesignalConfigured, pushPermission, requestPushPermission } from '../onesignal.js';

export function Settings() {
  const [tab, setTab] = useState('currency');
  const [currencies, setCurrencies] = useState(() => getCurrencies());
  const [templates, setTemplates] = useState(() => getTemplates());
  const [e, setE] = useState(null);

  const [pushPerm, setPushPerm] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState(null);
  const [curCode, setCurCode] = useState('');
  const [curName, setCurName] = useState('');
  const [curBusy, setCurBusy] = useState(false);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [tplKey, setTplKey] = useState('');
  const [tplLabel, setTplLabel] = useState('');
  const [tplBusy, setTplBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => subscribeCatalogs(() => {
    setCurrencies(getCurrencies());
    setTemplates(getTemplates());
  }), []);

  // Read current permission on mount (no prompting — explicit button only).
  useEffect(() => { pushPermission().then(setPushPerm); }, []);

  const enablePush = async () => {
    setPushBusy(true);
    try {
      const granted = await requestPushPermission();
      setPushPerm(await pushPermission());
      notifications.show({
        title: granted ? 'Notifications enabled' : 'Notifications not enabled',
        color: granted ? 'teal' : 'orange',
        message: granted
          ? "You'll get push alerts when group expenses or payments change."
          : 'Permission was not granted — enable notifications in your browser settings.',
      });
    } finally {
      setPushBusy(false);
    }
  };

  const openAddCurrency = () => {
    setEditingCurrency(null);
    setCurCode('');
    setCurName('');
    setE(null);
    setCurrencyOpen(true);
  };
  const openEditCurrency = (item) => {
    setEditingCurrency(item);
    setCurCode(item.code);
    setCurName(item.name || '');
    setE(null);
    setCurrencyOpen(true);
  };
  const saveCurrencyForm = (ev) => {
    ev.preventDefault();
    setCurBusy(true);
    try {
      setCurrencies(saveCurrency({
        id: editingCurrency?.id,
        code: curCode,
        name: curName,
      }));
      setCurrencyOpen(false);
      notifications.show({
        title: editingCurrency ? 'Currency updated' : 'Currency added',
        color: 'teal',
      });
      setE(null);
    } catch (err) {
      setE({ message: err.message || String(err) });
    } finally {
      setCurBusy(false);
    }
  };

  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTplKey('');
    setTplLabel('');
    setE(null);
    setTemplateOpen(true);
  };
  const openEditTemplate = (item) => {
    setEditingTemplate(item);
    setTplKey(item.key);
    setTplLabel(item.label);
    setE(null);
    setTemplateOpen(true);
  };
  const saveTemplateForm = (ev) => {
    ev.preventDefault();
    setTplBusy(true);
    try {
      setTemplates(saveTemplate({
        id: editingTemplate?.id,
        key: tplKey,
        label: tplLabel,
      }));
      setTemplateOpen(false);
      notifications.show({
        title: editingTemplate ? 'Template updated' : 'Template added',
        color: 'teal',
      });
      setE(null);
    } catch (err) {
      setE({ message: err.message || String(err) });
    } finally {
      setTplBusy(false);
    }
  };

  const askDelete = (kind, item) => {
    setConfirmTarget({ kind, item });
    setConfirmOpen(true);
    setE(null);
  };
  const confirmDelete = () => {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      if (confirmTarget.kind === 'currency') {
        setCurrencies(deleteCurrency(confirmTarget.item.id));
        notifications.show({ title: 'Currency deleted', color: 'teal' });
      } else {
        setTemplates(deleteTemplate(confirmTarget.item.id));
        notifications.show({ title: 'Template deleted', color: 'teal' });
      }
      setConfirmOpen(false);
      setConfirmTarget(null);
      setE(null);
    } catch (err) {
      setE({ message: err.message || String(err) });
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <Shell>
      <div className="dash-head">
        <div>
          <Title order={2}>Settings</Title>
          <Text size="sm" c="dimmed">Manage currencies and group templates</Text>
        </div>
      </div>
      <Err e={e} />

      <Tabs value={tab} onChange={(v) => setTab(v || 'currency')} className="profile-tabs settings-tabs">
        <div className="tab-rail profile-tab-rail">
          <Tabs.List>
            <Tabs.Tab value="currency">Currency</Tabs.Tab>
            <Tabs.Tab value="template">Template</Tabs.Tab>
            <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
          </Tabs.List>
        </div>

        <Tabs.Panel value="currency" className="profile-panel">
          <div className="settings-panel">
            <Group justify="space-between" mb="sm">
              <Text size="sm" fw={600}>{currencies.length} currencies</Text>
              <button type="button" className="gd-action-btn settings-add-btn" onClick={openAddCurrency}>
                <SettingsIcon name="plus" />
                <span>Add</span>
              </button>
            </Group>
            <div className="settings-list">
              {currencies.map((c) => (
                <div key={c.id} className="settings-row">
                  <div className="settings-row-body">
                    <Text className="settings-row-title">{c.code}</Text>
                    <Text className="settings-row-sub">{c.name}</Text>
                  </div>
                  <div className="settings-row-actions">
                    <Tooltip label="Edit" withArrow openDelay={200}>
                      <button type="button" className="gd-person-action" aria-label={`Edit ${c.code}`} onClick={() => openEditCurrency(c)}>
                        <SettingsIcon name="edit" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete" withArrow openDelay={200}>
                      <button type="button" className="gd-person-action is-danger" aria-label={`Delete ${c.code}`} onClick={() => askDelete('currency', c)}>
                        <SettingsIcon name="trash" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="template" className="profile-panel">
          <div className="settings-panel">
            <Group justify="space-between" mb="sm">
              <Text size="sm" fw={600}>{templates.length} templates</Text>
              <button type="button" className="gd-action-btn settings-add-btn" onClick={openAddTemplate}>
                <SettingsIcon name="plus" />
                <span>Add</span>
              </button>
            </Group>
            <div className="settings-list">
              {templates.map((t) => (
                <div key={t.id} className="settings-row">
                  <div className="settings-row-body">
                    <Text className="settings-row-title">{t.label}</Text>
                    <Text className="settings-row-sub">{t.key}</Text>
                  </div>
                  <div className="settings-row-actions">
                    <Tooltip label="Edit" withArrow openDelay={200}>
                      <button type="button" className="gd-person-action" aria-label={`Edit ${t.label}`} onClick={() => openEditTemplate(t)}>
                        <SettingsIcon name="edit" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete" withArrow openDelay={200}>
                      <button type="button" className="gd-person-action is-danger" aria-label={`Delete ${t.label}`} onClick={() => askDelete('template', t)}>
                        <SettingsIcon name="trash" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <Text size="sm" c="dimmed">No templates yet — add one to use in New group.</Text>
              )}
            </div>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="notifications" className="profile-panel">
          <div className="settings-panel">
            {!onesignalConfigured() ? (
              <Text size="sm" c="dimmed">
                Push notifications are not configured for this build.
              </Text>
            ) : (
              <Group justify="space-between" mb="sm">
                <div>
                  <Text className="settings-row-title">
                    Push notifications
                    {pushPerm === 'granted' ? ' — on' : pushPerm === 'denied' ? ' — blocked' : ''}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {pushPerm === 'granted'
                      ? "You'll be notified when members of your groups add expenses or record payments."
                      : pushPerm === 'denied'
                        ? 'Notifications are blocked for this site — allow them in your browser settings to re-enable.'
                        : 'Get a push when someone in your group adds an expense or records a payment.'}
                  </Text>
                </div>
                {pushPerm !== 'granted' && pushPerm !== 'denied' && (
                  <Button className="gd-action-btn settings-add-btn" loading={pushBusy} onClick={enablePush}>
                    Enable notifications
                  </Button>
                )}
              </Group>
            )}
          </div>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={currencyOpen}
        onClose={() => !curBusy && setCurrencyOpen(false)}
        closeOnClickOutside={!curBusy}
        title={<span className="wizard-title-name">{editingCurrency ? 'Edit currency' : 'Add currency'}</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={440}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <form className="wizard-form" onSubmit={saveCurrencyForm}>
          <TextInput
            label="Code"
            placeholder="USD"
            required
            maxLength={3}
            value={curCode}
            onChange={(x) => setCurCode(x.target.value.toUpperCase())}
          />
          <TextInput
            label="Name"
            placeholder="US Dollar"
            value={curName}
            onChange={(x) => setCurName(x.target.value)}
          />
          <Button className="wizard-primary" fullWidth type="submit" loading={curBusy}>
            {editingCurrency ? 'Save changes' : 'Add currency'}
          </Button>
          <Err e={e} />
        </form>
      </Modal>

      <Modal
        opened={templateOpen}
        onClose={() => !tplBusy && setTemplateOpen(false)}
        closeOnClickOutside={!tplBusy}
        title={<span className="wizard-title-name">{editingTemplate ? 'Edit template' : 'Add template'}</span>}
        classNames={{
          content: 'wizard-modal-content',
          header: 'wizard-modal-header',
          body: 'wizard-modal-body',
          title: 'wizard-modal-title',
        }}
        centered
        size={440}
        radius={24}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.55, blur: 8 }}
      >
        <form className="wizard-form" onSubmit={saveTemplateForm}>
          <TextInput
            label="Label"
            placeholder="Beach trip"
            required
            value={tplLabel}
            onChange={(x) => setTplLabel(x.target.value)}
          />
          <TextInput
            label="Key"
            description="Used by the API (e.g. roommates, beach-trip, wedding)"
            placeholder="beach-trip"
            required
            value={tplKey}
            onChange={(x) => setTplKey(x.target.value)}
          />
          <Button className="wizard-primary" fullWidth type="submit" loading={tplBusy}>
            {editingTemplate ? 'Save changes' : 'Add template'}
          </Button>
          <Err e={e} />
        </form>
      </Modal>

      <Modal
        opened={confirmOpen}
        onClose={() => !confirmBusy && setConfirmOpen(false)}
        closeOnClickOutside={!confirmBusy}
        title={(
          <span className="wizard-title-name">
            {confirmTarget?.kind === 'currency' ? 'Delete currency' : 'Delete template'}
          </span>
        )}
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
            {confirmTarget?.kind === 'currency'
              ? <>Delete <b>{confirmTarget.item.code}</b>? Groups already using it are unchanged.</>
              : <>Delete <b>{confirmTarget?.item?.label}</b>? This removes it from New group.</>}
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setConfirmOpen(false)} disabled={confirmBusy}>
              Cancel
            </Button>
            <Button className="wizard-primary is-danger" loading={confirmBusy} onClick={confirmDelete}>
              Delete
            </Button>
          </Group>
          <Err e={e} />
        </div>
      </Modal>
    </Shell>
  );
}

function SettingsIcon({ name }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'edit') {
    return (
      <svg {...common} width={17} height={17}>
        <path d="M4.5 19.5h4.1L19.2 8.9a2.1 2.1 0 0 0 0-3l-1.1-1.1a2.1 2.1 0 0 0-3 0L4.5 15.4v4.1Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M13.4 6.6 17.4 10.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} width={17} height={17} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6.5 7v11.2A1.8 1.8 0 0 0 8.3 20h7.4a1.8 1.8 0 0 0 1.8-1.8V7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 11v5.5M14 11v5.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
