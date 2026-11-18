# Tasks: Several receipts in one photo / camera shot

Design + open decisions: `plan.md` (same folder). **Status: pending — not started.**

## How to resume (read first)

1. Read root `AGENTS.md`, `web/AGENTS.md`, then `plan.md`.
2. Confirm the open decisions D1–D4 in `plan.md` §5 with Alex if not yet recorded below.
3. Find the first task that is `[~]` (resume it) or else the first `[ ]` task whose
   "Start when" is true.
4. Mark `[~]` when starting, `[X]` only after its "Verify" ran and passed. Append a short
   dated log line under the task whenever you stop mid-task.
5. Do not overwrite Alex's unrelated uncommitted changes (`git status` before editing).

Status: `[ ]` not started · `[~]` in progress · `[X]` done · `[!]` blocked (say why).

Verify suite:
```sh
dotnet build SplitShare.sln
dotnet test tests/SplitShare.Tests.csproj
node --test web/test/*.test.mjs
npm --prefix web run build
npm --prefix mobile test        # sync-shared --check + mapping-check + node --test
```

Decisions log:
- (none yet)

---

## Phase 0 — scope

- [ ] T0 Record decisions D1–D4 above; note in `specs/004-multi-receipt-expenses/spec.md`
      §Out of scope that multi-receipt-per-photo moved to spec 008.

## Phase 1 — quick wins (can ship independently)

- [ ] T1 Web batch modal keeps every receipt of a photo: `scanCard` in
      `web/src/components/ScanReceipts.jsx` uses `cardsFromSuggestion` and replaces the one
      card with N cards (same as mobile `ScanReceiptsScreen.js`).
  - Verify: source-wiring + behaviour test in `web/test/scan-receipts-batch.test.mjs`; web build.
- [ ] T2 Single-scan form handles `count > 1`: "Found N receipts" → **Review all** (open
      `ScanReceipts` pre-loaded with the response, no rescan) or **Use receipt ①**.
      Files: `web/src/components/Forms.jsx`, `web/src/pages/GroupDetail.jsx`,
      `mobile/src/components/expense/ExpenseForm.js`, `web/src/i18n/messages.js` (en + vi).
  - Start when: T1 `[X]`.
  - Verify: web tests + build, mobile tests, manual check with a mocked 2-receipt response.

## Phase 2 — backend boxes

- [ ] T3 Prompt schema adds `box:[ymin,xmin,ymax,xmax]` (0–1000); `ReceiptBox` record +
      `ReceiptSuggestion.Box`; `ReceiptParser` validation (invalid → null, never fails);
      warnings `overlap`, `possibly_merged`; DTO `box` per receipt (additive).
      Files: `api/Expenses/OcrService.cs`, `ReceiptParser.cs`, `OpenAiCompatibleOcrService.cs`,
      `api/Endpoints/ReceiptScanEndpoints.cs`.
  - Verify: extend `tests/ReceiptScanTests.cs` (valid / invalid / missing box, overlap,
    DTO shape, legacy flat fields unchanged).

## Phase 3 — client prep + shared helpers

- [ ] T4 Higher scan resolution for batch scans (`SCAN_MAX_EDGE_MULTI ≈ 2048`, q ≈ 0.7) in
      `web/src/receiptScan.js` and `mobile/src/receipt.js`; single-scan stays 1200.
  - Verify: `web/test/receipt-scan.test.mjs`; size check on `receipt-test/` fixtures.
- [ ] T5 Pure helpers in `web/src/receiptBatch.js`: `boxToPixels`, `iou`, within-photo
      duplicates; cards keep `box`, `sourceId`, `index`; `MAX_BATCH` counts cards. Run
      `mobile/scripts/sync-shared.js`.
  - Start when: T3 `[X]` (contract frozen).
  - Verify: node tests; `npm --prefix mobile test`.

## Phase 4 — cropping + review UI

- [ ] T6 Client-side crop from the original file; upload the crop as each expense image
      (fallback full photo). Web: crop util in `receiptScan.js` + `ScanReceipts.jsx`;
      mobile: `ImageManipulator` crop in `mobile/src/receipt.js` + `ScanReceiptsScreen.js`.
  - Start when: T5 `[X]`.
  - Verify: browser + device test; EXIF-rotated photo crops correctly.
- [ ] T7 Review UI: `ReceiptPhotoPreview` with numbered boxes, "+ Add missing receipt",
      "Rescan this receipt" (uploads crop), remove card, framing hint; i18n en + vi.
  - Start when: T6 `[X]`.
  - Verify: web tests + build, mobile tests, manual run with mocked responses.

## Phase 5 — accuracy gate + docs

- [ ] T8 Live accuracy set: ~20 photos with 2–5 receipts (overlap, angled, low light, mixed
      currency). Measure count accuracy, per-receipt total accuracy, box IoU. Gate:
      **count ≥ 90 %, total ≥ 85 %**. Extend opt-in `ReceiptScanLiveTests`. Record results in
      `plan.md`. If not met → `[!]`, report, consider server-side refinement (`plan.md` §4.2).
  - Start when: D1 provider key available (roadmap R3.1).
- [ ] T9 Docs + release: README, `RELEASE_NOTES.md`, spec 004 `research.md` cross-link.
  - Verify: full verify suite above.
