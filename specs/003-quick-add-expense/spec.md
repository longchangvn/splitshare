# Feature Spec: Quick "Add expense" floating button (web)

**Status**: Implemented · **Scope**: web client only (`web/`)

## User goal

Add an expense from the dashboard without first navigating into a group, choosing
"who" (people and/or an existing group) in one step.

## User stories

- **US1** As a user on Dashboard / Groups / Activity, I see a floating "Add expense"
  button and can open a picker from it.
- **US2 (Flow 2 — group only)** I pick only a group → I land on that group with the
  existing "New expense" form already open (same UI and logic as today).
- **US3 (Flow 3 — people only)** I pick only people → a group is created for me with
  default values (default name, USD, those people as members) and the "New expense"
  form opens in it.
- **US4 (Flow 1 — people + group)** I pick people *and* a group → the existing
  "New group" wizard opens pre-filled with the selected people plus every member of
  the selected group; after I name it and press **Next**, the group is created and the
  "New expense" form opens in it.

## Functional requirements

- FR-1 A floating action button (FAB) labelled "Add expense" is shown on the
  dashboard views (`/`, `/groups`, `/activity`), above the mobile bottom nav.
- FR-2 The picker modal contains, top to bottom:
  1. a multi-select box showing / editing the selected people;
  2. an "All contacts" box with fixed height (≈10 rows) that scrolls; each row is a
     checkbox (multi select) kept in sync with the multi-select box;
  3. a single-select "Group" list showing every group as a radio button (scrollable),
     with a "No group" radio to clear the choice; closed groups are shown but disabled;
  4. a **Next** button, disabled until at least one person or a group is selected.
- FR-3 Contacts come from `GET /api/v1/contacts` (people who share a group with me,
  ordered by display name). Groups come from `GET /api/v1/groups`, sorted by name.
- FR-1b Inside a group (GroupDetail) the same floating button opens the normal
  New expense form directly (no picker); disabled when the group is not writable.
- FR-4 Flow routing on **Next**:
  | people | group | result |
  |---|---|---|
  | no  | yes | Flow 2: open group, auto-open New expense |
  | yes | no  | Flow 3: `POST /api/v1/groups` with default name + members, then Flow 2 on it |
  | yes | yes | Flow 1: load group members, open New-group wizard pre-filled (people ∪ group members, minus me); create → Flow 2 on new group |
- FR-5 Default group name (Flow 3) is "You, Name1, Name2…" (localized "You"),
  capped at 50 characters with a "+N" suffix for names that do not fit (server rule:
  3–50 chars).
- FR-6 In Flow 1 the wizard's final button reads **Next** and, on success, skips the
  "Group created" screen and goes straight to the expense form.
- FR-7 Loading, empty and error states are shown in the picker; Next is guarded
  against double submission.

## Non-functional

- Reuse existing components (GroupWizard, ExpenseForm, Mantine), API client and i18n
  (en + vi). No backend / contract changes. Keyboard accessible, dark theme aware.

## Edge cases & assumptions

- The contacts endpoint caps results at 50 (`limit` is clamped server-side); the
  "All contacts" box shows up to 50 people. Assumed acceptable.
- Duplicate people (selected and also in the group) are merged by `user_id`; the
  current user is never sent as a member (the creator is added as owner anyway).
- Locked groups are offered; server-side write policy still applies in the expense
  form.
- Opening the New expense form is driven by router state (`{ addExpense: true }`),
  consumed once so reload does not reopen it.

## Out of scope

- Mobile (Expo) app, invite-by-email from the picker, backend changes.
