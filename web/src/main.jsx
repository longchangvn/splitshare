import React from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from './theme.js';
import App from './App.jsx'
import { initOneSignal } from './onesignal.js';

initOneSignal(); // fire-and-forget; no-op without VITE_ONESIGNAL_APP_ID

createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme}>
    <ModalsProvider>
      <Notifications position="top-right" />
      <App />
    </ModalsProvider>
  </MantineProvider>
)
