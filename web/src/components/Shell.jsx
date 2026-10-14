import { Link } from 'react-router-dom';
import { AppShell, Avatar, Badge, Button, Container, Group, Text } from '@mantine/core';
import { useAuth } from '../auth.jsx';
import { initialsOf } from './Net.jsx';

export function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Text component={Link} to="/" fw={800} size="lg" c="teal.7">
            SplitShare
          </Text>
          <Group gap="sm" wrap="nowrap">
            {user && (
              <>
                <Avatar color="teal" radius="xl" size="sm">
                  {initialsOf(user.display_name)}
                </Avatar>
                <Text size="sm" visibleFrom="xs">
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
              onClick={async () => { await logout(); window.location.reload(); }}
            >
              Log out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="md" py="sm">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
