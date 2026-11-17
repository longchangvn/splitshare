// SplitEase-only group / expense / payment screens and feature flags.
// Screens are required lazily: this file loads while the theme registry is still being built,
// before src/theme.js (which the screens' styles need) can resolve the active theme.
import React from 'react';

function lazy(load) {
  return function LazyScreen(props) {
    const C = load().default;
    return <C {...props} />;
  };
}

export const screens = [
  {
    name: 'PaymentRecorded',
    component: lazy(() => require('./PaymentRecordedScreen')),
    options: (t) => ({ title: t('groupDetail.paymentRecorded'), presentation: 'modal' }),
  },
];

export const features = {
  groupHero: true, // GroupScreen: status chips + "Your group net" card + header chip (M22)
  memberCarousel: true, // GroupScreen: horizontally scrolling member-balance cards (M22)
  ledgerByDate: true, // LedgerTab: date-grouped ledger cards, category chips, lent/borrowed (M22/M11)
  closedBanner: true, // GroupScreen: "All balances settled · ledger locked" banner when closed (M39/M46)
  removalPreview: true, // PeopleTab: structured member-removal re-split preview (M5)
  settingsCards: true, // GroupSettingsSheet: access-status cards + danger-zone card (M24)
  expenseCards: true, // ExpenseFields/ExpenseForm: amount hero, tiles, paid-by + split cards (M50/M34/M8)
  payCards: true, // PayScreen: payer → recipient card, big amount, method chips (M29/M36/M41)
  paymentRecorded: true, // PayScreen → PaymentRecorded confirmation screen (M31/M40/M54)
  inviteQr: true, // InviteScreen: copy link + QR code of the invite link (M33)
};
