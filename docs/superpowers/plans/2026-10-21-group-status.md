# Group lifecycle status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-controlled Opening, Lock, and Closed states that are enforced for every group write and visible in group detail and group cards.

**Architecture:** Persist the lifecycle status on Group and use a new GroupStatusPolicy for every group-scoped mutation. GroupService owns the owner-only transition API, while existing write services convert policy rejections to their established operation results. The frontend consumes the status already returned by list/detail API responses to render shared badges, an owner dropdown, and contextual read-only UI.

**Tech Stack:** ASP.NET Core minimal APIs, EF Core migrations for PostgreSQL and SQL Server, xUnit, React 18, Mantine 7, Vite, Node test runner.

**Spec:** docs/superpowers/specs/2026-10-21-group-status-design.md

## Global Constraints

- UI labels are Opening, Lock, and Closed; the persisted/API values are opening, locked, and closed.
- Existing groups and new groups default to opening.
- Opening preserves every current role and record-specific permission; this feature grants no new authority.
- Lock makes non-owners read-only while owners retain normal group-management capability.
- Closed makes everyone read-only except an owner may change the group lifecycle to reopen it.
- Reads, exports, reports, and public read-only sharing remain available at every lifecycle state.
- Server-side status checks are authoritative; UI affordances must not be the only enforcement.
- Do not modify unrelated current worktree changes.

## Review Focus

- A member sends a direct expense/payment/category request after the owner changes the group to Lock; add policy/service tests in Tasks 2 and 4 expecting a lifecycle rejection.
- An owner must be able to reopen a Closed group but must not be able to write any other group data while it remains Closed; add transition and mutation tests in Tasks 3 and 4.
- A recurring bill due during Lock or Closed must not create an expense or silently lose its schedule; add a materialization test in Task 4.
- A stale browser attempts a write after another owner changes status; add UI error/refresh coverage in Task 5.
- Existing records missing a status during migration must load as opening; add migration/default verification in Task 1.

---

## File structure

- api/Models/Entities.cs — persisted Group lifecycle property.
- api/Data/AppDbContext.cs — field mapping/default constraints.
- api/Groups/GroupStatusPolicy.cs — lifecycle parsing and central write authorization.
- api/Groups/GroupService.cs — owner-only status transition plus status-aware group mutations.
- api/Endpoints/GroupEndpoints.cs — status DTO, list/detail exposure, and PATCH endpoint.
- api/Expenses/ExpenseService.cs and api/Payments/PaymentService.cs — policy checks around existing mutations.
- api/Groups/CategoryService.cs, api/Endpoints/RecurringEndpoints.cs, api/Services/RecurringService.cs, api/Endpoints/TripPackEndpoints.cs, api/Endpoints/PaymentEndpoints.cs — policy checks for remaining group writes.
- api/Migrations/Postgres/* and api/Migrations/SqlServer/* — provider-specific status migrations and snapshots.
- tests/GroupStatusTests.cs and existing focused service test files — lifecycle authorization coverage.
- web/src/pages/GroupDetail.jsx, web/src/pages/Dashboard.jsx, web/src/i18n/messages.js, and web/src/styles.css — lifecycle controls, badges, copy, and responsive styling.
- web/test/group-status.test.mjs — rendered UI and mobile/desktop lifecycle regression coverage.

### Task 1: Persist the lifecycle status and centralize the policy

**Files:**
- Create: api/Groups/GroupStatusPolicy.cs
- Create: tests/GroupStatusTests.cs
- Create: api/Migrations/Postgres/<timestamp>_GroupLifecycleStatus.cs and Designer.cs
- Create: api/Migrations/SqlServer/<timestamp>_GroupLifecycleStatus.cs and Designer.cs
- Modify: api/Models/Entities.cs
- Modify: api/Data/AppDbContext.cs
- Modify: api/Migrations/Postgres/AppDbContextModelSnapshot.cs
- Modify: api/Migrations/SqlServer/SqlServerAppDbContextModelSnapshot.cs
- Modify: api/Program.cs

**Interfaces:**
- Produces Group.Status as a non-null string with default opening.
- Produces GroupStatusPolicy.CheckWriteAsync(Guid groupId, Guid actorId) returning a decision containing group, role, error code, and error message.
- Produces GroupStatusPolicy.CanMaterializeAsync(Guid groupId) for non-user recurring writes.

- [ ] **Step 1: Write failing policy and default tests**

~~~csharp
[Fact]
public async Task LifecyclePolicy_OpeningAllowsMember_LockAllowsOnlyOwner_ClosedRejectsAllWrites()
{
    // Seed owner and member, then assert CheckWriteAsync at each persisted status.
    Assert.True(openMember.Allowed);
    Assert.False(lockMember.Allowed);
    Assert.True(lockOwner.Allowed);
    Assert.False(closedOwner.Allowed);
}
~~~

Also add a test proving a new Group has Status equal to opening and the migration default is represented in the provider migrations.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `dotnet test SplitShare.sln --filter FullyQualifiedName~GroupStatusTests`

Expected: FAIL because Group.Status and GroupStatusPolicy do not exist.

- [ ] **Step 3: Add Group.Status, map its constrained default, and implement GroupStatusPolicy**

Use normalized lowercase values opening, locked, and closed. Return GROUP_READ_ONLY for lifecycle denials and preserve NOT_FOUND/FORBIDDEN for missing groups and non-members. Register the policy in DI and generate both provider migrations from the updated model.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `dotnet test SplitShare.sln --filter FullyQualifiedName~GroupStatusTests`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add api/Models/Entities.cs api/Data/AppDbContext.cs api/Groups/GroupStatusPolicy.cs api/Migrations tests/GroupStatusTests.cs api/Program.cs
git commit -m "feat: add group lifecycle policy"
~~~

### Task 2: Enforce lifecycle policy in expenses and payments

**Files:**
- Modify: api/Expenses/ExpenseService.cs
- Modify: api/Payments/PaymentService.cs
- Modify: api/Endpoints/ExpenseEndpoints.cs
- Modify: api/Endpoints/PaymentEndpoints.cs
- Modify: tests/ExpenseTests.cs
- Modify: tests/PaymentTests.cs

**Interfaces:**
- Consumes GroupStatusPolicy.CheckWriteAsync and its GROUP_READ_ONLY decision.
- Produces lifecycle-safe create, update, delete, image upload/delete, record payment, reverse payment, and payment-proof upload behavior.

- [ ] **Step 1: Write failing direct-service tests for lifecycle-protected writes**

~~~csharp
[Theory]
[InlineData("locked", "member", false)]
[InlineData("locked", "owner", true)]
[InlineData("closed", "owner", false)]
public async Task ExpenseWrites_RespectGroupLifecycle(string status, string role, bool allowed) { ... }
~~~

Add equivalent payment record/reverse/proof cases. Assert blocked calls return GROUP_READ_ONLY before any ledger, file, or row mutation.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~ExpenseTests|FullyQualifiedName~PaymentTests"`

Expected: FAIL because locked/closed writes currently use only membership and expense/payment status checks.

- [ ] **Step 3: Integrate the policy before each write path**

Inject GroupStatusPolicy into ExpenseService and PaymentService. Apply it inside the existing guards, including expense image operations and payment reversal. For direct payment-proof upload, check policy before accepting or storing the file. Map GROUP_READ_ONLY to HTTP 403 in both endpoint result mappers.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~ExpenseTests|FullyQualifiedName~PaymentTests"`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add api/Expenses/ExpenseService.cs api/Payments/PaymentService.cs api/Endpoints/ExpenseEndpoints.cs api/Endpoints/PaymentEndpoints.cs tests/ExpenseTests.cs tests/PaymentTests.cs
git commit -m "feat: enforce group lifecycle for expenses and payments"
~~~

### Task 3: Add status transition API and protect GroupService mutations

**Files:**
- Modify: api/Groups/GroupService.cs
- Modify: api/Endpoints/GroupEndpoints.cs
- Modify: tests/GroupTests.cs
- Modify: tests/ContractTests.cs

**Interfaces:**
- Consumes GroupStatusPolicy for standard group writes.
- Produces GroupService.SetStatusAsync(Guid actorId, Guid groupId, string status).
- Produces PATCH /api/v1/groups/{id}/status accepting StatusDto(string Status).
- Produces status in GET group list and group-detail DTOs.

- [ ] **Step 1: Write failing GroupService and contract tests**

~~~csharp
[Fact]
public async Task SetStatusAsync_OnlyOwnerCanChangeLifecycle_AndValidatesValues() { ... }

[Fact]
public async Task ClosedGroup_OnlyAllowsOwnerStatusTransition() { ... }
~~~

Assert opening is emitted from both list and detail DTO shapes, invalid status returns VALIDATION, a member receives FORBIDDEN for transitions, and an owner can reopen closed but cannot rename/invite/change settings/delete while closed.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~GroupTests|FullyQualifiedName~ContractTests"`

Expected: FAIL because no status endpoint/DTO field or status-aware GroupService guard exists.

- [ ] **Step 3: Implement the transition and policy-aware GroupService guard**

Keep SetStatusAsync owner-only and valid for all three values even when the group is closed. Route every other GroupService mutation through the policy: member/invite operations, rename/settings, roles/deposits, flat fee, sharing, invite rotation, leave/remove, and deletion. Preserve each method’s existing role checks after lifecycle authorization.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~GroupTests|FullyQualifiedName~ContractTests"`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add api/Groups/GroupService.cs api/Endpoints/GroupEndpoints.cs tests/GroupTests.cs tests/ContractTests.cs
git commit -m "feat: add group status transition API"
~~~

### Task 4: Cover category, recurring, and collaboration mutation paths

**Files:**
- Modify: api/Groups/CategoryService.cs
- Modify: api/Endpoints/RecurringEndpoints.cs
- Modify: api/Services/RecurringService.cs
- Modify: api/Endpoints/TripPackEndpoints.cs
- Modify: api/Endpoints/PaymentEndpoints.cs
- Modify: tests/GroupTests.cs
- Modify: tests/TripPackTests.cs

**Interfaces:**
- Consumes GroupStatusPolicy.CheckWriteAsync and CanMaterializeAsync.
- Produces lifecycle-safe category, recurring, comment/nudge, and payment-proof mutations.

- [ ] **Step 1: Write failing tests for the remaining mutation families**

Add tests that a member cannot add/rename/delete categories or recurring rules in Lock; a Closed owner cannot make those writes; owner operations remain allowed in Lock; and a due recurring rule in Lock/Closed neither creates an expense nor advances/deactivates the rule.

Add comment/nudge and payment-proof tests asserting direct requests return GROUP_READ_ONLY with no new row/file.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~GroupTests|FullyQualifiedName~TripPackTests|FullyQualifiedName~PaymentTests"`

Expected: FAIL because these endpoint/service paths only use current membership/role checks.

- [ ] **Step 3: Apply GroupStatusPolicy at each remaining write boundary**

Inject the policy into CategoryService and RecurringService. Pass or resolve it in direct recurring, TripPack, and payment-proof endpoint writes. For materialization, leave the rule untouched when status is locked or closed so it can run after reopening.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `dotnet test SplitShare.sln --filter "FullyQualifiedName~GroupTests|FullyQualifiedName~TripPackTests|FullyQualifiedName~PaymentTests"`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add api/Groups/CategoryService.cs api/Endpoints/RecurringEndpoints.cs api/Services/RecurringService.cs api/Endpoints/TripPackEndpoints.cs api/Endpoints/PaymentEndpoints.cs tests/GroupTests.cs tests/TripPackTests.cs tests/PaymentTests.cs
git commit -m "feat: protect group collaboration by lifecycle"
~~~

### Task 5: Render and manage lifecycle status in the web app

**Files:**
- Create: web/test/group-status.test.mjs
- Modify: web/src/pages/GroupDetail.jsx
- Modify: web/src/pages/Dashboard.jsx
- Modify: web/src/i18n/messages.js
- Modify: web/src/styles.css

**Interfaces:**
- Consumes group.status from GET list/detail responses.
- Sends PATCH /api/v1/groups/{id}/status with { status }.
- Produces shared status labels/classes: opening, locked, closed.

- [ ] **Step 1: Write failing rendered UI tests**

~~~js
test('owner sees lifecycle selector while members see a read-only badge', () => {
  // Opening, Lock, and Closed labels map to opening, locked, closed values.
});

test('group cards expose the lifecycle badge and closed UI removes write actions', () => {
  // Render a closed member view and assert no add/edit/payment action is actionable.
});
~~~

Include a stale-update rejection test: simulate the PATCH failure, assert the selected value resets to persisted detail.status and the error is shown.

- [ ] **Step 2: Run the focused web test to verify it fails**

Run: `node --test test/group-status.test.mjs` from web/

Expected: FAIL because lifecycle UI, copy, and test module do not exist.

- [ ] **Step 3: Implement lifecycle presentation and owner transitions**

Add localized labels/descriptions in English and Vietnamese. Add a reusable status label helper local to the group UI, render a compact badge in GroupDetail and GroupTile, and show the status Select only to owners. Disable/hide member write controls in locked/closed states, retain owner actions in Lock, and retain only status transition controls in Closed. On successful PATCH reload group detail; on error reload before presenting the API error.

- [ ] **Step 4: Add responsive lifecycle styling without changing unrelated desktop card design**

Style Opening as quiet, Lock as warning, and Closed as neutral/closed. Keep badges legible on dark/mobile views and make the owner status control fit the existing mobile Group detail hierarchy.

- [ ] **Step 5: Run focused web tests to verify they pass**

Run: `node --test test/group-status.test.mjs` from web/

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add web/src/pages/GroupDetail.jsx web/src/pages/Dashboard.jsx web/src/i18n/messages.js web/src/styles.css web/test/group-status.test.mjs
git commit -m "feat: show and manage group lifecycle status"
~~~

### Task 6: Run complete verification and review migration output

**Files:**
- Modify: only files required by failures discovered during verification.

**Interfaces:**
- Consumes all earlier tasks.
- Produces verified backend migrations, API behavior, and production frontend bundle.

- [ ] **Step 1: Run the full backend suite**

Run: `dotnet test SplitShare.sln`

Expected: PASS with no lifecycle regressions.

- [ ] **Step 2: Run web regression and production build**

Run: `node --test test/category-management-layout.test.mjs && npm test -- --run && npm run build` from web/

Expected: targeted UI tests and build PASS. Record any pre-existing failure in googleReturn.test.mjs separately rather than attributing it to lifecycle work.

- [ ] **Step 3: Validate both migration families and diff hygiene**

Run: `dotnet ef migrations list --project api --startup-project api` and the provider-specific migration validation commands already used by this repository, followed by `git diff --check`.

Expected: both new migrations load and diff check emits no whitespace errors.

- [ ] **Step 4: Commit final corrections if verification required any**

~~~bash
git add <only files changed by verification fixes>
git commit -m "test: verify group lifecycle status"
~~~
