// Member statement — web parity with pages/Statement.jsx (StatementMobileList):
// member picker (defaults to userId param / me), entry rows with kind chips, date + time,
// amount, running balance, closing net, footnote.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, RefreshControl, StyleSheet } from 'react-native';
import { api, fmt } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, type } from '../theme';
import { Screen, Card, SelectField, SkeletonCard, ErrText, Row } from '../ui';
import { ListRow, NetChip, useDateFmt, p as parts } from '../components/group/parts';

const KIND_KEY = { paid: 'm.group.kind.paid', share: 'm.group.kind.share', payment_out: 'm.group.kind.paymentOut', payment_in: 'm.group.kind.paymentIn' };

export default function StatementScreen({ route, navigation }) {
  const { id, userId } = route.params || {};
  const t = useT();
  const d = useDateFmt();
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [uid, setUid] = useState(userId || '');
  const [stmt, setStmt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [e, setE] = useState(null);
  const req = useRef(0);

  useEffect(() => {
    let live = true;
    api.get(`/api/v1/groups/${id}`).then((g) => {
      if (!live) return;
      const det = g?.group || g;
      setDetail(det);
      if (det?.name) navigation.setOptions({ title: `${t('statement.title')} · ${det.name}` });
      const ms = det?.members || [];
      setUid((cur) => {
        if (cur && ms.some((m) => m.user_id === cur)) return cur;
        return ms.find((m) => m.user_id === user?.user_id)?.user_id || ms[0]?.user_id || cur;
      });
    }).catch((err) => { if (live) setE(err); });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!uid) return;
    const r = ++req.current;
    setLoading(true);
    try {
      const s = await api.get(`/api/v1/groups/${id}/statement/${uid}`);
      if (r === req.current) { setStmt(s); setE(null); }
    } catch (err) {
      if (r === req.current) setE(err);
    } finally {
      if (r === req.current) setLoading(false);
    }
  }, [id, uid]);
  useEffect(() => { load(); }, [load]);

  const members = detail?.members || [];
  const currency = detail?.currency || 'USD';
  const entries = stmt?.user_id && stmt.user_id !== uid ? [] : stmt?.entries || [];

  const kindLabel = (k) => (KIND_KEY[k] ? t(KIND_KEY[k]) : String(k || '').replace(/_/g, ' '));

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && !!stmt} onRefresh={load} tintColor={colors.primary} />}>
      <SelectField
        label={t('statement.member')}
        value={uid}
        onChange={setUid}
        options={members.map((m) => ({ value: m.user_id, label: m.user_id === user?.user_id ? `${m.display_name} · ${t('m.group.you')}` : m.display_name }))}
      />
      <ErrText e={e} />
      {!stmt && !e ? <SkeletonCard /> : null}
      {stmt ? (
        <Card style={{ paddingVertical: 4 }}>
          {entries.length === 0 ? <Text style={[type.small, { paddingVertical: 16, textAlign: 'center' }]}>{t('report.emptyStatement')}</Text> : null}
          {entries.map((r, i) => {
            const k = String(r.entry?.kind || '');
            const [bg, fg] = colors.kind[k] || colors.kind.comment;
            return (
              <ListRow key={`${r.entry?.at}-${k}-${i}`} last={false}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={type.h3} numberOfLines={1}>{r.entry?.title}</Text>
                  <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                    <Text style={[s.kind, { backgroundColor: bg, color: fg }]}>{kindLabel(k)}</Text>
                    <Text style={parts.meta}>{d.date(r.entry?.at)}</Text>
                    <Text style={[parts.meta, { color: colors.muted }]}>{d.time(r.entry?.at)}</Text>
                  </Row>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={parts.amount}>{fmt(r.entry?.amount_cents, currency)}</Text>
                  <Text style={parts.meta}>→ {fmt(r.running_cents, currency)}</Text>
                </View>
              </ListRow>
            );
          })}
          {typeof stmt.closing_cents === 'number' ? (
            <ListRow last>
              <Text style={[type.h3, { flex: 1 }]}>{t('statement.closingNet')}</Text>
              <NetChip cents={stmt.closing_cents} label={stmt.closing_cents === 0 ? t('common.settled') : fmt(stmt.closing_cents, currency)} />
            </ListRow>
          ) : null}
        </Card>
      ) : null}
      <Text style={type.small}>{t('m.group.statementFootnote')}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  kind: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
});
