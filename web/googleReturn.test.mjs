// Behavioral test for web/src/googleReturn.js with a stubbed browser env.
const store = new Map();
const ss = new Map();
let failStorage = false;
const calls = { posts: [], closes: 0, replaces: [] };

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (failStorage) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = {
  getItem: (k) => (ss.has(k) ? ss.get(k) : null),
  setItem: (k, v) => ss.set(k, String(v)),
  removeItem: (k) => ss.delete(k),
};
// Real browsers drop the fragment when replaceState targets a URL without one.
globalThis.history = {
  replaceState: (_s, _t, url) => {
    calls.replaces.push(url);
    const loc = globalThis.window?.location;
    if (loc) { const i = url.indexOf('#'); loc.hash = i === -1 ? '' : url.slice(i); }
  },
};

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

// 4. no opener -> finishes the flow in this document, WITHOUT navigating.
//    A reload here would race the drain and kill the exchange in flight, which
//    is what bounced users back to the login form after a successful consent.
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK3', opener: null });
mod.consumeReturn();
check('no-opener does not navigate', calls.replaces.length === 0, JSON.stringify(calls.replaces));
check('token still parked for that page', mod.takePending()?.id_token === 'TK3');

// 5. user cancels -> error payload, no token
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#error=access_denied&error_description=User+cancelled', opener: null });
mod.consumeReturn();
parked = mod.takePending();
check('error parked without a token', !parked?.id_token && parked?.error === 'access_denied', JSON.stringify(parked));
check('error_description decoded', parked?.error_description === 'User cancelled', JSON.stringify(parked));

// 6. closed opener is treated as no opener -> same no-navigation finish
store.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK4', opener: { closed: true } });
mod.consumeReturn();
check('closed opener does not navigate', calls.replaces.length === 0, JSON.stringify(calls.replaces));
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

// 9. storage blocked (private mode / quota): the fragment must survive
store.clear(); ss.clear(); calls.replaces.length = 0;
failStorage = true;
globalThis.window = makeWindow({ hash: '#id_token=TK9', opener: null });
mod.consumeReturn();
failStorage = false;
const last9 = calls.replaces.at(-1);
check('storage failure keeps the fragment', last9.includes('id_token=TK9'), last9);
check('storage failure still reaches /login', last9.startsWith('/login'), last9);

// 10. the surviving fragment is then readable by the login page
globalThis.window = makeWindow({ hash: '#id_token=TK9', opener: null });
const rec = mod.takePending();
check('takePending falls back to the URL fragment', rec?.id_token === 'TK9', JSON.stringify(rec));
check('the fragment is consumed exactly once', mod.takePending() === null);

// 11. mobile redirect flow must never treat its own tab as a popup
store.clear(); ss.clear(); calls.posts.length = 0; calls.replaces.length = 0;
ss.set(mod.REDIRECT_FLOW_KEY, '1');
const opener3 = { closed: false, postMessage: (m, o) => calls.posts.push({ m, o }) };
const w11 = makeWindow({ hash: '#id_token=TK11', opener: opener3 });
w11.close = () => { w11._closed = true; };
globalThis.window = w11;
mod.consumeReturn();
check('redirect flow does not ping an opener', calls.posts.length === 0, JSON.stringify(calls.posts));
check('redirect flow leaves its own tab open', w11.closed === false);
check('redirect flow does not reload the tab (the bug that ate the token)', calls.replaces.length === 0, JSON.stringify(calls.replaces));
check('redirect flow marker is consumed', !ss.has(mod.REDIRECT_FLOW_KEY));

// 12. the marker only applies to its own flow — desktop still hands off
store.clear(); ss.clear(); calls.posts.length = 0; calls.replaces.length = 0;
const opener4 = { closed: false, postMessage: (m, o) => calls.posts.push({ m, o }) };
const w12 = makeWindow({ hash: '#id_token=TK12', opener: opener4 });
w12.close = () => { w12._closed = true; };
globalThis.window = w12;
mod.consumeReturn();
check('popup flow still pings its opener', calls.posts.length === 1, JSON.stringify(calls.posts));
check('popup flow still closes', w12.closed === true);

// 13. the regression this fix exists for: a successful consent on the redirect
//     path must leave the token drainable in-place. Reordering these two calls
//     is what silently discarded the sign-in.
store.clear(); ss.clear(); calls.replaces.length = 0;
globalThis.window = makeWindow({ hash: '#id_token=TK13&state=%2Fgroups%2F9', opener: null });
mod.consumeReturn();
const p13 = mod.takePending();
check('no reload after a successful consent', calls.replaces.length === 0, JSON.stringify(calls.replaces));
check('token is drainable in-place', p13?.id_token === 'TK13', JSON.stringify(p13));
check('dest survives the round trip', p13?.next === '/groups/9', JSON.stringify(p13));
check('drained exactly once', mod.takePending() === null);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
