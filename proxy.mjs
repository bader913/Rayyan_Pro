import http from 'http';

const TARGET_PORT = 5001;

const server = http.createServer((req, res) => {
  const options = {
    hostname: 'localhost',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${TARGET_PORT}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxy, { end: true });

  proxy.on('error', () => {
    res.writeHead(502);
    res.end('Rayyan Pro is starting...');
  });
});

server.on('upgrade', (req, socket, head) => {
  const proxyReq = http.request({
    hostname: 'localhost',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    const headers = ['HTTP/1.1 101 Switching Protocols'];
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      headers.push(`${k}: ${v}`);
    }
    socket.write(headers.join('\r\n') + '\r\n\r\n');
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(5000, '0.0.0.0', () => {
  console.log(`✓ Rayyan Pro proxy: port 5000 → ${TARGET_PORT}`);
});
