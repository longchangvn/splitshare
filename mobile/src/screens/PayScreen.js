// Pay — records a payment (PaymentForm) and offers the reverse action when
// opened from a completed transfer. Web parity: PaymentForm + reverse.
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, normalizeDecimal } from '../api/client';
import { colors } from '../theme';
import { Card, ErrorBanner, SkeletonCard, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import PaymentForm from '../components/PaymentForm';

export default function PayScreen({ route, navigation }) {
  const { id, to, from, amount, paymentId, maxCents } = route.params || {};
  const t = useT();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const g = await api.get(`/api/v1/groups/${id}`);
      setGroup(g.group || g);
    } catch (err) { setError(err); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={load} />
      </View>
    );
  }

  const toName = (group.members || []).find((m) => m.user_id === to)?.display_name || '';

  const reverse = () => {
    Alert.alert(t('m.settlement.reverseTitle'), t('m.settlement.reverseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupDetail.reverse'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.post(`/api/v1/payments/${paymentId}/reverse`, {});
            Alert.alert(t('groupDetail.paymentReversed'), '');
            navigation.goBack();
          } catch (err) {
            Alert.alert(t('groupDetail.reverse'), err.message);
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.wrap}>
      <View style={s.card}>
        <Text style={s.h}>Pay {displayNameOf(members, toId) || '…'}</Text>
        <Text style={s.muted}>from/to/owner only · partial allowed · overpay blocked (422 + max)</Text>
        <Text style={s.big}>${amt || '0.00'} {currency}</Text>
        <Text style={s.h}>From</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Pressable key={m.user_id} style={[s.chip, fromId === m.user_id && s.chipOn]} onPress={() => setFromId(m.user_id)}>
              <Text style={s.chipT}>{m.display_name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.h}>To</Text>
        <View style={s.chips}>
          {members.map((m) => (
            <Pressable key={m.user_id} style={[s.chip, toId === m.user_id && s.chipOn]} onPress={() => setToId(m.user_id)}>
              <Text style={s.chipT}>{m.display_name}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={amt} onChangeText={(v) => setAmt(normalizeDecimal(v))} keyboardType="decimal-pad" placeholder="amount" />
        <View style={s.seg}>
          {['cash', 'transfer', 'other'].map((m) => (
            <Pressable key={m} style={[s.segI, method === m && s.segOn]} onPress={() => setMethod(m)}>
              <Text style={s.segT}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.inp} value={note} onChangeText={setNote} placeholder="note ≤280" maxLength={280} />
        <ErrText e={e} />
        <SpinButton title={busy ? 'Recording…' : 'Record payment'} busy={busy} onPress={record} />
        {paymentId && (
          <Pressable style={s.ghost} onPress={reverse}><Text>Reverse (owner, 24h)</Text></Pressable>
        )}
      </View>
    <ScrollView style={s.wrap} keyboardShouldPersistTaps="handled">
      <PaymentForm
        group={group}
        initial={{ from, to, amount, toName }}
        maxCents={maxCents}
        onCancel={() => navigation.goBack()}
        onSaved={(_, state) => {
          if (state === 'settled') Alert.alert(t('groupDetail.fullySettled'), '');
          else if (state === 'open') Alert.alert(t('groupDetail.paymentRecorded'), '');
          navigation.goBack();
        }}
      />
      {paymentId && (
        <Card>
          <Text style={uiStyles.h}>{t('groupDetail.reverse')}</Text>
          <Text style={uiStyles.muted}>{t('m.settlement.reverseBody')}</Text>
          <SpinButton title={t('groupDetail.reverse')} variant="ghost" busy={busy} onPress={reverse} />
        </Card>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
});
