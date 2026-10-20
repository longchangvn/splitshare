import { useEffect, useState } from 'react';
import {
  Button, Group, Modal, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Err } from '../auth.jsx';
import { Shell } from '../components/Shell.jsx';
import { useT } from '../prefs.jsx';
import {
  deleteTemplate, getTemplates, saveTemplate, subscribeCatalogs,
} from '../settingsStore.js';

export function Settings() {
  const t = useT();
  const [templates, setTemplates] = useState(() => getTemplates());
  const [e, setE] = useState(null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [tplKey, setTplKey] = useState('');
  const [tplLabel, setTplLabel] = useState('');
  const [tplBusy, setTplBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => subscribeCatalogs(() => {
    setTemplates(getTemplates());
  }), []);

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
        title: editingTemplate ? t('settings.templateUpdated') : t('settings.templateAdded'),
        color: 'teal',
      });
      setE(null);
    } catch (err) {
      setE({ message: err.message || String(err) });
    } finally {
      setTplBusy(false);
    }
  };

  const askDelete = (item) => {
    setConfirmTarget(item);
    setConfirmOpen(true);
    setE(null);
  };
  const confirmDelete = () => {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      setTemplates(deleteTemplate(confirmTarget.id));
      notifications.show({ title: t('settings.templateDeleted'), color: 'teal' });
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
          <Title order={2}>{t('settings.title')}</Title>
          <Text size="sm" c="dimmed">{t('settings.subtitle')}</Text>
        </div>
      </div>
      <Err e={e} />

      <div className="profile-panel settings-panel">
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>{t('settings.templatesCount', { count: templates.length })}</Text>
          <button type="button" className="gd-action-btn settings-add-btn" onClick={openAddTemplate}>
            <SettingsIcon name="plus" />
            <span>{t('common.add')}</span>
          </button>
        </Group>
        <div className="settings-list">
          {templates.map((tpl) => (
            <div key={tpl.id} className="settings-row">
              <div className="settings-row-body">
                <Text className="settings-row-title">{tpl.label}</Text>
                <Text className="settings-row-sub">{tpl.key}</Text>
              </div>
              <div className="settings-row-actions">
                <Tooltip label={t('common.edit')} withArrow openDelay={200}>
                  <button type="button" className="gd-person-action" aria-label={`${t('common.edit')} ${tpl.label}`} onClick={() => openEditTemplate(tpl)}>
                    <SettingsIcon name="edit" />
                  </button>
                </Tooltip>
                <Tooltip label={t('common.delete')} withArrow openDelay={200}>
                  <button type="button" className="gd-person-action is-danger" aria-label={`${t('common.delete')} ${tpl.label}`} onClick={() => askDelete(tpl)}>
                    <SettingsIcon name="trash" />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <Text size="sm" c="dimmed">{t('settings.noTemplates')}</Text>
          )}
        </div>
      </div>

      <Modal
        opened={templateOpen}
        onClose={() => !tplBusy && setTemplateOpen(false)}
        closeOnClickOutside={!tplBusy}
        title={<span className="wizard-title-name">{editingTemplate ? t('settings.editTemplate') : t('settings.addTemplate')}</span>}
        classNames={{
          content: 'wizard-modal-content template-modal-content',
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
            label={t('settings.templateLabel')}
            placeholder={t('settings.templateLabelPh')}
            required
            value={tplLabel}
            onChange={(x) => setTplLabel(x.target.value)}
          />
          <TextInput
            label={t('settings.templateKey')}
            description={t('settings.templateKeyHint')}
            placeholder={t('settings.templateKeyPh')}
            required
            value={tplKey}
            onChange={(x) => setTplKey(x.target.value)}
          />
          <Button className="wizard-primary" fullWidth type="submit" loading={tplBusy}>
            {editingTemplate ? t('common.saveChanges') : t('settings.addTemplate')}
          </Button>
          <Err e={e} />
        </form>
      </Modal>

      <Modal
        opened={confirmOpen}
        onClose={() => !confirmBusy && setConfirmOpen(false)}
        closeOnClickOutside={!confirmBusy}
        title={<span className="wizard-title-name">{t('settings.deleteTemplate')}</span>}
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
            {t('settings.deleteTemplateBody', { label: confirmTarget?.label || '' })}
          </Text>
          <Group gap="sm" grow>
            <Button className="wizard-back" onClick={() => setConfirmOpen(false)} disabled={confirmBusy}>
              {t('common.cancel')}
            </Button>
            <Button className="wizard-primary is-danger" loading={confirmBusy} onClick={confirmDelete}>
              {t('common.delete')}
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
