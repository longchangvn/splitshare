// SplitShare mobile — Expo managed entry.
// Tabs: Home · Groups · Add · Activity · You.
// Deep links (all web URLs resolve to a screen, spec 005 task 5.7):
//   /                     → Home
//   /groups/:id           → Group
//   /groups/:id/expenses/:expenseId → Expense detail
//   /groups/:id/statement → Statement
//   /groups/:id/activity  → Group activity
//   /groups/:id/report    → Report
//   /g/:token, /join/:token → Invite landing (410 INVITE_ROTATED shown)
//   /s/:token             → Public read-only share
//   /reset/:token         → Password reset (signs in)
//   /verify/:token        → Email verification
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { PrefsProvider } from './src/prefs';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import AuthScreen, { RegisterScreen, ForgotScreen, ResetScreen, GoogleTokenScreen, VerifyEmailScreen } from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import GroupDetailScreen, { GroupsScreen } from './src/screens/GroupScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpenseDetailScreen from './src/screens/ExpenseDetailScreen';
import SettlementScreen from './src/screens/SettlementScreen';
import PayScreen from './src/screens/PayScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import QuickAdd from './src/screens/QuickAdd';
import SystemScreen from './src/screens/SystemScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import Settings from './src/screens/Settings';
import Categories from './src/screens/Categories';
import Recurring from './src/screens/Recurring';
import Statement from './src/screens/Statement';
import Report from './src/screens/Report';
import GroupActivity from './src/screens/GroupActivity';
import GroupSettings from './src/screens/GroupSettings';
import { InviteLandingScreen, SharePublicScreen } from './src/screens/PublicScreens';
import { registerPush, addNotificationResponseListener } from './src/push/notifications';
import { colors } from './src/theme';
import { useT } from './src/prefs';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const prefix = Linking.createURL('/');
const linking = {
  prefixes: [prefix, 'https://app', 'splitshare://'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: '',
          Groups: 'groups',
          Activity: 'activity',
          You: 'you',
        },
      },
      InviteLanding: 'g/:token',
      InviteJoin: 'join/:token',
      SharePublic: 's/:token',
      Reset: 'reset/:token',
      VerifyEmail: 'verify/:token',
      GroupDetail: 'groups/:id',
      ExpenseDetail: 'groups/:groupId/expenses/:expenseId',
      Statement: 'groups/:id/statement',
      GroupActivity: 'groups/:id/activity',
      Report: 'groups/:id/report',
    },
  },
};

function AddPlaceholder() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}

function Main() {
  const t = useT();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.screen }} edges={['top']}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { minHeight: 56 },
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
        <Tab.Screen name="Groups" component={GroupsScreen} options={{ title: t('nav.groups') }} />
        <Tab.Screen
          name="Add"
          component={AddPlaceholder}
          options={{ title: t('common.add') }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate('QuickAdd');
            },
          })}
        />
        <Tab.Screen name="Activity" component={SystemScreen} options={{ title: t('nav.activity') }} />
        <Tab.Screen name="You" component={ProfileScreen} options={{ title: t('profile.title') }} />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const t = useT();
  const navigationRef = useRef(null);
  const pushRegistered = useRef(false);

  // Register the Expo token once per signed-in session; the API upserts.
  useEffect(() => {
    if (!user || pushRegistered.current) return;
    pushRegistered.current = true;
    registerPush().catch(() => {});
  }, [user]);

  // Notification tap → group or expense.
  useEffect(() => {
    const unsubscribe = addNotificationResponseListener((name, params) => {
      navigationRef.current?.navigate(name, params);
    });
    return unsubscribe;
  }, []);

  // Return to a pending invite after login.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await AsyncStorage.getItem('ss_pending_invite').catch(() => null);
      if (!token) return;
      await AsyncStorage.removeItem('ss_pending_invite').catch(() => {});
      setTimeout(() => navigationRef.current?.navigate('InviteLanding', { token }), 60);
    })();
  }, [user]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking} fallback={<Text>{t('common.loading')}</Text>}>
      <Stack.Navigator>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={AuthScreen} options={{ headerShown: false, title: t('auth.logIn') }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: t('auth.register') }} />
            <Stack.Screen name="Forgot" component={ForgotScreen} options={{ title: t('auth.forgotPassword') }} />
            <Stack.Screen name="Reset" component={ResetScreen} options={{ title: t('auth.resetPassword') }} />
            <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ title: t('auth.emailVerification') }} />
            <Stack.Screen name="GoogleToken" component={GoogleTokenScreen} options={{ title: 'Google' }} />
            <Stack.Screen name="InviteLanding" component={InviteLandingScreen} options={{ title: t('invite.title') }} />
            <Stack.Screen name="InviteJoin" component={InviteLandingScreen} options={{ title: t('invite.title') }} />
            <Stack.Screen name="SharePublic" component={SharePublicScreen} options={{ title: t('share.readOnly') }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={Main} options={{ headerShown: false }} />
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: t('nav.groups') }} />
            <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: t('groupDetail.newExpense') }} />
            <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={{ title: t('groupDetail.expense') }} />
            <Stack.Screen name="Settlement" component={SettlementScreen} options={{ title: t('settlement.detailTitle') }} />
            <Stack.Screen name="Pay" component={PayScreen} options={{ title: t('forms.payment.record') }} />
            <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: t('wizard.newGroup') }} />
            <Stack.Screen name="QuickAdd" component={QuickAdd} options={{ title: t('quickAdd.title'), presentation: 'modal' }} />
            <Stack.Screen name="GroupActivity" component={GroupActivity} options={{ title: t('groupDetail.tabActivity') }} />
            <Stack.Screen name="Statement" component={Statement} options={{ title: t('statement.title') }} />
            <Stack.Screen name="Report" component={Report} options={{ title: t('report.title') }} />
            <Stack.Screen name="Categories" component={Categories} options={{ title: t('groupDetail.tabCategories') }} />
            <Stack.Screen name="Recurring" component={Recurring} options={{ title: t('groupDetail.recurringBills') }} />
            <Stack.Screen name="GroupSettings" component={GroupSettings} options={{ title: t('groupDetail.groupSettings') }} />
            <Stack.Screen name="Settings" component={Settings} options={{ title: t('settings.title') }} />
            <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} options={{ title: t('auth.emailVerification') }} />
            <Stack.Screen name="InviteLanding" component={InviteLandingScreen} options={{ title: t('invite.title') }} />
            <Stack.Screen name="InviteJoin" component={InviteLandingScreen} options={{ title: t('invite.title') }} />
            <Stack.Screen name="SharePublic" component={SharePublicScreen} options={{ title: t('share.readOnly') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
