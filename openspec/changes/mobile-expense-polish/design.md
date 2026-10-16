# Design: mobile-expense-polish

## 1. Upload flow (two-phase, unchanged contract)

Images require an expense id, so creation stays two-phase: `POST /groups/{id}/expenses` (JSON) → `POST /expenses/{id}/images` (multipart, one file per request, existing route). The form holds picked `File[]` in state (max 5, 10MB client pre-check) and uploads sequentially after create, collecting per-file failures into `imgErrs` + one summary notification instead of failing the expense. Copy carry-over keeps its download→re-upload loop but names files `receipt.<ext-for-mime>` so `FileStore.OpenAsync` serves the right mime on download (extensionless `receipt` previously served `application/octet-stream`).

## 2. Picker accept lists mirror the API allow-list

Frontend `accept` strings are narrowed from `image/*` to `image/jpeg,image/png,image/webp,image/heic,image/heif` in both pickers; the API `AllowedMimes` is extended with `image/heif`, `image/heic-sequence`, `image/heif-sequence` (iOS uploads), and `OpenAsync` maps `.heif`. Picker reset via React `key` bump after each upload attempt (Mantine `FileButton` keeps the file otherwise, so re-picking the same file never refires `onChange`).

## 3. Simplify by removing UI, not data

The `bill` JSX block and its accordion item are deleted; the backing state (`tax/tip/fee/orig*/guests/onlyPresent`) and `build()` payload are kept. Rationale: `UpdateAsync` partial semantics mean omitting fields preserves them, and deleting state would have risked clearing legacy trip-pack data on edit. Error path `setOpenSections` drops `'bill'`. Preview effect deps keep the hidden vars (harmless, no UI).

## 4. Tab focus: transient override + state-aware derive

`BottomNav` keeps a transient `sel` (set on every tap for instant feedback) cleared by `useEffect` on `[path, loc.hash, loc.key]`. The derived base reads router state: `state.tab === 'activity'` → `'activity'` (fixes Groups-stuck highlight), `state.openNew` → `'add'` while the dashboard wizard is pending (Dashboard consumes it via replace-nav, so the highlight is momentary and correct). All five tabs now receive `active` (Add/Activity were hardcoded `false`).

## 5. Mobile entry points via menu + anchors

`jumpTo(tab, anchor?, extra?)` in `GroupDetail` switches the mobile tab (loading activity/rules on demand like the tab `onChange` does), runs an optional extra (e.g. open Insights for paid/share), then smooth-scrolls to `group-tabs` (card, `scrollMarginTop: 72`) or the section anchor (`m-transfers` / `m-updates` / `m-recurring`). Paid/share reuse the existing Insights collapse (no new fetch); payments reuse the Transfers section (same ledger rows + reverse menu). Desktop tabs/panels untouched. CSV export appends the `<a>` to `document.body` before `click()` (iOS requires DOM attachment) and delays `revokeObjectURL`.

## Alternatives considered

- Single-request create-with-images (multipart create endpoint): rejected — changes the API contract and idempotency handling for marginal gain; post-create upload reuses the existing route and validation.
- Deleting bill state entirely: rejected — would silently clear legacy tax/tip/FX data on the next edit of old expenses.
- Separate mobile Recurring tab: rejected — keeps the 3-tab IA from mobile-simplify; menu jump + anchors reach the same content.
