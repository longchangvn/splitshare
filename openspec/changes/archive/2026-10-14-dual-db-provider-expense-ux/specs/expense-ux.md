## Purpose

Replace the error-prone `id:val` free-text split box with inline per-participant inputs, and add client-side expense copy. Wire contract unchanged.

## ADDED Requirements

### Requirement: Inline per-participant split inputs
For EXACT/PERCENT/SHARES, each checked participant shows a textbox beside their name; EQUAL shows none. The `id:val` box is removed.

#### Scenario: Type switch with prefill
- **WHEN** the user switches EQUAL → PERCENT with 4 participants checked
- **THEN** each box prefills 25 and switching back and forth preserves typed values where convertible

#### Scenario: Live running totals
- **WHEN** values are typed for a $100 EXACT expense
- **THEN** a running total (`sum = $98.50 of $100.00` / `97% of 100%`) updates per keystroke (debounced with preview)

#### Scenario: Edit mode prefill
- **WHEN** editing an existing PERCENT expense
- **THEN** boxes prefill from stored splits instead of starting empty

#### Scenario: Uncheck clears
- **WHEN** a participant is unchecked
- **THEN** their box value is stashed; rechecking restores it; unchecked users are excluded from submit and preview

### Requirement: Client-side expense copy
Expense detail offers Copy, opening the create form prefilled from the source; saving creates a new OPEN expense via existing endpoints.

#### Scenario: Copy recurring expense
- **WHEN** the user copies a settled group's dinner expense and saves
- **THEN** a new OPEN expense appears with title `Copy of X`, original payer (or me if they left), active participants only with a dropped-members notice, and identical split values

#### Scenario: Receipts carried over
- **WHEN** the source has receipt images
- **THEN** saving the copy downloads the source blobs and re-uploads them to the new expense; failures surface per-image without blocking the expense

#### Scenario: Copy from locked group allowed
- **WHEN** the source expense is LOCKED
- **THEN** copy still succeeds because it creates a new expense
