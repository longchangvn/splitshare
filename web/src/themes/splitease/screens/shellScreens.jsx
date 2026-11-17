// SplitEase-only shell screens + flags (see ./index.jsx for the contract).
import { BalancesScreen } from './BalancesScreen.jsx';
import { ArchivedScreen } from './ArchivedScreen.jsx';

export const routes = [
  { path: '/balances', element: <BalancesScreen /> },
  { path: '/archived', element: <ArchivedScreen /> },
];

// Appended after the core Dashboard / Groups / Activity items in the sidebar and bottom nav.
export const nav = [
  { id: 'balances', to: '/balances', labelKey: 'nav.balances', ms: 'account_balance_wallet' },
  { id: 'archived', to: '/archived', labelKey: 'nav.archived', ms: 'inventory_2' },
];

export const features = {
  // Shell.jsx: net-balance card at the sidebar foot.
  sidebarBalance: true,
  // BottomNav.jsx: every tab shows its label (flat bar), not only the active one.
  bottomNavLabels: true,
  // Dashboard.jsx: stat tiles + group cards + activity layout (components/shell/DashboardHome.jsx).
  dashboardTiles: true,
  // AuthPages.jsx: green brand panel beside the auth card.
  authBrandPanel: true,
  // SharePage.jsx: logo tile + wordmark header instead of the plain text brand.
  publicBrandHeader: true,
};
