// Small presentational pieces shared by the group screens (ledger tiles, net chips, bars).
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../typography';
import { colors, radius, type, CATEGORY_META, groupTokens } from '../../theme';
import { activeTheme } from '../../themes';
import { ThemedIcon } from '../ThemedIcon';
import { usePrefs } from '../../i18n';
import { netTone } from './helpers';

export function useDateFmt() {
  const { locale } = usePrefs();
  const tag = locale === 'vi' ? 'vi-VN' : 'en-US';
  return React.useMemo(() => {
    const safe = (iso, fn) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : fn(d);
    };
    return {
      date: (iso) => safe(iso, (d) => d.toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' })),
      time: (iso) => safe(iso, (d) => d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })),
      dateTime: (iso) => safe(iso, (d) => `${d.toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })}`),
    };
  }, [tag]);
}

/** Ledger tile (web tileFor): payment 💸, category emoji, receipt 🧾 keeps category colour. */
export function tileFor(item) {
  if (item?.kind === 'payment') return CATEGORY_META.payment;
  const hit = CATEGORY_META[item?.category] || CATEGORY_META.other;
  return item?.has_image ? { emoji: '🧾', color: hit.color, ms: hit.ms } : hit;
}

export function Tile({ item, emoji, color, ms, size = 40 }) {
  const m = item ? tileFor(item) : { emoji, color, ms };
  // Material themes: tinted rounded square holding the category icon (Stitch icon tiles).
  if (activeTheme().icons === 'material' && m.ms) return <IconTile ms={m.ms} color={m.color} size={size} />;
  return (
    <View style={[p.tile, { width: size, height: size, backgroundColor: m.color }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={{ fontSize: Math.round(size * 0.45) }}>{m.emoji}</Text>
    </View>
  );
}

/** Rounded square tinted with `color`, holding a Material icon (glyph `children` in classic). */
export function IconTile({ ms, color = colors.primary, size = 40, children }) {
  return (
    <View style={[p.tile, { width: size, height: size, backgroundColor: `${color}1f` }]} accessibilityElementsHidden importantForAccessibility="no">
      <ThemedIcon ms={ms} size={Math.round(size * 0.5)} color={color}>{children}</ThemedIcon>
    </View>
  );
}

/** Chevron used by tappable rows (› in classic). */
export function Chevron({ size = 18, color = colors.muted }) {
  return <ThemedIcon ms="chevron_right" size={size + 4} color={color}><Text style={{ color, fontSize: size }}>›</Text></ThemedIcon>;
}

/** Net amount chip (web .report-net / .net-chip is-owe|owed|settled). */
export function NetChip({ cents, label }) {
  const [bg, fg] = colors.kind[netTone(cents)];
  return <Text style={[p.chip, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}

/** Horizontal track + fill (budget, category %, distribution rows). */
export function Bar({ value, color = colors.primary, height = 8, track = groupTokens.barTrack }) {
  const w = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${w}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function Swatch({ color, size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: color }} />;
}

/** Flat row with divider (web flat list rows). */
export function ListRow({ children, onPress, onLongPress, last, style, accessibilityLabel }) {
  const st = [p.row, !last && p.rowLine, style];
  if (!onPress && !onLongPress) return <View style={st}>{children}</View>;
  return (
    <Pressable
      style={({ pressed }) => [...st, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

/** Quiet text action (web subtle buttons / anchors). */
export function TextAction({ label, onPress, danger, disabled, style }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button" style={[{ minHeight: 32, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, style]}>
      <Text style={[p.textAction, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Settings-style row used in sheets (label + optional sub + chevron). */
export function MenuRow({ label, sub, onPress, danger, disabled, right, last, ms }) {
  const icon = ms && activeTheme().icons === 'material'
    ? <IconTile ms={ms} size={36} color={danger ? colors.danger : colors.primary} />
    : null;
  return (
    <Pressable
      style={({ pressed }) => [p.menu, !last && p.rowLine, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={[type.h3, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={type.small} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : <Chevron />}
    </Pressable>
  );
}

export const p = StyleSheet.create({
  tile: { borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center' },
  chip: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 48 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, minHeight: 52 },
  textAction: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.secondary },
});
