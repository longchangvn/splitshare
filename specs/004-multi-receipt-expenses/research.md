# Research: Scan multiple receipts → create multiple expenses

Exploration done 2026-10-22 (read-only; nothing implemented). Line numbers are as of
that date — re-check before editing.

## 1. Current state of the codebase

### Backend (`api/`, .NET 10 minimal API, EF Core, Postgres/SQL Server)

- **OCR is a gated stub.** `api/Expenses/OcrService.cs`: `IOcrService { bool Enabled;
  Task<Dictionary<string,string>> ExtractAsync(byte[] image, string mime); }` and
  `DisabledOcrService` (always empty; `Enabled` = `Ocr:Enabled`). Registered as singleton
  in `api/Program.cs` (~L61).
- `POST /api/v1/expenses/ocr` (`api/Endpoints/TripPackEndpoints.cs` ~L224-235): auth
  required, not group-scoped, 501 `OCR_UNAVAILABLE` when disabled, returns
  `{ suggestion: Dictionary<string,string> }`. No client uses it.
- `GET /api/v1/capabilities` (public, same file ~L243) → `{ ocr_enabled }`.
- Trip-pack design (`openspec/changes/archive/2026-10-15-trip-pack/design.md` §9)
  intentionally left the provider out ("UI hides the button via /capabilities").
- **Expense create** `POST /api/v1/groups/{id}/expenses`
  (`api/Endpoints/ExpenseEndpoints.cs` L44-67): supports `Idempotency-Key` header
  (`IdempotencyService` replay/store). DTO `CreateExpenseDto` (L199-205): `title,
  description, amount (decimal), payer_id, split_type, participant_ids, exact/percent/
  shares, category, spent_at, tax, tip, fee, orig_currency, orig_amount, fx_rate,
  guests, only_present`.
- **Image upload** `POST /api/v1/expenses/{id}/images` (multipart, L142-160) →
  `ExpenseService.UploadImageAsync` (`api/Expenses/ExpenseService.cs` L571-608):
  max 5 images/expense, 10 MB, mimes jpg/png/webp/heic(+sequence), mime inferred from
  extension, `ImageSanitizer.Sanitize` strips JPEG APPn/COM + PNG ancillary chunks
  (GPS), stored via `IFileStore` (`LocalFileStore`, `Uploads:Path`).
- Validation helpers to reuse: `ExpenseService.ParseAmount` (>0, ≤1,000,000, 2 dp),
  `ParseSpentAt` (≤24 h future), `ResolveFx` (ISO-4217, all-or-nothing triple),
  `CategoryService.ValidateKeyAsync(groupId, key)` / `ListAsync`.
- Guards: `ExpenseService.GuardAsync` (group exists, member, write policy via
  `GroupStatusPolicy`).
- Rate limiter exists: `AddRateLimiter` in `Program.cs` L103-113 with policy `auth-ip`
  (5/min per IP), `app.UseRateLimiter()` L144. Endpoint groups: `v1` public,
  `api = v1.MapGroup("/").RequireAuthorization()` L175.
- HttpClient pattern to copy: OneSignal — `AddHttpClient(name, c => c.Timeout=10s)` +
  factory reading config (`Program.cs` ~L63-72).
- Tests (`tests/`, xUnit): services constructed directly with in-memory/sqlite DB and
  fakes (e.g. `new ExpenseService(db, ledger, new FakeStore(), new CategoryService(db))`
  in `ExpenseTests.cs` L41). No WebApplicationFactory → put logic in a service class.

### Web (`web/`, React 18 + Vite + Mantine 7, JS, npm)

- `web/src/components/Forms.jsx` `ExpenseForm`: hidden file input L460-467
  (`multiple`, image accept list, **no `capture`**, **no resize**), staging `staged` max 5,
  10 MB (`onPickFiles` L307-320), upload after create (`uploadStaged` L321-333) via
  `api.postForm('/api/v1/expenses/{id}/images')`. Create at L354 `api.post(...)`
  **without Idempotency-Key**. `build()` L182-215. Defaults: EQUAL, all members,
  category `'food'` fallback, categories from `GET /groups/{id}/categories`.
- `web/src/api.js`: `req()` L27-42, `api.postForm` L93 (FormData), Bearer from
  localStorage, 401 refresh+retry, `ApiError(status,{message,code,fields})`.
  `api.post` — check whether it accepts custom headers; add if needed for
  Idempotency-Key.
- `web/src/pages/GroupDetail.jsx`: New-expense CTAs L742, L779, FAB L1474
  (`setShowExp(true)`, `canWriteGroup`); `ExpenseForm` modal ~L1497.
- i18n `web/src/i18n/messages.js` flat `{en, vi}`; parity is tested.
- Tests: `web/test/*.test.mjs` with `node:test` (pure helpers + regex on sources), e.g.
  `web/test/quick-add-expense.test.mjs`; `npm test` only runs `googleReturn.test.mjs`.

### Mobile (`mobile/`, Expo 52 / RN 0.76, JS)

- `mobile/src/screens/AddExpenseScreen.js`: `pick` L144-162 uses
  `launchImageLibraryAsync({allowsMultipleSelection, selectionLimit})` — **no camera**;
  resize `ImageManipulator.manipulateAsync(uri,[{resize:{width:1600}}],{compress:0.8,
  format:JPEG})` L156. `save` L164-196: `POST /groups/{id}/expenses` with
  `Idempotency-Key` (`newIdempotencyKey`, uuid), then `api.postForm` images (errors
  swallowed). Defaults: payer first member, all participants, EQUAL. No category.
- `mobile/src/api/client.js`: `api.postForm` L150, Bearer from SecureStore, refresh
  single-flight, no timeouts.
- `mobile/src/offline/queue.js`: queues JSON drafts only (photos dropped).
- Navigation: `mobile/App.js` L123 `AddExpense`; reached from `GroupScreen.js` L245.
- `mobile/app.json`: camera + photo permissions already declared; `expo-image-picker`
  plugin present → `launchCameraAsync` usable without new deps.
- `npm --prefix mobile test` → `scripts/mapping-check.js`.

### Not existing anywhere

No batch/multi-receipt code, no real OCR provider, no client OCR calls, no camera
capture (mobile) or `capture` attribute (web), no client resize on web.

## 2. Provider options

| Option | Price / receipt | Notes |
|---|---|---|
| **OpenCode Console, free vision model** (chosen for now) | **$0** | OpenAI-compatible; limited-time free; see §3 |
| OpenCode Console paid small model (e.g. `gemini-3.5-flash-lite`, `gpt-5.4-nano`) | ~$0.001 (estimate) | Same code, config change only |
| Azure AI Document Intelligence `prebuilt-receipt` | $0.01 ($10/1k pages); F0 500 pages/mo free | Purpose-built, predictable; same cloud as deploy |
| AWS Textract AnalyzeExpense | $0.01 | Reportedly English-only receipts |
| Google Document AI Expense parser | $0.10 per document | Too expensive |
| OpenAI `gpt-5-mini` direct | ~$0.001-0.003 (estimate) | $0.25 in / $2 out per 1M tokens |

Prices checked 2026-10-22 from vendor pages / summaries; LLM per-receipt numbers are
token-based estimates (~1-1.5k image tokens + ~300-800 output tokens).

Monthly estimate (incl. ~20% rescans): 2,400 scans ≈ $0 (OpenCode free) / ~$5 (small
paid LLM) / ~$24 (Azure DI). Infra: Container Apps free grant covers the extra I/O-bound
requests; no new storage/DB resources.

## 3. OpenCode Console details (decision: use for now)

- Docs: https://opencode.ai/docs/zen/ · model list: `GET https://opencode.ai/inference/v1/models`
  (no modality metadata) · modalities from https://models.dev/api.json (`opencode` provider).
- Endpoint: `POST https://opencode.ai/inference/openai/v1/chat/completions`,
  `Authorization: Bearer <OpenCode Console API key>`, OpenAI chat format, image as
  `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}`.
- Free + live + image-capable models on 2026-10-22:

  | Model | Input | Privacy (OpenCode docs) | Use? |
  |---|---|---|---|
  | `glm-5.3-flash-free` | text, image, video, pdf | zero retention, no training | **primary** |
  | `deepseek-v4.1-flash-free` | text, image | zero retention, no training | fallback |
  | `nemotron-3.5-super-vl-free` | text, image | NVIDIA trial: "do not submit personal or confidential data" | **no** |
  | others (big-pickle, beam, flint, mimo, nemotron lightning/ultra) | text only or data used for training | — | no |

- Risks: free "for a limited time" (models can vanish — the docs list and live list
  already differ); gateway is aimed at coding agents (no SLA / published free-tier rate
  limits; check terms before production); accuracy of these small models on receipts
  (esp. Vietnamese, faded thermal) is **unmeasured**; data passes through OpenCode +
  model provider (US/EU).
- **Not yet verified**: that image input actually works through this endpoint for these
  models, and their accuracy → first task (spike) in `tasks.md`.

## 4. Expected accuracy (estimates, to be measured in the spike)

Purpose-built receipt OCR / strong LLMs on clear printed receipts: total ~90-95 %,
date ~85-90 %, merchant ~85-90 %, category guess ~70-80 %; degraded receipts
(faded/crumpled/handwritten) ~60-75 %. Small free models: unknown, likely lower.
With the review step the end result is ~100 % correct expenses (user fixes misses);
without review, ~1 in 10 would have a wrong amount → review step is required.
Acceptance gate for the spike: total correct ≥ 85 % on a 30-50 receipt sample.

## 5. Subagents used during exploration

- Mobile flow explorer (read-only) → mobile findings above.
- Web flow explorer (read-only) → web findings above.
Backend, provider and pricing research done directly.
