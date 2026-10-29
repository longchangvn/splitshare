// Group categories (spec 005 task 2.6) — list, add, rename, delete. Default
// categories are read-only, matching the API rule that only custom rows can be
// renamed or removed.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, ErrorBanner, PressableRow, Sheet, SkeletonCard, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { categoryLabel } from '../lib/categories';

export default function Categories({ route }) {
  const { id } = route.params || {};
  const t = useT();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // {category_id?, name}
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/v1/groups/${id}/categories`);
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) { setError(err); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      if (editing?.category_id) {
        await api.patch(`/api/v1/groups/${id}/categories/${editing.category_id}`, { name });
      } else {
        await api.post(`/api/v1/groups/${id}/categories`, { name });
      }
      setEditing(null);
      setValue('');
      await load();
      Alert.alert(t('groupDetail.categorySaved'), '');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const remove = (row) => {
    Alert.alert(t('groupDetail.categoryDelete'), t('groupDetail.categoryDeleteBody', { name: categoryLabel(row, t) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.del(`/api/v1/groups/${id}/categories/${row.category_id}`);
            await load();
          } catch (err) { setError(err); } finally { setBusy(false); }
        },
      },
    ]);
  };

  if (!rows) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap}>
      <Text style={uiStyles.muted}>{t('groupDetail.categoriesHint')}</Text>
      <Card>
        {rows.length === 0 && <Text style={uiStyles.muted}>{t('groupDetail.noCategories')}</Text>}
        {rows.map((row) => (
          <View key={row.category_id || row.key}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{categoryLabel(row, t)}</Text>
                <Text style={s.meta}>
                  {row.key}{row.is_default ? ` · ${t('groupDetail.categoryDefault')}` : ''}
                </Text>
              </View>
              {!row.is_default && (
                <View style={s.actions}>
                  <Text
                    style={s.action}
                    onPress={() => { setEditing(row); setValue(row.name || ''); }}
                    accessibilityRole="button"
                  >{t('groupDetail.categoryRename')}</Text>
                  <Text
                    style={[s.action, s.danger]}
                    onPress={() => remove(row)}
                    accessibilityRole="button"
                  >{t('common.delete')}</Text>
                </View>
              )}
            </View>
          </View>
        ))}
        <SpinButton
          title={`＋ ${t('groupDetail.categoryAdd')}`}
          onPress={() => { setEditing({}); setValue(''); }}
        />
      </Card>
      <ErrorBanner error={error} />
      <View style={{ height: 20 }} />

      <Sheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.category_id ? t('groupDetail.categoryRename') : t('groupDetail.categoryAdd')}
        scroll={false}
      >
        <TextInput
          style={s.input}
          value={value}
          onChangeText={setValue}
          placeholder={t('groupDetail.categoryName')}
          autoFocus
          maxLength={40}
        />
        <SpinButton title={t('common.save')} busy={busy} onPress={save} />
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  action: { fontSize: 12, fontWeight: '700', color: colors.darkTealText, paddingVertical: 10 },
  danger: { color: colors.debtorText },
  input: {
    backgroundColor: '#fff', borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, minHeight: 44, fontSize: 14,
  },
});
