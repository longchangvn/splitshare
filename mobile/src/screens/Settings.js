// Settings (spec 005 task 5.3) — local group-template catalogue with the same
// validation as web settingsStore. The New-group wizard reads it immediately.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme';
import {
  Card, ErrorBanner, PressableRow, Sheet, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { deleteTemplate, getTemplates, saveTemplate } from '../lib/templates';

export default function Settings() {
  const t = useT();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, label, key}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await getTemplates());
      setError(null);
    } catch (err) { setError(err); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveTemplate(editing);
      setEditing(null);
      await load();
    } catch (err) {
      setError({ status: 422, code: 'VALIDATION', message: err.message });
    } finally { setBusy(false); }
  };

  const remove = (item) => {
    Alert.alert(t('settings.deleteTemplate'), t('settings.deleteTemplateBody', { label: item.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            setTemplates(await deleteTemplate(item.id));
          } catch (err) { setError({ message: err.message }); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('settings.title')}</Text>
      <Text style={uiStyles.muted}>{t('settings.subtitle')} · {t('settings.templatesCount', { count: templates.length })}</Text>

      <Card>
        {templates.length === 0 && <Text style={uiStyles.muted}>{t('settings.noTemplates')}</Text>}
        {templates.map((item) => (
          <View key={item.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={uiStyles.muted}>{item.key}</Text>
            </View>
            <Text
              style={s.action}
              onPress={() => setEditing({ id: item.id, label: item.label, key: item.key })}
              accessibilityRole="button"
            >{t('common.edit')}</Text>
            <Text
              style={[s.action, s.danger]}
              onPress={() => remove(item)}
              accessibilityRole="button"
            >{t('common.delete')}</Text>
          </View>
        ))}
        <SpinButton title={`＋ ${t('settings.addTemplate')}`} onPress={() => setEditing({ label: '', key: '' })} />
      </Card>

      <ErrorBanner error={error} />
      <View style={{ height: 20 }} />

      <Sheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('settings.editTemplate') : t('settings.addTemplate')}
        scroll={false}
      >
        <Text style={s.fieldLabel}>{t('settings.templateLabel')}</Text>
        <TextInput
          style={s.input}
          value={editing?.label || ''}
          onChangeText={(v) => setEditing({ ...editing, label: v })}
          placeholder={t('settings.templateLabelPh')}
          maxLength={40}
        />
        <Text style={s.fieldLabel}>{t('settings.templateKey')}</Text>
        <TextInput
          style={s.input}
          value={editing?.key || ''}
          onChangeText={(v) => setEditing({ ...editing, key: v })}
          placeholder={t('settings.templateKeyPh')}
          autoCapitalize="none"
          maxLength={32}
        />
        <Text style={uiStyles.muted}>{t('settings.templateKeyHint')}</Text>
        <SpinButton title={t('common.save')} busy={busy} onPress={save} />
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  action: { fontSize: 12, fontWeight: '700', color: colors.darkTealText, paddingHorizontal: 8, paddingVertical: 10 },
  danger: { color: colors.debtorText },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 10, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, minHeight: 44, fontSize: 14,
  },
});
