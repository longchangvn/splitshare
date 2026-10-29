// Shared UI kit — one light palette, 44 pt targets, icon-only controls labelled.
// Every screen composes these primitives instead of inventing local styles
// (spec 005 task 0.4).
import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { colors, radius, touchTarget } from './theme';
import { fmt, signPrefix, toneForNet } from './lib/money';
import { errorText } from './lib/errors';
import { useT } from './prefs';

// ---------------------------------------------------------------- states

export function Skeleton({ w = '100%', h = 14, style }) {
  return <View style={[{ width: w, height: h, backgroundColor: '#e2e8f0', borderRadius: 8 }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={s.card}>
      <Skeleton w="60%" h={14} />
      <View style={{ height: 8 }} />
      <Skeleton w="90%" h={12} />
    </View>
  );
}

export function EmptyState({ title, hint, action, onAction }) {
  return (
    <View style={s.card}>
      <Text style={s.h}>{title}</Text>
      {!!hint && <Text style={s.muted}>{hint}</Text>}
      {action ? (
        <Pressable style={s.ghostBtn} onPress={onAction} accessibilityRole="button">
          <Text style={s.ghostT}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Kept for older call sites. */
export function Empty({ title, sub }) {
  return <EmptyState title={title} hint={sub} />;
}

export function ErrorBanner({ error, onRetry }) {
  const t = useT();
  if (!error) return null;
  return (
    <View style={s.errCard}>
      <Text style={s.errT}>{errorText(error, t)}</Text>
      {onRetry ? (
        <Pressable style={s.errRetry} onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('m.state.retry')}>
          <Text style={s.errRetryT}>{t('m.state.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrText({ e }) {
  if (!e) return null;
  return <ErrorBanner error={e} />;
}

export function StaleChip({ label }) {
  return <Text style={s.staleChip}>{label}</Text>;
}

export function ListFooter({ loading, done, onRetry, error }) {
  const t = useT();
  if (loading) return <View style={s.footer}><ActivityIndicator color={colors.primary} /></View>;
  if (error) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (done) return <Text style={[s.muted, s.footer]}>{t('m.activity.noMore')}</Text>;
  return null;
}

// ---------------------------------------------------------------- money

const TONE = {
  owe: colors.debtorText,
  owed: colors.owedText,
  settled: colors.secondary,
};

/**
 * Money text. `signed` shows +/- relative to the viewer; `tone` colours it.
 * Always formats through lib/money so grouping and symbols match the web.
 */
export function Money({ cents, currency, signed = false, tone, size = 'md', style }) {
  const value = Number(cents) || 0;
  const color = tone ? TONE[tone] || colors.text : colors.text;
  const prefix = signed ? signPrefix(value) : '';
  return (
    <Text style={[moneyStyles[size] || moneyStyles.md, { color }, style]}>
      {prefix}{fmt(Math.abs(value), currency)}
    </Text>
  );
}

export function NetBadge({ net, tone }) {
  const t = useT();
  const resolved = tone || toneForNet(net);
  const label = resolved === 'settled' ? t('common.settled') : resolved === 'owe' ? t('net.youOweShort') : t('net.owedToYou');
  return <Text style={resolved === 'settled' ? s.bLock : resolved === 'owe' ? s.bRed : s.bTeal}>{label}</Text>;
}

export function Avatar({ name, size = 36 }) {
  const init = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: colors.lightTealBg,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontWeight: '800', color: colors.darkTealText, fontSize: size > 40 ? 18 : 14 }}>{init}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- controls

export function SpinButton({ title, busy, onPress, variant = 'primary', disabled, accessibilityLabel }) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  return (
    <Pressable
      style={[
        s.btn,
        primary && s.btnPrimary,
        danger && s.btnDanger,
        !primary && !danger && s.btnGhost,
        (busy || disabled) && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
    >
      {busy ? (
        <ActivityIndicator color={primary || danger ? '#fff' : colors.primary} />
      ) : (
        <Text style={primary || danger ? s.btnT : s.btnGhostT}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, count, tone = 'teal', accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel || label}
      style={[
        s.chip,
        tone === 'warn' && s.chipWarn,
        selected && s.chipOn,
      ]}
    >
      <Text style={[s.chipT, selected && s.chipTOn]}>
        {label}{count != null ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );
}

export function Segmented({ options = [], value, onChange, label }) {
  return (
    <View style={s.seg} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.value;
        const text = typeof o === 'string' ? o : o.label;
        const active = key === value;
        return (
          <Pressable
            key={key}
            style={[s.segI, active && s.segOn]}
            onPress={() => onChange?.(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={text}
          >
            <Text style={[s.segT, active && s.segTOn]} numberOfLines={1}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One-tap row: 44 pt minimum, optional chevron and right-hand slot. */
export function PressableRow({ title, subtitle, right, onPress, chevron = true, destructive, accessibilityLabel, style }) {
  return (
    <Pressable
      style={[s.row, style]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel || title}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.rowT, destructive && s.dangerT]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.muted} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {right}
      {onPress && chevron ? <Text style={s.chev}>›</Text> : null}
    </Pressable>
  );
}

export function Card({ children, onPress, style, accessibilityLabel }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable style={[s.card, style]} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {children}
    </Pressable>
  );
}

export function Field({ label, hint, error, children, style }) {
  return (
    <View style={[{ marginTop: 10 }, style]}>
      {!!label && <Text style={s.fieldLabel}>{label}</Text>}
      {children}
      {!!hint && !error && <Text style={s.fieldHint}>{hint}</Text>}
      {!!error && <Text style={s.fieldError}>{error}</Text>}
    </View>
  );
}

export function ProgressBar({ percent = 0, tone = 'teal', height = 8, accessibilityLabel }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <View
      style={[s.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[s.fill, { width: `${clamped}%`, height, backgroundColor: tone === 'warn' ? '#f59e0b' : tone === 'danger' ? colors.debtorText : colors.primary }]} />
    </View>
  );
}

/** Horizontal share bars (native, no chart library): paid vs share, categories. */
export function ShareBars({ rows = [], currency, emptyLabel }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0);
  if (!rows.length) return <Text style={s.muted}>{emptyLabel || ''}</Text>;
  return (
    <View>
      {rows.map((r) => (
        <View key={r.key || r.label} style={{ marginTop: 8 }}>
          <View style={s.rowBetween}>
            <Text style={s.barLabel} numberOfLines={1}>{r.label}</Text>
            <Money cents={r.value} currency={currency} size="sm" />
          </View>
          <ProgressBar
            percent={max > 0 ? (Number(r.value) / max) * 100 : 0}
            tone={r.tone || 'teal'}
            accessibilityLabel={`${r.label} ${r.value}`}
          />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- sheet

export function Sheet({ visible, onClose, title, children, footer, scroll = true }) {
  const t = useT();
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={s.closeBtn}
              hitSlop={8}
            >
              <Text style={s.closeT}>✕</Text>
            </Pressable>
          </View>
          <Body style={scroll ? { maxHeight: '80%' } : undefined} contentContainerStyle={scroll ? { paddingBottom: 16 } : undefined}>
            {children}
          </Body>
          {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export const uiStyles = s;

const moneyStyles = StyleSheet.create({
  xs: { fontSize: 11, fontWeight: '700' },
  sm: { fontSize: 12, fontWeight: '700' },
  md: { fontSize: 14, fontWeight: '800' },
  lg: { fontSize: 20, fontWeight: '800' },
  xl: { fontSize: 28, fontWeight: '800' },
});

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1,
    borderRadius: radius.card, padding: 13, marginBottom: 8,
  },
  h: { fontSize: 13, fontWeight: '800', color: colors.text },
  muted: { fontSize: 12, color: colors.secondary, marginTop: 3 },
  dangerT: { color: colors.debtorText, fontWeight: '700' },
  chev: { fontSize: 20, color: colors.muted, fontWeight: '700', marginLeft: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: touchTarget,
    paddingVertical: 10, paddingHorizontal: 2,
  },
  rowT: { fontSize: 13, fontWeight: '700', color: colors.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  btn: {
    borderRadius: radius.btn, padding: 13, alignItems: 'center', justifyContent: 'center',
    minHeight: touchTarget, marginTop: 8,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.debtorText },
  btnT: { color: '#fff', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: '#fff' },
  btnGhostT: { fontWeight: '700', color: colors.text },
  ghostBtn: {
    borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.btn,
    padding: 11, alignItems: 'center', marginTop: 10, minHeight: touchTarget, justifyContent: 'center',
  },
  ghostT: { fontWeight: '700', color: colors.text, fontSize: 13 },

  chip: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.inputBorder,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.lightTealBg, borderColor: colors.accentLight },
  chipWarn: { backgroundColor: colors.warnBg, borderColor: '#fdba74' },
  chipT: { fontSize: 12, fontWeight: '700', color: colors.secondary },
  chipTOn: { color: colors.darkTealText, fontWeight: '800' },

  seg: { flexDirection: 'row', backgroundColor: colors.lockedBg, borderRadius: radius.seg, padding: 3, gap: 3 },
  segI: { flex: 1, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 12, fontWeight: '700', color: colors.lockedText },
  segTOn: { color: colors.darkTealText, fontWeight: '800' },

  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.secondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  fieldHint: { fontSize: 11, color: colors.muted, marginTop: 4 },
  fieldError: { fontSize: 11, color: colors.debtorText, marginTop: 4, fontWeight: '700' },

  track: { backgroundColor: colors.lockedBg, borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  fill: { borderRadius: 999 },
  barLabel: { fontSize: 12, color: colors.text, fontWeight: '600', flex: 1, marginRight: 8 },

  errCard: {
    backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder, borderWidth: 1,
    borderRadius: radius.card, padding: 12, marginVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  errT: { color: colors.debtorText, fontSize: 12, flex: 1, fontWeight: '600' },
  errRetry: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.dangerCardBorder },
  errRetryT: { fontWeight: '800', color: colors.debtorText, fontSize: 12 },

  staleChip: {
    fontSize: 10, fontWeight: '800', color: colors.openText, backgroundColor: colors.openBg,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start',
  },
  footer: { alignItems: 'center', paddingVertical: 14 },

  bRed: { fontSize: 10, fontWeight: '800', backgroundColor: colors.debtorBg, color: colors.debtorText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bTeal: { fontSize: 10, fontWeight: '800', backgroundColor: colors.owedBg, color: colors.owedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  bLock: { fontSize: 10, fontWeight: '800', backgroundColor: colors.lockedBg, color: colors.lockedText, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },

  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  closeBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  closeT: { fontSize: 16, color: colors.secondary, fontWeight: '800' },
  sheetFooter: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10 },
});
