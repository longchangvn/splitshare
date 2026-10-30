// Shared UI primitives — native take on the web design system (web/src/styles.css):
// pill buttons, soft cards, chips, pastel avatars, bottom sheets, toasts, skeletons.
import React from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Alert, Modal, ScrollView,
  Image, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, type } from './theme';
import {
  isDevBuild, configuredApiUrl, baseUrl, setApiUrlOverride, resetApiUrlOverride, DEV_DEFAULT_API_URL,
  authHeaders, api,
} from './api/client';
import { useT } from './i18n';

// ---------- Avatars (web components/Net.jsx pastelFor / initialsOf) ----------
const GROUP_PASTELS = [
  ['#dcefe6', '#b7d9c8'], ['#e3eef5', '#c2d6e6'], ['#efe8dc', '#ddd0bc'], ['#e7f0ea', '#c5d8ce'],
  ['#efe6e4', '#dfcbc7'], ['#e6ebe8', '#cdd6d1'], ['#e8edf2', '#c8d2dc'], ['#ebe8e2', '#d4cfc4'],
];

export function pastelFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const [from, to] = GROUP_PASTELS[h % GROUP_PASTELS.length];
  return { from, to };
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 36, rounded = true }) {
  const p = pastelFor(name);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: rounded ? size / 2 : Math.round(size * 0.3),
        backgroundColor: p.from, borderWidth: 1, borderColor: p.to, alignItems: 'center', justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={{ fontWeight: '800', color: '#2f3b36', fontSize: Math.max(11, Math.round(size * 0.34)) }}>{initialsOf(name)}</Text>
    </View>
  );
}

/** Square group cover thumb (web GroupThumb). */
export const GroupThumb = ({ name, size = 44 }) => <Avatar name={name} size={size} rounded={false} />;

// ---------- Layout ----------
export function Screen({ children, scroll = true, refreshControl, contentStyle, footer }) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={u.screen}
      contentContainerStyle={[u.screenContent, { paddingBottom: 24 + (footer ? 0 : insets.bottom) }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : <View style={[u.screen, u.screenContent, contentStyle]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.screen }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {body}
      {footer ? <View style={[u.footer, { paddingBottom: 10 + insets.bottom }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, tone, accessibilityLabel }) {
  const t = tone ? colors.tones[tone] : null;
  const st = [u.card, t && { backgroundColor: t.bg, borderColor: t.border }, style];
  if (!onPress) return <View style={st}>{children}</View>;
  return (
    <Pressable
      style={({ pressed }) => [...st, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction, style }) {
  return (
    <View style={[u.sectionRow, style]}>
      <Text style={type.h2}>{title}</Text>
      {action ? <Text style={u.link} onPress={onAction} accessibilityRole="button">{action}</Text> : null}
    </View>
  );
}

export function Row({ children, style, gap = 8 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ---------- Buttons ----------
const BTN = {
  primary: { bg: colors.ink, fg: '#fff' },
  brand: { bg: colors.primary, fg: '#fff' },
  danger: { bg: colors.danger, fg: '#fff' },
  soft: { bg: colors.primarySoft, fg: colors.primaryText },
  ghost: { bg: '#fff', fg: colors.text, border: colors.inputBorder },
  pay: { bg: colors.pay, fg: '#fff' },
};

export function Button({ title, busy, onPress, variant = 'primary', disabled, icon, small, style, accessibilityLabel }) {
  const v = BTN[variant] || BTN.primary;
  const off = busy || disabled;
  return (
    <Pressable
      style={({ pressed }) => [
        u.btn, small && u.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border || v.bg, borderWidth: v.border ? 1 : 0 },
        off && { opacity: 0.45 }, pressed && !off && { opacity: 0.85 }, style,
      ]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      accessibilityLabel={accessibilityLabel || title}
    >
      {busy ? <ActivityIndicator color={v.fg} /> : (
        <Text style={[u.btnT, small && { fontSize: 13 }, { color: v.fg }]} numberOfLines={1}>{icon ? `${icon}  ` : ''}{title}</Text>
      )}
    </Pressable>
  );
}

/** Back-compat wrapper (pre-redesign API). */
export const SpinButton = (props) => <Button {...props} />;

// ---------- Chips / badges / segmented ----------
export function Chip({ label, on, onPress, disabled, style }) {
  return (
    <Pressable
      style={[u.chip, on && u.chipOn, disabled && { opacity: 0.4 }, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!on, disabled: !!disabled }}
    >
      <Text style={[u.chipT, on && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ options, value, onChange, multi = false, scroll = false }) {
  const isOn = (v) => (multi ? (value || []).includes(v) : value === v);
  const toggle = (v) => {
    if (!multi) return onChange(v);
    onChange(isOn(v) ? value.filter((x) => x !== v) : [...(value || []), v]);
  };
  const chips = options.map((o) => (
    <Chip key={String(o.value)} label={o.label} on={isOn(o.value)} disabled={o.disabled} onPress={() => toggle(o.value)} />
  ));
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chips}</ScrollView>;
  return <View style={u.chipWrap} accessibilityRole="radiogroup">{chips}</View>;
}

/** Small status pill. kind = key in colors.kind (expense, payment, owe, owed, settled …) or a tone. */
export function Badge({ label, kind = 'comment', tone }) {
  const t = tone ? colors.tones[tone] : null;
  const [bg, fg] = t ? [t.bg, t.ink] : (colors.kind[kind] || colors.kind.comment);
  return <Text style={[u.badge, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={u.seg} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.value}
          style={[u.segI, value === o.value && u.segOn]}
          onPress={() => onChange(o.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === o.value }}
        >
          <Text style={[u.segT, value === o.value && { color: colors.text }]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CheckRow({ label, sub, checked, onPress, right, disabled }) {
  return (
    <Pressable
      style={[u.checkRow, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked, disabled: !!disabled }}
    >
      <View style={[u.box, checked && u.boxOn]}>{checked ? <Text style={u.boxTick}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={type.h3} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={type.small} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

// ---------- Inputs ----------
export const Input = React.forwardRef(function Input({ style, error, ...props }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.muted}
      style={[u.inp, error && { borderColor: colors.danger }, style]}
      {...props}
    />
  );
});

export function Field({ label, error, hint, children, style }) {
  return (
    <View style={[{ marginTop: 12 }, style]}>
      {label ? <Text style={u.label}>{label}</Text> : null}
      {children}
      {error ? <Text style={u.err}>{error}</Text> : hint ? <Text style={u.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Tap-to-pick select rendered as a bottom sheet list (native stand-in for Mantine Select). */
export function SelectField({ label, value, options, onChange, placeholder, error, disabled }) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} error={error}>
      <Pressable
        style={[u.inp, u.selectBox, disabled && { opacity: 0.5 }]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current?.label || '' }}
      >
        <Text style={{ color: current ? colors.text : colors.muted, flex: 1 }} numberOfLines={1}>{current?.label || placeholder || '—'}</Text>
        <Text style={{ color: colors.muted }}>⌄</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            style={u.option}
            onPress={() => { setOpen(false); onChange(o.value); }}
            disabled={o.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: o.value === value }}
          >
            <Text style={[type.body, o.disabled && { opacity: 0.4 }, o.value === value && { fontWeight: '700', color: colors.text }]}>{o.label}</Text>
            {o.value === value ? <Text style={{ color: colors.primary, fontWeight: '800' }}>✓</Text> : null}
          </Pressable>
        ))}
      </Sheet>
    </Field>
  );
}

// ---------- Sheet (web wizard modal → native bottom sheet) ----------
export function Sheet({ visible, onClose, title, children, footer, scroll = true }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={u.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={[u.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={u.grip} />
          {title ? (
            <View style={u.sheetHead}>
              <Text style={[type.h1, { flex: 1 }]}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><Text style={u.close}>✕</Text></Pressable>
            </View>
          ) : null}
          {scroll ? <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>{children}</ScrollView> : children}
          {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Two-button confirm sheet (web wizard confirm modal). */
export function ConfirmSheet({ visible, title, message, confirmLabel, cancelLabel, danger, busy, confirmDisabled, onConfirm, onClose }) {
  const t = useT();
  const close = () => { if (!busy) onClose?.(); };
  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {message ? <Text style={[type.body, { marginBottom: 12 }]}>{message}</Text> : null}
      <Row>
        <Button style={{ flex: 1 }} variant="ghost" title={cancelLabel || t('common.cancel')} onPress={close} disabled={busy} />
        <Button style={{ flex: 1 }} variant={danger ? 'danger' : 'primary'} busy={busy} disabled={confirmDisabled} title={confirmLabel || t('common.continue')} onPress={onConfirm} />
      </Row>
    </Sheet>
  );
}

// ---------- Toasts (web Mantine notifications) ----------
const toastListeners = new Set();
/** toast({ title?, message, color: 'teal'|'green'|'orange'|'red' }) */
export function toast(n) { toastListeners.forEach((fn) => fn({ id: Date.now() + Math.random(), ...n })); }

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const fn = (n) => {
      setItems((prev) => [...prev.slice(-2), n]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== n.id)), 3500);
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, []);
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[u.toastWrap, { top: insets.top + 8 }]}>
      {items.map((n) => {
        const bar = n.color === 'red' ? colors.danger : n.color === 'orange' ? '#f59e0b' : colors.primary;
        return (
          <Pressable key={n.id} style={[u.toast, { borderLeftColor: bar }]} onPress={() => setItems((p) => p.filter((x) => x.id !== n.id))} accessibilityLiveRegion="polite">
            {n.title ? <Text style={type.h3}>{n.title}</Text> : null}
            {n.message ? <Text style={type.small}>{n.message}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Authenticated image (GET /images/:id with Bearer) ----------
export function AuthImage({ imageId, style, resizeMode = 'cover' }) {
  const [headers, setHeaders] = React.useState(null);
  React.useEffect(() => { let live = true; authHeaders().then((h) => live && setHeaders(h)); return () => { live = false; }; }, []);
  if (!headers) return <View style={[style, { backgroundColor: colors.line }]} />;
  return <Image source={{ uri: api.imageUrl(imageId), headers }} style={style} resizeMode={resizeMode} />;
}

// ---------- Feedback ----------
export function Skeleton({ w = '100%', h = 14, style }) {
  const o = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ width: w, height: h, backgroundColor: '#e6ebe8', borderRadius: 8, opacity: o }, style]} />;
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

export function NetBadge({ net }) {
  const t = useT();
  if (net === 0) return <Badge kind="settled" label={t('net.settledUp')} />;
  return net < 0 ? <Badge kind="owe" label={t('m.badge.owe')} /> : <Badge kind="owed" label={t('m.badge.owed')} />;
}

export function ErrText({ e }) {
  if (!e) return null;
  return <Text style={u.err} accessibilityLiveRegion="polite">{e.message || e.code || 'Failed'}</Text>;
}

export function Empty({ title, sub, action, onAction, emoji }) {
  return (
    <View style={[u.card, { alignItems: 'center', paddingVertical: 24 }]}>
      {emoji ? <Text style={{ fontSize: 32, marginBottom: 6 }}>{emoji}</Text> : null}
      <Text style={[type.h2, { textAlign: 'center' }]}>{title}</Text>
      {!!sub && <Text style={[type.small, { textAlign: 'center', marginTop: 4 }]}>{sub}</Text>}
      {action ? <Button style={{ marginTop: 12, alignSelf: 'stretch' }} title={action} onPress={onAction} /> : null}
    </View>
  );
}

// Dev-only (non-release) API base URL switcher. Renders nothing in release builds.
export function DevApiUrlCard() {
  const t = useT();
  const [url, setUrl] = React.useState(configuredApiUrl());
  const [active, setActive] = React.useState(baseUrl());
  const [e, setE] = React.useState(null);
  if (!isDevBuild) return null;

  const apply = async (fn) => {
    setE(null);
    try {
      await fn();
      setUrl(configuredApiUrl());
      setActive(baseUrl());
      Alert.alert(t('m.dev.updated'), t('m.dev.updatedBody', { url: baseUrl() }));
    } catch (err) { setE(err); }
  };

  return (
    <View style={u.card}>
      <Text style={type.h3}>{t('m.dev.apiUrl')}</Text>
      <Text style={type.small}>{t('m.dev.active', { url: active })}</Text>
      <Input
        style={{ marginTop: 8 }}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder={DEV_DEFAULT_API_URL}
      />
      <ErrText e={e} />
      <Button style={{ marginTop: 8 }} title={t('m.dev.save')} onPress={() => apply(() => setApiUrlOverride(url))} />
      <Button style={{ marginTop: 8 }} title={t('m.dev.reset')} variant="ghost" onPress={() => apply(resetApiUrlOverride)} />
    </View>
  );
}

export const u = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screen },
  screenContent: { padding: 16, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.screen, borderTopWidth: 1, borderTopColor: colors.line },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius.card, padding: 16, ...shadow.card },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  link: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  btn: { borderRadius: radius.btn, minHeight: 46, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 36, paddingHorizontal: 14 },
  btnT: { fontWeight: '700', fontSize: 15 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.chipBg, borderRadius: radius.chip, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipT: { fontSize: 14, fontWeight: '600', color: colors.body },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', backgroundColor: '#eef2f0', borderRadius: radius.seg, padding: 3, gap: 3 },
  segI: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  segOn: { backgroundColor: '#fff', ...shadow.card },
  segT: { fontSize: 13, fontWeight: '700', color: colors.secondary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxTick: { color: '#fff', fontWeight: '900', fontSize: 13 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  inp: { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1, borderRadius: radius.inp, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, minHeight: 46 },
  selectBox: { flexDirection: 'row', alignItems: 'center' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 48 },
  hint: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  err: { fontSize: 12, color: colors.danger, marginTop: 6 },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 18, paddingTop: 8, maxHeight: '90%' },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  close: { fontSize: 18, color: colors.secondary, paddingHorizontal: 4 },
  toastWrap: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 1000 },
  toast: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderLeftWidth: 4, ...shadow.dock },
});
