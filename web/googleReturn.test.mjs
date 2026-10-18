// Behavioral test for web/src/googleReturn.js with a stubbed browser env.
const store = new Map();
const calls = { posts: [], closes: 0, replaces: [] };

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.history = { replaceState: (_s, _t, url) => calls.replaces.push(url) };

const makeWindow = ({ hash, opener }) => ({
  location: {
    hash,
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    replace: (u) => calls.replaces.push(u),
  },
  get opener() { return opener; },
  get closed() { return this._closed; },
  _closed: false,
  postMessage: (msg, origin) => calls.posts.push({ msg, origin }),
  close() { this._closed = true; },
});

const mod = await import('./src/googleReturn.js');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// 1. no fragment -> totally inert
calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '', opener: null });
mod.consumeReturn();
check('no fragment is a no-op', calls.replaces.length === 0);

// 2. success with an opener -> parks, pings opener, closes
store.clear(); calls.posts.length = 0; calls.replaces.length = 0;
const opener = { closed: false, postMessage: (msg, origin) => calls.posts.push({ msg, origin }) };
globalThis.window = makeWindow({ hash: '#id_token=TK1&state=%2Fgroups%2F5', opener });
mod.consumeReturn();
let parked = mod.takePending();
check('token parked for opener', parked?.id_token === 'TK1', JSON.stringify(parked));
check('state decoded as next', parked?.next === '/groups/5', JSON.stringify(parked));
check('pinged opener with our origin', calls.posts[0]?.origin === 'http://localhost:3000', JSON.stringify(calls.posts[0]));
check('ping carries PING type', calls.posts[0]?.msg?.type === mod.PING);
check('fragment stripped', calls.replaces[0] === '/', calls.replaces[0]);
check('popup closed itself after handing over', globalThis.window.closed === true);
check('did not ALSO redirect (would double-exchange)', !calls.replaces.includes('/login'), JSON.stringify(calls.replaces));
check('parked token is consumed exactly once', mod.takePending() === null);

// 3. hostile state cannot escape the origin
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK2&state=%2F%2Fevil.com', opener: null });
mod.consumeReturn();
parked = mod.takePending();
check('//host state dropped', parked?.next === null, JSON.stringify(parked));

// 4. no opener -> finishes the flow in this document
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK3', opener: null });
mod.consumeReturn();
check('no-opener redirects to /login', calls.replaces.at(-1) === '/login', calls.replaces.at(-1));
check('token still parked for that page', mod.takePending()?.id_token === 'TK3');

// 5. user cancels -> error payload, no token
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#error=access_denied&error_description=User+cancelled', opener: null });
mod.consumeReturn();
parked = mod.takePending();
check('error parked without a token', !parked?.id_token && parked?.error === 'access_denied', JSON.stringify(parked));
check('error_description decoded', parked?.error_description === 'User cancelled', JSON.stringify(parked));

// 6. closed opener is treated as no opener
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK4', opener: { closed: true } });
mod.consumeReturn();
check('closed opener -> local finish', calls.replaces.at(-1) === '/login', calls.replaces.at(-1));
check('token parked for local finish', mod.takePending()?.id_token === 'TK4');

// 7. browser refuses to close the popup -> still must land somewhere usable
store.clear(); calls.replaces.length = 0;
const opener2 = { closed: false, postMessage: (msg, origin) => calls.posts.push({ msg, origin }) };
const w7 = makeWindow({ hash: '#id_token=TK5', opener: opener2 });
w7.close = () => { /* browser blocks script-close */ };
globalThis.window = w7;
mod.consumeReturn();
check('blocked close -> still pinged opener', calls.posts.at(-1)?.msg?.type === mod.PING);
check('blocked close -> redirects so token is drained', calls.replaces.at(-1) === '/login', calls.replaces.at(-1));
check('blocked close still parks token', mod.takePending()?.id_token === 'TK5');

// 8. makeNonce must never throw — the original bug was a TypeError here that
//    killed the button before it opened anything.
let n1 = null;
let n2 = null;
let n3 = null;
try { n1 = mod.makeNonce(); } catch (e) { console.log('  threw:', e.message); }
check('nonce from real crypto is a non-empty string', typeof n1 === 'string' && n1.length > 8, JSON.stringify(n1));

// Insecure origin: randomUUID is SecureContext-only -> undefined.
const fakeCrypto = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 3) % 256; return a; } };
n2 = mod.makeNonce(fakeCrypto);
check('insecure origin falls back to getRandomValues', typeof n2 === 'string' && n2.length === 32, JSON.stringify(n2));

// No usable crypto at all -> the exact path that crashed the phone.
n3 = mod.makeNonce({});
check('no crypto does not throw (the original crash)', typeof n3 === 'string' && n3.length > 0, JSON.stringify(n3));
check('nonces are distinct', n1 !== n2 && n2 !== n3 && n1 !== n3);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
