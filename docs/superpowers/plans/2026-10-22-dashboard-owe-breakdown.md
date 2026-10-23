# Dashboard "You owe" / "Owed to you" breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard "You owe" and "Owed to you" stat cards clickable. Clicking a card expands an inline collapsible panel listing, per currency, every person involved and the amount — "who do I owe and how much" / "who owes me and how much" — aggregated across all groups, with each contributing group shown as a link.

**Architecture:** The all-groups balances payload (`GET /api/v1/me/balances`) gains a per-group, per-person raw-debt breakdown (`owes[]`, `owed_to_me[]`) computed from the same expense/split/payment snapshot the endpoint already loads, so the API change is additive and costs no extra queries. The web dashboard turns the two stat cards into buttons that toggle an inline breakdown panel spanning the grid; the panel aggregates the raw per-pair debts per person per currency in the client and renders person rows with group links.

**Tech Stack:** ASP.NET Core minimal APIs, EF Core, xUnit, React 18, Mantine 7, Vite, Node test runner, plain CSS (styles.css) with `[data-ss-theme="dark"]` overrides.

**Spec:** Derived from `openspec/specs/splitshare-v1/ledger-views.md` (per-group and all-groups balances; never summed across currencies) and `openspec/specs/splitshare-v1/web-app.md` (collapsible, `aria-expanded`).

## Global Constraints

- Amounts are integer cents; every currency is rendered in its own section and **never summed across currencies** (existing invariant, preserved).
- Breakdown amounts are **raw payer-based debts**: a member owes a payer the member's share of that payer's open expenses, reduced by payments between the two. They are **not** settlement-optimizer transfers (`BuildMeAsync` keeps its current transfer-based behavior untouched).
- Per person the raw debt is **netted across groups** within a currency before display: `net = sum(owed_to_me) - sum(owes)`. Positive → "Owed to you" panel; negative → "You owe" panel. A person can therefore appear in at most one panel per currency.
- Known, accepted consequence: the breakdown rows net *people*, while the headline totals net *groups*; with mixed-position people the breakdown column may not sum exactly to the headline figure. Do not "fix" this by re-summing groups — it is inherent to the chosen net-per-person view.
- API change must be **purely additive** (new optional fields with empty-list defaults): the mobile app (`mobile/src/screens/HomeScreen.js`) consumes the same endpoint and must not break.
- All new UI strings require both English and Vietnamese entries in `web/src/i18n/messages.js`.
- Collapsible controls must expose `aria-expanded` and `aria-controls` (repo accessibility convention, `requirements-splitshare.md`).
- Web-only scope: do not change `mobile/`.

## Review Focus

- A member who owes Ana in one group and is owed by Ana in another sees a single netted row for Ana in the correct panel; add a `LedgerViewTests` case in Task 1 covering the both-directions netting.
- Payments between two members reduce their raw pair debt (an expense fully repaid by a payment yields no row); add a test in Task 1.
- A group currency with no owe/owed rows emits empty lists, not nulls, so existing consumers of `/me/balances` see no shape change; add a contract assertion in Task 1.
- Multi-currency users see separate sections with the "never summed" footnote; add web test coverage in Task 4.
- Collapse/expand is keyboard operable and reports `aria-expanded`; add web test coverage in Task 4.

## File structure

- api/Services/LedgerService.cs — extend `GroupNets` with pairwise raw debts; extend `GroupRow` with `List<OweTo> Owes` and `List<OwedFrom> OwedToMe` (default empty).
- tests/LedgerViewTests.cs — new facts on `BuildAllAsync` raw-debt breakdown.
- web/src/pages/Dashboard.jsx — card buttons, open state, aggregation, panel.
- web/src/styles.css — `.dash-stat.is-clickable`, `.dash-breakdown`, `.dash-person-*`, chevron, dark mode.
- web/src/i18n/messages.js — new keys (EN + VI).
- web/test/dashboard-owe-breakdown.test.mjs — new node test script.

### Task 1: Compute raw per-person debts in the all-groups balances payload

**Files:**
- Modify: api/Services/LedgerService.cs
- Modify: tests/LedgerViewTests.cs

**Interfaces:**
- Consumes the expense/split/payment snapshot already loaded by `ComputeNetsAsync`.
- Produces pairwise raw debts on `GroupNets` and, per requesting user, `GroupRow.Owes: List<OweTo>` / `GroupRow.OwedToMe: List<OwedFrom>` in `BuildAllAsync`'s JSON (`owes`, `owed_to_me`, snake_case like existing fields).

- [x] **Step 1: Write failing tests for the raw-debt breakdown**

~~~csharp
[Fact]
public async Task All_RawDebtBreakdown_PayerBased_AndPaymentAdjusted()
{
    // A pays a 30m expense split A/B; B's raw debt to A = 1500.
    // B then pays A 500 -> B's row becomes 1000; A's owed_to_me reflects 1000.
}

[Fact]
public async Task All_RawDebtBreakdown_NetsPersonAcrossGroups()
{
    // B owes Ana 1500 in group USD; Ana owes B 500 in group EUR-equivalent same-currency group.
    // Assert B sees Ana once, netted: 1000 in owes, and NOT in owed_to_me.
}

[Fact]
public async Task All_RawDebtBreakdown_EmptyListsWhenNoDebts()
{
    // Settled group -> Owes and OwedToMe are empty lists, Totals unchanged.
}
~~~

- [x] **Step 2: Run the focused test to verify it fails**

Run: `dotnet test SplitShare.sln --filter FullyQualifiedName~LedgerViewTests`

Expected: FAIL because `GroupRow` has no `Owes`/`OwedToMe` fields.

- [x] **Step 3: Implement pairwise raw debts inside the existing snapshot pass**

In `ComputeNetsAsync` (already iterates every expense split and payment), accumulate per-pair signed amounts: `pair[(debtor, creditor)] += share` for each split where `share > 0 && debtor != payer`; `pair[(from, to)] -= amount` for each open payment. Carry the resulting map on `GroupNets` (no new DB queries). In `BuildAllAsync`, for the requesting user derive `OweTo` entries (pair amount > 0) and `OwedFrom` entries (pair amount < 0, mirrored sign), netted per counterparty, names resolved from the snapshot's user dictionary. Do not alter totals computation or `BuildMeAsync`.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `dotnet test SplitShare.sln --filter FullyQualifiedName~LedgerViewTests`

Expected: PASS.

- [x] **Step 5: Commit**

~~~bash
git add api/Services/LedgerService.cs tests/LedgerViewTests.cs
git commit -m "feat: add raw per-person debt breakdown to me/balances"
~~~

### Task 2: Make the dashboard stat cards clickable and render the breakdown panel

**Files:**
- Modify: web/src/pages/Dashboard.jsx

**Interfaces:**
- Consumes `data.groups[].owes` / `data.groups[].owed_to_me` from `GET /api/v1/me/balances`.
- Produces toggleable stat cards (`<button>`, `aria-expanded`, `aria-controls`, chevron) and an inline `.dash-breakdown` panel inside `.dash-grid` spanning all columns.

- [x] **Step 1: Write failing rendered markup assertions**

~~~js
test('owe and owed cards are buttons exposing aria-expanded', () => { ... });
test('clicking the owe card renders the breakdown panel with person rows', () => { ... });
~~~

(See Task 4 for the test file; create it here with the card-state assertions so the markup contract drives implementation.)

- [x] **Step 2: Run the focused web test to verify it fails**

Run: `node --test test/dashboard-owe-breakdown.test.mjs` from web/

Expected: FAIL because the test module and panel do not exist.

- [x] **Step 3: Implement card buttons, open state, aggregation, and panel**

Add `const [openPanel, setOpenPanel] = useState(null)` ('owe' | 'owed' | null). Aggregate client-side: iterate `groups`, for each currency accumulate `personNet[currency][user_id] += -amount_cents` for `owes` entries and `+= amount_cents` for `owed_to_me` entries, keeping the display name and the set of contributing `{group_id, name}` links. Sort rows by descending absolute amount, tie-break by name. Render one panel (whichever card is open) as a `<section className="dash-card dash-breakdown">` inserted in `.dash-grid` directly after the two stat cards with `grid-column: 1 / -1`. Person row: initials avatar via `initialsOf`/`pastelFor` from `components/Net.jsx`, name, per-currency amount via `fmt`, group chips as `<Link to={/groups/:id}>`. Empty state uses existing dimmed copy; loading keeps `MoneyShimmer` on the cards and shows the panel skeleton only when open.

- [x] **Step 4: Run the focused web test to verify it passes**

Run: `node --test test/dashboard-owe-breakdown.test.mjs` from web/

Expected: PASS.

- [x] **Step 5: Commit**

~~~bash
git add web/src/pages/Dashboard.jsx
git commit -m "feat: add clickable owe/owed breakdown to dashboard"
~~~

### Task 3: Style the clickable cards and breakdown panel

**Files:**
- Modify: web/src/styles.css

**Interfaces:**
- Consumes class names from Task 2 (`is-clickable`, `dash-breakdown`, `dash-person-row`, `dash-group-chip`, `dash-chevron`).
- Produces hover/active/focus-visible affordance on the two stat cards, animated chevron rotation, panel and person-row layout, `[data-ss-theme="dark"]` overrides, and mobile stacking consistent with the existing `.dash-grid` responsive rules (~line 3480).

- [x] **Step 1: Add the styles, keeping existing card tones (`is-open`, `is-owed`, `is-settled`) unchanged**

Do not alter the shimmer animation or the ring gauge styles.

- [x] **Step 2: Verify visually against desktop and narrow widths, then commit**

~~~bash
git add web/src/styles.css
git commit -m "feat: style dashboard owe/owed breakdown panel"
~~~

### Task 4: Add i18n copy and complete the web tests

**Files:**
- Modify: web/src/i18n/messages.js
- Create (if not already created in Task 2): web/test/dashboard-owe-breakdown.test.mjs

**Interfaces:**
- Consumes `t()` keys used by the panel markup.
- Produces EN + VI entries for: breakdown section headings ("You owe" / "Owed to you" reuse `net.youOweShort` / `net.owedToYou`; add `dashboard.breakdownEmptyOwe`, `dashboard.breakdownEmptyOwed`, `dashboard.inGroups` chip tooltip, `dashboard.perCurrencyNote`, `dashboard.collapseBreakdown`, `dashboard.expandBreakdown`).

- [x] **Step 1: Add English and Vietnamese entries for every new key**

- [x] **Step 2: Write/extend failing web tests for multi-currency and a11y**

~~~js
test('multi-currency breakdown renders separate currency sections plus the never-summed note', () => { ... });
test('breakdown toggle reports aria-expanded and toggles closed', () => { ... });
test('all new i18n keys exist in both en and vi', () => { ... });
~~~

- [x] **Step 3: Run the focused web tests to verify they pass**

Run: `node --test test/dashboard-owe-breakdown.test.mjs` from web/

Expected: PASS.

- [x] **Step 4: Commit**

~~~bash
git add web/src/i18n/messages.js web/test/dashboard-owe-breakdown.test.mjs
git commit -m "feat: localize dashboard owe/owed breakdown"
~~~

### Task 5: Run complete verification

**Files:**
- Modify: only files required by failures discovered during verification.

- [x] **Step 1: Run the full backend suite**

Run: `dotnet test SplitShare.sln`

Expected: PASS with no regressions (additive DTO fields must not break `ContractTests`).

- [x] **Step 2: Run web regression and production build**

Run: `node --test test/dashboard-owe-breakdown.test.mjs test/dashboard-loading-shimmer.test.mjs && npm run build` from web/

Expected: PASS. Record any pre-existing unrelated failure separately rather than attributing it to this work.

- [x] **Step 3: Diff hygiene**

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 4: Commit final corrections if verification required any**

~~~bash
git add <only files changed by verification fixes>
git commit -m "test: verify dashboard owe/owed breakdown"
~~~
