# Feature Spec: Scan multiple receipts → create multiple expenses

**Status**: v1 implemented (single "Scan receipt" in web Add expense, mobile site only — see
`tasks.md` "v1 implemented"); multi-receipt batch flow below still planned.
**Scope**: API (`api/`), web (`web/`), mobile (`mobile/`)
**Related**: `research.md` (exploration, providers, cost, accuracy), `plan.md`, `tasks.md`

## User goal

In a group, take photos of (or pick) several receipts at once and get one expense per
receipt with amount / title / date / category pre-filled, instead of typing each one.

## User stories

- **US1** As a group member I open "Scan receipts", take several photos with the camera
  (or pick several from the gallery / file system) in one session.
- **US2** Each photo is scanned automatically; I see one editable card per receipt with
  amount, title (merchant), date and category pre-filled, and fields the scanner was
  unsure about highlighted.
- **US3** I fix anything wrong, choose payer / participants (defaults: me / all members,
  EQUAL split), remove receipts I don't want, then press **Create N expenses**.
- **US4** Each expense is created with its receipt photo attached. If some fail, the
  others are kept and I can retry only the failed ones without creating duplicates.
- **US5** If scanning is disabled or a scan fails, I can still enter that card manually.

## Functional requirements

- FR-1 Entry point "Scan receipts" in a group: web `GroupDetail` (next to New expense),
  mobile `GroupScreen` (next to Add expense). Hidden when `GET /api/v1/capabilities`
  returns `ocr_enabled=false`; disabled when the group is not writable.
- FR-2 Capture: mobile camera (repeatable) + gallery multi-select; web `<input type=file
  multiple accept=image/* capture=environment>`. Max **10 receipts per batch**,
  10 MB each, jpg/png/webp/heic (existing `AllowedMimes`).
- FR-3 Client resizes to max 1600 px JPEG (q≈0.8) before upload (mobile already does
  this in `AddExpenseScreen`; web adds a canvas helper).
- FR-4 Scan endpoint `POST /api/v1/groups/{id}/expenses/scan` (multipart, 1 file)
  returns a normalized suggestion (see plan "API contract"). Group membership required.
  Images are EXIF/GPS-stripped (`ImageSanitizer`) before being sent to the provider.
- FR-5 Client scans with max 3 concurrent requests; each card shows scanning / ready /
  failed (manual) state.
- FR-6 Review card fields: title (required, default merchant or "Receipt N"), amount
  (required), date (`spent_at`), category (group category keys), payer, participants,
  split EQUAL. Low-confidence or missing fields are highlighted; a card cannot be
  submitted without title + valid amount.
- FR-7 Currency: if the detected currency differs from the group currency, the card
  shows a warning; web pre-fills `orig_currency` / `orig_amount` and requires `fx_rate`
  (existing manual-FX contract); mobile requires the user to enter the amount in group
  currency (mobile has no FX UI).
- FR-8 Duplicate hint: warn (non-blocking) when a card matches an existing group expense
  or another card in the batch with same amount and same date (and similar title).
- FR-9 **Create N expenses**: cards are created sequentially via the existing
  `POST /api/v1/groups/{id}/expenses` with a per-card `Idempotency-Key` (generated once
  per card, reused on retry), then the photo is attached via
  `POST /api/v1/expenses/{eid}/images`. Result per card: created / failed (+ retry).
  Image upload failure does not fail the expense (existing behaviour).
- FR-10 Per-user scan rate limit (default 20 per 10 min, configurable); 429 is shown as
  "Too many scans, try later" and the card falls back to manual entry.
- FR-11 Kill switch: `Ocr:Enabled=false` disables scanning instantly (endpoint → 501
  `OCR_UNAVAILABLE`, UI hides entry point).

## Non-functional

- Provider is pluggable behind the existing `IOcrService`; initial provider is the
  OpenCode Console OpenAI-compatible endpoint with a free vision model
  (`glm-5.3-flash-free`), switchable by configuration only (base URL / model / key).
- API key only from env / user-secrets / GitHub secret — never in `appsettings*.json`,
  never in client bundles, never logged. Receipt contents are not logged.
- Scan request timeout 30 s; provider errors never become 500s.
- Reuse existing components, API clients, i18n (web en + vi), Mantine (web), theme/ui
  (mobile). No DB schema change.

## Edge cases & assumptions

- One receipt per photo (multi-receipt-in-one-photo is out of scope).
- Unreadable / non-receipt photo → card with empty fields, manual entry.
- Totals outside `0 < x ≤ 1,000,000.00` or > 2 decimals are rounded/rejected by
  server-side normalization and returned as `null` + warning.
- Date in the future (>24 h) is dropped (server rule in `ParseSpentAt`).
- HEIC on web browsers that cannot decode it: original file is sent; if the provider
  rejects it, the card falls back to manual entry.
- Group closed/settling mid-batch → create returns the existing write-policy error per
  card; remaining cards stay in the list.
- Offline: scanning requires network (mobile offline queue does not persist photos);
  out of scope for v1.
- Free OpenCode models are "free for a limited time" — the model may disappear; a
  provider error is handled as scan failure and the model is swapped by config.

## Out of scope

- Multiple receipts in a single photo, line-item splitting (assign items to people).
- Automatic FX rates. Offline scanning. Editing/rescanning existing expenses.
- An atomic server-side batch-create endpoint (possible later, see plan).

## Open decisions (confirm before implementing — defaults assumed above)

1. Platforms: both web and mobile (assumed) vs one first.
2. Review step before create (assumed) vs fully automatic creation.
3. Free OpenCode model in production vs only for dev/accuracy testing (then switch to a
   paid model on the same gateway, ~$0.001/receipt).
4. Privacy wording shown to users: receipts are processed by a third-party AI provider.
