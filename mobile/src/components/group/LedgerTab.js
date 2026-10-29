// Ledger tab — web GroupDetail "ledger" panel (mobile layout): search, type filter,
// collapsible filter sheet with active-count badge, receipt-style rows, archive empty states.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fmt, displayNameOf } from '../../api/client';
import { colors, type } from '../../theme';
import { useT } from '../../i18n';
import { sanitizeMoneyInput } from '../../money';
import { categoryLabelForKey, categorySelectData } from '../../shared/categories';
import { Card, Input, Segmented, Button, SelectField, Field, Sheet, Badge, Row, Skeleton } from '../../ui';
import { Tile, ListRow, useDateFmt, p as parts } from './parts';
import { DEFAULT_FILTERS, activeFilterCount, isValidDateInput } from './helpers';

export default function LedgerTab({
  items, loading, loaded, currency, members, categories, type: kind, onType, q, onQ,
  filters, onApplyFilters, emptyKind, onOpen, onItemActions,
}) {
  const t = useT();
  const d = useDateFmt();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const totals = items.reduce((a, it) => ({ amount: a.amount + (it.amount_cents || 0), mine: a.mine + (it.my_share_cents || 0) }), { amount: 0, mine: 0 });

  return (
    <View style={{ gap: 10 }}>
      <Segmented
        value={kind}
        onChange={onType}
        options={[
          { value: 'all', label: t('groupDetail.filterAll') },
          { value: 'expense', label: t('groupDetail.filterExpenses') },
          { value: 'payment', label: t('groupDetail.filterPayments') },
        ]}
      />
      <Row>
        <Input
          style={{ flex: 1 }}
          value={q}
          onChangeText={onQ}
          placeholder={t('groupDetail.searchExpenses')}
          accessibilityLabel={t('groupDetail.searchExpenses')}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Pressable
          style={[s.fbtn, count > 0 && { borderColor: colors.primary }]}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? t('groupDetail.filtersActive', { count }) : t('common.filters')}
        >
          <Text style={{ fontSize: 16, color: colors.text }}>⧩</Text>
          {count > 0 ? <View style={s.dot}><Text style={s.dotT}>{count}</Text></View> : null}
        </Pressable>
      </Row>
      {filters.status === 'LOCKED' ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge kind="comment" label={t('groupDetail.statusLocked')} />
          <Text style={parts.textAction} onPress={() => onApplyFilters({ ...filters, status: 'OPEN' })} accessibilityRole="button">{t('groupDetail.viewActive')}</Text>
        </Row>
      ) : null}

      <Card style={{ paddingVertical: 4 }}>
        {!loaded && loading ? (
          <View style={{ gap: 12, paddingVertical: 12 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={36} />)}</View>
        ) : null}
        {items.map((it, i) => {
          const isExp = it.kind === 'expense';
          const meta = isExp
            ? [it.category ? categoryLabelForKey(it.category, categories, t) : null, it.payer_name || displayNameOf(members, it.payer_id)].filter(Boolean).join(' · ')
            : `${it.from_name || displayNameOf(members, it.from_user_id)} → ${it.to_name || displayNameOf(members, it.to_user_id)}`;
          const locked = it.status === 'LOCKED';
          return (
            <ListRow
              key={`${it.kind}-${it.id}`}
              onPress={isExp ? () => onOpen(it) : undefined}
              onLongPress={isExp ? () => onItemActions(it) : undefined}
              accessibilityLabel={isExp ? t('groupDetail.openItem', { title: it.title }) : undefined}
              style={it.reversed ? { opacity: 0.55 } : null}
            >
              <Tile item={it} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.h3, it.reversed && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                  {it.title}{it.has_image ? ' 🧾' : ''}{it.reversed ? ` (${t('common.reversed')})` : ''}
                </Text>
                <Text style={parts.meta} numberOfLines={1}>{meta}</Text>
                <Text style={[parts.meta, { color: colors.muted }]}>{d.date(it.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={parts.amount}>{fmt(it.amount_cents, currency)}</Text>
                <Text style={parts.meta}>{t('groupDetail.myShare')} {it.my_share_cents != null ? fmt(it.my_share_cents, currency) : '—'}</Text>
                <Text style={[s.status, locked ? s.stLocked : s.stOpen]}>{locked ? t('groupDetail.statusLocked') : t('groupDetail.statusOpen')}</Text>
              </View>
            </ListRow>
          );
        })}
        {items.length > 0 ? (
          <ListRow last>
            <Text style={[type.h3, { flex: 1 }]}>{t('groupDetail.totalCount', { count: items.length })}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={parts.amount}>{fmt(totals.amount, currency)}</Text>
              <Text style={parts.meta}>{t('groupDetail.mine')} {fmt(totals.mine, currency)}</Text>
            </View>
          </ListRow>
        ) : null}
        {loaded && !loading && items.length === 0 ? (
          <View style={{ paddingVertical: 18, alignItems: 'center', gap: 6 }} accessibilityRole="text">
            {emptyKind === 'archive' ? (
              <>
                <Text style={[type.small, { textAlign: 'center' }]}>{t('groupDetail.ledgerEmptyArchive')}</Text>
                <Button small variant="soft" title={t('groupDetail.viewActive')} onPress={() => onApplyFilters({ ...filters, status: 'OPEN' })} />
              </>
            ) : emptyKind === 'settled' ? (
              <>
                <Text style={type.h2}>{t('groupDetail.ledgerAllSettled')}</Text>
                <Text style={[type.small, { textAlign: 'center' }]}>{t('groupDetail.ledgerAllSettledHint')}</Text>
                <Button small variant="soft" title={t('groupDetail.viewArchive')} onPress={() => onApplyFilters({ ...filters, status: 'LOCKED' })} />
              </>
            ) : (
              <Text style={[type.small, { textAlign: 'center' }]}>{t('groupDetail.ledgerEmptyActive')}</Text>
            )}
          </View>
        ) : null}
      </Card>
      {items.length > 0 ? <Text style={[type.small, { textAlign: 'center' }]}>{t('m.group.longPressHint')}</Text> : null}

      <FilterSheet
        visible={open}
        onClose={() => setOpen(false)}
        initial={filters}
        members={members}
        categories={categories}
        onApply={(f) => { setOpen(false); onApplyFilters(f); }}
      />
    </View>
  );
}

function FilterSheet({ visible, onClose, initial, members, categories, onApply }) {
  const t = useT();
  const [f, setF] = useState(initial);
  React.useEffect(() => { if (visible) setF(initial); }, [visible, initial]);
  const set = (k) => (v) => setF((prev) => ({ ...prev, [k]: v }));
  const fromErr = isValidDateInput(f.from) ? null : t('m.group.dateFormat');
  const toErr = isValidDateInput(f.to) ? null : t('m.group.dateFormat');
  const anyone = { value: '', label: t('common.anyone') };
  const any = { value: '', label: t('common.any') };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('common.filters')}
      footer={(
        <Row>
          <Button style={{ flex: 1 }} variant="ghost" title={t('m.group.clearFilters')} onPress={() => setF({ ...DEFAULT_FILTERS })} />
          <Button style={{ flex: 1 }} title={t('common.apply')} disabled={!!fromErr || !!toErr} onPress={() => onApply(f)} />
        </Row>
      )}
    >
      <Field label={t('common.status')} style={{ marginTop: 0 }}>
        <Segmented
          value={f.status}
          onChange={set('status')}
          options={[{ value: 'OPEN', label: t('groupDetail.statusOpen') }, { value: 'LOCKED', label: t('groupDetail.statusLocked') }]}
        />
      </Field>
      <SelectField
        label={t('groupDetail.payerParty')}
        value={f.payer}
        onChange={set('payer')}
        options={[anyone, ...members.map((m) => ({ value: m.user_id, label: m.display_name }))]}
      />
      <SelectField
        label={t('common.category')}
        value={f.cat}
        onChange={set('cat')}
        options={[any, ...categorySelectData(categories, t)]}
      />
      <Row gap={10}>
        <Field label={t('groupDetail.minAmount')} style={{ flex: 1 }}>
          <Input value={f.min} onChangeText={(v) => set('min')(sanitizeMoneyInput(v))} keyboardType="decimal-pad" placeholder="0.00" />
        </Field>
        <Field label={t('groupDetail.maxAmount')} style={{ flex: 1 }}>
          <Input value={f.max} onChangeText={(v) => set('max')(sanitizeMoneyInput(v))} keyboardType="decimal-pad" placeholder="0.00" />
        </Field>
      </Row>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Field label={t('common.from')} error={fromErr} style={{ flex: 1 }}>
          <Input value={f.from} onChangeText={set('from')} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} />
        </Field>
        <Field label={t('common.to')} error={toErr} style={{ flex: 1 }}>
          <Input value={f.to} onChangeText={set('to')} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} />
        </Field>
      </Row>
      <Field label={t('common.sort')}>
        <Segmented
          value={f.sort}
          onChange={set('sort')}
          options={[{ value: 'newest', label: t('common.newest') }, { value: 'oldest', label: t('common.oldest') }]}
        />
      </Field>
      <View style={{ height: 8 }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  fbtn: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  stOpen: { backgroundColor: colors.openBg, color: colors.openText },
  stLocked: { backgroundColor: colors.lockedBg, color: colors.lockedText },
});
