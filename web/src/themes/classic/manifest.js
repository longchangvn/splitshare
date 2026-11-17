// Classic theme: the original SplitShare look. styles.css renders this theme through
// its var(--ss-*, <original>) fallbacks, so this theme defines no colour tokens.
import { createTheme } from '@mantine/core';
import favicon from './favicon.svg';

const FONT = '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Mantine's default teal, kept under the shared `brand` name that components use.
const brand = ['#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be', '#38d9a9', '#20c997', '#12b886', '#0ca678', '#099268', '#087f5b'];

export default {
  name: 'classic',
  label: 'Classic',
  mantine: createTheme({
    colors: { brand },
    primaryColor: 'brand',
    defaultRadius: 'md',
    fontFamily: FONT,
    headings: { fontFamily: FONT },
  }),
  fonts: ['https://fonts.googleapis.com/css2?family=Google+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'],
  favicon,
  themeColor: '#0f766e',
  // 'svg' = the inline SVG icons in each component (ThemedIcon renders its children).
  icons: 'svg',
  // Theme-only screens/nav; classic has none.
  routes: [],
  nav: [],
  features: {},
  messages: { en: {}, vi: {} },
};
