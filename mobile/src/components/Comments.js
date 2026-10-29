// Expense comments — web ExpenseDetail parity: list, add, delete (author or
// owner; the API enforces it, the UI hides impossible actions).
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, ErrorBanner, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';

export default function Comments({ expenseId, groupOwnerId }) {
  const t = useT();
  const { user } = useAuth();
  const meId = user?.user_id || user?.id;
  const [rows, setRows] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/v1/expenses/${expenseId}/comments`);
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) { setError(err); }
  }, [expenseId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.post(`/api/v1/expenses/${expenseId}/comments`, { body: text });
      setBody('');
      await load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const remove = (commentId) => {
    Alert.alert(t('common.delete'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/api/v1/comments/${commentId}`);
            await load();
          } catch (err) { Alert.alert(t('m.errors.unknown'), err.message); }
        },
      },
    ]);
  };

  return (
    <Card>
      <Text style={uiStyles.h}>{t('expense.comments', { count: rows.length })}</Text>
      {rows.length === 0 && <Text style={uiStyles.muted}>{t('expense.noComments')}</Text>}
      {rows.map((c) => (
        <View key={c.comment_id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.author}>{c.author_name}</Text>
            <Text style={s.body}>{c.body}</Text>
            <Text style={s.meta}>{new Date(c.created_at).toLocaleString()}</Text>
          </View>
          {(c.author_id === meId || c.author_id === groupOwnerId) && (
            <Pressable
              onPress={() => remove(c.comment_id)}
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
              style={s.del}
            >
              <Text style={s.delT}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
      <TextInput
        style={s.input}
        value={body}
        onChangeText={setBody}
        placeholder={t('expense.commentPh')}
        maxLength={1000}
        multiline
      />
      <SpinButton title={t('common.send')} busy={busy} onPress={add} disabled={!body.trim()} />
      <ErrorBanner error={error} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  author: { fontSize: 12, fontWeight: '800', color: colors.text },
  body: { fontSize: 13, color: colors.text, marginTop: 2 },
  meta: { fontSize: 10, color: colors.muted, marginTop: 2 },
  del: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  delT: { color: colors.debtorText, fontWeight: '800' },
  input: {
    borderColor: colors.inputBorder, borderWidth: 1, borderRadius: 12, padding: 11,
    marginTop: 10, minHeight: 44, backgroundColor: '#fff', textAlignVertical: 'top',
  },
});
