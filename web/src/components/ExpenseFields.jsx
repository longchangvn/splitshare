import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Group, Modal, Select, Stack, Text, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, fmt } from '../api.js';
import { Err } from '../auth.jsx';
import { categoryLabelForKey, categorySelectData } from '../categories.js';
import { displayNameOf } from './Net.jsx';
import { useT } from '../prefs.jsx';
import { normalizeDecimalInput as dec } from '../decimalInput.js';
import {
  TITLE_MAX, changeType, effectiveAmount, equalNote, hasBillDetails, isFxLocked, moneyAmountError,
  runningTotals, sanitizeMoneyInput, setSplitValue, toggleParticipant,
} from '../expenseDraft.js';

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

/**
 * Shared expense fields (specs/007): basics, bill details and split with live preview.
 * Used by ExpenseForm (Add expense, Quick Add, Copy, Edit) and every Scan Receipts card, so
 * all entry points look and behave the same. Controlled: the parent owns `draft`.
 */
export function ExpenseFields({
  draft, onChange, groupId, members, categories = [], onCategoryCreated, currency = '',
  preview = null, errors = [], disabled = false, splitHint = null, receiptCurrency = '',
}) {
  const t = useT();
  const err = (code) => (errors.includes(code) ? t(ERR_KEY[code]) : null);
  const fx = isFxLocked(draft);
  const type = draft.splitType;
  const sel = draft.participantIds;
  const memberData = members.map((m) => ({ value: m.user_id, label: m.display_name }));

  const [billOpen, setBillOpen] = useState(() => hasBillDetails(draft));
  useEffect(() => { if (fx) setBillOpen(true); }, [fx]);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catModalErr, setCatModalErr] = useState(null);
  const openAddCategory = () => { setNewCatName(''); setCatModalErr(null); setCatModalOpen(true); };
  const addCategoryFromModal = async () => {
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
      notifications.show({ message: t('groupDetail.categoryAdded'), color: 'teal' });
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
  const boxLabel = type === 'EXACT'
    ? t('forms.expense.exactBox')
    : type === 'PERCENT' ? t('forms.expense.percentBox') : t('forms.expense.sharesBox');
  const totals = runningTotals(draft, t);
  const note = equalNote(type, preview, { fmtCents: (c) => fmt(c, currency), nameOf: (id) => displayNameOf(members, id) }, t);
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

  return (
    <>
      <TextInput
        label={t('forms.expense.title')}
        required
        maxLength={TITLE_MAX}
        placeholder={t('forms.expense.titlePh')}
        value={draft.title}
        disabled={disabled}
        error={err('title')}
        onChange={(x) => onChange({ title: x.target.value })}
      />
      <TextInput
        label={t('forms.expense.amount')}
        required
        inputMode="decimal"
        placeholder="0.00"
        value={shownAmount}
        disabled={disabled || fx}
        description={fx ? t('forms.expense.amountFromFx') : undefined}
        error={amountMsg || err('amount')}
        onChange={(x) => onChange({ amount: sanitizeMoneyInput(x.target.value) })}
      />
      <div className="wizard-field">
        <span className="wizard-label">{t('forms.expense.category')}</span>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Select
            style={{ flex: 1 }}
            value={draft.category || null}
            onChange={(v) => { if (v) onChange({ category: v }); }}
            data={catData}
            searchable
            disabled={disabled}
            comboboxProps={{ withinPortal: true }}
            aria-label={t('forms.expense.category')}
          />
          <Button
            type="button"
            variant="light"
            color="teal"
            className="wizard-cat-add"
            disabled={disabled}
            onClick={openAddCategory}
          >
            {t('forms.expense.addCategoryBtn')}
          </Button>
        </Group>
      </div>
      <TextInput
        label={t('forms.expense.spentOn')}
        type="date"
        value={draft.spentAt}
        disabled={disabled}
        error={err('date')}
        onChange={(x) => onChange({ spentAt: x.target.value })}
      />
      <Select
        label={t('forms.expense.payer')}
        value={draft.payerId || null}
        onChange={(v) => onChange({ payerId: v || '' })}
        data={memberData}
        disabled={disabled}
        error={err('payer')}
        comboboxProps={{ withinPortal: true }}
      />

      <details className="wizard-optional" open={billOpen} onToggle={(ev) => setBillOpen(ev.currentTarget.open)}>
        <summary>{t('forms.expense.billDetails')}</summary>
        <div className="wizard-optional-body">
          <Group gap="xs" grow>
            <TextInput label={t('forms.expense.taxOpt')} inputMode="decimal" placeholder="0.00" disabled={disabled} value={draft.tax} onChange={(x) => onChange({ tax: dec(x.target.value) })} />
            <TextInput label={t('forms.expense.tipOpt')} inputMode="decimal" placeholder="0.00" disabled={disabled} value={draft.tip} onChange={(x) => onChange({ tip: dec(x.target.value) })} />
            <TextInput label={t('forms.expense.feeOpt')} inputMode="decimal" placeholder="0.00" disabled={disabled} value={draft.fee} onChange={(x) => onChange({ fee: dec(x.target.value) })} />
          </Group>
          <div className="wizard-field">
            <span className="wizard-label">{t('forms.expense.foreign')}</span>
            <Group gap="xs" grow>
              <TextInput placeholder="JPY" maxLength={3} disabled={disabled} value={draft.origCurrency} onChange={(x) => onChange({ origCurrency: x.target.value.toUpperCase() })} />
              <TextInput placeholder={t('forms.expense.fxAmount')} inputMode="decimal" disabled={disabled} value={draft.origAmount} onChange={(x) => onChange({ origAmount: dec(x.target.value) })} />
              <TextInput placeholder={t('forms.expense.fxRate')} inputMode="decimal" disabled={disabled} value={draft.fxRate} error={err('rate')} onChange={(x) => onChange({ fxRate: dec(x.target.value) })} />
            </Group>
            {fxApprox && <Text size="xs" c="dimmed" mt={6}>{fxApprox}</Text>}
            {receiptCurrency && fx && (
              <Text size="xs" c="orange" mt={4}>{t('scan.currencyMismatch', { currency: receiptCurrency })}</Text>
            )}
          </div>
          <div className="wizard-field">
            <Group justify="space-between" mb={6}>
              <span className="wizard-label" style={{ marginBottom: 0 }}>{t('forms.expense.guestShares')}</span>
              <button
                type="button"
                className="wizard-chip"
                disabled={disabled}
                onClick={() => setGuests([...guests, { label: '', amount: '', covered_by: sel[0] || draft.payerId }])}
              >
                {t('forms.expense.addGuest')}
              </button>
            </Group>
            {guests.map((g, i) => (
              <Group key={i} gap="xs" mb={6} wrap="nowrap">
                <TextInput
                  placeholder={t('forms.expense.guestLabel')}
                  value={g.label}
                  style={{ flex: 2 }}
                  disabled={disabled}
                  onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, label: x.target.value } : gg)))}
                />
                <TextInput
                  placeholder="$"
                  inputMode="decimal"
                  value={g.amount}
                  style={{ flex: 1 }}
                  disabled={disabled}
                  onChange={(x) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, amount: dec(x.target.value) } : gg)))}
                />
                <Select
                  value={g.covered_by}
                  style={{ flex: 2 }}
                  disabled={disabled}
                  onChange={(v) => setGuests(guests.map((gg, j) => (j === i ? { ...gg, covered_by: v } : gg)))}
                  data={memberData}
                  comboboxProps={{ withinPortal: true }}
                />
                <Button size="xs" variant="subtle" color="red" disabled={disabled} onClick={() => setGuests(guests.filter((_, j) => j !== i))}>X</Button>
              </Group>
            ))}
            {guests.length === 0 && (
              <Text size="xs" c="dimmed">{t('forms.expense.guestHint')}</Text>
            )}
          </div>
          <Checkbox
            checked={!!draft.onlyPresent}
            disabled={disabled}
            onChange={(x) => onChange({ onlyPresent: x.currentTarget.checked })}
            label={t('forms.expense.onlyPresent')}
          />
        </div>
      </details>

      <div className="wizard-field">
        <span className="wizard-label">{t('forms.expense.method')}</span>
        {splitHint}
        <div className="wizard-chips" role="radiogroup" aria-label={t('forms.expense.method')}>
          {splitTypes.map((st) => (
            <button
              key={st.value}
              type="button"
              role="radio"
              className={type === st.value ? 'wizard-chip is-on' : 'wizard-chip'}
              aria-checked={type === st.value}
              disabled={disabled}
              onClick={() => onChange(changeType(draft, st.value))}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>
      {note && <Text size="xs" c="dimmed">{note}</Text>}
      <div className="wizard-field">
        <span className="wizard-label">{t('forms.expense.participants')}</span>
        <Stack gap={8}>
          {members.map((m) => (
            <div key={m.user_id} className="wizard-person">
              <Checkbox
                checked={sel.includes(m.user_id)}
                disabled={disabled}
                onChange={() => onChange(toggleParticipant(draft, m.user_id))}
                label={m.display_name}
              />
              {type !== 'EQUAL' && sel.includes(m.user_id) && (
                <TextInput
                  className="split-value"
                  aria-label={`${boxLabel} for ${m.display_name}`}
                  placeholder={type === 'SHARES' ? '1' : boxLabel}
                  inputMode={type === 'SHARES' ? 'numeric' : 'decimal'}
                  min={type === 'SHARES' ? 1 : undefined}
                  value={draft.values[m.user_id] ?? (type === 'SHARES' ? '1' : '')}
                  disabled={disabled}
                  onChange={(x) => onChange(setSplitValue(draft, m.user_id, x.target.value))}
                  style={{ width: 110 }}
                />
              )}
            </div>
          ))}
        </Stack>
        {err('participants') && <Text size="xs" c="red" mt={4}>{err('participants')}</Text>}
      </div>
      {type !== 'EQUAL' && totals && (
        <Text size="sm" c={totals.ok ? 'teal' : 'orange'}>{totals.text}</Text>
      )}
      {err('split') && <Text size="xs" c="red">{err('split')}</Text>}
      {preview && (
        <div className="wizard-person wizard-pay-hint">
          <Text size="sm" fw={600}>{t('forms.expense.livePreview')}</Text>
          <Text size="sm">
            {Object.entries(preview.shares || {}).map(([id, v]) => (
              `${displayNameOf(members, id)} ${fmt(v, currency)}`
            )).join(' · ')}
          </Text>
          {preview.unsettled_user_ids?.length > 0 && (
            <Text size="sm" fw={600} c="orange">
              {t('forms.expense.unsettle', { count: preview.unsettled_user_ids.length })}
            </Text>
          )}
        </div>
      )}

      <Modal
        opened={catModalOpen}
        onClose={() => { if (!addingCat) setCatModalOpen(false); }}
        title={t('forms.expense.addCategory')}
        centered
        size="sm"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
        zIndex={400}
      >
        <Stack gap="sm">
          <TextInput
            label={t('groupDetail.categoryName')}
            placeholder={t('forms.expense.addCategoryPh')}
            value={newCatName}
            data-autofocus
            autoFocus
            onChange={(x) => setNewCatName(x.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                addCategoryFromModal();
              }
            }}
          />
          <Err e={catModalErr} />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" disabled={addingCat} onClick={() => setCatModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button color="teal" loading={addingCat} disabled={!newCatName.trim()} onClick={addCategoryFromModal}>
              {t('forms.expense.addCategoryBtn')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
