import { Badge, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { useT } from '../prefs.jsx';

function Row({ label, value }) {
  return (
    <Group gap={6} wrap="nowrap" align="baseline">
      <Text size="xs" c="dimmed" fw={600} style={{ flex: '0 0 auto', minWidth: 72 }}>{label}</Text>
      <Text size="sm" fw={600} c="dark" style={{ minWidth: 0, wordBreak: 'break-all' }}>{value}</Text>
    </Group>
  );
}

/**
 * Marker shown on every screen reached from an invitation link (emailed
 * /invite/:token or shared /g/:token): the group, who invited, and who is invited.
 */
export function InvitationBanner({ inviter, group, memberCount, email }) {
  const t = useT();
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      role="note"
      aria-label={t('invitation.badge')}
      className="invitation-banner"
      style={{ background: 'var(--mantine-color-teal-0)', borderColor: 'var(--mantine-color-teal-3)' }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon color="teal" variant="filled" radius="xl" size={36} aria-hidden>✉</ThemeIcon>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Badge color="teal" variant="light" size="sm">{t('invitation.badge')}</Badge>
          <Text size="xs" c="dimmed" mt={6}>{t('invitation.groupLabel')}</Text>
          <Text fw={800} size="lg" c="dark" lh={1.25} style={{ wordBreak: 'break-word' }}>{group}</Text>
          {memberCount != null && (
            <Text size="xs" c="dimmed" mb={6}>{t('invitation.members', { count: memberCount })}</Text>
          )}
          {inviter && <Row label={t('invitation.invitedByLabel')} value={inviter} />}
          {email && <Row label={t('invitation.inviteeLabel')} value={email} />}
        </div>
      </Group>
    </Paper>
  );
}
