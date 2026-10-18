import { Box, Group } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../prefs.jsx';
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
    <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2.1" />
    <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="2.1" />
    <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2.1" />
    <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2.1" />
  </I>
);
export const GroupsIcon = () => (
  <I>
    <rect x="7" y="3.6" width="13.2" height="13.2" rx="3" />
    <path d="M5.2 8.4A2.8 2.8 0 0 0 3.6 11v7.2A3.2 3.2 0 0 0 6.8 21.4h7.4a2.8 2.8 0 0 0 2.6-1.8" />
  </I>
);
export const ActivityIcon = () => (
  <I>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8.2V12l2.7 1.7" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </I>
);
export const SettingsIcon = () => (
  <I>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.9 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </I>
);

export function usePrimaryNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const path = loc.pathname;
  const active = path === '/activity' ? 'activity'
    : path === '/settings' || path.startsWith('/settings/') ? 'settings'
    : path === '/groups' || path.startsWith('/groups/') ? 'groups'
      : path === '/' ? 'home' : null;

  return [
    { id: 'home', label: t('nav.dashboard'), short: t('nav.home'), icon: <HomeIcon />, active: active === 'home', onClick: () => nav('/') },
    { id: 'groups', label: t('nav.groups'), short: t('nav.groups'), icon: <GroupsIcon />, active: active === 'groups', onClick: () => nav('/groups') },
    { id: 'activity', label: t('nav.activity'), short: t('nav.activity'), icon: <ActivityIcon />, active: active === 'activity', onClick: () => nav('/activity') },
    { id: 'settings', label: t('nav.settings'), short: t('nav.settings'), icon: <SettingsIcon />, active: active === 'settings', onClick: () => nav('/settings') },
  ];
}

function Tab({ label, icon, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      className={`bottom-nav-tab${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      <span className="bottom-nav-icon">{icon}</span>
      {active && <span className="bottom-nav-label">{label}</span>}
    </Box>
  );
}

export function BottomNav() {
  const items = usePrimaryNav();
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
