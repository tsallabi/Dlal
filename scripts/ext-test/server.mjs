import https from 'node:https'; import fs from 'node:fs';
const fx = (n) => fs.readFileSync(new URL(n, import.meta.url));
https.createServer({ key: fx('key.pem'), cert: fx('cert.pem') }, (req, res) => {
  const host = req.headers.host || ''; const u = req.url || '';
  let file = 'detail.html';
  if (host.startsWith('s.')) file = 'list.html';
  if (u.includes('offer/900000002')) file = 'detail-nologin.html';   // صفحة كما تظهر لزائر غير مسجّل
  if (u.includes('captcha=1') || u.includes('offer/900000003')) file = 'captcha.html';
  console.log('FX', host, u, '->', file);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fx(file));
}).listen(443, '127.0.0.1', () => console.log('fixture https on 443'));
