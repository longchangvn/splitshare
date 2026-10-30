// Account-area building blocks: brand mark, auth layout (web AuthLayout), password input,
// language switch (web Shell language picker) and friendly API error text.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, type } from '../../theme';
import { Input, u } from '../../ui';
import { usePrefs, useT } from '../../i18n';

/**
 * Two-piece SplitShare mark (web Shell BrandMark, 42×48 viewBox) drawn with Views:
 * left pill + knob in brandA, right pill in brandB with a socket cut around the knob.
 * `bg` must match the surface behind the mark so the socket reads as a gap.
 */
export function BrandMark({ size = 28, bg = colors.darkHero }) {
  const k = size / 42;
  const h = Math.round(48 * k);
  const pill = { position: 'absolute', top: 8 * k, width: 16 * k, height: 32 * k, borderRadius: 8 * k };
  const disc = (cx, r, c) => ({
    position: 'absolute', left: (cx - r) * k, top: (24 - r) * k, width: 2 * r * k, height: 2 * r * k, borderRadius: r * k, backgroundColor: c,
  });
  return (
    <View style={{ width: size, height: h }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[pill, { left: 22 * k, backgroundColor: colors.brandB }]} />
      <View style={disc(22, 7.5, bg)} />
      <View style={[pill, { left: 2 * k, backgroundColor: colors.brandA }]} />
      <View style={disc(20, 7.5, colors.brandA)} />
    </View>
  );
}

/** Compact EN / VI switch (web Shell language picker). */
export function LanguageSwitch({ dark = false, style }) {
  const { locale, setLocale, locales, localeMeta } = usePrefs();
  const t = useT();
  return (
    <View style={[a.lang, dark && a.langDark, style]} accessibilityRole="radiogroup" accessibilityLabel={t('shell.chooseLanguage')}>
      {locales.map((l) => {
        const on = l === locale;
        return (
          <Pressable
            key={l}
            onPress={() => setLocale(l)}
            style={[a.langI, on && (dark ? a.langOnDark : a.langOn)]}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(l === 'vi' ? 'shell.switchToVi' : 'shell.switchToEn')}
          >
            <Text style={[a.langT, dark && { color: 'rgba(255,255,255,0.7)' }, on && { color: dark ? colors.darkHero : '#fff' }]}>
              {localeMeta?.[l]?.code || l.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Web AuthLayout adapted to native: dark atmospheric hero + bright form card. */
export function AuthLayout({ title, desc, children, footer, compact = false }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.darkHero }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[a.hero, { paddingTop: (compact ? 18 : 28) + (compact ? 0 : insets.top) }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={[a.orb, a.orbA]} />
            <View style={[a.orb, a.orbB]} />
            <View style={[a.orb, a.orbC]} />
          </View>
          <View style={a.heroTop}>
            <View style={a.brand} accessible accessibilityRole="header" accessibilityLabel={t('shell.brand')}>
              <BrandMark size={28} />
              <Text style={a.word}>{t('shell.brand')}</Text>
            </View>
            <LanguageSwitch dark />
          </View>
          {!compact ? <Text style={a.tagline}>{t('m.account.tagline')}</Text> : null}
        </View>
        <View style={a.sheet}>
          <View style={a.card}>
            {title ? <Text style={type.title} accessibilityRole="header">{title}</Text> : null}
            {desc ? <Text style={[type.body, { color: colors.secondary, marginTop: 4 }]}>{desc}</Text> : null}
            {children}
          </View>
          {footer}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Password input with show/hide toggle (Mantine PasswordInput). */
export function PasswordInput({ value, onChangeText, placeholder, autoComplete, onSubmitEditing, returnKeyType, error }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
        placeholder={placeholder}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        error={error}
        style={{ paddingRight: 64 }}
      />
      <Pressable
        style={a.eye}
        onPress={() => setShow(!show)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(show ? 'm.account.hidePassword' : 'm.account.showPassword')}
      >
        <Text style={u.link}>{t(show ? 'm.account.hide' : 'm.account.show')}</Text>
      </Pressable>
    </View>
  );
}

/** Map an API error to friendly, translated copy (no raw codes / endpoints). */
export function friendlyError(e, t) {
  if (!e) return null;
  if (e.friendly) return e.message;
  if (e.status === 429) return t('m.account.err.RATE_LIMITED');
  if (e.code) {
    const key = `m.account.err.${e.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  if (!e.status && !e.code) return e instanceof TypeError || !e.message ? t('m.account.err.network') : e.message;
  return e.message || t('m.error.failed');
}

export function AccountErr({ e, style }) {
  const t = useT();
  if (!e || e.code === 'SESSION_EXPIRED') return null;
  return (
    <View style={[a.err, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={a.errT}>{friendlyError(e, t)}</Text>
    </View>
  );
}

/** Tappable list row with chevron (settings-row). */
export function LinkRow({ title, sub, onPress, danger, right }) {
  return (
    <Pressable
      style={({ pressed }) => [a.linkRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ flex: 1 }}>
        <Text style={[type.h3, danger && { color: colors.danger }]}>{title}</Text>
        {sub ? <Text style={type.small}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Text style={a.chev}>›</Text> : null}
    </Pressable>
  );
}

export const a = StyleSheet.create({
  hero: { paddingHorizontal: 22, paddingBottom: 56, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  orbA: { width: 260, height: 260, top: -120, right: -90, backgroundColor: 'rgba(61,222,132,0.18)' },
  orbB: { width: 200, height: 200, bottom: -110, left: -60, backgroundColor: 'rgba(20,154,98,0.28)' },
  orbC: { width: 120, height: 120, top: 40, left: '45%', backgroundColor: 'rgba(255,255,255,0.05)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  tagline: { color: 'rgba(255,255,255,0.78)', fontSize: 15, marginTop: 18, fontWeight: '600' },
  sheet: { flexGrow: 1, backgroundColor: colors.page, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28, padding: 16, gap: 12 },
  card: { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius.card, padding: 20, ...shadow.card },
  lang: { flexDirection: 'row', backgroundColor: '#eef2f0', borderRadius: 999, padding: 3, gap: 2 },
  langDark: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  langI: { paddingHorizontal: 12, minHeight: 32, minWidth: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  langOn: { backgroundColor: colors.ink },
  langOnDark: { backgroundColor: '#fff' },
  langT: { fontSize: 12, fontWeight: '800', color: colors.secondary, letterSpacing: 0.4 },
  eye: { position: 'absolute', right: 14, minHeight: 44, justifyContent: 'center' },
  err: { backgroundColor: colors.dangerCardBg, borderColor: colors.dangerCardBorder, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  errT: { color: colors.dangerDeep, fontSize: 13, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 48 },
  chev: { fontSize: 22, color: colors.muted, marginLeft: 4 },
  sep: { height: 1, backgroundColor: colors.line },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  linkT: { color: colors.primaryText, fontWeight: '700', fontSize: 14, paddingVertical: 8 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  orT: { fontSize: 12, color: colors.muted, fontWeight: '600' },
});
