// Mobile-only message keys, one file per workstream so screens can grow independently.
import common from './mobile/common';
import expense from './mobile/expense';
import home from './mobile/home';
import group from './mobile/group';
import account from './mobile/account';

const parts = [common, expense, home, group, account];

export const MOBILE_MESSAGES = {
  en: Object.assign({}, ...parts.map((p) => p.en)),
  vi: Object.assign({}, ...parts.map((p) => p.vi)),
};
