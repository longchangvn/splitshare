## Purpose

Make dashboard, expense add/edit, and lists usable from narrow phones to laptops with fluid, mobile-first layouts. Presentation only; no contract change.

## ADDED Requirements

### Requirement: Fluid tables
Ledger and Balances tables scroll horizontally on narrow screens instead of squeezing or clipping.

#### Scenario: 360px ledger
- **WHEN** the ledger renders at 360px width
- **THEN** all 5 columns remain reachable via horizontal scroll with sticky first column optional, no overlapping text

### Requirement: Stacked expense rows
Participant checkbox+name+value rows stack (input full-width below the name) on small screens; split-type selector adapts (scroll/2×2) under sm.

#### Scenario: Inline split inputs at 360px
- **WHEN** EXACT mode with 5 participants renders at 360px
- **THEN** each value box is full-width and tappable without zooming

### Requirement: Fullscreen mobile modals and touch targets
Payment, invite, and new-group modals render fullscreen on small screens; row actions meet ~44px touch targets.

#### Scenario: Payment modal on phone
- **WHEN** opened under sm breakpoint
- **THEN** the modal fills the viewport and all fields are reachable without horizontal scroll
