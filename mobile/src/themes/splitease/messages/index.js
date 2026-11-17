import account from './account';
import brand from './brand';
import group from './group';

export const messages = {
  en: { ...brand.en, ...account.en, ...group.en },
  vi: { ...brand.vi, ...account.vi, ...group.vi },
};
