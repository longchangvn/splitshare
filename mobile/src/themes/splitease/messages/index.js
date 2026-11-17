import account from './account';
import group from './group';

export const messages = {
  en: { ...account.en, ...group.en },
  vi: { ...account.vi, ...group.vi },
};
