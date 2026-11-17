// SplitEase-only group screens + feature flags (group page, forms, modals).
// Flags are read by shared components via useAppTheme().features; classic defines none,
// so every gated branch falls back to the classic markup.
import { GroupDetail } from '../../../pages/GroupDetail.jsx';

// Rendered lazily by the router, so the GroupDetail binding is only touched at render time
// (themes/index.js → manifest → this file → GroupDetail.jsx is an import cycle).
function GroupSettingsRoute() {
  return <GroupDetail view="settings" />;
}

export const routes = [
  { path: '/groups/:id/settings', element: <GroupSettingsRoute /> },
];

export const nav = [];

export const features = {
  // Group page
  heroActions: true, // desktop action buttons live inside the header card
  yourNet: true, // "your net" + peer balances card from /groups/:id/me
  ledgerByDate: true, // ledger cards grouped by day with daily totals + lent/borrowed labels
  closedBanner: true, // closed (read-only) group banner with per-member settled list
  groupSettings: true, // /groups/:id/settings page + header settings link
  // Forms / modals
  expenseCards: true, // add/edit expense: category chips, payer tiles, allocation banner
  payRoute: true, // record payment: payer → recipient header card
  paymentRecorded: true, // success view after a payment is recorded
  inviteQr: true, // QR code of the invite link (invite modal + invite page)
};
