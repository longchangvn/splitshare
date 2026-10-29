// SplitShare mobile — Expo Managed entry. Navigation mirrors the web shell
// (web/src/components/BottomNav.jsx + QuickAddExpense.jsx): floating pill dock with
// Home · Groups · Activity · Settings and a global "+ Add expense" FAB → Quick Add.
// Deep links: splitshare://g/<token> + https://app/g/<token> -> Join
// (POST /groups/join idempotent; 410 INVITE_ROTATED / 404).
import React from 'react';
import { Text, View, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { api, groupIdOf } from './src/api/client';
import { colors, shadow } from './src/theme';
import { ToastHost } from './src/ui';

const Tab = createBottomTabNavigator();
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
      Reset: 'reset/:token',
      GroupDetail: 'groups/:id',
      ExpenseDetail: 'groups/:groupId/expenses/:expenseId',
    },
  },
};

function JoinScreen({ route, navigation }) {
  const { user } = useAuth();
  const t = useT();
  const { token } = route.params || {};
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const g = await api.post('/api/v1/groups/join', { token });
        const gid = groupIdOf(g);
        if (gid) navigation.replace('GroupDetail', { id: gid });
        else setMsg(t('m.join.joinedOpenGroups'));
      } catch (e) {
        setMsg(e.code === 'INVITE_ROTATED' ? t('m.join.rotated') : t('m.join.failed', { reason: e.message || e.code }));
      }
    })();
  }, [token, user]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.screen }}>
      <Text>{msg || (user ? t('m.join.joining') : t('m.join.signIn'))}</Text>
      {!user ? (
        <Text style={{ color: colors.primaryText, fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>
          {t('m.join.goLogin')}
        </Text>
      ) : null}
    </View>
  );
}

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

function Main() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }} edges={['top']}>
      <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(p) => <Dock {...p} />}>
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Groups" component={GroupsScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const t = useT();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  const header = {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.screen },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700' },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.screen },
  };
  // Auth sub-screens sit on the dark AuthLayout hero — header blends into it.
  const authHeader = { headerStyle: { backgroundColor: colors.darkHero }, headerTintColor: '#fff', contentStyle: { backgroundColor: colors.darkHero } };
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
          <Stack.Screen name="Join" component={JoinScreen} options={{ title: '' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={Main} options={{ headerShown: false }} />
          <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: '' }} />
          <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: t('groupDetail.addExpense'), presentation: 'modal' }} />
          <Stack.Screen name="ScanReceipts" component={ScanReceiptsScreen} options={{ title: t('scan.title'), presentation: 'modal' }} />
          <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ title: '' }} />
          <Stack.Screen name="Settlement" component={SettlementScreen} options={{ title: t('settlement.detailTitle') }} />
          <Stack.Screen name="Pay" component={PayScreen} options={{ title: t('groupDetail.recordPayment'), presentation: 'modal' }} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: t('wizard.newGroup'), presentation: 'modal' }} />
          <Stack.Screen name="QuickAdd" component={QuickAddScreen} options={{ title: t('quickAdd.title'), presentation: 'modal' }} />
          <Stack.Screen name="Statement" component={StatementScreen} options={{ title: t('statement.title') }} />
          <Stack.Screen name="Report" component={ReportScreen} options={{ title: t('report.title') }} />
          <Stack.Screen name="Invite" component={InviteScreen} options={{ title: t('invite.title'), presentation: 'modal' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('m.nav.profile') }} />
          <Stack.Screen name="System" component={SystemScreen} options={{ title: t('m.settings.offlinePush') }} />
          <Stack.Screen name="Join" component={JoinScreen} options={{ title: '' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <NavigationContainer linking={linking} fallback={<Text>…</Text>}>
            <Root />
          </NavigationContainer>
          <ToastHost />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
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
