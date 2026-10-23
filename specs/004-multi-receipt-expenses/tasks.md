# Tasks: Scan multiple receipts → create multiple expenses

**Status**: Planned — not started. Exploration done 2026-10-22.
Provider decision: **OpenCode Console OpenAI-compatible endpoint, free vision model
`glm-5.3-flash-free`** (fallback `deepseek-v4.1-flash-free`), swappable by config.

## How to resume

1. Read `AGENTS.md`, `web/AGENTS.md`, `new-feature-guide.md`, then `spec.md`,
   `research.md`, `plan.md` in this folder.
2. Confirm the **Open decisions** at the bottom of `spec.md` with the user.
3. Get an OpenCode Console API key from the user (store with
   `dotnet user-secrets set "Ocr:ApiKey" "<key>" --project api`; never commit it).
4. Re-check line numbers cited in `research.md` (`git log` since 2026-10-22).
5. Start at the first unchecked task. `[P]` = can run in parallel with other `[P]` tasks
   of the same phase (different files).

## Phase 0 — Spike (gate)

- [ ] T001 Spike script (temporary, not committed or under `scripts/`): send 30-50 real
  receipt photos (resized 1600px JPEG) to
  `POST https://opencode.ai/inference/openai/v1/chat/completions` with the prompt from
  `plan.md`, for `glm-5.3-flash-free` and `deepseek-v4.1-flash-free`. Record per field:
  correct / wrong / null, latency, failures. Include Vietnamese + faded receipts.
- [ ] T002 Decision gate: total correct ≥ 85 % and image input works → continue.
  Otherwise try a paid model on the same gateway (e.g. `gemini-3.5-flash-lite`) or
  Azure DI; record result + chosen model in `research.md` §4.

## Phase 1 — Backend (depends on T002)

- [ ] T003 `api/Expenses/OcrService.cs`: add `ReceiptSuggestion` record (merchant, total,
  currency, date, tax, tip, category, confidence, warnings); change
  `IOcrService.ExtractAsync(byte[] image, string mime, OcrContext ctx)` → `ReceiptSuggestion`
  (`OcrContext` = group currency + allowed category keys); update `DisabledOcrService`;
  add `bool Configured`.
- [ ] T004 [P] `api/Expenses/ReceiptParser.cs` (pure static): extract JSON from model
  text, normalize/validate using `ExpenseService.ParseAmount` / `ParseExtra` /
  `ParseSpentAt` rules, ISO-4217 regex, category whitelist, warnings.
- [ ] T005 `api/Expenses/OpenAiCompatibleOcrService.cs`: named HttpClient `"ocr"`,
  config `Ocr:BaseUrl|Model|ApiKey|TimeoutSeconds`, build chat request with base64 data
  URL, map non-2xx/timeout/parse failure → `OcrProviderException`. No body/key logging.
  (depends T003, T004)
- [ ] T006 `api/Expenses/ReceiptScanService.cs`: member guard, group currency, category
  keys via `CategoryService.EnsureAsync/ListAsync`, mime normalization + size (reuse
  `ExpenseService.AllowedMimes`, `MaxImageBytes`, same extension inference as
  `UploadImageAsync`), `ImageSanitizer.Sanitize`, call provider, structured log
  (no content). Returns op result with codes from `plan.md`. (depends T003)
- [ ] T007 `api/Program.cs`: register `"ocr"` HttpClient; `IOcrService` factory by
  `Ocr:Provider` (`openai-compatible` → new service, else Disabled); `AddScoped
  <ReceiptScanService>`; rate-limit policy `ocr-user` (fixed window, partition by user id
  claim, `Ocr:RateLimit:*`, default 20 / 10 min).
- [ ] T008 `api/Endpoints/ExpenseEndpoints.cs`: `POST /groups/{id:guid}/expenses/scan`
  (multipart field `file`, check `Length` before reading, `.DisableAntiforgery()`,
  `.RequireRateLimiting("ocr-user")`); response/errors per `plan.md` (501, 403/404, 422,
  503 `OCR_PROVIDER_ERROR`).
- [ ] T009 `api/Endpoints/TripPackEndpoints.cs`: keep `/expenses/ocr` working with the new
  return type (map to `{suggestion:{...}}` dictionary); `/capabilities` →
  `ocr_enabled = Enabled && Configured`.
- [ ] T010 [P] Config: `api/appsettings.json` non-secret `Ocr` defaults (Enabled=false);
  `docker-compose.yml` `Ocr__Enabled/Provider/BaseUrl/Model/ApiKey` from env;
  `.env.example` commented `OCR_*` entries (**file has uncommitted user edits — append
  only**); `.github/workflows/cd-api.yml` add `GH_OCR__*` env (vars + `secrets.OCR__APIKEY`)
  and mapping entries next to `Notification__*` (~L79-81, ~L364-366) — or the env-mapping
  file if `openspec/changes/load-env-mapping-from-file` has landed.
- [ ] T011 `tests/OcrTests.cs`: parser, provider (fake `HttpMessageHandler`), scan service
  cases listed in `plan.md` Testing. Run `dotnet build SplitShare.sln` + `dotnet test tests`.

## Phase 2 — Web (contract from `plan.md`; can start in parallel with Phase 1 using a mocked response)

- [ ] T012 [P] `web/src/api.js`: `post: (p, b, extra) => reqAuth('POST', p, b ?? {}, extra)`
  so callers can pass `{ headers: { 'Idempotency-Key': key } }` (backward compatible).
- [ ] T013 [P] `web/src/imageResize.js`: canvas resize ≤1600px JPEG q0.8 → `File`;
  return original on decode failure.
- [ ] T014 [P] `web/src/receiptBatch.js` (pure): `newCard(file)` (id + idempotency key via
  `crypto.randomUUID()`), `cardFromSuggestion(card, resp, group)`, `validateCard`,
  `findDuplicates(cards, groupExpenses)`, `buildExpensePayload(card, members)` (EQUAL,
  category, spent_at, tax/tip, orig_currency/orig_amount/fx_rate when mismatch),
  `runPool(items, 3, fn)`, `MAX_BATCH = 10`.
- [ ] T015 [P] `web/src/i18n/messages.js`: `scan.*` keys (title, add photos, take photo,
  scanning, scan failed/manual, low confidence, currency mismatch, duplicate hint,
  create N, created/failed, retry failed, rate limited, third-party notice) in en + vi.
- [ ] T016 `web/src/components/ScanReceipts.jsx`: Mantine modal; file input `multiple`
  `accept="image/*"` `capture="environment"`; resize → scan pool → review cards (title,
  amount, date, category, payer, participants; highlight low confidence; remove card) →
  sequential create with Idempotency-Key + image upload via `api.postForm` → per-card
  result + retry failed; loading/empty/error states; busy guard. (depends T012-T015)
- [ ] T017 `web/src/pages/GroupDetail.jsx`: fetch `/api/v1/capabilities` once; "Scan
  receipts" button near New expense (L742 / L779), disabled when `!canWriteGroup`;
  render `ScanReceipts`; reload group data after create. (depends T016)
- [ ] T018 `web/test/receipt-batch.test.mjs`: helpers + i18n parity + source wiring.
  Run `node --test web/test/*.mjs`, `node web/googleReturn.test.mjs`,
  `npm --prefix web run build`.

## Phase 3 — Mobile (can run in parallel with Phase 2)

- [ ] T019 [P] `mobile/src/receiptBatch.js`: same pure helpers as T014 (ids via
  `newIdempotencyKey` / `react-native-uuid`); no FX (mismatch → require group-currency amount).
- [ ] T020 `mobile/src/screens/ScanReceiptsScreen.js`: "Take photo" (`launchCameraAsync`,
  permission request, repeat) + "Pick photos" (`launchImageLibraryAsync`
  `allowsMultipleSelection`, `selectionLimit`), resize like `AddExpenseScreen` L156,
  scan via `api.postForm`, review list, sequential create with `Idempotency-Key`, image
  upload, per-item result + retry. Use `theme.js` / `ui.js`. (depends T019)
- [ ] T021 `mobile/App.js` route `ScanReceipts`; `mobile/src/screens/GroupScreen.js`
  button near L245, hidden when capabilities `ocr_enabled=false`. (depends T020)
- [ ] T022 Run `npm --prefix mobile test`; manual check on simulator/device (camera,
  gallery, scan, create, retry).

## Phase 4 — Verify, converge, document

- [ ] T023 Integration smoke (local API + real OpenCode key, `Ocr__Enabled=true`):
  5+ receipts → N expenses with images in web and mobile; non-member 403; disabled 501;
  rate limit 429; provider down → manual cards; retry creates no duplicates.
- [ ] T024 Converge: compare implementation with `spec.md` FRs; add/fix missing tasks.
- [ ] T025 Docs: README feature + `Ocr__*` config section (user-secrets, compose, CD
  secret `OCR__APIKEY`), update `research.md` with spike results; update this file.
- [ ] T026 Final diff review (`git status`, `git diff`): no secrets, no spike script, no
  unrelated changes (`.env.example`, `.env.remote` already had user edits on 2026-10-22).
