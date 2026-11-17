// Account-area building blocks: brand mark, auth layout (web AuthLayout), password input,
// language switch (web Shell language picker) and friendly API error text.
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '../../typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, type, tk } from '../../theme';
import { Input, u } from '../../ui';
import { usePrefs, useT } from '../../i18n';
import { activeTheme } from '../../themes';
import { ThemedIcon } from '../ThemedIcon';
import { IconTile } from '../../themes/splitease/components/IconTile';

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

/**
 * SplitEase auth layout (Stitch M30/M45): light page, round green logo, centred title,
 * optional `top` block (Quick Pass) above the white form card.
 */
function LightAuthLayout({ title, desc, children, footer, compact, banner, top }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const logo = compact ? 56 : 72;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: (compact ? 8 : 16) + (compact ? 0 : insets.top), paddingBottom: 24 + insets.bottom, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={a.lightTop}><LanguageSwitch /></View>
        <View style={a.lightHead}>
          <View style={[a.logo, { width: logo, height: logo, borderRadius: logo / 2 }]} accessible accessibilityRole="header" accessibilityLabel={t('shell.brand')}>
            <ThemedIcon ms="pie_chart" size={Math.round(logo * 0.5)} color="#fff" />
          </View>
          {!compact ? (
            <View style={a.kickerPill}>
              <View style={a.kickerDot} />
              <Text style={a.kickerT}>{t('shell.brand')}</Text>
            </View>
          ) : null}
          {title ? <Text style={[a.lightTitle, compact && { fontSize: 26 }]} accessibilityRole="header">{title}</Text> : null}
          {desc ? <Text style={a.lightDesc}>{desc}</Text> : null}
        </View>
        {top}
        <View style={a.lightCard}>
          {banner ? <View style={{ marginBottom: 16 }}>{banner}</View> : null}
          {children}
        </View>
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Web AuthLayout adapted to native: dark atmospheric hero + bright form card. */
export function AuthLayout({ title, desc, children, footer, compact = false, banner, top }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  if (activeTheme().features?.lightAuth) {
    return <LightAuthLayout {...{ title, desc, footer, compact, banner, top }}>{children}</LightAuthLayout>;
  }
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
            {banner ? <View style={{ marginBottom: 16 }}>{banner}</View> : null}
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
        <ThemedIcon ms={show ? 'visibility_off' : 'visibility'} size={22} color={colors.secondary}>
          <Text style={u.link}>{t(show ? 'm.account.hide' : 'm.account.show')}</Text>
        </ThemedIcon>
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

/** Tappable list row with chevron (settings-row). `ms` adds a Material icon tile in icon themes. */
export function LinkRow({ title, sub, onPress, danger, right, ms }) {
  return (
    <Pressable
      style={({ pressed }) => [a.linkRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <IconTile ms={ms} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={[type.h3, danger && { color: colors.danger }]}>{title}</Text>
        {sub ? <Text style={type.small}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <ThemedIcon ms="chevron_right" size={22} color={colors.muted}><Text style={a.chev}>›</Text></ThemedIcon> : null}
    </Pressable>
  );
}

export const a = StyleSheet.create({
  // SplitEase light layout (LightAuthLayout only).
  lightTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  lightHead: { alignItems: 'center', gap: 10 },
  logo: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.fab },
  kickerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.chipBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  kickerT: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.body },
  lightTitle: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.8, textAlign: 'center' },
  lightDesc: { fontSize: 15, color: colors.body, textAlign: 'center', lineHeight: 22 },
  lightCard: { backgroundColor: colors.card, borderRadius: radius.card, padding: 20, ...shadow.card },
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
  lang: { flexDirection: 'row', backgroundColor: tk('#eef2f0'), borderRadius: 999, padding: 3, gap: 2 },
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
