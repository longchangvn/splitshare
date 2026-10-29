// Settlement — web SettlementBox parity: status card, final transfers with Pay,
// why-box (nets before, steps, raw debts), completed payments with time and
// reversed/settled tags, reverse action, version history (read-only).
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import {
  Card, Chip, ErrorBanner, Money, SkeletonCard, SpinButton, uiStyles,
} from '../ui';
import { useT } from '../prefs';
import { fmt } from '../lib/money';

export default function SettlementScreen({ route, navigation }) {
  const { id } = route.params || {};
  const t = useT();
  const [plan, setPlan] = useState(null);
  const [group, setGroup] = useState(null);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState(null);
  const [viewVersion, setViewVersion] = useState(null);
  const [why, setWhy] = useState(false);
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [p, g, ledger] = await Promise.all([
        api.get(`/api/v1/groups/${id}/settlement`),
        api.get(`/api/v1/groups/${id}`).catch(() => null),
        api.get(`/api/v1/groups/${id}/ledger?type=payment&limit=100`).catch(() => ({ items: [] })),
      ]);
      setPlan(p);
      setGroup(g?.group || g);
      setPayments(ledger.items || []);
      setViewVersion(null);
    } catch (err) { setError(err); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadHistory = async () => {
    if (history) { setHistory(null); setViewVersion(null); return; }
    try {
      const rows = await api.get(`/api/v1/groups/${id}/settlement/history`);
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (err) { setError(err); }
  };

  if (!plan && !error) {
    return <View style={s.wrap}><SkeletonCard /><SkeletonCard /></View>;
  }
  if (!plan) {
    return <View style={s.wrap}><ErrorBanner error={error} onRetry={load} /></View>;
  }

  const members = group?.members || [];
  const currency = group?.currency || 'USD';
  const nameOf = (uid) => members.find((m) => m.user_id === uid)?.display_name || String(uid || '').slice(0, 8);
  const historical = viewVersion != null;
  const view = historical ? (history || []).find((h) => h.version === viewVersion) || plan : plan;
  const transfers = view?.transfers || [];
  const ex = view?.explanation || {};
  const settled = transfers.length === 0;
  const openPayments = payments.filter((p) => !p.reversed && p.status !== 'LOCKED');

  const reverse = (payment) => {
    Alert.alert(t('m.settlement.reverseTitle'), t('m.settlement.reverseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupDetail.reverse'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.post(`/api/v1/payments/${payment.payment_id || payment.id}/reverse`, {});
            Alert.alert(t('groupDetail.paymentReversed'), '');
            await load();
          } catch (err) {
            Alert.alert(t('groupDetail.reverse'), err.message);
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <Card style={settled ? s.settledCard : s.openCard}>
        <Text style={s.status}>{settled ? t('settlement.statusSettled') : t('settlement.statusOpen')}</Text>
        <Text style={uiStyles.muted}>
          {settled
            ? t('settlement.statusSettledHint')
            : t('settlement.statusOpenHint', { n: transfers.length, saved: ex.saved ?? '—' })}
        </Text>
        <Text style={uiStyles.muted}>
          v{view?.version} · {String(view?.inputs_hash || '').slice(0, 9)}…
          {view?.computed_at ? ` · ${new Date(view.computed_at).toLocaleString()}` : ''}
        </Text>
      </Card>

      {historical && (
        <Card style={s.histCard}>
          <Text style={s.histT}>{t('settlement.historical', { version: viewVersion })}</Text>
          <SpinButton title={t('settlement.current')} variant="ghost" onPress={() => setViewVersion(null)} />
        </Card>
      )}

      <Card>
        <Text style={uiStyles.h}>{t('settlement.finalTransfers')}</Text>
        {settled && <Text style={uiStyles.muted}>{t('settlement.allSettledHint')}</Text>}
        {transfers.map((xfer, i) => (
          <Pressable
            key={`${xfer.from_user_id}-${xfer.to_user_id}-${i}`}
            style={s.transfer}
            disabled={historical}
            onPress={() => navigation.navigate('Pay', {
              id,
              from: xfer.from_user_id,
              to: xfer.to_user_id,
              amount: xfer.amount_cents,
              maxCents: xfer.amount_cents,
            })}
            accessibilityRole="button"
            accessibilityLabel={`${nameOf(xfer.from_user_id)} → ${nameOf(xfer.to_user_id)} ${fmt(xfer.amount_cents, currency)}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.transferNames}>
                {nameOf(xfer.from_user_id)} → {nameOf(xfer.to_user_id)}
              </Text>
              <Money cents={xfer.amount_cents} currency={currency} size="sm" />
            </View>
            {!historical && <Text style={s.payT}>{t('groupDetail.pay')} ›</Text>}
          </Pressable>
        ))}

        <Pressable onPress={() => setWhy(!why)} accessibilityRole="button" accessibilityState={{ expanded: why }}>
          <Text style={s.link}>{why ? t('settlement.hide') : `${t('settlement.steps')} / ${t('settlement.rawHint', { raw: ex.raw_debts ?? '—', n: transfers.length })}`}</Text>
        </Pressable>
        {why && (
          <View>
            <Text style={[uiStyles.h, { marginTop: 10 }]}>{t('settlement.netBalances')}</Text>
            {Object.entries(ex.before_nets || {}).length === 0 && (
              <Text style={uiStyles.muted}>{t('settlement.noNets')}</Text>
            )}
            {Object.entries(ex.before_nets || {}).map(([uid, cents]) => (
              <View key={uid} style={s.netRow}>
                <Text style={s.small}>{nameOf(uid)}</Text>
                <Money cents={cents} currency={currency} size="sm" signed tone={cents < 0 ? 'owe' : cents > 0 ? 'owed' : 'settled'} />
              </View>
            ))}
            <Text style={[uiStyles.h, { marginTop: 10 }]}>{t('settlement.steps')}</Text>
            {(ex.steps || []).map((step, i) => (
              <Text key={i} style={s.step}>{i + 1}. {step}</Text>
            ))}
            <Pressable onPress={() => setRaw(!raw)} accessibilityRole="button">
              <Text style={s.link}>{raw ? t('settlement.hide') : t('settlement.viewRaw')}</Text>
            </Pressable>
            {raw && (
              <Text style={uiStyles.muted}>
                {t('settlement.rawHint', { raw: ex.raw_debts ?? '—', n: transfers.length })}
              </Text>
            )}
          </View>
        )}
      </Card>

      <Card>
        <Text style={uiStyles.h}>{t('settlement.completed', { count: payments.length })}</Text>
        {payments.length === 0 && <Text style={uiStyles.muted}>{t('settlement.noTransfers')}</Text>}
        {payments.map((p) => {
          const pid = p.payment_id || p.id;
          const reversed = p.reversed || p.status === 'REVERSED';
          const canReverse = !reversed && p.status !== 'LOCKED';
          return (
            <View key={pid} style={s.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.small}>
                  {nameOf(p.from_user_id)} → {nameOf(p.to_user_id)}
                </Text>
                <Text style={s.meta}>
                  {new Date(p.created_at).toLocaleString()} · {p.method || ''}
                  {reversed ? ` · ${t('settlement.reversed')}` : p.status === 'LOCKED' ? ` · ${t('settlement.statusSettled')}` : ''}
                </Text>
                {!!p.note && <Text style={s.meta}>{p.note}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Money cents={p.amount_cents} currency={currency} size="sm" />
                {canReverse && (
                  <Pressable
                    onPress={() => reverse(p)}
                    accessibilityRole="button"
                    accessibilityLabel={t('groupDetail.reverse')}
                    style={s.reverseBtn}
                  >
                    <Text style={s.reverseT}>{t('groupDetail.reverse')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
        {busy && <Text style={uiStyles.muted}>{t('profile.saving')}</Text>}
      </Card>

      <SpinButton title={t('settlement.history')} variant="ghost" onPress={loadHistory} />
      {history && (
        <Card>
          <Text style={uiStyles.h}>{t('settlement.history')}</Text>
          <View style={s.chips}>
            <Chip label={t('settlement.current')} selected={viewVersion == null} onPress={() => setViewVersion(null)} />
            {history.map((h) => (
              <Chip
                key={h.version}
                label={`v${h.version}`}
                selected={viewVersion === h.version}
                onPress={() => setViewVersion(h.version)}
              />
            ))}
          </View>
        </Card>
      )}
      <ErrorBanner error={error} onRetry={load} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  settledCard: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
  openCard: { backgroundColor: colors.openBg, borderColor: '#fde68a' },
  histCard: { backgroundColor: colors.warnBg, borderColor: '#fdba74' },
  histT: { fontSize: 12, color: colors.warnText, fontWeight: '700' },
  status: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  transfer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen,
    borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, padding: 12, marginTop: 8, minHeight: 52,
  },
  transferNames: { fontSize: 13, fontWeight: '700', color: colors.text },
  payT: { color: colors.darkTealText, fontWeight: '800', fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  link: { color: colors.primary, fontWeight: '700', marginTop: 10, fontSize: 12 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  small: { fontSize: 12, color: colors.text, fontWeight: '600' },
  meta: { fontSize: 10, color: colors.secondary, marginTop: 2 },
  step: { backgroundColor: colors.paleTealBg, borderRadius: 10, padding: 8, fontSize: 11, color: colors.darkTealText, marginTop: 6 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 44 },
  reverseBtn: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.dangerCardBg, borderWidth: 1, borderColor: colors.dangerCardBorder },
  reverseT: { fontSize: 11, fontWeight: '800', color: colors.debtorText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
});
