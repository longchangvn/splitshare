# Plan: Several receipts in one photo / camera shot

**Created**: 2026-11-17 · **Status**: Pending (not started) · **Tasks**: `tasks.md` (same folder)
**Builds on**: `specs/004-multi-receipt-expenses` (batch scan), `specs/007-consistent-add-expense`
(shared draft + `ExpenseFields`). Moves "Multiple receipts in a single photo" (spec 004 §Out of
scope) into scope.

---

## 1. Current state (explored 2026-11-17)

| Layer | State | Where |
|---|---|---|
| Prompt asks for every receipt, reading order, never merge/split | Done | `api/Expenses/OpenAiCompatibleOcrService.cs` `BasePrompt` |
| Parser reads `receipts[]`, cap 10/photo | Done + tested | `api/Expenses/ReceiptParser.cs` `ParseMany`, `MaxReceiptsPerPhoto` |
| Service returns a list; DTO `count` + `receipts[]` + legacy flat fields | Done | `api/Expenses/ReceiptScanService.cs`, `api/Endpoints/ReceiptScanEndpoints.cs` `ToDto` |
| Shared helper: one response → one card per receipt | Done | `web/src/receiptBatch.js` `cardsFromSuggestion` (synced to `mobile/src/shared/`) |
| Mobile batch screen | Uses `cardsFromSuggestion` | `mobile/src/screens/ScanReceiptsScreen.js` `scanCard` |
| **Web batch modal** | **Bug**: uses `cardFromSuggestion` (singular) → receipts 2+ dropped | `web/src/components/ScanReceipts.jsx` `scanCard` |
| Single-scan button (Add expense) | Takes only the first receipt, silently | `web/src/components/Forms.jsx` `onScanFile`; mobile `components/expense/ExpenseForm.js` |
| Text mode (Ollama `glm-ocr`) | Always one receipt (plain text can't be split) | `api/Expenses/ReceiptTextParser.cs` |
| Server image library | None (cropping must be client-side or add a package) | `api/SplitShare.Api.csproj` |

## 2. Gaps

1. **Resolution**: `SCAN_MAX_EDGE = 1200` px. With 3 receipts side by side each gets ~400 px
   width → totals become unreadable. Biggest accuracy risk.
2. **No per-receipt location**: every card shows/uploads the same full photo; user can't tell
   which card is which receipt.
3. Web modal drops receipts 2+ (bug above).
4. Single-scan form ignores `count > 1`.
5. No recovery when the model merges two receipts, misses one, or double-counts one.
6. No capture guidance (flat, non-overlapping, contrasting background).

## 3. User flow

```
[Scan receipts]  (GroupDetail modal / mobile ScanReceiptsScreen)
   ├─ Take photo (camera)  or  Pick from library (multi-select, ≤10 photos)
   │    hint: "Lay receipts flat, not overlapping. Up to 10 per photo."
   ▼
Client prep: orientation fix → resize ~2048 px gray JPEG → POST /expenses/scan
   ▼
Server: one vision call → receipts[] each with fields + box (normalized 0–1000)
   ▼
Review screen
   ├─ Photo preview with numbered boxes ①②③ (tap box → scroll to card)
   ├─ One card per receipt: crop thumbnail + ExpenseFields (prefilled)
   ├─ Warnings: low confidence, currency mismatch, duplicate (vs ledger AND
   │   within same photo), "possibly merged"
   ├─ Remove card (false detection) · "+ Add missing receipt" (manual card,
   │   same photo) · "Rescan this receipt" (uploads the crop alone)
   ▼
Create N  → POST /expenses (Idempotency-Key per card)
          → POST /expenses/{id}/images with that receipt's CROP (fallback: full photo)
```

Single-scan form (Add expense): when `count > 1` show "Found 3 receipts in this photo" →
**Review all** (opens `ScanReceipts` pre-loaded with the scan response, no rescan) or
**Use receipt ①** (current behaviour).

## 4. Technical design

### 4.1 Detection — one call with bounding boxes
- Prompt schema adds `"box":[ymin,xmin,ymax,xmax]` integers 0–1000 per receipt (Gemini's
  native box format).
- `ReceiptParser`: validate (4 ints, 0–1000, min < max, minimum area); invalid → `box = null`,
  receipt kept. A box never fails a request.
- `ReceiptSuggestion` gains `ReceiptBox? Box`; DTO adds `box` per receipt (additive).
- Warnings: `overlap` (two boxes IoU > 0.6 → likely double count), `possibly_merged`
  (one box covers most of the image while the receipt shows conflicting totals/dates).

### 4.2 Accuracy refinement
- v1 (recommended): client-side **"Rescan this receipt"** uploads the crop to the existing scan
  endpoint with the single-receipt flow. No new server dependency; cost only when needed.
- Later option: `Ocr:RefineCrops=true` → server crops low-confidence boxes and re-reads them in
  parallel. Needs an image library (SkiaSharp / ImageSharp — check license).
- Rescans count against `ocr-user` rate limit (20 / 10 min); revisit the limit.

### 4.3 Client image prep
- `SCAN_MAX_EDGE_MULTI ≈ 2048`, JPEG q ≈ 0.7 (~350–600 KB) for batch scans; single-scan keeps
  1200. Web `compressReceiptImage(file, { maxEdge })` and mobile `reencode(file, maxEdge, …)`
  already take the parameter.
- Crop per receipt from the **original** high-res file, ~3 % padding:
  - Web: canvas `drawImage` with source rect.
  - Mobile: `ImageManipulator.manipulateAsync(uri, [{ crop: { originX, originY, width, height } }])`.
- Box → pixels: `x = xmin / 1000 * width` (after orientation; web already uses
  `imageOrientation: 'from-image'`; verify EXIF-rotated dimensions on mobile).

### 4.4 Shared helpers (`web/src/receiptBatch.js`, synced to mobile)
- `cardsFromSuggestion` keeps `box`, `sourceId` (shared photo), `index` per card.
- New pure helpers: `boxToPixels(box, w, h, pad)`, `iou(a, b)`; `findDuplicates` also compares
  cards within the same photo.
- `MAX_BATCH` counts **cards**, not photos; total cap 10.

### 4.5 UI
- Reuse `ScanReceipts.jsx` / `ScanCard` / `ExpenseFields` (web/AGENTS.md reuse rule); no new flow.
- Small `ReceiptPhotoPreview` (image + absolutely positioned numbered boxes), one per photo.
- i18n `scan.*` en + vi: `foundN`, `addMissing`, `rescanOne`, `possiblyMerged`, `framingHint`.

### 4.6 Not doing (for now)
- Live on-device detection in the viewfinder (OpenCV.js / ML Kit). ML Kit Document Scanner
  handles only one document per shot; bundle/native cost is high.
- Splitting receipts in text mode (`glm-ocr` returns no boxes) — stays a single-receipt dev
  fallback; document it.

## 5. Open decisions (confirm before starting)

| # | Decision | Recommended default |
|---|---|---|
| D1 | Production provider | Gemini Flash via OpenAI-compatible endpoint (boxes need a Gemini-class model; current default `glm-5.3-flash`) |
| D2 | Image attached to each expense | The cropped receipt (fallback: full photo) |
| D3 | Refinement | Client "Rescan this receipt" only for v1 |
| D4 | Ordering vs roadmap | T1 (web bug fix) may ship now; the rest follows roadmap R3 gate (P0.3 persistent storage) |

## 6. Acceptance

- One photo with 3 receipts → 3 cards, each with its own crop thumbnail and prefilled total.
- Remove / add-missing / rescan-one work; duplicate + overlap hints appear.
- Each created expense has its own cropped image.
- Live accuracy set (~20 photos, 2–5 receipts each): **count ≥ 90 %**, **per-receipt total ≥ 85 %**.
- Legacy single-scan clients keep working (flat DTO fields unchanged).
