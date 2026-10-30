## 0. Confirm
- [ ] 0.1 Product answers the open questions in design.md (extras shared, legacy conversion, fractional shares, stale-client 422)

## 1. Data model (api/)
- [ ] 1.1 `ExpenseGuest`: add `Mode` ("split" | "addon"), `ExactCents long?`, `Percent decimal?`, `Shares int?`
- [ ] 1.2 `AppDbContext`: `Percent` precision (5,2), `Mode` max length 10, default `addon`
- [ ] 1.3 Generate migrations for **both** providers (Postgres + SqlServer) and update snapshots; run `SqlServerMigrationTests`

## 2. Split math (api/Expenses/)
- [ ] 2.1 Extract one `BuildSplit(type, baseCents, members, guests, exact, percent, shares)` helper: guest lines join the split, are folded into `covered_by`, and return `(memberMap, guestShares)`
- [ ] 2.2 Per-method guest validation (EXACT needs amount_cents, PERCENT needs percent, SHARES ≥ 1 default 1)
- [ ] 2.3 `CreateAsync` / `PreviewAsync`: use the helper; `AmountCents = face + tax + tip + fee`; set `Mode = split`
- [ ] 2.4 `UpdateAsync` / `PreviewEditAsync`: face derivation respects `addon`; metadata-only edits keep legacy rows untouched; guest input converts rows to `split`
- [ ] 2.5 `MapExpense`: guests return `share_cents`, `exact_cents`, `percent`, `shares`, `mode`

## 3. Endpoints
- [ ] 3.1 `GuestDto(Label, CoveredBy, AmountCents?, Percent?, Shares?)` + `Opts` mapping
- [ ] 3.2 Preview / preview-edit responses add `guest_shares`
- [ ] 3.3 (Optional, per 0.1) temporary `GUEST_MODE_CHANGED` 422 for stale clients

## 4. Web (web/src/)
- [ ] 4.1 `Forms.jsx` guest row: per-method input (hidden for EQUAL, `$` EXACT, `%` PERCENT, shares SHARES), using the decimal normalizer
- [ ] 4.2 `changeType`: PERCENT equal-prefill over members + guests; SHARES default 1 for guests
- [ ] 4.3 Totals line and `build()` include guests; init from `source.guests` for edit/copy
- [ ] 4.4 Preview shows each guest's computed amount "Kid 30.00 via Anna"
- [ ] 4.5 `ExpenseDetail.jsx` guest line shows computed share + method value
- [ ] 4.6 i18n en + vi: hint text and labels

## 5. Mobile (mobile/src/)
- [ ] 5.1 `ExpenseDetailScreen.js`: read-only guest lines; block split-type edits on expenses with EXACT/PERCENT guests, with an "edit on web" hint

## 6. Tests and verification
- [ ] 6.1 `TripPackTests`: rewrite `Guests_Ride_On_Covering_Member` as a legacy `addon` test; add EQUAL/EXACT/PERCENT/SHARES/extras/covered-by-dropped scenarios from the spec; check `sum(nets)==0`
- [ ] 6.2 `SplitTests`: helper unit tests (remainder cents, guest folding)
- [ ] 6.3 `ContractTests`: guest DTO + `guest_shares` shape
- [ ] 6.4 `web/test/guest-split.test.mjs`: form wiring
- [ ] 6.5 `dotnet test`, `node --test web/test`, `vite build`; manual web check on mobile viewport
- [ ] 6.6 Deploy order: API first, then web (same release)
