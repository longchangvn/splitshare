import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppShell, Avatar, Box, Group, Modal, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '../auth.jsx';
import { usePrefs } from '../prefs.jsx';
import { LOCALE_META, LOCALES } from '../i18n/messages.js';
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

function SunIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.5 12H2.3M21.7 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M16.8 7.2l1.6-1.6M5.6 18.4l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.2 13.4A8.2 8.2 0 0 1 10.6 3.8 8.4 8.4 0 1 0 20.2 13.4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

export function Shell({ children }) {
  const { user } = useAuth();
  const { theme, toggleTheme, locale, setLocale, localeMeta, t } = usePrefs();
  const onProfile = useLocation().pathname === '/profile';
  const items = usePrimaryNav();
  const isDesktop = useMediaQuery('(min-width: 48em)');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const avatarPastel = pastelFor(user?.display_name || user?.username || '?');
  const themeLabel = theme === 'dark' ? t('shell.themeToLight') : t('shell.themeToDark');
  const langLabel = t('shell.language');

  const pickLocale = (next) => {
    setLocale(next);
    setLangOpen(false);
  };

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
          <Link to="/" className="brand-logo is-light mobile-brand" aria-label={t('shell.brand')}>
            <BrandMark size={26} />
            <span className="brand-word">{t('shell.brand')}</span>
          </Link>
          <Group gap={8} wrap="nowrap">
            <button
              type="button"
              className="mobile-pref-btn"
              aria-label={themeLabel}
              title={themeLabel}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className="mobile-pref-btn is-lang"
              aria-label={langLabel}
              title={langLabel}
              aria-haspopup="dialog"
              onClick={() => setLangOpen(true)}
            >
              <span className="lang-code">{localeMeta.code}</span>
            </button>
            <Link
              to="/profile"
              className={`mobile-avatar${onProfile ? ' is-active' : ''}`}
              aria-label={user ? t('shell.accountNamed', { name: user.display_name }) : t('shell.account')}
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
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Box component="nav" className="sidebar-card" aria-label={t('shell.primaryNav')}>
          <Group className="sidebar-brand" wrap="nowrap" gap={0}>
            <Link to="/" className="brand-logo" aria-label={t('shell.brand')}>
              <BrandMark />
              <span className="brand-word">{t('shell.brand')}</span>
            </Link>
            <button
              type="button"
              className="sidebar-collapse"
              aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
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

          <Box className="sidebar-user">
            <div className="sidebar-utils">
              <Tooltip label={themeLabel} position="right" disabled={!collapsed} openDelay={300}>
                <button
                  type="button"
                  className="sidebar-util-btn"
                  aria-label={themeLabel}
                  onClick={toggleTheme}
                >
                  <span className="sidebar-util-icon">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
                  <span className="sidebar-util-label">{theme === 'dark' ? t('shell.themeLight') : t('shell.themeDark')}</span>
                </button>
              </Tooltip>
              <Tooltip label={langLabel} position="right" disabled={!collapsed} openDelay={300}>
                <button
                  type="button"
                  className="sidebar-util-btn"
                  aria-label={langLabel}
                  aria-haspopup="dialog"
                  onClick={() => setLangOpen(true)}
                >
                  <span className="sidebar-util-icon is-lang" aria-hidden>
                    <span className="lang-code">{localeMeta.code}</span>
                  </span>
                  <span className="sidebar-util-label">{localeMeta.native}</span>
                </button>
              </Tooltip>
            </div>

            {user && (
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
                    {user.email_verified ? t('shell.emailVerified') : t('shell.emailNotVerified')}
                  </Text>
                </Box>
              </Group>
            )}
          </Box>
        </Box>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box className="app-stage">
          <Box className="app-stage-scroll">
            {children}
            <Box className="mobile-spacer no-print" h={76} aria-hidden />
          </Box>
        </Box>
      </AppShell.Main>
      <BottomNav />

      <Modal
        opened={langOpen}
        onClose={() => setLangOpen(false)}
        title={t('shell.chooseLanguage')}
        centered
        size="xs"
        radius="lg"
        classNames={{ content: 'lang-modal', header: 'lang-modal-header', title: 'lang-modal-title', body: 'lang-modal-body' }}
      >
        <div className="lang-options" role="listbox" aria-label={t('shell.language')}>
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const active = locale === code;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={active}
                className={`lang-option${active ? ' is-active' : ''}`}
                onClick={() => pickLocale(code)}
              >
                <span className="lang-code">{meta.code}</span>
                <span className="lang-option-copy">
                  <span className="lang-option-native">{meta.native}</span>
                  <span className="lang-option-label">{meta.label}</span>
                </span>
                {active ? <span className="lang-option-check"><CheckIcon /></span> : null}
              </button>
            );
          })}
        </div>
      </Modal>
    </AppShell>
  );
}
