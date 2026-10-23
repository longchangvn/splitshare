# Plan: Scan multiple receipts → create multiple expenses

See `spec.md` (what/why) and `research.md` (current code, providers, cost, accuracy).

## Architecture

```
client (web / mobile)
  capture N photos → resize ≤1600px JPEG
  → for each (≤3 concurrent): POST /api/v1/groups/{id}/expenses/scan   (new)
        API: auth + member guard → rate limit → sanitize EXIF → IOcrService
             → OpenAiCompatibleOcrService → OpenCode chat/completions (vision)
             → parse + normalize + validate → ReceiptSuggestion
  → review cards (edit, remove, duplicate hint)
  → sequential: POST /api/v1/groups/{id}/expenses  (existing, Idempotency-Key per card)
                POST /api/v1/expenses/{eid}/images (existing, receipt photo)
  → per-card result (created / failed + retry)
```

Creation reuses existing endpoints → no DB migration, no change to the expense
contract. A server-side atomic batch endpoint is deliberately not built (partial success
+ idempotent retry is simpler and matches existing behaviour); revisit only if needed.

## Components

| Piece | File | Notes |
|---|---|---|
| OCR contract | `api/Expenses/OcrService.cs` | Change `IOcrService.ExtractAsync` to return `ReceiptSuggestion` (typed); keep `DisabledOcrService` |
| Provider | `api/Expenses/OpenAiCompatibleOcrService.cs` (new) | Named HttpClient `"ocr"`, 30 s timeout; base URL/model/key from config; prompt + JSON parse |
| Normalizer | `api/Expenses/ReceiptParser.cs` (new, pure/static) | Extract JSON from model text (handles ```json fences / prose), validate & normalize fields |
| Scan service | `api/Expenses/ReceiptScanService.cs` (new) | Member guard (reuse `GroupMembers`), mime/size checks (reuse `ExpenseService.AllowedMimes`, `MaxImageBytes`), `ImageSanitizer`, category key list via `CategoryService`, calls `IOcrService` |
| Endpoint | `api/Endpoints/ExpenseEndpoints.cs` | `POST /groups/{id:guid}/expenses/scan` (multipart, `.DisableAntiforgery()`, `.RequireRateLimiting("ocr-user")`) |
| Legacy endpoint | `api/Endpoints/TripPackEndpoints.cs` | `/expenses/ocr` kept; maps `ReceiptSuggestion` back to `{suggestion:{...}}` dictionary for compatibility |
| DI / rate limit | `api/Program.cs` | Provider factory by `Ocr:Provider` (`openai-compatible` → new service, else Disabled); add `ocr-user` policy partitioned by user id claim |
| Config | `api/appsettings.json` | Non-secret defaults only (`Ocr:Enabled=false`, `Provider`, `BaseUrl`, `Model`, limits). **No key.** |
| Compose / CD | `docker-compose.yml`, `.env.example`, `.github/workflows/cd-api.yml` | Env vars `Ocr__*`; key as secret (mapping list ~L364 `"Ocr__ApiKey:GH_OCR__APIKEY:true"`). Note open change `openspec/changes/load-env-mapping-from-file` may move this list to a file — follow whichever is current |
| Web helpers | `web/src/receiptBatch.js` (new, pure) | card model, suggestion→card mapping, validation, duplicate detection, concurrency pool, payload builder |
| Web image resize | `web/src/imageResize.js` (new) | canvas resize to 1600px JPEG q0.8; fall back to original on decode failure (HEIC) |
| Web UI | `web/src/components/ScanReceipts.jsx` (new) | Mantine modal: capture → scanning list → review cards → create → results |
| Web wiring | `web/src/pages/GroupDetail.jsx` | "Scan receipts" action near L742/L779; gated by capabilities + `canWriteGroup`; reload group after create |
| Web API | `web/src/api.js` | `api.post(p, b, extra)` passes `extra.headers` (for `Idempotency-Key`); `req` already supports headers |
| Web i18n | `web/src/i18n/messages.js` | `scan.*` keys en + vi |
| Mobile screen | `mobile/src/screens/ScanReceiptsScreen.js` (new) | camera loop (`launchCameraAsync`) + gallery multi-select, reuse resize from AddExpenseScreen, review list, create |
| Mobile helpers | `mobile/src/receiptBatch.js` (new) | same pure logic as web (copy; no shared package exists) |
| Mobile wiring | `mobile/App.js`, `mobile/src/screens/GroupScreen.js` | stack route `ScanReceipts`; button near L245; capabilities check |

## API contract (new)

`POST /api/v1/groups/{groupId}/expenses/scan` — auth required, group member required.
Request: `multipart/form-data`, field `file` (1 image, ≤10 MB, jpg/png/webp/heic).

200:
```json
{
  "receipt": {
    "merchant": "Pho 24",
    "total": 12.50,
    "currency": "USD",
    "date": "2026-10-20",
    "tax": 1.00,
    "tip": null,
    "category": "food",
    "confidence": { "total": "high", "date": "low", "merchant": "high" }
  },
  "warnings": ["currency_mismatch"]
}
```
- All receipt fields nullable. `total`/`tax`/`tip` decimals in receipt currency,
  normalized to 2 dp and validated with `ParseAmount`/`ParseExtra` rules (invalid → null +
  `total_invalid`). `date` ISO date, dropped if >24 h future. `currency` ISO-4217 or
  null. `category` only if it is a valid key of this group (`ValidateKeyAsync`), else null.
- `warnings`: `currency_mismatch`, `total_missing`, `total_invalid`, `not_a_receipt`.

Errors (standard envelope via `ApiResults`):
| Status | Code | When |
|---|---|---|
| 501 | `OCR_UNAVAILABLE` | `Ocr:Enabled=false` or provider not configured |
| 403 / 404 | `FORBIDDEN` / `NOT_FOUND` | not a member / group missing |
| 422 | `VALIDATION` | no file, bad mime, size |
| 429 | (rate limiter) | per-user limit exceeded |
| 503 | `OCR_PROVIDER_ERROR` | provider timeout / 4xx / 5xx / unparseable output |

`GET /api/v1/capabilities` unchanged (`ocr_enabled` = Enabled && provider configured).

## Provider call (OpenCode, OpenAI-compatible)

`POST {Ocr:BaseUrl}/chat/completions`, `Authorization: Bearer {Ocr:ApiKey}`:
```json
{
  "model": "glm-5.3-flash-free",
  "temperature": 0,
  "messages": [
    {"role":"system","content":"You extract data from a single shop receipt. Reply with ONLY a JSON object: {\"is_receipt\":bool,\"merchant\":string|null,\"total\":number|null,\"currency\":\"ISO-4217\"|null,\"date\":\"YYYY-MM-DD\"|null,\"tax\":number|null,\"tip\":number|null,\"category\":one of [<group category keys>]|null,\"confidence\":{\"total\":\"high|low\",\"date\":\"high|low\",\"merchant\":\"high|low\"}}. total is the final amount paid. Use null when unsure. Do not guess."},
    {"role":"user","content":[{"type":"text","text":"Group currency: USD."},{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,<...>"}}]}
  ]
}
```
- Do not rely on `response_format` (free models may not support it); `ReceiptParser`
  extracts the first balanced `{...}` from `choices[0].message.content`.
- Treat receipt text as untrusted (prompt-injection on a receipt can only affect the
  suggestion values, which are validated and user-reviewed; no tools/actions).
- Never log the image, the key or the model output body; log status, latency, model.

## Configuration

| Key | Default | Secret |
|---|---|---|
| `Ocr:Enabled` | `false` | no |
| `Ocr:Provider` | `openai-compatible` | no |
| `Ocr:BaseUrl` | `https://opencode.ai/inference/openai/v1` | no |
| `Ocr:Model` | `glm-5.3-flash-free` (fallback `deepseek-v4.1-flash-free`) | no |
| `Ocr:ApiKey` | — (user-secrets / env / GitHub secret) | **yes** |
| `Ocr:TimeoutSeconds` | `30` | no |
| `Ocr:RateLimit:PermitLimit` / `WindowMinutes` | `20` / `10` | no |

Local: `dotnet user-secrets set "Ocr:ApiKey" "<key>" --project api`.

## Security

- Server-side membership check before calling the provider (cost + privacy).
- EXIF/GPS stripped before leaving our server. Max size enforced before reading fully
  (check `IFormFile.Length`).
- Key only server-side; clients never talk to the provider.
- Per-user rate limit + kill switch; OpenCode Console budget cap on the account.
- User-facing note that receipts are processed by a third-party AI provider (copy TBD).
- Do not use `nemotron-*-free` models (NVIDIA trial terms forbid personal data).

## Error handling / UX

- Scan failure/429/501 → card in manual mode with message; never blocks other cards.
- Create failure → card keeps data + idempotency key; "Retry failed" button.
- Busy flags prevent double submit; closing the modal mid-create asks for confirmation.

## Observability

Structured logs in `ReceiptScanService`: group id, user id, model, latency ms, outcome
(ok / provider_error / parse_error / rate_limited), warnings count. No receipt content.

## Testing strategy

- `tests/OcrTests.cs` (xUnit, same style as `ExpenseTests.cs`):
  - `ReceiptParser`: fenced JSON, prose + JSON, invalid JSON, negative/huge/3-dp totals,
    future date, bad currency, unknown category, `is_receipt=false`.
  - `OpenAiCompatibleOcrService` with fake `HttpMessageHandler`: request shape (model,
    auth header, data URL), 200 → parsed, 429/500/timeout → provider error.
  - `ReceiptScanService`: non-member → FORBIDDEN, bad mime/size → VALIDATION, disabled →
    OCR_UNAVAILABLE, category filtered to group keys, currency mismatch warning.
- Web `web/test/receipt-batch.test.mjs` (`node:test`): mapping, validation, duplicates,
  payload builder (EQUAL, participants, orig_currency), concurrency pool, i18n parity,
  source wiring (GroupDetail renders ScanReceipts behind capability).
- Mobile: `npm --prefix mobile test` + manual run on device/simulator (camera).
- Manual E2E: real OpenCode key, 5+ receipts → N expenses with images; retry path.

## Migration / compatibility

- No DB migration. `IOcrService` signature change is internal (only `DisabledOcrService`
  and `/expenses/ocr` use it). `/expenses/ocr` response shape preserved.
- Deploy order: API first (capability stays false until key + `Ocr__Enabled=true`), then
  web, then mobile. Clients hide the feature when capability is false → safe in any order.
