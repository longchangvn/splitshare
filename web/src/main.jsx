import React from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from './theme.js';
import { PrefsProvider, usePrefs } from './prefs.jsx';
import App from './App.jsx'
import { initOneSignal } from './onesignal.js';
import { consumeReturn } from './googleReturn.js';

// Must run before React mounts: if this document is the OAuth popup Google
// redirected back to, hand the token to the tab that started the flow.
consumeReturn();

initOneSignal(); // fire-and-forget; no-op without VITE_ONESIGNAL_APP_ID

function bootstrapThemeAttr() {
  const v = localStorage.getItem('ss-theme');
  document.documentElement.setAttribute('data-ss-theme', v === 'dark' ? 'dark' : 'light');
  const loc = localStorage.getItem('ss-locale');
  document.documentElement.lang = loc === 'vi' ? 'vi' : 'en';
}
bootstrapThemeAttr();

function ThemedRoot() {
  const { theme: colorScheme } = usePrefs();
  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme} defaultColorScheme={colorScheme}>
      <ModalsProvider>
        <Notifications position="top-right" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <PrefsProvider>
    <ThemedRoot />
  </PrefsProvider>
)
