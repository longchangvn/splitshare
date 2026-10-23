# Plan: Quick "Add expense" floating button

## Architecture

Frontend-only change on existing endpoints. No API, database or migration changes.

| Piece | File | Notes |
|---|---|---|
| Flow logic (pure, unit-tested) | `web/src/quickAdd.js` | `resolveQuickAddFlow`, `mergeMembers`, `defaultGroupName`, `ADD_EXPENSE_STATE` |
| FAB + picker modal | `web/src/components/QuickAddExpense.jsx` | MultiSelect + fixed-height checkbox list + Select + Next |
| Dashboard integration | `web/src/pages/Dashboard.jsx` | Renders FAB; Flow 1 opens existing `GroupWizard` pre-filled in "expense" mode |
| Auto-open expense form | `web/src/pages/GroupDetail.jsx` | Mount effect consumes `location.state.addExpense` → `setShowExp(true)` |
| Styles | `web/src/styles.css` | `.qa-fab`, `.qa-contacts` (fixed height, scroll), dark theme |
| i18n | `web/src/i18n/messages.js` | `quickAdd.*` keys in en + vi |

## API usage (existing)

- `GET /api/v1/contacts?limit=50` → `[{ user_id, display_name, username }]`
- `GET /api/v1/groups` → `[{ group_id, name, currency, status }]`
- `GET /api/v1/groups/{id}` → `{ members: [{ user_id, display_name, username }] }` (Flow 1)
- `POST /api/v1/groups` `{ name, currency, member_ids, invite_emails }` (Flow 3 and Flow 1 via wizard)

## Security

Authorization unchanged: server enforces membership on group detail, membership
limits and write policy. Client only sends user ids it received from the API.

## Error handling

Picker shows `Err` for load/submit failures; Next uses a busy flag. Wizard keeps its
existing error handling.

## Testing

`node --test` source + unit tests in `web/test/quick-add-expense.test.mjs`
(flow routing, merging, default name, UI order, wiring, i18n parity), plus
`vite build`.

## Backward compatibility

Existing wizard behaviour unchanged when not in expense mode; the `copyFrom` router
state handoff in GroupDetail is preserved.
