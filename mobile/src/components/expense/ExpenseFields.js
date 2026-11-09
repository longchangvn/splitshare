// Shared expense fields — native twin of web/src/components/ExpenseFields.jsx (specs/007).
// Used by ExpenseForm (Add expense, Quick Add, Copy, Edit) and every Scan Receipts card, so all
// entry points look and behave the same. Controlled: the parent owns `draft`.
// `bare` renders the sections without their own Card (a scan card is already a Card).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api, fmt, displayNameOf } from '../../api/client';
import { colors, type } from '../../theme';
import {
  Card, Row, Button, ChipRow, Chip, CheckRow, Input, Field, SelectField, Sheet, toast, Badge, ErrText,
} from '../../ui';
import { useT } from '../../i18n';
import { categorySelectData, categoryLabelForKey } from '../../shared/categories';
import {
  TITLE_MAX, changeType, effectiveAmount, equalNote, hasBillDetails, isFxLocked, moneyAmountError,
  runningTotals, sanitizeMoneyInput, setSplitValue, toggleParticipant, todayIso,
} from '../../shared/expenseDraft';
import { decimal } from './formLogic';

// validateDraft code → message (same wording in the form and on scan cards).
const ERR_KEY = {
  title: 'scan.err.title',
  amount: 'scan.err.amount',
  rate: 'scan.err.rate',
  date: 'scan.err.date',
  payer: 'scan.err.payer',
  participants: 'scan.err.participants',
  split: 'scan.err.split',
};

export default function ExpenseFields({
  draft, onChange, groupId, members, categories = [], onCategoryCreated, currency = '',
  preview = null, errors = [], disabled = false, splitHint = null, receiptCurrency = '', bare = false,
}) {
  const t = useT();
  const Section = bare ? View : Card;
  const err = (code) => (errors.includes(code) ? t(ERR_KEY[code]) : null);
  const nameOf = (id) => displayNameOf(members, id);
  const money = (c) => fmt(c, currency);
  const fx = isFxLocked(draft);
  const type_ = draft.splitType;
  const sel = draft.participantIds;
  const memberOptions = members.map((m) => ({ value: m.user_id, label: m.display_name }));

  const [detailsOpen, setDetailsOpen] = useState(() => hasBillDetails(draft));
  useEffect(() => { if (fx) setDetailsOpen(true); }, [fx]);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catModalErr, setCatModalErr] = useState(null);
  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name || addingCat) return;
    setAddingCat(true);
    setCatModalErr(null);
    try {
      const created = await api.post(`/api/v1/groups/${groupId}/categories`, { name });
      onCategoryCreated?.(created);
      onChange({ category: created.key });
      setNewCatName('');
      setCatModalOpen(false);
      toast({ message: t('groupDetail.categoryAdded'), color: 'teal' });
    } catch (e) {
      setCatModalErr(e);
    } finally {
      setAddingCat(false);
    }
  };

  const amountMsg = !fx && draft.amount ? moneyAmountError(draft.amount, t) : null;
  const shownAmount = fx ? (effectiveAmount(draft) ?? '') : draft.amount;
  const catData = categorySelectData(categories, t);
  if (draft.category && !catData.some((c) => c.value === draft.category)) {
    catData.push({ value: draft.category, label: categoryLabelForKey(draft.category, categories, t) });
  }
  const boxLabel = type_ === 'EXACT'
    ? t('forms.expense.exactBox')
    : type_ === 'PERCENT' ? t('forms.expense.percentBox') : t('forms.expense.sharesBox');
  const totals = runningTotals(draft, t);
  const note = equalNote(type_, preview, { fmtCents: money, nameOf }, t);
  const fxApprox = fx && draft.origAmount !== '' && draft.fxRate !== '' && effectiveAmount(draft) !== null
    ? t('forms.expense.fxApprox', { amount: effectiveAmount(draft) })
    : null;
  const splitTypes = [
    { value: 'EQUAL', label: t('forms.expense.equal') },
    { value: 'EXACT', label: t('forms.expense.exact') },
    { value: 'PERCENT', label: t('forms.expense.percent') },
    { value: 'SHARES', label: t('forms.expense.shares') },
  ];
  const guests = draft.guests || [];
  const setGuests = (next) => onChange({ guests: next });
  const yesterday = todayIso(new Date(Date.now() - 864e5));
  const off = disabled ? { pointerEvents: 'none', opacity: 0.5 } : null;

  return (
    <>
      <Section>
        <Field label={t('forms.expense.title')} error={err('title')} style={{ marginTop: 0 }}>
          <Input
            value={draft.title}
            editable={!disabled}
            error={!!err('title')}
            onChangeText={(v) => onChange({ title: v })}
            placeholder={t('forms.expense.titlePh')}
            maxLength={TITLE_MAX}
            accessibilityLabel={t('forms.expense.title')}
          />
        </Field>
        <Field
          label={t('forms.expense.amount')}
          error={amountMsg || err('amount')}
          hint={fx ? t('forms.expense.amountFromFx') : null}
        >
          <Input
            value={shownAmount}
            editable={!disabled && !fx}
            error={!!(amountMsg || err('amount'))}
            onChangeText={(v) => onChange({ amount: sanitizeMoneyInput(v) })}
            placeholder="0.00"
            keyboardType="decimal-pad"
            accessibilityLabel={t('forms.expense.amount')}
          />
        </Field>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <SelectField
              label={t('forms.expense.category')}
              value={draft.category}
              options={catData}
              disabled={disabled}
              onChange={(v) => { if (v) onChange({ category: v }); }}
            />
          </View>
          <Button
            small
            variant="soft"
            style={{ minHeight: 46 }}
            disabled={disabled}
            title={t('forms.expense.addCategoryBtn')}
            accessibilityLabel={t('forms.expense.addCategory')}
            onPress={() => { setNewCatName(''); setCatModalErr(null); setCatModalOpen(true); }}
          />
        </Row>
        <Field label={t('forms.expense.spentOn')} error={err('date')} hint={t('m.expense.dateHint')}>
          <Input
            value={draft.spentAt}
            editable={!disabled}
            error={!!err('date')}
            onChangeText={(v) => onChange({ spentAt: v.replace(/[^\d-]/g, '').slice(0, 10) })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            accessibilityLabel={t('forms.expense.spentOn')}
          />
          <Row style={{ marginTop: 8 }}>
            <Chip label={t('m.expense.today')} disabled={disabled} on={draft.spentAt === todayIso()} onPress={() => onChange({ spentAt: todayIso() })} />
            <Chip label={t('m.expense.yesterday')} disabled={disabled} on={draft.spentAt === yesterday} onPress={() => onChange({ spentAt: yesterday })} />
          </Row>
        </Field>
        <SelectField
          label={t('forms.expense.payer')}
          value={draft.payerId}
          options={memberOptions}
          disabled={disabled}
          error={err('payer')}
          onChange={(v) => onChange({ payerId: v || '' })}
        />
      </Section>

      {/* Bill details (collapsible, like web <details>); opens itself when FX is filled. */}
      <Section style={bare ? { marginTop: 12 } : undefined}>
        <Pressable
          onPress={() => setDetailsOpen((o) => !o)}
          style={s.summary}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
        >
          <Text style={[type.h3, { flex: 1 }]}>{t('forms.expense.billDetails')}</Text>
          <Text style={{ color: colors.secondary }}>{detailsOpen ? '▴' : '▾'}</Text>
        </Pressable>
        {detailsOpen && (
          <View>
            <Row style={{ alignItems: 'flex-start' }}>
              <Field label={t('forms.expense.taxOpt')} style={{ flex: 1 }}>
                <Input value={draft.tax} editable={!disabled} onChangeText={(v) => onChange({ tax: decimal(v) })} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
              <Field label={t('forms.expense.tipOpt')} style={{ flex: 1 }}>
                <Input value={draft.tip} editable={!disabled} onChangeText={(v) => onChange({ tip: decimal(v) })} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
              <Field label={t('forms.expense.feeOpt')} style={{ flex: 1 }}>
                <Input value={draft.fee} editable={!disabled} onChangeText={(v) => onChange({ fee: decimal(v) })} placeholder="0.00" keyboardType="decimal-pad" />
              </Field>
            </Row>
            <Field
              label={t('forms.expense.foreign')}
              error={err('rate')}
              hint={receiptCurrency && fx ? t('scan.currencyMismatch', { currency: receiptCurrency }) : fxApprox}
            >
              <Row>
                <Input
                  style={{ flex: 1 }}
                  value={draft.origCurrency}
                  editable={!disabled}
                  onChangeText={(v) => onChange({ origCurrency: v.toUpperCase() })}
                  placeholder="JPY"
                  autoCapitalize="characters"
                  maxLength={3}
                  accessibilityLabel={t('forms.expense.foreign')}
                />
                <Input
                  style={{ flex: 1 }}
                  value={draft.origAmount}
                  editable={!disabled}
                  onChangeText={(v) => onChange({ origAmount: decimal(v) })}
                  placeholder={t('forms.expense.fxAmount')}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('forms.expense.fxAmount')}
                />
                <Input
                  style={{ flex: 1 }}
                  value={draft.fxRate}
                  editable={!disabled}
                  error={!!err('rate')}
                  onChangeText={(v) => onChange({ fxRate: decimal(v) })}
                  placeholder={t('forms.expense.fxRate')}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('forms.expense.fxRate')}
                />
              </Row>
            </Field>
            <View style={[{ marginTop: 12 }, off]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.label}>{t('forms.expense.guestShares')}</Text>
                <Chip
                  label={t('forms.expense.addGuest')}
                  onPress={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || draft.payerId }])}
                />
              </Row>
              {guests.map((g, i) => (
                <View key={i} style={s.guest}>
                  <Row>
                    <Input
                      style={{ flex: 2 }}
                      placeholder={t('forms.expense.guestLabel')}
                      value={g.label}
                      onChangeText={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: v } : gg)))}
                    />
                    <Input
                      style={{ flex: 1 }}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      value={g.amount}
                      onChangeText={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: decimal(v) } : gg)))}
                    />
                    <Pressable
                      onPress={() => setGuests(guests.filter((_, j) => j !== i))}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.remove')}
                    >
                      <Text style={s.remove}>✕</Text>
                    </Pressable>
                  </Row>
                  <SelectField
                    label={t('m.expense.coveredBy')}
                    value={g.covered_by}
                    options={memberOptions}
                    onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
                  />
                </View>
              ))}
              {guests.length === 0 && <Text style={[type.small, { marginTop: 6 }]}>{t('forms.expense.guestHint')}</Text>}
            </View>
            <CheckRow
              label={t('forms.expense.onlyPresent')}
              checked={!!draft.onlyPresent}
              disabled={disabled}
              onPress={() => onChange({ onlyPresent: !draft.onlyPresent })}
            />
          </View>
        )}
      </Section>

      <Section style={bare ? { marginTop: 12 } : undefined}>
        <Text style={s.label}>{t('forms.expense.method')}</Text>
        {splitHint}
        <View style={off}>
          <ChipRow options={splitTypes} value={type_} onChange={(v) => onChange(changeType(draft, v))} />
        </View>
        {note ? <Text style={[type.small, { marginTop: 8 }]}>{note}</Text> : null}
        <Text style={[s.label, { marginTop: 14 }]}>{t('forms.expense.participants')}</Text>
        {members.map((m) => {
          const on = sel.includes(m.user_id);
          return (
            <CheckRow
              key={m.user_id}
              label={m.display_name}
              checked={on}
              disabled={disabled}
              onPress={() => onChange(toggleParticipant(draft, m.user_id))}
              right={type_ !== 'EQUAL' && on ? (
                <Input
                  style={s.splitBox}
                  value={draft.values[m.user_id] ?? (type_ === 'SHARES' ? '1' : '')}
                  editable={!disabled}
                  onChangeText={(v) => onChange(setSplitValue(draft, m.user_id, v))}
                  placeholder={type_ === 'SHARES' ? '1' : boxLabel}
                  keyboardType={type_ === 'SHARES' ? 'number-pad' : 'decimal-pad'}
                  accessibilityLabel={`${boxLabel} · ${m.display_name}`}
                />
              ) : null}
            />
          );
        })}
        {err('participants') ? <Text style={s.err}>{err('participants')}</Text> : null}
        {type_ !== 'EQUAL' && totals && (
          <Text style={[type.h3, { marginTop: 6, color: totals.ok ? colors.primaryText : colors.warn }]}>{totals.text}</Text>
        )}
        {err('split') ? <Text style={s.err}>{err('split')}</Text> : null}
      </Section>

      {preview && (
        <Card tone="settled" style={bare ? { marginTop: 12 } : undefined}>
          <Text style={type.h3}>{t('forms.expense.livePreview')}</Text>
          <Text style={[type.body, { marginTop: 4 }]}>
            {Object.entries(preview.shares || {}).map(([id, v]) => `${nameOf(id)} ${money(v)}`).join(' · ')}
          </Text>
          {preview.unsettled_user_ids?.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Badge kind="nudge" label={t('forms.expense.unsettle', { count: preview.unsettled_user_ids.length })} />
            </View>
          )}
        </Card>
      )}

      <Sheet
        visible={catModalOpen}
        onClose={() => { if (!addingCat) setCatModalOpen(false); }}
        title={t('forms.expense.addCategory')}
        footer={(
          <Row>
            <Button style={{ flex: 1 }} variant="ghost" title={t('common.cancel')} disabled={addingCat} onPress={() => setCatModalOpen(false)} />
            <Button
              style={{ flex: 1 }}
              variant="brand"
              busy={addingCat}
              disabled={!newCatName.trim()}
              title={t('forms.expense.addCategoryBtn')}
              onPress={addCategory}
            />
          </Row>
        )}
      >
        <Field label={t('groupDetail.categoryName')} style={{ marginTop: 0 }}>
          <Input
            value={newCatName}
            onChangeText={setNewCatName}
            placeholder={t('forms.expense.addCategoryPh')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addCategory}
          />
        </Field>
        <ErrText e={catModalErr} />
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  guest: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  splitBox: { width: 104, minHeight: 40, paddingVertical: 8 },
  remove: { color: colors.danger, fontWeight: '700', fontSize: 13 },
  err: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
