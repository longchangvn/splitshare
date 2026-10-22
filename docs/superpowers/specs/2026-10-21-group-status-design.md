# Group lifecycle status

## Goal

Let a group owner set the group lifecycle to **Opening**, **Lock**, or
**Closed**. The status must be enforced by the API and shown consistently in
group detail and group cards.

## Status rules

| Status | Members | Owner | Default |
| --- | --- | --- | --- |
| Opening | Current permissions apply. | Current permissions apply. | Yes |
| Lock | Read-only. No group-scoped writes. | May make normal group changes and change the status. | No |
| Closed | Read-only. No group-scoped writes. | May only change the lifecycle status, allowing the group to reopen. | No |

“Current permissions” preserves role and record-specific rules already in
place. For example, an owner or treasurer can make the edits currently allowed
to them; this lifecycle feature does not grant a member additional authority.

Read operations, reports, exports, and public read-only sharing remain
available in every status.

## Data and API contract

- Add a non-null lifecycle field to `Group`, defaulting to `opening`.
- Persist the field through an EF migration. Existing groups receive
  `opening`.
- Keep the user-facing label `Lock`; persist the corresponding status value as
  `locked`.
- Return `status` from both `GET /api/v1/groups` and
  `GET /api/v1/groups/{id}`.
- Add owner-only `PATCH /api/v1/groups/{id}/status` with a body containing
  `status`. The accepted values are case-insensitive `opening`, `locked`,
  and `closed`; the response returns the updated status.
- Reject invalid values with the existing validation response shape.

## Authorization design

Introduce one status policy owned by the group domain rather than duplicating
status comparisons across endpoints. Its input is the persisted group and the
actor role; it returns whether the requested group-scoped mutation is allowed.

- Opening permits the mutation, leaving each existing service to apply its
  normal role/record checks.
- Lock permits an owner and rejects every non-owner.
- Closed rejects every mutation except the owner changing the lifecycle status.

The policy is applied in service-layer write paths so direct API calls cannot
bypass the UI. Coverage includes expenses and their uploads, payments and
proofs, categories, recurring rules/materialization, group settings, member
and invite management, roles/deposits, fee and sharing settings, and
group-scoped collaboration actions such as comments and nudges. A read,
preview, export, or status transition is not blocked unless it writes group
state under the rules above.

Background recurring materialization must not create an expense while a group
is locked or closed.

## UI

### Group detail

- Render a compact lifecycle badge beside the existing group metadata for all
  members.
- For owners, render a status dropdown with the three labels and a short
  explanatory description.
- Reload the group detail and list data after a successful transition.
- In locked and closed states, hide or disable controls that the current viewer
  cannot use and show a concise read-only notice. Server responses remain the
  source of truth.

### Group cards

- Add the lifecycle badge to every group card/list tile, using the same label
  and color mapping as detail.
- Opening is visually quiet; Lock and Closed are clearly distinguishable
  without changing card navigation.

## Failure handling

- A forbidden write returns the existing API error structure with a dedicated
  lifecycle error code/message.
- The UI displays that response and refreshes group data so another owner’s
  status change cannot leave stale actionable controls visible.
- A failed status update leaves the dropdown at the persisted status.

## Test plan

1. Domain/service tests prove the default, each state transition, invalid
   status rejection, owner-only transition, and the authorization matrix.
2. Endpoint tests prove status is included in list/detail and writes are
   rejected according to the policy, including a background recurring run.
3. Frontend tests cover status badge/dropdown rendering, owner-only controls,
   read-only controls, and card badges.
4. Run targeted backend and frontend suites, production build, and
   `git diff --check`.
