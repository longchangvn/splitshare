// SplitEase theme: Google Stitch project "Bill Splitter Mobile UI".
// Primary #006948, Plus Jakarta Sans, Material Symbols Outlined, 8px base radius.
import { createTheme } from '@mantine/core';
import favicon from './favicon.svg';
import { routes, nav, features } from './screens/index.jsx';
import { messages } from './messages/index.js';

const FONT = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const brand = ['#e8f6ef', '#c9ecdb', '#a1dcc0', '#6fc9a0', '#3fb682', '#16a06a', '#00855d', '#006948', '#00553a', '#003f2b'];

export default {
  name: 'splitease',
  label: 'SplitEase',
  mantine: createTheme({
    colors: { brand },
    primaryColor: 'brand',
    primaryShade: { light: 7, dark: 4 },
    defaultRadius: 'md',
    fontFamily: FONT,
    headings: { fontFamily: FONT, fontWeight: '700' },
  }),
  fonts: [
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&display=block',
  ],
  favicon,
  themeColor: '#006948',
  // 'material' = ThemedIcon renders its Material Symbols name instead of the SVG children.
  icons: 'material',
  routes,
  nav,
  features,
  messages,
};
