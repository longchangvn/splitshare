# Plan: Consistent "add expense" everywhere + remembered split

**Status**: In progress — see `tasks.md` for live progress.
**Scope**: web + mobile. Frontend only — no API, DB or migration changes.

## Goal

Adding an expense must look and behave the same in every entry point:

| Entry point | Web | Mobile |
|---|---|---|
| Add expense (group page) | `GroupDetail.jsx` → `ExpenseForm` | `AddExpenseScreen` → `ExpenseForm` |
| Quick Add (existing or new group) | `QuickAddExpense` / `Dashboard` wizard → `GroupDetail` (`addExpense` state) → `ExpenseForm` | `QuickAddScreen` / `NewGroupScreen` → `AddExpense` |
| Copy expense | `ExpenseForm copyFrom` | `AddExpense copyFrom` |
| Scan Receipts (batch) | `ScanReceipts.jsx` | `ScanReceiptsScreen.js` |

Quick Add needs no own code: every Quick Add path ends in `ExpenseForm`.

And the app remembers the last split (method, participants, percent/shares values, payer,
category) per user + group on the device, so repeated adds need no re-selection.

## Decisions (approved by Alex, 2026-11-08)

| Item | Expense form (Add / Quick Add / Copy) | Scan card |
|---|---|---|
| UI + behaviour | one shared `ExpenseFields` component | same `ExpenseFields` per card |
| Split method / participants / values | 4 methods, start from remembered split | same; remembered EXACT starts as EQUAL |
| Payer default | remembered → me → first member | same |
| Category default | remembered → `food` → `other` | scanned (if group has it) → remembered → `other`; editable, no "None" |
| Bill details (tax, tip, fee, FX, guests, only-present) | shown (collapsed) | same section, collapsed, pre-filled from scan |
| Live split preview | yes | yes, per card (debounced) |
| Validation | one shared validator (title 1–100, date ≤ tomorrow, amounts, split totals) | same |
| Idempotency-Key | mobile has it; **web gets one key per form instance** | per card (existing) |
| Single "Scan receipt" button in form | fills same fields as batch scan (`applyScan`, only empty fields; amount always) | – |
| Memory saved | after each successful create (Save & new / Save & close / copy) | after each created card (last wins) |
| Memory storage | per user + group, on device (web `localStorage`, mobile `AsyncStorage`) | same |
| Memory used | create only (not edit; copy uses its source) | new cards |

Later decisions (2026-11-08, during T1.1):

| Item | Decision |
|---|---|
| FX amount | When a foreign currency is set, Amount is read-only = foreign amount × rate (as scan does; matches server, which overrides face amount with the FX triple). Preview/totals use the converted amount. |
| FX section | Inside Bill details; Bill details auto-opens when FX is filled (e.g. scanned foreign receipt) and shows the currency-mismatch note. |
| Date | Required + valid + ≤ tomorrow everywhere (form pre-fills today). |
| Single scan "only empty" | A field is overwritten only if the user has not changed it from the new-form default; amount always. |
| Scan tax/tip (bug fix) | Server total = amount + tax + tip + fee (+ guests). OCR `amount_spent` is the grand total, so batch scan was double-counting tax/tip. Scan now fills Amount = grand total and leaves tax/tip empty (same as single scan). |
| Edit/copy amount (bug fix) | Edit/copy prefilled Amount with `amount_cents` (total incl. tax/tip/fee/guests) *and* prefilled tax/tip/fee/guests, so saving re-added them. Prefill Amount with the face amount = `amount_cents − tax − tip − fee − Σguests` (server `ExpenseService` edit rule). |
| EXACT totals (bug fix) | Running total / validation compares the EXACT sum to amount + tax + tip + fee (server `baseCents`), not amount alone. |

Accepted differences (by design): form attaches ≤5 receipts vs scan card = its photo;
offline queue mobile form only; web single-scan button only on mobile widths.

## Architecture

```
web/src/expenseDraft.js  + web/src/splitMemory.js   (pure, copied to mobile/src/shared via sync-shared)
        │
ExpenseFields (web: Mantine  ·  mobile: RN ui.js)
  ├─ basics       title, amount, category + add-category, date, payer
  ├─ bill details tax, tip, fee, FX, guests, only-present (collapsed)
  └─ split        method chips, participants, values, totals, equal note, live preview
        │
  ├─ ExpenseForm = receipts strip + single scan + ExpenseFields + footer (+ un-settle confirm)
  └─ Scan card   = status header + ExpenseFields(compact) + card errors
```

`ExpenseFields` is controlled: `{ draft, onChange(patch), members, categories, currency,
preview, compact, ... }`. Form keeps one draft; scan keeps one draft per card.

### Draft shape (plain JSON)

```js
{
  title, amount, payer, category, spentAt,          // strings ('' = empty)
  type, sel, values, stashed,                       // split
  tax, tip, fee, origCur, origAmt, fxRate,          // bill details (strings)
  guests: [{ label, amount, covered_by }], onlyPresent,
}
```

### Shared modules

- `expenseDraft.js`: `newDraft`, `draftFromSource`, `applyScan`, `changeType`,
  `toggleParticipant`, `draftToBody`, `validateDraft`, `runningTotals`, `equalNote`,
  money helpers (`sanitizeMoneyInput`, `isValidMoneyAmount`, `moneyAmountError`), `isValidDay`.
- `splitMemory.js`: `splitMemoryKey(userId, groupId)`, `SPLIT_MEMORY_PREFIX`,
  `snapshotSplit(draft)`, `restoreSplit(saved, { members, meId, context })`.
- `receiptBatch.js` keeps batch-only parts (`newCard`, `cardsFromSuggestion`,
  `findDuplicates`, `runPool`, `MAX_BATCH`…); card = card meta + draft fields.
- Mobile `formLogic.js` re-exports from shared so existing imports/tests keep working.

### Storage keys

`ss-last-split:v1:<userId>:<groupId>` → JSON from `snapshotSplit`. Cleared on logout.

## API usage (existing, unchanged)

- `POST /api/v1/groups/{id}/expenses` (+ `Idempotency-Key`)
- `POST /api/v1/groups/{id}/expenses/preview-split`, `POST /api/v1/expenses/{id}/preview-edit`
- `PATCH /api/v1/expenses/{id}` (`expected_version`)
- `POST /api/v1/groups/{id}/expenses/scan`, `POST /api/v1/expenses/{id}/images`
- `GET/POST /api/v1/groups/{id}/categories`

Server stays authoritative for validation (422) and authorization.

## Risks

- Large refactor of `Forms.jsx`, `ExpenseForm.js`, both scan screens. Shared-logic tests land first.
- Source-regex tests (`expense-save-new`, `scan-receipts-batch`, `receipt-scan`) must follow code into `ExpenseFields`.
- Scan cards get longer; bill details collapsed.
- Per-card preview = more API calls (debounced; initial previews pooled at 3).
- `web/src/i18n/messages.js` + `mobile/src/shared/messages.js` have Alex's uncommitted edits — only add keys.
