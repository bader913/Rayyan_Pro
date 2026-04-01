import http from 'http';
http.createServer((_, res) => res.end('ok')).listen(3000, '0.0.0.0');
