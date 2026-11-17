import { Box, Group } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../prefs.jsx';
import { addExpenseTarget } from '../quickAdd.js';
function I({ children }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block', flex: 'none' }}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <I>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M10 3.5v17M10 12h10.5" />
  </I>
);
export const GroupsIcon = () => (
  <I>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c.6-3.1 3-5 6-5s5.4 1.9 6 5" />
    <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.6 14.8c1.9.6 3.1 2.3 3.4 4.7" />
  </I>
);
export const ActivityIcon = () => (
  <I>
    <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6" />
    <path d="M3.4 3.8v4.4h4.4" />
    <path d="M12 7.8V12l3 1.8" />
  </I>
);
export const BalancesIcon = () => (
  <I>
    <path d="M18 7.5V5.8A2.3 2.3 0 0 0 15.7 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18 7.5H6" />
    <rect x="13" y="11" width="7.5" height="5" rx="1.6" />
    <circle cx="15.8" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
  </I>
);
export const ArchivedIcon = () => (
  <I>
    <rect x="3" y="3.8" width="18" height="5" rx="1.6" />
    <path d="M4.8 8.8v9.4a2.3 2.3 0 0 0 2.3 2.3h9.8a2.3 2.3 0 0 0 2.3-2.3V8.8" />
    <path d="M10 12.6h4" />
  </I>
);
export const AddExpenseIcon = () => (
  <I>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </I>
);

/** Primary destinations. `side` = desktop sidebar, `bottom` = mobile tab bar. */
export function usePrimaryNav({ placement = 'side' } = {}) {
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const path = loc.pathname;
  const active = path === '/activity' ? 'activity'
    : path === '/balances' ? 'balances'
      : path === '/archived' ? 'archived'
        : path === '/groups' || path.startsWith('/groups/') ? 'groups'
          : path === '/' ? 'home' : null;

  const add = () => {
    const { to, state } = addExpenseTarget(path);
    nav(to, { state });
  };
  const items = [
    { id: 'home', label: t('nav.dashboard'), short: t('nav.home'), icon: <HomeIcon />, onClick: () => nav('/') },
    { id: 'groups', label: t('nav.groups'), short: t('nav.groups'), icon: <GroupsIcon />, onClick: () => nav('/groups') },
    { id: 'add', label: t('quickAdd.fab'), short: t('quickAdd.fab'), icon: <AddExpenseIcon />, onClick: add, bottomOnly: true },
    { id: 'activity', label: t('nav.activity'), short: t('nav.activity'), icon: <ActivityIcon />, onClick: () => nav('/activity'), sideOnly: true },
    { id: 'balances', label: t('nav.balances'), short: t('nav.balances'), icon: <BalancesIcon />, onClick: () => nav('/balances') },
    { id: 'archived', label: t('nav.archived'), short: t('nav.archived'), icon: <ArchivedIcon />, onClick: () => nav('/archived') },
  ];
  return items
    .filter((x) => (placement === 'bottom' ? !x.sideOnly : !x.bottomOnly))
    .map((x) => ({ ...x, active: active === x.id }));
}

function Tab({ id, label, icon, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      className={`bottom-nav-tab${active ? ' is-active' : ''} is-${id}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      <span className="bottom-nav-icon">{icon}</span>
      <span className="bottom-nav-label">{label}</span>
    </Box>
  );
}

export function BottomNav() {
  const items = usePrimaryNav({ placement: 'bottom' });
  const t = useT();
  return (
    <Box
      component="nav"
      aria-label={t('shell.primaryNav')}
      className="bottom-nav no-print"
      pos="fixed"
      bottom={0}
      left={0}
      right={0}
      style={{
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <Group className="bottom-nav-dock" gap={4} justify="center" wrap="nowrap">
        {items.map((item) => (
          <Tab
            key={item.id}
            id={item.id}
            label={item.short}
            icon={item.icon}
            active={item.active}
            onClick={item.onClick}
          />
        ))}
      </Group>
    </Box>
  );
}
