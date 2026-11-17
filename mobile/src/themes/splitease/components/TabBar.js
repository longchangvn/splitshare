// SplitEase bottom tab bar (Stitch M32): flat white bar, icon + label per tab and a
// raised round green "+" in the middle that opens Quick Add (same target as the classic FAB).
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../typography';
import { ThemedIcon } from '../../../components/ThemedIcon';
import { colors, shadow } from '../../../theme';
import { useT } from '../../../i18n';

const TAB_MS = { Home: 'home', Groups: 'groups', Activity: 'history', Settings: 'settings' };
const TAB_LABEL = { Home: 'nav.home', Groups: 'nav.groups', Activity: 'nav.activity', Settings: 'nav.settings' };

export default function TabBar({ state, navigation }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const half = Math.ceil(state.routes.length / 2);

  const tab = (r, i) => {
    const on = state.index === i;
    const color = on ? colors.primary : colors.navInactive;
    return (
      <Pressable
        key={r.key}
        style={({ pressed }) => [s.tab, pressed && { opacity: 0.7 }]}
        onPress={() => { if (!on) navigation.navigate(r.name); }}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t(TAB_LABEL[r.name])}
      >
        <ThemedIcon ms={TAB_MS[r.name] || 'circle'} size={24} color={color} />
        <Text style={[s.label, { color }, on && s.labelOn]} numberOfLines={1}>{t(TAB_LABEL[r.name])}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.slice(0, half).map((r, i) => tab(r, i))}
      <View style={s.fabSlot}>
        <Pressable
          style={({ pressed }) => [s.fab, pressed && { opacity: 0.9 }]}
          onPress={() => navigation.navigate('QuickAdd')}
          accessibilityRole="button"
          accessibilityLabel={t('m.fab.addExpense')}
        >
          <ThemedIcon ms="add" size={32} color="#fff" />
        </Pressable>
      </View>
      {state.routes.slice(half).map((r, i) => tab(r, i + half))}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.card, paddingTop: 8, paddingHorizontal: 6,
    borderTopWidth: 1, borderTopColor: colors.line, ...shadow.dock,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  label: { fontSize: 11, fontWeight: '600' },
  labelOn: { fontWeight: '700' },
  fabSlot: { flex: 1, alignItems: 'center' },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginTop: -30, marginBottom: 4, borderWidth: 4, borderColor: colors.card, ...shadow.fab,
  },
});
