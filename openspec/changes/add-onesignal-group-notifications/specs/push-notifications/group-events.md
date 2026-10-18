## Purpose

When a member creates an expense or records a payment, every other current member of that group receives a push notification in real time.

## ADDED Requirements

### Requirement: Notify group on expense creation
After `ExpenseService.CreateAsync` persists an expense, it best-effort fires one notification to all current `GroupMembers` of the group **excluding the actor**. Title/actor wording follows "who did what" (e.g. "Alice added an expense"), body includes the title and amount, `Url` deep-links to the group. Send is fire-and-forget and wrapped so any provider exception is logged and never fails or delays the expense response. Idempotent replays (endpoint `Idempotency-Key` short-circuit) do not re-send.

#### Scenario: New expense fans out to the rest of the group
- **WHEN** Alice (group member) creates expense "Dinner $45.20" in a group with Bob and Carol
- **THEN** Bob and Carol are targeted with one notification each; Alice is not targeted

#### Scenario: Notification failure never breaks the expense
- **WHEN** the notification provider throws or times out during expense creation
- **THEN** the expense is still created and the API returns success (201)

#### Scenario: No self-notification
- **WHEN** the actor creates an expense in a two-person group
- **THEN** the only other member is targeted and the actor's own subscription receives nothing

### Requirement: Notify group on payment recording
After `PaymentService.RecordAsync` persists a payment, it fires the same best-effort notification to all current group members except the actor, with payment wording (e.g. "Bob recorded a payment").

#### Scenario: Payment fans out to the rest of the group
- **WHEN** Bob records a payment of $30 in a group with Alice and Carol
- **THEN** Alice and Carol are targeted; Bob is not
