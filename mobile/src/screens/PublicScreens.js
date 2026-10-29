// Public screens (spec 005 task 5.5):
//   /s/:token  → GET /shared/{token}, read-only balances (no session needed)
//   /g/:token  → GET /invites/{token} preview, then join after sign-in
// Both are reachable signed out; the invite keeps the token so the user lands
// back on the same group after login.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, groupIdOf } from '../api/client';
import { colors } from '../theme';
import { Card, ErrorBanner, Money, PressableRow, SpinButton, uiStyles } from '../ui';
import { useT } from '../prefs';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../lib/errors';

export function SharePublicScreen({ route }) {
  const { token } = route.params || {};
  const t = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get(`/api/v1/shared/${token}`));
      setError(null);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const currency = data?.currency || 'USD';

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.title}>{data?.name || t('share.readOnly')}</Text>
      <Text style={uiStyles.muted}>{t('share.modeGroup', { mode: data?.mode || 'shared' })}</Text>
      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}
      <ErrorBanner error={error} onRetry={load} />

      {data && (
        <>
          <Card>
            <Text style={uiStyles.h}>{t('common.members')}</Text>
            {(data.members || []).map((m) => (
              <View key={m.display_name} style={s.rowBetween}>
                <Text style={s.name}>{m.display_name}</Text>
                <Money cents={m.net_cents || 0} currency={currency} signed size="sm" />
              </View>
            ))}
          </Card>
          <Card>
            <Text style={uiStyles.h}>{t('share.whoPaysWhom')}</Text>
            {(data.transfers || []).length === 0 && <Text style={uiStyles.muted}>{t('settlement.allSettledHint')}</Text>}
            {(data.transfers || []).map((xfer, i) => (
              <View key={`${xfer.from}-${xfer.to}-${i}`} style={s.rowBetween}>
                <Text style={s.name}>{xfer.from} → {xfer.to}</Text>
                <Money cents={xfer.amount_cents} currency={currency} size="sm" />
              </View>
            ))}
          </Card>
        </>
      )}
      <Text style={s.foot}>{t('share.logIn')}</Text>
    </ScrollView>
  );
}

export function InviteLandingScreen({ route, navigation }) {
  const { token } = route.params || {};
  const t = useT();
  const { user } = useAuth();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPreview(await api.get(`/api/v1/invites/${token}`));
      setError(null);
    } catch (err) { setError(err); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const join = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/v1/groups/join', { token });
      const id = groupIdOf(res) || res?.group_id;
      if (id) navigation.replace('GroupDetail', { id });
      else navigation.replace('Main', { screen: 'Groups' });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.title}>{t('invite.title')}</Text>
      {preview ? (
        <Card>
          <Text style={s.groupName}>{preview.name}</Text>
          <Text style={uiStyles.muted}>
            {preview.currency} · {t('groupDetail.membersCount', { count: preview.member_count, unit: preview.member_count === 1 ? t('common.person') : t('common.people') })}
          </Text>
        </Card>
      ) : (
        <>
          <ActivityIndicator style={{ marginTop: 16 }} />
          <ErrorBanner error={error} onRetry={load} />
        </>
      )}

      {user ? (
        <SpinButton
          title={busy ? t('expense.joining') : t('quickAdd.group')}
          busy={busy}
          disabled={!preview}
          onPress={join}
        />
      ) : (
        <>
          <Text style={uiStyles.muted}>{t('share.logIn')}</Text>
          <SpinButton
            title={t('auth.logIn')}
            onPress={async () => {
              // Remember the invite so login returns the user to this group.
              try { await AsyncStorage.setItem('ss_pending_invite', token); } catch { /* ignore */ }
              navigation.navigate('Login');
            }}
          />
        </>
      )}
      {error && !preview && <Text style={s.err}>{errorText(error, t)}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 18, fontWeight: '800' },
  groupName: { fontSize: 16, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, minHeight: 36 },
  name: { fontSize: 13, color: colors.text, fontWeight: '600' },
  foot: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 20 },
  err: { fontSize: 12, color: colors.debtorText, marginTop: 10 },
});
