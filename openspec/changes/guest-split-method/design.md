## Context

Current flow (`api/Expenses/ExpenseService.cs`):

```
baseCents = face + tax + tip + fee
map       = ResolveShares(type, baseCents, members, exact, percent, shares)   // members only
guests    = ResolveGuests(guests, members)                                    // fixed cents
map[g.CoveredBy] += g.ShareCents
AmountCents = baseCents + sum(guests)                                         // bill grows
```

Update / preview-edit rebuild the face as `AmountCents - tax - tip - fee - sum(guests)`, which depends on the add-on rule.

## Decisions

1. **Guests become synthetic split lines.** Each guest gets a stable line id (`ExpenseGuest.Id`, generated before splitting). `ResolveShares` runs over `members ∪ guestLineIds` with the existing `SplitService.Equal/Exact/Percent/Shares`. There's no new split algorithm, so remainder/rounding rules are unchanged. Guest line results are then folded into `covered_by` and removed from the member map.
2. **Guest is inside the bill.** `AmountCents = face + tax + tip + fee` for `mode = split`. Face derivation on edit becomes `AmountCents - tax - tip - fee - (mode == addon ? sum(guests) : 0)`.
3. **Legacy compatibility via `mode`.** New column `ExpenseGuest.Mode` (`addon` default for existing rows via migration, `split` for new writes). Old rows keep old math until a request sends `guests` again (or changes money/split fields, which needs guest values for EXACT/PERCENT).
4. **Per-method values stored on the guest row**, same as `ExpenseSplit`: `ExactCents long?`, `Percent decimal(5,2)?`, `Shares int?`. `ShareCents` keeps the computed share (used by detail view and legacy math).
5. **Request validation per method**: EXACT needs `amount_cents` on every guest, PERCENT needs `percent`, SHARES defaults to 1. Exact/percent/shares sets must still cover exactly the members, and guest values come from the guest entries (no ids from the client).
6. **Line cap**: members ≤ 50 (unchanged) and guests ≤ 20 (unchanged).
7. **Preview contract**: `shares` keeps its current meaning (per member, folded). An additive `guest_shares: [cents...]` (request order) lets the UI show "Kid 30.00 via Anna".

## Impact matrix

| Layer | File | Change | Risk |
|---|---|---|---|
| Model | `api/Models/TripPack.cs` (`ExpenseGuest`) | add `Mode`, `ExactCents`, `Percent`, `Shares` | Low |
| EF config | `api/Data/AppDbContext.cs` (~L140) | precision `Percent (5,2)`, `Mode` max length + default `addon` | Low |
| Migrations | `api/Migrations/Postgres/*`, `api/Migrations/SqlServer/*` + both snapshots | additive nullable columns + `Mode` default `addon` | **Med**: two providers, startup `MigrateAsync`; must generate both and run `SqlServerMigrationTests` |
| Service | `api/Expenses/ExpenseService.cs` `ResolveGuests`, `ResolveShares`, `CreateAsync`, `PreviewAsync`, `UpdateAsync`, `PreviewEditAsync`, `MapExpense` | guest lines in split, new total rule, legacy face derivation, guest values | **High**: core money math, 4 parallel code paths that must stay identical |
| Split math | `api/Expenses/SplitService.cs` | none, or a tiny helper to merge lines; algorithms reused | Low |
| Endpoints | `api/Endpoints/ExpenseEndpoints.cs` (`GuestDto`, `Opts`, preview result) | `GuestDto(Label, CoveredBy, AmountCents?, Percent?, Shares?)`, `guest_shares` | Med: `AmountCents` becomes nullable; old clients still send it |
| Ledger / nets / settlement / statement / report / breakdown | `LedgerService`, report endpoints | **no change**: they read `ExpenseSplit.ShareCents`, which still sums to `AmountCents` | Low (verify with invariant tests) |
| Web form | `web/src/components/Forms.jsx` (ExpenseForm: state L145, build L205, totals L227, changeType L155, guest rows L677-715, preview L773) | guest per-method input, totals include guests, PERCENT prefill across members+guests, copy/edit init from new fields, guest hint text | **High**: largest UI change; EXACT/PERCENT totals and "sum ok" state |
| Web detail | `web/src/pages/ExpenseDetail.jsx` (L138-146) | show guest computed share + method value | Low |
| i18n | `web/src/i18n/messages.js` (en L504-507, vi L1252-1255) | new hint "Guest takes part in the split; covered member pays their part", labels | Low |
| Mobile | `mobile/src/screens/ExpenseDetailScreen.js` | read-only guest lines; when editing an expense with `split` guests, send no split changes or show "edit on web" for EXACT/PERCENT | Med: RN edit can 422 if it changes the split type without guest values |
| Mobile | `mobile/src/screens/AddExpenseScreen.js` | none (guests are out of scope there) | — |
| Tests | `tests/TripPackTests.cs` (`Guests_Ride_On_Covering_Member` expects add-on 120 → must be rewritten as legacy + new cases), `tests/SplitTests.cs`, `tests/ContractTests.cs`, new `web/test/guest-split.test.mjs` | spec scenarios + invariant `sum(nets)==0` | Med |
| Spec | `openspec/specs/trip-pack/expense-richness.md` | replace Guest shares requirement on sync | Low |

## Risks / Trade-offs

- **Behaviour change for users**: the same input (guest $30, EQUAL) now gives a different result. Mitigation: new UI no longer shows a `$` box for EQUAL/PERCENT/SHARES; release note; legacy rows untouched.
- **Mixed-version clients**: an older cached web bundle or the RN app may send `guests[{amount_cents}]` with EQUAL. Under the new rules the amount is ignored and the guest becomes a head, which changes the numbers without any warning. Mitigations: (a) deploy API + web together (`cd-api.yml` then `cd-web.yml`); (b) optional temporary rule: `amount_cents` present with a non-EXACT split → 422 `GUEST_MODE_CHANGED` for one release so stale clients reload.
- **Existing data**: legacy `addon` rows remain valid but differ from new ones. Editing a money field on a legacy expense converts it to `split`, which can change the total. The edit preview must show the new total and the un-settle list (existing `preview-edit` + confirm flow covers this).
- **Locked/settled expenses**: they can't be edited (`EXPENSE_LOCKED`), so there's no recompute risk.
- **Four duplicated code paths** (create / preview / update / preview-edit) must apply identical rules. Mitigation: extract one `BuildSplit(type, base, members, guests, exact, percent, shares)` helper used by all four, and test it directly.
- **Rounding**: guest line ids are random Guids, so remainder-cent order between a guest and a member is deterministic per stored expense but not across re-creates. This matches current member behaviour.
- **Copy expense**: copies guests with method values; if the copy changes split type, guest values are reset like member values.

## Open questions (need product confirmation)

1. Should tax/tip/fee be shared with guests (proposed: yes, same as members)?
2. Should we convert legacy `addon` guests to `split` automatically, or keep them as `addon` forever (proposed: keep and convert only on edit)?
3. For SHARES, are fractional guest shares (e.g. kid = 0.5) needed? The current model is integer only, so 0.5 would require changing `Shares` to decimal for members too.
4. Should we do the temporary 422 `GUEST_MODE_CHANGED` safety rule for stale clients?
