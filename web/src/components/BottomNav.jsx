import { useEffect, useState } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { api } from '../api.js';

const TEAL = '#0d9488';
const GRAY = '#94a3b8';

// Outline icons matching the mockup tab bar (no icon lib in this project;
// same inline-SVG precedent as Net.jsx ChevronRight).
function I({ children }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  );
}
const HomeIcon = () => (
  <I><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h4v-6h4v6h4V9.5" /></I>
);
const GroupsIcon = () => (
  <I><rect x="4" y="4" width="7" height="16" rx="1.5" /><rect x="13" y="4" width="7" height="16" rx="1.5" /></I>
);
const AddIcon = () => (
  <I><circle cx="12" cy="12" r="8.5" /><path d="M12 8.5v7M8.5 12h7" /></I>
);
const ActivityIcon = () => (
  <I><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.5 2" /></I>
);
const YouIcon = () => (
  <I>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 9.5h.01M15 9.5h.01" />
    <path d="M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2" />
  </I>
);

function Tab({ label, icon, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      style={{
        flex: 1,
        background: 'none',
        border: 0,
        padding: '8px 0 6px',
        minHeight: 56,
        minWidth: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        color: active ? TEAL : GRAY,
        cursor: 'pointer',
      }}
    >
      {icon}
      <Text component="span" size="xs" fw={active ? 700 : 500} style={{ color: 'inherit' }}>
        {label}
      </Text>
    </Box>
  );
}

// Bottom tab bar (all screens). Rendered by Shell; always visible so the
// primary nav never disappears across breakpoints.
export function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const path = loc.pathname;
  // Instant tap feedback: the clicked tab highlights immediately, then the
  // location-derived value takes over on navigation (cleared below).
  const [sel, setSel] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(null); }, [path, loc.hash, loc.key]);
  // Location-derived tab. Activity deep-links to a group page carrying
  // state.tab, so it must resolve to 'activity' — never fall back to 'groups'.
  // Add is an action opening the dashboard wizard (state.openNew).
  const base = path === '/'
    ? (loc.state?.openNew ? 'add' : loc.hash === '#groups' ? 'groups' : 'home')
    : path === '/profile' ? 'you'
      : path.startsWith('/groups')
        ? (loc.state?.tab === 'activity' ? 'activity' : 'groups')
        : null;
  const active = sel ?? base;

  const goHome = () => { setSel('home'); nav('/'); };
  const goGroups = () => {
    setSel('groups');
    if (path === '/') {
      document.getElementById('groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (loc.hash !== '#groups') nav({ pathname: '/', hash: '#groups' }, { replace: true });
    } else {
      nav({ pathname: '/', hash: '#groups' });
    }
  };

  // Global Add opens the dashboard new-group wizard (Dashboard consumes
  // location.state.openNew, same pattern as GroupDetail copyFrom).
  const goAdd = () => { setSel('add'); nav('/', { state: { openNew: true } }); };

  // No global activity feed exists; jump to the most outstanding group's
  // Activity tab (GroupDetail consumes location.state.tab).
  const goActivity = async () => {
    setSel('activity');
    try {
      const d = await api.get('/api/v1/me/balances');
      const list = d.groups || [];
      const target = list.find((g) => g.net_cents !== 0) || list[0];
      if (!target) {
        notifications.show({ title: 'No groups yet', message: 'Create a group to see activity.', color: 'teal' });
        return;
      }
      nav(`/groups/${target.group_id}`, { state: { tab: 'activity' } });
    } catch {
      notifications.show({ title: 'Could not load activity', color: 'red' });
    }
  };

  return (
    <Box
      component="nav"
      aria-label="Primary"
      className="bottom-nav"
      pos="fixed"
      bottom={0}
      left={0}
      right={0}
      style={{
        zIndex: 100,
        background: '#fff',
        borderTop: '1px solid var(--mantine-color-gray-3)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <Group gap={0} grow wrap="nowrap">
        <Tab label="Home" icon={<HomeIcon />} active={active === 'home'} onClick={goHome} />
        <Tab label="Groups" icon={<GroupsIcon />} active={active === 'groups'} onClick={goGroups} />
        <Tab label="Add" icon={<AddIcon />} active={active === 'add'} onClick={goAdd} />
        <Tab label="Activity" icon={<ActivityIcon />} active={active === 'activity'} onClick={goActivity} />
        <Tab label="You" icon={<YouIcon />} active={active === 'you'} onClick={() => { setSel('you'); nav('/profile'); }} />
      </Group>
    </Box>
  );
}
