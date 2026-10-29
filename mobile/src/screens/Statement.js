// Statement (spec 005 task 4.1) — member picker, entries with running balance
// and closing net. Numbers come straight from GET /groups/:id/statement/:uid.
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, Chip, ErrorBanner, Money, SkeletonCard, uiStyles } from '../ui';
import { useT } from '../prefs';

export default function Statement({ route }) {
  const { id, memberId } = route.params || {};
  const t = useT();
  const [group, setGroup] = useState(null);
  const [uid, setUid] = useState(memberId || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const loadGroup = useCallback(async () => {
    try {
      const g = await api.get(`/api/v1/groups/${id}`);
      const detail = g.group || g;
      setGroup(detail);
      if (!uid && detail.members?.[0]) setUid(detail.members[0].user_id);
    } catch (err) { setError(err); }
  }, [id, uid]);
  useFocusEffect(useCallback(() => { loadGroup(); }, [loadGroup]));

  useEffect(() => {
    let cancelled = false;
    if (!id || !uid) return () => { cancelled = true; };
    (async () => {
      try {
        const rows = await api.get(`/api/v1/groups/${id}/statement/${uid}`);
        if (!cancelled) { setData(rows); setError(null); }
      } catch (err) { if (!cancelled) setError(err); }
    })();
    return () => { cancelled = true; };
  }, [id, uid]);

  if (!group) {
    return (
      <View style={s.wrap}>
        <SkeletonCard />
        <ErrorBanner error={error} onRetry={loadGroup} />
      </View>
    );
  }

  const currency = group.currency || 'USD';
  const entries = data?.entries || [];

  return (
    <ScrollView style={s.wrap}>
      <Text style={s.title}>{t('statement.title')}</Text>
      <Text style={uiStyles.muted}>{t('statement.footnote')}</Text>

      <Text style={s.label}>{t('statement.member')}</Text>
      <View style={s.chips}>
        {(group.members || []).map((m) => (
          <Chip
            key={m.user_id}
            label={m.display_name}
            selected={uid === m.user_id}
            onPress={() => setUid(m.user_id)}
          />
        ))}
      </View>

      {!data && <SkeletonCard />}

      {entries.map((row, index) => {
        const entry = row.entry || {};
        const kind = String(entry.kind || '').replaceAll('_', ' ');
        return (
          <Card key={`${entry.at}-${index}`}>
            <View style={s.rowBetween}>
              <Text style={s.itemTitle} numberOfLines={1}>{entry.title}</Text>
              <Money cents={entry.amount_cents} currency={currency} size="md" />
            </View>
            <View style={s.rowBetween}>
              <Text style={s.meta}>
                {kind} · {entry.at ? new Date(entry.at).toLocaleDateString() : ''}
              </Text>
              <Text style={s.meta}>→ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((row.running_cents || 0) / 100)}</Text>
            </View>
          </Card>
        );
      })}

      {data && (
        <Card style={s.closing}>
          <View style={s.rowBetween}>
            <Text style={s.itemTitle}>{t('statement.closingNet')}</Text>
            <Money cents={data.closing_cents || 0} currency={currency} size="lg" signed tone={data.closing_cents < 0 ? 'owe' : data.closing_cents > 0 ? 'owed' : 'settled'} />
          </View>
        </Card>
      )}

      <ErrorBanner error={error} />
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.screen, padding: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginTop: 12, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  meta: { fontSize: 11, color: colors.secondary, marginTop: 3 },
  closing: { backgroundColor: colors.paleTealBg, borderColor: colors.borderTeal },
});
