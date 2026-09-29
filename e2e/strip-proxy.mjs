// Reverse proxy kecil yang MEMBUANG header Cookie/Authorization sebelum meneruskan permintaan —
// tiruan proxy pratinjau tersemat (mis. arena.site) tempat cookie tidak pernah sampai ke aplikasi.
import http from "node:http";

export function startStripProxy(port, target = "http://127.0.0.1:3000") {
  const t = new URL(target);
  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, host: t.host };
    delete headers.cookie;
    delete headers.authorization;
    const up = http.request({ hostname: t.hostname, port: t.port, path: req.url, method: req.method, headers }, (ur) => {
      res.writeHead(ur.statusCode ?? 502, ur.headers);
      ur.pipe(res);
    });
    up.on("error", () => {
      res.writeHead(502);
      res.end("proxy error");
    });
    req.pipe(up);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
