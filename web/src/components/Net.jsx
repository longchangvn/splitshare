import { Badge } from '@mantine/core';
import { fmt } from '../api.js';

export function Net({ v, c }) {
  if (v === 0) return <Badge color="gray" variant="light">Settled up</Badge>;
  return v < 0
    ? <Badge color="red" variant="light">You owe {fmt(-v, c)}</Badge>
    : <Badge color="teal" variant="light">You are owed {fmt(v, c)}</Badge>;
}

export function displayNameOf(members, userId) {
  const m = (members || []).find((x) => x.user_id === userId);
  return m?.display_name || userId.slice(0, 8);
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ChevronRight({ size = 20, label = 'View details' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
      style={{ flex: 'none', opacity: 0.55 }}
    >
      <path d="m 9 6 6 6 -6 6" />
    </svg>
  );
}
