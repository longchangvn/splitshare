# Tasks: Consistent "add expense" everywhere + remembered split

Design + approved decisions: `plan.md` (same folder).

## How to resume (read first)

1. Read root `AGENTS.md`, `web/AGENTS.md`, then `plan.md`.
2. Find the first task that is `[~]` (resume it) or else the first `[ ]` task.
3. Read the "Notes / log" under the task — it says what is already done and what is next.
4. Mark `[~]` when starting, `[X]` only after its "Verify" ran and passed. Append a short
   dated log line under the task whenever you stop mid-task.
5. Do not overwrite Alex's unrelated uncommitted changes (`git status` before editing).

Status: `[ ]` not started · `[~]` in progress · `[X]` done · `[!]` blocked (say why).

Verify suite:
```sh
node --test web/test/*.test.mjs
npm --prefix web run build
npm --prefix mobile test        # sync-shared --check + mapping-check + node --test
```

---

## Phase 1 — shared pure logic (no UI change)

- [X] T1.1 `web/src/expenseDraft.js`: draft model, split ops, body builder, validator, scan merge, money helpers.
- [X] T1.2 `web/src/splitMemory.js`: key, snapshot, restore (form/scan context).
- [X] T1.3 `receiptBatch.js` uses `expenseDraft` (`newCard` carries draft fields; `cardFromSuggestion` → `applyScan`; `buildExpensePayload` → `draftToBody`; `validateCard` → `validateDraft`). Keep exports for compatibility.
- [X] T1.4 Add both files to `mobile/scripts/sync-shared.js`; `mobile/src/components/expense/formLogic.js` re-exports shared logic.
- [X] T1.5 Tests: `web/test/expense-draft.test.mjs`, `web/test/split-memory.test.mjs`; existing tests still pass.
  - Verify: `node --test web/test/*.test.mjs` and `npm --prefix mobile test`.
  - Log 2026-11-08: done. web 159/159, mobile 36/36 (sync check + mapping-check OK).
    `mobile/src/money.js` now re-exports money helpers from `shared/expenseDraft.js`.
    `scan-receipts-batch.test.mjs` updated: scan no longer fills tax/tip (approved bug fix).
    Draft field names (shared by form + card): `title, amount, payerId, category, spentAt,
    splitType, participantIds, values, stashed, tax, tip, fee, origCurrency, origAmount,
    fxRate, guests, onlyPresent`. Mobile `formLogic.buildBody/runningTotals` adapt the old
    names (`payer/type/sel/origCur/origAmt`) until T4.3 moves the mobile form to the draft.
    Interim state: UIs unchanged; batch scan already uses the shared body/validator.

## Phase 2 — web shared component + expense form

- [X] T2.1 `web/src/splitMemoryStore.js` (localStorage load/save/clear-all) + clear on logout (`auth.jsx logout`, not on session expiry).
- [X] T2.2 `web/src/components/ExpenseFields.jsx` (basics, bill details, split + preview, add-category modal) + `web/src/useSplitPreview.js`.
- [X] T2.3 `ExpenseForm` (Forms.jsx) rebuilt on draft + `ExpenseFields`; Idempotency-Key on create (`newIdempotencyKey` in api.js); shared validation (live after first submit); remembered split (`initialSplit`) + save after create; "Using your last split · Reset" hint; single scan uses `applyScan(keep)`.
- [X] T2.4 `GroupDetail.jsx` passes `initialSplit`; update source-regex tests.
  - Verify: web tests + build.
  - Log 2026-11-08: done. web 160/160, `vite build` OK. Tests updated to follow code
    (intent kept): decimal-input (fields now in ExpenseFields), expense-save-new (+ memory /
    idempotency test), receipt-scan (single scan now uses shared applyScan).
    i18n keys added early (T5.1 web part): `scan.err.split`, `forms.expense.lastSplit`,
    `forms.expense.lastSplitReset`, `forms.expense.amountFromFx` (en + vi).
    Not yet manually checked in a browser.

## Phase 3 — web Scan Receipts

- [X] T3.1 Cards render `<ExpenseFields>` (inner `ScanCard`); start from remembered split (`context:'scan'`) + `pickScanCategory`; per-card preview (`useSplitPreview`, off while scanning/creating/created); validate/create via shared logic (errors live after first create attempt, `card.tried`); save memory after each created card; add-category updates a local `cats` list shared by all cards.
  - Verify: web tests + build.
  - Log 2026-11-08: done. web 161/161, build OK. New test in `scan-receipts-batch.test.mjs`.
    Previews are not pooled; they naturally spread because scans run 3 at a time and each
    preview is debounced 350 ms. Not yet manually checked in a browser.

## Phase 4 — mobile

- [X] T4.1 `mobile/src/splitMemoryStore.js` (AsyncStorage + in-memory cache, `peekLastSplit`) + clear on logout (`AuthContext.logout`).
- [X] T4.2 `mobile/src/components/expense/ExpenseFields.js` (same props as web + `bare` for scan cards) + `mobile/src/useSplitPreview.js`.
- [X] T4.3 `ExpenseForm.js` on draft + `ExpenseFields`; memory (saved after create, incl. offline-queued); single scan `applyScan(keep)`; `AddExpenseScreen` loads memory in `load()` and passes `peekLastSplit` (fresh on Save & new remount).
- [X] T4.4 `ScanReceiptsScreen.js` cards use `ExpenseFields bare` (inner `ScanCard`); memory; per-card preview; no "None" category.
- [X] T4.5 `mapping-check.js` entry for `ExpenseFields`; `expense-form.test.mjs` scans `ExpenseFields.js` for `m.expense.*` keys.
  - Verify: `npm --prefix mobile test`.
  - Log 2026-11-08: done. mobile 36/36 (sync check + mapping-check OK). RN files can't run
    under node, so syntax + named imports were checked with
    `web/node_modules/.bin/esbuild <file> --bundle --platform=neutral --loader:.js=jsx`
    (RN/expo packages external): ExpenseFields, ExpenseForm, ScanReceiptsScreen,
    AddExpenseScreen, AuthContext — no errors. Not yet run on a device/simulator.

## Phase 5 — i18n, docs, final verification

- [X] T5.1 i18n keys (all locales): last-split hint + reset, `scan.err.split`; `npm --prefix mobile run sync:shared`.
- [X] T5.2 Update `specs/005-mobile-parity/parity-matrix.md` (new row G16). README has no per-feature notes for these flows, so it was left unchanged.
- [~] T5.3 Full verify suite + manual checklist (below); report.
  - Log 2026-11-08: automated checks all green —
    `node --test web/test/*.test.mjs` 161/161 · `npm --prefix web run build` OK ·
    `npm --prefix mobile test` 36/36 · `./scripts/e2e.sh --web` 17/17 (Playwright, real API + test DB) ·
    new E2E `web/e2e/expenses.spec.js` "remembered split…" passes (Save & new, reload, Reset, server shares).
  - Remaining (needs Alex / a device): manual checklist items 3–4 (scan needs OCR enabled;
    the E2E env has it off) and the whole checklist on the mobile app (iOS/Android).
    Mark `[X]` once done.

### Manual checklist (web + mobile)
1. Add expense 60/40 PERCENT for 3 of 5 members → Save & new keeps split; reload keeps it.
2. Quick Add → same group → same split.
3. Scan 2 receipts → cards start with that split; category scanned or `other`; tax/tip visible; live preview.
4. Single scan in form fills empty fields only (amount always).
5. Double-click Save on web → one expense.
6. Different group → its own memory; logout clears memory.
