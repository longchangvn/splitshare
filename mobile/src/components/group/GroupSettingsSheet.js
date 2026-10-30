// Group settings sheet — web GroupDetail action hierarchy: quiet secondary actions first,
// destructive actions tucked at the bottom behind a confirm. One Modal, swapped content
// (avoids stacking native modals).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { api } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { categoryLabel } from '../../shared/categories';
import { Sheet, Button, Input, Field, Row, ErrText, toast } from '../../ui';
import { MenuRow, TextAction } from './parts';

const STATUSES = ['opening', 'locked', 'closed'];
const STATUS_DOT = { opening: colors.primary, locked: '#f59e0b', closed: colors.secondary };

export default function GroupSettingsSheet({
  visible, onClose, groupId, detail, categories, onReloadCategories, onChanged, onLeft, onOpenStatement, onOpenReport,
}) {
  const t = useT();
  const [mode, setMode] = useState('menu');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);
  const [cat, setCat] = useState(null); // category being edited (null = new)
  const [catName, setCatName] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState(null);
  const isOwner = detail?.my_role === 'owner';
  const lifecycle = detail?.status || 'opening';

  useEffect(() => { if (visible) { setMode('menu'); setE(null); } }, [visible]);

  const go = (m) => { setE(null); setMode(m); };
  const close = () => { if (!busy) onClose(); };
  const run = async (fn) => {
    setBusy(true); setE(null);
    try { await fn(); } catch (err) { setE(err); } finally { setBusy(false); }
  };

  const rename = () => run(async () => {
    const next = name.trim();
    if (!next || next === detail?.name) { go('menu'); return; }
    await api.patch(`/api/v1/groups/${groupId}`, { name: next });
    toast({ title: t('groupDetail.groupRenamed'), color: 'teal' });
    await onChanged();
    go('menu');
  });

  const changeStatus = () => run(async () => {
    await api.patch(`/api/v1/groups/${groupId}/status`, { status: pending });
    await onChanged();
    toast({ message: t('groupStatus.updated'), color: 'teal' });
    setPending(null);
    go('menu');
  });

  const saveCategory = () => run(async () => {
    const n = catName.trim();
    if (!n) return;
    if (cat) await api.patch(`/api/v1/groups/${groupId}/categories/${cat.category_id}`, { name: n });
    else await api.post(`/api/v1/groups/${groupId}/categories`, { name: n });
    await onReloadCategories();
    toast({ message: t(cat ? 'groupDetail.categorySaved' : 'groupDetail.categoryAdded'), color: 'teal' });
    go('categories');
  });

  const deleteCategory = () => run(async () => {
    await api.del(`/api/v1/groups/${groupId}/categories/${cat.category_id}`);
    await onReloadCategories();
    toast({ message: t('groupDetail.categoryDeleted'), color: 'teal' });
    go('categories');
  });

  const exportCsv = () => run(async () => {
    const text = await api.get(`/api/v1/groups/${groupId}/export.csv`);
    const safe = String(detail?.name || 'group').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'group';
    const file = new File(Paths.cache, `${safe}-export.csv`);
    if (file.exists) file.delete();
    file.create();
    await file.write(typeof text === 'string' ? text : JSON.stringify(text));
    if (!(await Sharing.isAvailableAsync().catch(() => false))) {
      setE({ message: t('m.group.shareUnavailable') });
      return;
    }
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: t('groupDetail.exportCsv') });
  });

  const leave = () => run(async () => {
    try {
      await api.post(`/api/v1/groups/${groupId}/leave`, {});
    } catch (err) {
      if (err.code === 'HAS_OPEN_BALANCE') throw new Error(t('m.group.leaveBlocked'));
      throw err;
    }
    onClose();
    onLeft();
  });

  const del = () => run(async () => {
    await api.del(`/api/v1/groups/${groupId}`);
    onClose();
    onLeft();
  });

  let title = t('m.group.settings');
  let body = null;
  if (mode === 'menu') {
    body = (
      <View>
        {isOwner ? <MenuRow label={t('groupDetail.rename')} onPress={() => { setName(detail?.name || ''); go('rename'); }} /> : null}
        {isOwner ? (
          <MenuRow label={t('groupStatus.label')} sub={t(`groupStatus.${lifecycle}`)} onPress={() => go('status')} />
        ) : null}
        <MenuRow label={t('groupDetail.tabCategories')} sub={t('groupDetail.categoriesHint')} onPress={() => go('categories')} />
        <MenuRow label={t('groupDetail.tabStatement')} onPress={() => { onClose(); onOpenStatement(); }} />
        <MenuRow label={t('report.title')} onPress={() => { onClose(); onOpenReport(); }} />
        <MenuRow label={t('groupDetail.exportCsv')} disabled={busy} onPress={exportCsv} right={null} />
        <Text style={[type.kicker, { marginTop: 18, marginBottom: 2 }]}>{t('m.group.dangerZone')}</Text>
        <MenuRow danger label={t('groupDetail.leaveGroup')} onPress={() => go('leave')} last={!isOwner} />
        {isOwner ? <MenuRow danger last label={t('groupDetail.deleteGroup')} onPress={() => go('delete')} /> : null}
      </View>
    );
  } else if (mode === 'rename') {
    title = t('groupDetail.rename');
    body = (
      <View>
        <Field label={t('wizard.groupName')} style={{ marginTop: 0 }}>
          <Input value={name} onChangeText={setName} autoFocus maxLength={80} returnKeyType="done" onSubmitEditing={rename} />
        </Field>
        <Row style={{ marginTop: 14 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} onPress={() => go('menu')} />
          <Button style={{ flex: 1 }} title={t('groupDetail.renameSave')} busy={busy} disabled={!name.trim()} onPress={rename} />
        </Row>
      </View>
    );
  } else if (mode === 'status') {
    title = t('groupStatus.label');
    body = (
      <View>
        {STATUSES.map((st, i) => (
          <MenuRow
            key={st}
            last={i === STATUSES.length - 1}
            label={t(`groupStatus.${st}`)}
            sub={t(`groupStatus.${st}Hint`)}
            onPress={() => { if (st === lifecycle) return; setPending(st); go('statusConfirm'); }}
            right={st === lifecycle ? <Text style={{ color: colors.primary, fontWeight: '800' }}>✓</Text> : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_DOT[st] }} />}
          />
        ))}
      </View>
    );
  } else if (mode === 'statusConfirm' && pending) {
    title = t('groupStatus.confirmTitle');
    body = (
      <View style={{ gap: 8 }}>
        <Row>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_DOT[pending] }} />
          <Text style={type.h2}>{t(`groupStatus.${pending}`)}</Text>
        </Row>
        <Text style={type.body}>{t('groupStatus.confirmBody', { from: t(`groupStatus.${lifecycle}`), to: t(`groupStatus.${pending}`) })}</Text>
        <Text style={type.small}>{t(`groupStatus.${pending}Hint`)}</Text>
        <Row style={{ marginTop: 8 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => { setPending(null); go('status'); }} />
          <Button style={{ flex: 1 }} title={t('groupStatus.confirmAction')} busy={busy} onPress={changeStatus} />
        </Row>
      </View>
    );
  } else if (mode === 'categories') {
    title = t('groupDetail.tabCategories');
    body = (
      <View>
        <Text style={type.small}>{t('groupDetail.categoriesHint')}</Text>
        <Button style={{ marginTop: 10 }} small variant="soft" icon="＋" title={t('groupDetail.categoryAdd')} onPress={() => { setCat(null); setCatName(''); go('catEdit'); }} />
        <View style={{ marginTop: 6 }}>
          {categories.map((c, i) => (
            <MenuRow
              key={c.category_id || c.key}
              last={i === categories.length - 1}
              label={categoryLabel(c, t)}
              sub={c.is_default ? t('groupDetail.categoryDefault') : c.key}
              onPress={c.is_default ? undefined : () => { setCat(c); setCatName(c.name || ''); go('catEdit'); }}
              disabled={false}
              right={c.is_default ? null : (
                <Row gap={14}>
                  <TextAction label={t('common.edit')} onPress={() => { setCat(c); setCatName(c.name || ''); go('catEdit'); }} />
                  <TextAction danger label={t('common.delete')} onPress={() => { setCat(c); go('catDelete'); }} />
                </Row>
              )}
            />
          ))}
          {categories.length === 0 ? <Text style={[type.small, { paddingVertical: 12 }]}>{t('groupDetail.noCategories')}</Text> : null}
        </View>
        <Button style={{ marginTop: 12 }} variant="ghost" title={t('common.back')} onPress={() => go('menu')} />
      </View>
    );
  } else if (mode === 'catEdit') {
    title = t(cat ? 'groupDetail.categoryRename' : 'groupDetail.categoryAdd');
    body = (
      <View>
        <Field label={t('groupDetail.categoryName')} style={{ marginTop: 0 }}>
          <Input value={catName} onChangeText={setCatName} placeholder={t('forms.expense.addCategoryPh')} autoFocus maxLength={40} onSubmitEditing={saveCategory} />
        </Field>
        <Row style={{ marginTop: 14 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => go('categories')} />
          <Button style={{ flex: 1 }} title={t(cat ? 'common.saveChanges' : 'groupDetail.categoryAdd')} busy={busy} disabled={!catName.trim()} onPress={saveCategory} />
        </Row>
      </View>
    );
  } else if (mode === 'catDelete' && cat) {
    title = t('groupDetail.categoryDelete');
    body = (
      <View>
        <Text style={type.body}>{t('groupDetail.categoryDeleteBody', { name: categoryLabel(cat, t) })}</Text>
        <Row style={{ marginTop: 14 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => go('categories')} />
          <Button style={{ flex: 1 }} variant="danger" title={t('common.delete')} busy={busy} onPress={deleteCategory} />
        </Row>
      </View>
    );
  } else if (mode === 'leave') {
    title = t('groupDetail.leaveGroup');
    body = (
      <View>
        <Text style={type.body}>{t('groupDetail.leaveBody', { name: detail?.name || '' })}</Text>
        <Text style={[type.small, { marginTop: 6 }]}>{t('m.group.leaveHint')}</Text>
        <Row style={{ marginTop: 14 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => go('menu')} />
          <Button style={{ flex: 1 }} variant="danger" title={t('groupDetail.leave')} busy={busy} onPress={leave} />
        </Row>
      </View>
    );
  } else if (mode === 'delete') {
    title = t('groupDetail.deleteGroup');
    body = (
      <View>
        <Text style={type.body}>{t('groupDetail.deleteBody', { name: detail?.name || '' })}</Text>
        <Text style={[type.small, { marginTop: 6 }]}>{t('m.group.deleteHint')}</Text>
        <Row style={{ marginTop: 14 }}>
          <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => go('menu')} />
          <Button style={{ flex: 1 }} variant="danger" title={t('groupDetail.delete')} busy={busy} onPress={del} />
        </Row>
      </View>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {body}
      <ErrText e={e} />
      {busy && mode === 'menu' ? <Text style={[type.small, { marginTop: 6 }]}>{t('common.loading')}</Text> : null}
      <View style={{ height: 8 }} />
    </Sheet>
  );
}
