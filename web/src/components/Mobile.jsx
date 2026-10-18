import { Box, Card, Group, Menu, Stack, Table, Text, ActionIcon } from '@mantine/core';
import { fmt } from '../api.js';
import { useT } from '../prefs.jsx';

// Shared ⋯ row menu (mobile-simplify quiet rows): one pattern for
// payment reverse, recurring pause/delete, debtor details.
export function RowMenu({ label, children }) {
  return (
    <Menu position="bottom-end" withinPortal={false}>
      <Menu.Target>
        <ActionIcon variant="subtle" title={label} aria-label={label}>⋯</ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

// Dual-render name/value list: cards on mobile, table on desktop. Same data.
export function NameValueList({ rows, totalLabel, total, currency, emptyText }) {
  const t = useT();
  const empty = emptyText ?? t('mobile.nothingYet');
  const totalLbl = totalLabel ?? t('common.total');
  return (
    <>
      <Box hiddenFrom="sm">
        <Stack gap="xs">
          {rows.map((r) => (
            <Card key={r.key} withBorder radius="md" padding="sm">
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm">{r.label}</Text>
                <Text size="sm" fw={600}>{fmt(r.value, currency)}</Text>
              </Group>
            </Card>
          ))}
          {rows.length === 0 && <Text size="sm" c="dimmed">{empty}</Text>}
          {total != null && (
            <Card withBorder radius="md" padding="sm">
              <Group justify="space-between">
                <Text size="sm" fw={600}>{totalLbl}</Text>
                <Text size="sm" fw={600}>{fmt(total, currency)}</Text>
              </Group>
            </Card>
          )}
        </Stack>
      </Box>
      <Box visibleFrom="sm">
        <Table striped highlightOnHover withTableBorder>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.key}>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td>{fmt(r.value, currency)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          {total != null && (
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td><Text size="sm" fw={600}>{totalLbl}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={600}>{fmt(total, currency)}</Text></Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
      </Box>
    </>
  );
}
