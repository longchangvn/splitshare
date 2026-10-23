# Tasks: Quick "Add expense" floating button

- [X] T001 Pure flow helpers in `web/src/quickAdd.js`
- [X] T002 [P] `quickAdd.*` i18n keys (en + vi) in `web/src/i18n/messages.js`
- [X] T003 [P] FAB / picker styles in `web/src/styles.css`
- [X] T004 `QuickAddExpense` component in `web/src/components/QuickAddExpense.jsx` (depends T001–T003)
- [X] T005 `GroupDetail` consumes `location.state.addExpense` to open New expense (Flow 2 target)
- [X] T006 `Dashboard` renders FAB; Flow 1 pre-fills `GroupWizard` (expense mode, Next label, skip success, picked people always visible); Flow 3 navigation (depends T004, T005)
- [X] T007 Tests `web/test/quick-add-expense.test.mjs`
- [X] T008 Verify: all `web/test/*.mjs`, `googleReturn.test.mjs`, `vite build`
- [X] T009 Docs: README web feature note
