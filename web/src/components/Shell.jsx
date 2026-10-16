import { Link } from 'react-router-dom';
import { AppShell, Avatar, Badge, Box, Button, Container, Group, Menu, Text } from '@mantine/core';
import { useAuth } from '../auth.jsx';
import { initialsOf } from './Net.jsx';
import { BottomNav } from './BottomNav.jsx';

export function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Text component={Link} to="/" fw={800} size="lg" c="teal.7" className="brand-splitshare">
            SplitShare
          </Text>
          <Group gap="sm" wrap="nowrap" visibleFrom="sm">
            {user && (
              <>
                <Avatar color="teal" radius="xl" size="sm">
                  {initialsOf(user.display_name)}
                </Avatar>
                <Text size="sm" component={Link} to="/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
                  {user.display_name} <Text span c="dimmed">@{user.username}</Text>
                </Text>
                {!user.email_verified && (
                  <Badge color="yellow" variant="light" size="sm">
                    unverified email
                  </Badge>
                )}
              </>
            )}
            <Button
              variant="light"
              size="xs"
              component={Link}
              to="/profile"
            >
              Profile
            </Button>
            <Button
              variant="light"
              size="xs"
              onClick={async () => { await logout(); window.location.reload(); }}
            >
              Log out
            </Button>
          </Group>
          <Group gap="sm" wrap="nowrap" hiddenFrom="sm">
            {user && !user.email_verified && (
              <Badge color="yellow" variant="light" size="sm" title="Email unverified">
                !
              </Badge>
            )}
            <Menu position="bottom-end" withinPortal={false}>
              <Menu.Target>
                <Avatar color="teal" radius="xl" size="sm" style={{ cursor: 'pointer' }}>
                  {user ? initialsOf(user.display_name) : '?'}
                </Avatar>
              </Menu.Target>
              <Menu.Dropdown>
                {user && <Menu.Label>{user.display_name} @{user.username}</Menu.Label>}
                {user && !user.email_verified && <Menu.Label c="orange">email unverified</Menu.Label>}
                <Menu.Item component={Link} to="/profile">Profile</Menu.Item>
                <Menu.Item color="red" onClick={async () => { await logout(); window.location.reload(); }}>
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="md" py="sm">
          {children}
          {/* Spacer so the fixed bottom tab bar never covers page-end content. */}
          <Box h={72} aria-hidden />
        </Container>
      </AppShell.Main>
      <BottomNav />
    </AppShell>
  );
}
