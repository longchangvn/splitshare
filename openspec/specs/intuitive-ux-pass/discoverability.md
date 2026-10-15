## Purpose

Make every navigable group recognizably tappable and give the dashboard distinct boxed compartments. Presentation only.

## ADDED Requirements

### Requirement: Whole-card group navigation
Each group card navigates to group detail from anywhere on the card, with a trailing chevron icon, visible hover lift, and keyboard focus (Enter/Space).

#### Scenario: Mouse user discovers details
- **WHEN** hovering a group card
- **THEN** the card lifts/highlights and a chevron signals more content

#### Scenario: Keyboard user navigates
- **WHEN** tabbing to a group card and pressing Enter
- **THEN** group detail opens (focus ring visible, no nested-interactive conflict with the owe badge)

### Requirement: Boxed dashboard layout
Dashboard renders three titled boxes — Balances (per-currency cards with icons), Groups (tappable cards), Quick actions (New group button) — each visually distinct.

#### Scenario: First-time scan
- **WHEN** the dashboard loads with data
- **THEN** balances, groups, and actions read as separate boxed areas with icon + title headers
