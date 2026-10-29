// Frame 4 · Add / copy / edit expense — web parity: Forms.jsx ExpenseForm as launched from
// GroupDetail (create + copy, Save & new / Save & close) and ExpenseDetail (edit).
// Params: { id: groupId, copyFrom?: expense object | expense id, expenseId?: edit target }.
// Create: POST /groups/:id/expenses with Idempotency-Key + live preview-split; offline → queueOrSend.
// Edit: GET /expenses/:id, PATCH with expected_version + live preview-edit + un-settle confirm.
// Receipts are compressed with ImageManipulator (src/receipt.js) before upload.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import {
  Screen, SkeletonCard, Empty, ErrText, Button,
} from '../ui';
import ExpenseForm from '../components/expense/ExpenseForm';

export default function AddExpenseScreen({ route, navigation }) {
  const t = useT();
  const { user } = useAuth() || {};
  const meId = user?.user_id;
  const { id: groupId, expenseId, copyFrom: copyParam } = route.params || {};
  const [group, setGroup] = useState(null);
  const [existing, setExisting] = useState(null);
  const [copyFrom, setCopyFrom] = useState(copyParam && typeof copyParam === 'object' ? copyParam : null);
  const [formKey, setFormKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [e, setE] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setE(null);
    try {
      const [g, det, copyDet] = await Promise.all([
        api.get(`/api/v1/groups/${groupId}`),
        expenseId ? api.get(`/api/v1/expenses/${expenseId}`) : Promise.resolve(null),
        copyParam && typeof copyParam !== 'object' ? api.get(`/api/v1/expenses/${copyParam}`) : Promise.resolve(null),
      ]);
      setGroup(g?.group ? { ...g, ...g.group } : g);
      if (det) setExisting(det.expense || det);
      if (copyDet) setCopyFrom(copyDet.expense || copyDet);
      setFormKey((k) => k + 1);
    } catch (err) {
      setE(err);
    } finally {
      setLoading(false);
    }
  }, [groupId, expenseId, copyParam]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const title = expenseId
      ? t('groupDetail.editExpense')
      : copyFrom ? t('groupDetail.copyExpense') : t('groupDetail.addExpense');
    navigation.setOptions({ title });
  }, [navigation, expenseId, copyFrom, t]);

  if (loading && !group) {
    return <Screen><SkeletonCard /><SkeletonCard /><SkeletonCard /></Screen>;
  }
  if (!group) {
    return (
      <Screen>
        <ErrText e={e} />
        <Button variant="ghost" title={t('m.retry')} onPress={load} />
      </Screen>
    );
  }

  const members = group.members || [];
  const currency = group.currency || '';
  const role = group.my_role;

  if (expenseId && existing) {
    // Same rule as web ExpenseDetail canModify (and the API GuardAsync).
    const open = String(existing.status || '').toUpperCase() === 'OPEN';
    const allowed = role === 'owner' || role === 'treasurer' || (!!meId && existing.created_by === meId);
    if (!open || !allowed) {
      return (
        <Screen>
          <Empty
            emoji={open ? '🔒' : '🗄'}
            title={open ? t('m.expense.err.forbidden') : t('m.expense.lockedTitle')}
            sub={open ? undefined : t('m.expense.lockedHint')}
            action={t('groupDetail.copyExpense')}
            onAction={() => navigation.replace('AddExpense', { id: groupId, copyFrom: existing })}
          />
        </Screen>
      );
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ExpenseForm
        key={formKey}
        groupId={groupId}
        members={members}
        existing={expenseId ? existing : null}
        copyFrom={expenseId ? null : copyFrom}
        currency={currency}
        meId={meId}
        onDone={() => navigation.goBack()}
        onSaveNew={expenseId ? undefined : () => { setCopyFrom(null); setFormKey((k) => k + 1); }}
        onCancel={() => navigation.goBack()}
        onReload={expenseId ? load : undefined}
      />
    </View>
  );
}
