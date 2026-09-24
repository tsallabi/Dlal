import https from 'node:https'; import fs from 'node:fs';
const fx = (n) => fs.readFileSync(new URL(n, import.meta.url));
https.createServer({ key: fx('key.pem'), cert: fx('cert.pem') }, (req, res) => {
  const host = req.headers.host || ''; const u = req.url || '';
  let file = 'detail.html';
  if (host.startsWith('s.')) file = 'list.html';
  if (u.includes('offer/900000002')) file = 'detail-nologin.html';   // صفحة كما تظهر لزائر غير مسجّل
  if (u.includes('captcha=1') || u.includes('offer/900000003')) file = 'captcha.html';
  // صفحة لا يكتمل تحميلها أبدًا (كما تفعل بعض صفحات 1688 الثقيلة): تُفعَّل مرة واحدة بإنشاء /tmp/fx-hang
  if (file === 'detail.html' && fs.existsSync('/tmp/fx-hang')) {
    fs.unlinkSync('/tmp/fx-hang'); console.log('FX HANG', u);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.write('<html><head><title>تحميل</title></head><body><div>');
    return;   // لا res.end(): المتصفح ينتظر إلى الأبد
  }
  // اكتشاف مجاني (discover.mjs): منتجات 9102xxxxx صفحاتها مولَّدة بعنوان مختلف لكل رقم، وكل صفحة منتج
  // تحمل كتلة «看了又看» فيها روابط ثلاثة منتجات أخرى — مفعّلة ما دام /tmp/fx-reco موجودًا
  const reco = fs.existsSync('/tmp/fx-reco');
  const rid = (u.match(/offer\/(9102\d{5})/) || [])[1];
  const block = (from) => '<div class="recommend"><h3>看了又看</h3>' + [1, 2, 3].map(k => `<a href="//detail.1688.com/offer/${910200000 + ((Number(from) + k) % 1000) || 910200001}.html">x</a>`).join('') + '</div>';
  if (reco && rid) {
    const n = Number(rid) % 1000;
    console.log('FX RECO', u);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><html><head><title>مصباح مكتب ${n} - 阿里巴巴</title></head><body><h1>Ningbo lamp co., ltd</h1>
<div class="price">¥ ${10 + n}.50</div><img src="https://cbu01.alicdn.com/img/ibank/2026/r${n}a.jpg"><img src="https://cbu01.alicdn.com/img/ibank/2026/r${n}b.jpg">
<table><tr><td>Color</td><td>白色,黑色</td></tr><tr><td>Weight (g)</td></tr><tr><td>450</td></tr></table>
<p>起批量 ${n === 3 ? 5 : 1}件</p>${block(rid)}</body></html>`);
  }
  console.log('FX', host, u, '->', file);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (reco && file === 'detail.html') return res.end(String(fx(file)).replace('</body>', block(910200000) + '</body>'));
  res.end(fx(file));
}).listen(443, '127.0.0.1', () => console.log('fixture https on 443'));
