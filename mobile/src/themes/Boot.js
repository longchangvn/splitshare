// Startup gate: picks the theme, loads its fonts, then requires App so every module-level
// StyleSheet is created with the chosen theme's tokens.
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Font from 'expo-font';
import { THEMES, THEME_STORAGE_KEY, setActiveTheme } from './index';

async function pickThemeName() {
  const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY).catch(() => null);
  if (THEMES[saved]) return saved;
  const built = process.env.EXPO_PUBLIC_THEME || Constants.expoConfig?.extra?.theme;
  return THEMES[built] ? built : undefined;
}

export default function Boot() {
  const [App, setApp] = React.useState(null);
  React.useEffect(() => {
    (async () => {
      const theme = setActiveTheme(await pickThemeName());
      if (theme.fonts) await Font.loadAsync(theme.fonts.assets).catch(() => {});
      if (theme.icons === 'material') {
        const { MaterialIcons } = require('@expo/vector-icons');
        await Font.loadAsync(MaterialIcons.font).catch(() => {});
      }
      setApp(() => require('../../App').default);
      // Ask the API which theme to use next launch (public endpoint; failures ignored).
      require('../api/client').getCapabilities().then((caps) => {
        if (caps && 'theme' in caps) require('./remember').rememberServerTheme(caps.theme);
      }).catch(() => {});
    })();
  }, []);
  if (!App) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <App />;
}
