// SplitShare mobile — Expo Managed entry.
// Nav 1:1 with docs/mobile-design.html: bottom tabs Home · Groups · Add ·
// Activity · You (+ stack: GroupDetail, Settlement, Pay, NewGroup, Auth).
// Deep links: splitshare://g/<token> + https://app…/g/<token> -> Join
// (POST /groups/join idempotent; 410 INVITE_ROTATED / 404).
import React from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import AuthScreen, { RegisterScreen, ForgotScreen } from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import GroupDetailScreen, { GroupsScreen } from './src/screens/GroupScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import SettlementScreen from './src/screens/SettlementScreen';
import PayScreen from './src/screens/PayScreen';
import NewGroupScreen from './src/screens/NewGroupScreen';
import SystemScreen from './src/screens/SystemScreen';
import { api } from './src/api/client';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const prefix = Linking.createURL('/');
const linking = {
  prefixes: [prefix, 'https://app'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Groups: 'groups',
          Activity: 'activity',
          You: 'you',
        },
      },
      Join: 'g/:token',
      GroupDetail: 'groups/:id',
    },
  },
};

function JoinScreen({ route, navigation }) {
  const { token } = route.params || {};
  const [msg, setMsg] = React.useState('Joining…');
  React.useEffect(() => {
    (async () => {
      try {
        const g = await api.post('/api/v1/groups/join', { token });
        navigation.replace('GroupDetail', { id: g.group_id || g.group?.group_id });
      } catch (e) {
        setMsg(e.code === 'INVITE_ROTATED' ? 'Invite rotated (410) — ask owner for a new link.' : `Join failed: ${e.code || e.message}`);
      }
    })();
  }, [token]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>{msg}</Text></View>;
}

// Add tab = action sheet entry: reuse NewGroup quick-create (matches web
// BottomNav Add -> Dashboard wizard state.openNew). Expense add lives in
// GroupDetail sticky button (Frame 3 -> Frame 4).
function AddPlaceholder({ navigation }) {
  React.useEffect(() => {
    const t = setTimeout(() => navigation.replace('NewGroup'), 0);
    return () => clearTimeout(t);
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}

function Main() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Groups" component={GroupsScreen} />
      <Tab.Screen name="Add" component={AddPlaceholder} />
      <Tab.Screen name="Activity" component={SystemScreen} />
      <Tab.Screen name="You" component={SystemScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  return (
    <Stack.Navigator>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={AuthScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Forgot" component={ForgotScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={Main} options={{ headerShown: false }} />
          <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={{ title: 'Group' }} />
          <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'New expense' }} />
          <Stack.Screen name="Settlement" component={SettlementScreen} options={{ title: 'Settlement' }} />
          <Stack.Screen name="Pay" component={PayScreen} options={{ title: 'Pay' }} />
          <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: 'New group' }} />
          <Stack.Screen name="Join" component={JoinScreen} options={{ title: 'Join' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer linking={linking} fallback={<Text>Loading…</Text>}>
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}
