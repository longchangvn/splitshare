// Container-only front proxy: :$PORT (ingress) -> Metro on :$METRO_PORT.
// Expo Go sends a `Forwarded` header; Expo CLI then answers with RELATIVE
// bundle/asset URLs, which Expo Go resolves against exp:// = http://<fqdn>:80.
// iOS won't load the bundle over plain HTTP from a public host ("Could not
// connect to development server"). Dropping the header makes Expo CLI emit
// absolute URLs from EXPO_PACKAGER_PROXY_URL (https://<fqdn>) instead.
const http = require('http');
const net = require('net');

const PORT = Number(process.env.PORT || 8081);
const METRO_PORT = Number(process.env.METRO_PORT || 8082);

const strip = (headers) => {
  const h = { ...headers };
  delete h.forwarded;
  return h;
};

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: METRO_PORT, method: req.method, path: req.url, headers: strip(req.headers) },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});

// WebSockets (dev tools, HMR): replay the upgrade request on a raw socket.
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(METRO_PORT, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(strip(req.headers))) {
      for (const val of [].concat(v)) lines.push(`${k}: ${val}`);
    }
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '0.0.0.0', () => console.log(`proxy :${PORT} -> metro :${METRO_PORT}`));
