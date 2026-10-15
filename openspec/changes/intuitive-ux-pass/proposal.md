---
slug: "intuitive-ux-pass"
createdAt: "2026-10-15T00:54:24.000Z"
---

## Why

Users don't realize group rows are tappable (only the name text links), screens show blank space or static text while loading, and the dashboard's sections blur together. All three hurt first-time comprehension.

## What Changes

- Dashboard group rows become whole-card tappable targets with a chevron affordance, keyboard focus, and hover lift.
- Shape-matching skeletons for page loads (dashboard, group detail, settlement) plus loading/disabled states on every submit button (also prevents double-submit).
- Dashboard restructured into distinct boxes: Balances, Groups, Quick actions (new group). No join-via-link box.

## Capabilities

### New Capabilities
- `ux-affordance`: clickable group cards, dashboard box layout

### Modified Capabilities
- `splitshare-v1/ledger-views`: presentation only (loading skeletons on ledger/groups), no contract change

## Impact

- Code: `web/src/pages/Dashboard.jsx`, `GroupDetail.jsx`, `ExpenseDetail.jsx`, `components/SettlementBox.jsx`, `styles.css`. No API change.
- Out of scope: join-via-link UI, session-expired copy, native apps.
