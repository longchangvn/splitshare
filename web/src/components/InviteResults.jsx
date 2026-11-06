import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { inviteRowMessage, inviteSummary, inviteSummaryMessage } from '../inviteResults.js';
import { useT } from '../prefs.jsx';

const TONE_COLOR = { success: 'teal', partial: 'yellow', error: 'red', empty: 'gray' };

/** Toast summarizing which invitation emails were actually sent. */
export function notifyInviteResults(t, rows) {
  const summary = inviteSummary(rows);
  if (summary.tone === 'empty') return;
  const m = inviteSummaryMessage(summary);
  notifications.show({
    title: t(m.key, m.vars),
    message: summary.failed > 0 ? t('invite.retryHint') : undefined,
    color: TONE_COLOR[summary.tone],
    autoClose: summary.failed > 0 ? 8000 : 4000,
  });
}

/** Per-address list that stays on screen so failures are not missed. */
export function InviteResults({ rows }) {
  const t = useT();
  if (!rows?.length) return null;
  const summary = inviteSummary(rows);
  const head = inviteSummaryMessage(summary);
  return (
    <Stack gap={8} className="invite-results" role="status" aria-live="polite" mt="sm">
      <Text size="sm" fw={700} c={TONE_COLOR[summary.tone]}>{t(head.key, head.vars)}</Text>
      {rows.map((r) => {
        const m = inviteRowMessage(r);
        const detail = m.detailKey ? t(m.detailKey) : m.detail;
        return (
          <Group key={r.email} gap="xs" wrap="nowrap" align="flex-start">
            <ThemeIcon size={20} radius="xl" variant="light" color={r.emailSent ? 'teal' : 'red'} aria-hidden>
              {r.emailSent ? '✓' : '!'}
            </ThemeIcon>
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} style={{ wordBreak: 'break-all' }}>{r.email}</Text>
              <Text size="xs" c={r.emailSent ? 'dimmed' : 'red'}>
                {t(m.key)}{detail ? ` — ${detail}` : ''}
              </Text>
            </div>
          </Group>
        );
      })}
      {summary.failed > 0 && <Text size="xs" c="dimmed">{t('invite.retryHint')}</Text>}
    </Stack>
  );
}
