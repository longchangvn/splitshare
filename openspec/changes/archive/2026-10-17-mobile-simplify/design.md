## Context

GroupDetail.jsx currently renders 7 `Tabs.Tab`s, two filter toolbars (desktop + mobile), inline per-row actions everywhere, and separate Members/Invite cards. Mantine v7 `Menu`, `Modal` (fullscreen → bottom-sheet feel with `styles`), `useMediaQuery` are already in use. Tab `value`s (`ledger`, `balances`, `paid`, `share`, `payments`, `activity`, `recurring`) are referenced by `onChange` auto-load logic — keep them, only change which tabs render under `sm`.

## Goals / Non-Goals

**Goals:** ≤6 visible buttons per mobile screen; every destination ≤2 taps away; zero capability loss; desktop pixel-identical.
**Non-Goals:** dashboard/expense-detail/auth restyle; deleting destinations; new dependencies.

## Decisions

1. **3 mobile tabs via conditional render, not new routing**: `{isMobile ? mobileTabs : allTabs}` where mobile renders `ledger | balances | activity`. Panels for `paid/share/payments/recurring` content move *inside* the surviving panels as sections (Insights disclosure in Balances; Transfers/Updates/Recurring sections in Activity). Desktop keeps all 7 tabs/panels untouched. No router change, no state migration.
2. **Bottom sheet = fullscreen Modal with bottom anchoring**, not a new lib: `Modal fullScreen={isMobile}` already used for forms; for the "+ New" sheet use `Modal` with `styles={{ content: { marginTop: 'auto', borderRadius: '16px 16px 0 0' } }}` under `sm` — two big list buttons (Expense with receipt icon, Record payment). Reuses existing open-state (`showExp`, `payOpen`), so zero new form logic.
3. **Debounced search replaces Go**: 600ms debounce on `q` under `sm` calling `loadLedger`; desktop keeps explicit Go (unchanged behavior for precision filtering). Aborts in-flight via request counter — ledger reads are idempotent GETs.
4. **Filter icon with badge, not text button**: `ActionIcon` (funnel) + `Indicator` count in the search row; opens the existing Collapse sheet (restyled as modal sheet later if needed — keep Collapse for this pass to bound scope).
5. **RowMenu shared component** (`Mobile.jsx`): `⋯ ActionIcon + Menu` wrapper used by payment rows (Reverse), recurring rows (Pause/Delete), debtor rows (Nudge/Details?). One pattern, three uses — replaces three bespoke inline button groups.
6. **People card merge**: single card, header `Group: "People (n)" + Invite button`; Leave/Delete group move to header ⋯ menu (both already confirm-modals — same handlers). Deposit/treasurer stay in the existing per-row menu.
7. **Header diet**: under `sm` render title + currency `Badge` + `Net` only; role/mode move into Settings modal subtitle (one line, no new UI). Budget bar loses card chrome → single `Progress` + one-line text (Mantine `Progress` already a dependency).

## Risks / Trade-offs

- "+ New" sheet adds one tap to the two most-used actions; justified by Splitwise-standard pattern and the explicit "too many controls" feedback. Desktop keeps both buttons (no friction change where space is free).
- Conditional tabs mean mobile/desktop show different tab sets — deep-linking a desktop-only tab value on mobile falls back to `ledger` (document in code; acceptable since mobile never links to them).
- Debounced search fires more reads; ledger endpoint is paged (limit 100) and cached per query — fine at group scale.
- Insights disclosure inside Balances duplicates `paid/share` panels' data source (`summary`) — same array, no new fetch.
