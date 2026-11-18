// SplitShare mobile — Expo Managed entry. Navigation mirrors the web shell
// (web/src/components/BottomNav.jsx + QuickAddExpense.jsx): floating pill dock with
// Home · Groups · Activity · Settings and a global "+ Add expense" FAB → Quick Add.
// Deep links: splitshare://g/<token> + https://app/g/<token> -> Join
// (POST /groups/join idempotent; 410 INVITE_ROTATED / 404).
// splitshare://invite/<token> -> Invitation (emailed per-address invite: accept / join).
import React from 'react';
import { View, ActivityIndicator, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Text } from './src/typography';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { PrefsProvider, useT } from './src/i18n';
import AuthScreen, { RegisterScreen, ForgotScreen, ResetScreen, GoogleTokenScreen } from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import GroupDetailScreen from './src/screens/GroupScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ScanReceiptsScreen from './src/screens/ScanReceiptsScreen';
import ExpenseDetailScreen from './src/screens/ExpenseDetailScreen';
import SettlementScreen from './src/screens/SettlementScreen';
import PayScreen from './src/screens/PayScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import QuickAddScreen from './src/screens/QuickAddScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import SystemScreen from './src/screens/SystemScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import StatementScreen from './src/screens/StatementScreen';
import ReportScreen from './src/screens/ReportScreen';
import InviteScreen from './src/screens/InviteScreen';
import InvitationScreen from './src/screens/InvitationScreen';
import JoinScreen from './src/screens/JoinScreen';
import { colors, shadow } from './src/theme';
import { ToastHost } from './src/ui';
import { registerPush, addNotificationResponseListener } from './src/push/notifications';
import { activeTheme } from './src/themes';
import { ThemedIcon } from './src/components/ThemedIcon';

const Tab = createBottomTabNavigator();

// iOS shows no back button on a modal (page sheet): give every modal screen the same ✕ as Sheet.
function CloseX({ onPress }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={st.closeX} accessibilityRole="button" accessibilityLabel={t('common.close')}>
      <ThemedIcon ms="close" size={22} color={colors.secondary} style={{ lineHeight: 22, textAlign: 'center' }}><Text style={st.closeXT}>✕</Text></ThemedIcon>
    </Pressable>
  );
}
const withClose = (opts) => ({ navigation }) => (opts?.presentation === 'modal'
  ? { ...opts, headerRight: () => <CloseX onPress={() => navigation.goBack()} /> }
  : opts);
const modal = (title) => withClose({ title, presentation: 'modal' });
const Stack = createNativeStackNavigator();

const prefix = Linking.createURL('/');
const linking = {
  prefixes: [prefix, 'https://app', 'splitshare://'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Groups: 'groups',
          Activity: 'activity',
          Settings: 'settings',
        },
      },
      Join: 'g/:token',
      Invitation: 'invite/:token',
      Reset: 'reset/:token',
      GroupDetail: 'groups/:id',
      ExpenseDetail: 'groups/:groupId/expenses/:expenseId',
    },
  },
};

const TAB_ICON = { Home: '⌂', Groups: '◫', Activity: '◷', Settings: '⚙' };
const TAB_LABEL = { Home: 'nav.home', Groups: 'nav.groups', Activity: 'nav.activity', Settings: 'nav.settings' };

// Floating pill dock (web .bottom-nav-dock): active tab expands into a green pill with label.
function Dock({ state, navigation }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[st.dockWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Pressable
        style={({ pressed }) => [st.fab, pressed && { opacity: 0.9 }]}
        onPress={() => navigation.navigate('QuickAdd')}
        accessibilityRole="button"
        accessibilityLabel={t('m.fab.addExpense')}
      >
        <Text style={st.fabT}>＋  {t('m.fab.addExpense')}</Text>
      </Pressable>
      <View style={st.dock} accessibilityRole="tablist">
        {state.routes.map((r, i) => {
          const on = state.index === i;
          return (
            <Pressable
              key={r.key}
              style={[st.tab, on && st.tabOn]}
              onPress={() => { if (!on) navigation.navigate(r.name); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(TAB_LABEL[r.name])}
            >
              <Text style={[st.tabIcon, on && { color: '#fff' }]}>{TAB_ICON[r.name]}</Text>
              {on ? <Text style={st.tabLabel}>{t(TAB_LABEL[r.name])}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TAB_NAMES = ['Home', 'Groups', 'Activity', 'Settings'];
// Pushed (non-modal) screens keep the bottom bar when the theme has a StackTabBar; value = tab to highlight.
const TAB_OF = {
  GroupDetail: 'Groups', ExpenseDetail: 'Groups', Settlement: 'Groups', Statement: 'Groups', Report: 'Groups',
  Profile: 'Settings', System: 'Settings',
};

function useKeyboardVisible() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

function StackTabLayout({ children, route, navigation }) {
  const Bar = activeTheme().StackTabBar;
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  // The bar owns the bottom safe area, so screen content must not pad for it again.
  const contentInsets = React.useMemo(() => ({ ...insets, bottom: 0 }), [insets]);
  // Inside a group (web addExpenseTarget): "+" opens that group's expense form, skipping the people/group picker.
  const groupId = TAB_OF[route.name] === 'Groups' ? (route.params?.groupId ?? route.params?.id) : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <SafeAreaInsetsContext.Provider value={contentInsets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
      {keyboard ? null : (
        <Bar
          tabs={TAB_NAMES}
          active={TAB_OF[route.name]}
          onTab={(name) => navigation.popTo('Main', { screen: name })}
          onAdd={() => (groupId ? navigation.navigate('AddExpense', { id: groupId }) : navigation.navigate('QuickAdd'))}
        />
      )}
    </View>
  );
}

function Main() {
  // Themes may supply their own tab bar (splitease: flat bar + centre "+"); classic uses the Dock.
  const TabBar = activeTheme().TabBar || Dock;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }} edges={['top']}>
      <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
        <Tab.Screen name={TAB_NAMES[0]} component={HomeScreen} />
        <Tab.Screen name={TAB_NAMES[1]} component={GroupsScreen} />
        <Tab.Screen name={TAB_NAMES[2]} component={ActivityScreen} />
        <Tab.Screen name={TAB_NAMES[3]} component={SettingsScreen} />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

function Root({ navigationRef }) {
  const { user, loading, takePostAuthRoute } = useAuth();
  const t = useT();
  React.useEffect(() => {
    if (!user) return undefined;
    const next = takePostAuthRoute();
    if (next) setTimeout(() => navigationRef.current?.navigate(next.name, next.params), 0);
    registerPush().catch(() => {});
    return addNotificationResponseListener((name, params) => navigationRef.current?.navigate(name, params));
  }, [user?.id]);
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  const header = {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.screen },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700', ...(activeTheme().fonts ? { fontFamily: activeTheme().fonts.byWeight['700'] } : null) },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.screen },
  };
  // Auth sub-screens sit on the AuthLayout hero (dark in classic, light in splitease) — header blends into it.
  const authHeader = {
    headerStyle: { backgroundColor: colors.darkHero }, headerTintColor: colors.heroText ?? '#fff', contentStyle: { backgroundColor: colors.darkHero },
  };
  return (
    <Stack.Navigator screenOptions={header}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={AuthScreen} options={{ headerShown: false }} />
          <Stack.Group screenOptions={authHeader}>
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: t('auth.register') }} />
            <Stack.Screen name="Forgot" component={ForgotScreen} options={{ title: t('auth.forgotPassword') }} />
            <Stack.Screen name="Reset" component={ResetScreen} options={{ title: t('auth.resetPassword') }} />
            <Stack.Screen name="GoogleToken" component={GoogleTokenScreen} options={{ title: t('auth.signInGoogle') }} />
          </Stack.Group>
          <Stack.Screen name="Join" component={JoinScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Invitation" component={InvitationScreen} options={{ headerShown: false }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={Main} options={{ headerShown: false }} />
          {/* Browse screens: bottom bar stays visible (themes with StackTabBar). */}
          {/* screenLayout is called as a plain function by the navigator — return an element so the
              layout's hooks run in their own component, not inside NativeStackNavigator. */}
          <Stack.Group screenLayout={activeTheme().StackTabBar ? (p) => <StackTabLayout {...p} /> : undefined}>
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: '' }} />
            <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ title: '' }} />
            <Stack.Screen name="Settlement" component={SettlementScreen} options={{ title: t('settlement.detailTitle') }} />
            <Stack.Screen name="Statement" component={StatementScreen} options={{ title: t('statement.title') }} />
            <Stack.Screen name="Report" component={ReportScreen} options={{ title: t('report.title') }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('m.nav.profile') }} />
            <Stack.Screen name="System" component={SystemScreen} options={{ title: t('m.settings.offlinePush') }} />
            <Stack.Screen name="Join" component={JoinScreen} options={{ title: '' }} />
            <Stack.Screen name="Invitation" component={InvitationScreen} options={{ title: '' }} />
          </Stack.Group>
          {/* Task / form screens: modal, no bottom bar. */}
          <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={modal(t('groupDetail.addExpense'))} />
          <Stack.Screen name="ScanReceipts" component={ScanReceiptsScreen} options={modal(t('scan.title'))} />
          <Stack.Screen name="Pay" component={PayScreen} options={modal(t('groupDetail.recordPayment'))} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} options={modal(t('wizard.newGroup'))} />
          <Stack.Screen name="QuickAdd" component={QuickAddScreen} options={modal(t('quickAdd.title'))} />
          <Stack.Screen name="Invite" component={InviteScreen} options={modal(t('invite.title'))} />
          {/* Theme-only screens (src/themes/<name>/screens). */}
          {activeTheme().screens.map((sc) => (
            <Stack.Screen key={sc.name} name={sc.name} component={sc.component} options={withClose(typeof sc.options === 'function' ? sc.options(t) : sc.options)} />
          ))}
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = React.useRef(null);
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef} linking={linking} fallback={<Text>…</Text>}>
            <Root navigationRef={navigationRef} />
          </NavigationContainer>
          <ToastHost />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  // Square, no offset: the native header centres it (iOS wraps header buttons in its own round button).
  closeX: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeXT: { fontSize: 18, lineHeight: 22, color: colors.secondary, textAlign: 'center' },
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  fab: {
    alignSelf: 'flex-end', marginRight: 20, marginBottom: 12, minHeight: 52, paddingHorizontal: 20,
    borderRadius: 999, backgroundColor: colors.primary, justifyContent: 'center', ...shadow.fab,
  },
  fabT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dock: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(212,230,218,0.9)', backgroundColor: 'rgba(255,255,255,0.97)', ...shadow.dock,
  },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 48, minHeight: 44, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.primary, paddingLeft: 12, paddingRight: 18 },
  tabIcon: { fontSize: 18, color: colors.navInactive },
  tabLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
