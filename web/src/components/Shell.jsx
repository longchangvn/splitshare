import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, Avatar, Box, Group, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '../auth.jsx';
import { initialsOf, pastelFor } from './Net.jsx';
import { BottomNav, usePrimaryNav } from './BottomNav.jsx';

const COLLAPSE_KEY = 'ss-nav-collapsed';

export function BrandMark({ size = 22 }) {
  const maskId = `brand-socket-${useId().replace(/:/g, '')}`;
  const h = Math.round((size * 48) / 42);
  return (
    <svg className="brand-mark" viewBox="0 0 42 48" width={size} height={h} aria-hidden>
      <defs>
        <mask id={maskId}>
          <rect width="42" height="48" fill="#fff" />
          <circle cx="22" cy="24" r="7.5" fill="#000" />
        </mask>
      </defs>
      <rect className="piece-a" x="2" y="8" width="16" height="32" rx="8" />
      <circle className="piece-a" cx="20" cy="24" r="7.5" />
      <rect className="piece-b" x="22" y="8" width="16" height="32" rx="8" mask={`url(#${maskId})`} />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg className="collapse-chevron" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function Shell({ children }) {
  const { user } = useAuth();
  const onProfile = useLocation().pathname === '/profile';
  const items = usePrimaryNav();
  const isDesktop = useMediaQuery('(min-width: 48em)');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const avatarPastel = pastelFor(user?.display_name || user?.username || '?');

  return (
    <AppShell
      className={collapsed ? 'shell-collapsed' : 'shell-expanded'}
      layout="alt"
      transitionDuration={340}
      transitionTimingFunction="cubic-bezier(0.22, 1, 0.36, 1)"
      header={{ height: 62, collapsed: !!isDesktop }}
      navbar={{
        width: collapsed ? 104 : 292,
        breakpoint: 'sm',
        collapsed: { mobile: true },
      }}
      padding={{ base: 12, sm: 18 }}
    >
      <AppShell.Header className="mobile-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" className="mobile-header-inner">
          <Link to="/" className="brand-logo is-light mobile-brand" aria-label="SplitShare">
            <BrandMark size={26} />
            <span className="brand-word">SplitShare</span>
          </Link>
          <Link
            to="/profile"
            className={`mobile-avatar${onProfile ? ' is-active' : ''}`}
            aria-label={user ? `${user.display_name} account` : 'Account'}
            aria-current={onProfile ? 'page' : undefined}
            style={{ '--av-from': avatarPastel.from, '--av-to': avatarPastel.to }}
          >
            <span className="mobile-avatar-ring">
              <span className="mobile-avatar-face">
                {user ? initialsOf(user.display_name) : '?'}
              </span>
            </span>
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Box component="nav" className="sidebar-card" aria-label="Primary">
          <Group className="sidebar-brand" wrap="nowrap" gap={0}>
            <Link to="/" className="brand-logo" aria-label="SplitShare">
              <BrandMark />
              <span className="brand-word">SplitShare</span>
            </Link>
            <button
              type="button"
              className="sidebar-collapse"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              <CollapseIcon />
            </button>
          </Group>

          <Box className="sidebar-links">
            {items.map((item) => (
              <Tooltip key={item.id} label={item.label} position="right" disabled={!collapsed} openDelay={300}>
                <button
                  type="button"
                  className="side-link"
                  aria-current={item.active ? 'page' : undefined}
                  aria-label={item.label}
                  onClick={item.onClick}
                >
                  <span className="side-icon">{item.icon}</span>
                  <span className="side-label">{item.label}</span>
                </button>
              </Tooltip>
            ))}
          </Box>

          {user && (
            <Box className="sidebar-user">
              <Group
                gap={10}
                wrap="nowrap"
                component={Link}
                to="/profile"
                className="sidebar-account"
                aria-current={onProfile ? 'page' : undefined}
                aria-label={user.display_name}
              >
                <Avatar className="sidebar-avatar" color="teal" radius="xl">{initialsOf(user.display_name)}</Avatar>
                <Box className="sidebar-account-copy" aria-hidden={collapsed}>
                  <Text size="sm" fw={700} truncate>{user.display_name}</Text>
                  <Text className={user.email_verified ? 'sidebar-verify is-ok' : 'sidebar-verify'} size="xs" truncate>
                    {user.email_verified ? 'Email verified' : 'Email not verified'}
                  </Text>
                </Box>
              </Group>
            </Box>
          )}
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box className="app-stage">
          <Box className="app-stage-scroll">
            {children}
            <Box className="mobile-spacer" h={76} aria-hidden />
          </Box>
        </Box>
      </AppShell.Main>
      <BottomNav />
    </AppShell>
  );
}
