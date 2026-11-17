import shell from './shell.js';
import group from './group.js';

export const messages = {
  en: { ...shell.en, ...group.en },
  vi: { ...shell.vi, ...group.vi },
};
