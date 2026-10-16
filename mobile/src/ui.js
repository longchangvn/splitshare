// Shared UI primitives — UX-polish: skeletons, spinner buttons, badges, avatars.
import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from './theme';

export function Skeleton({ w = '100%', h = 14, style }) {
  return <View style={[{ width: w, height: h, backgroundColor: '#e2e8f0', borderRadius: 8 }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={u.card}>
      <Skeleton w="60%" h={14} />
      <View style={{ height: 8 }} />
      <Skeleton w="90%" h={12} />
    </View>
  );
}

export function SpinButton({ title, busy, onPress, variant = 'primary', disabled }) {
  const primary = variant === 'primary';
  return (
    <Pressable
      style={[u.btn, primary ? u.btnPrimary : u.btnGhost, (busy || disabled) && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={busy || disabled}
    >
      {busy ? <ActivityIndicator color={primary ? '#fff' : colors.primary} /> : (
        <Text style={primary ? u.btnT : u.btnGhostT}>{title}</Text>
      )}
    </Pressable>
  );
}

export function NetBadge({ net }) {
  if (net === 0) return <Text style={u.bLock}>SETTLED</Text>;
  return net < 0
    ? <Text style={u.bRed}>OWE</Text>
    : <Text style={u.bTeal}>OWED</Text>;
}

export function Avatar({ name, size = 36 }) {
  const init = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.lightTealBg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '800', color: colors.darkTealText }}>{init}</Text>
    </View>
  );
}

export function ErrText({ e }) {
  if (!e) return null;
  return <Text style={u.err}>{e.code ? `${e.code}: ` : ''}{e.message || 'Failed'}</Text>;
}

export function Empty({ title, sub }) {
  return (
    <View style={u.card}>
      <Text style={u.h}>{title}</Text>
      {!!sub && <Text style={u.muted}>{sub}</Text>}
    </View>
  );
}

const u = StyleSheet.create({
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 8 },
  h: { fontSize: 13, fontWeight: '800' },
  muted: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  err: { fontSize: 12, color: colors.debtorText, marginTop: 6 },
  btn: { borderRadius: 12, padding: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnT: { color: '#fff', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: '#fff' },
  btnGhostT: { fontWeight: '700', color: colors.text },
  bRed: { fontSize: 10, fontWeight: '800', backgroundColor: colors.debtorBg, color: colors.debtorText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bTeal: { fontSize: 10, fontWeight: '800', backgroundColor: colors.owedBg, color: colors.owedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
});
