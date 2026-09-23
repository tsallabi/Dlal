import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// ١) فيديو قصير للحركة (دورتان)
const vctx = await b.newContext({ viewport: { width: 480, height: 400 }, recordVideo: { dir: 'vid', size: { width: 480, height: 400 } } });
const vp = await vctx.newPage();
await vp.setContent(`<body style="margin:0;background:#fff;display:grid;place-items:center;height:100vh">${fs.readFileSync('hudhud-logo.svg', 'utf8').replace('<svg ', '<svg width="460" ')}</body>`);
await vp.waitForTimeout(8800);
await vctx.close();
const v = fs.readdirSync('vid').find(f => f.endsWith('.webm')); fs.renameSync('vid/' + v, 'hudhud-animation.webm'); fs.rmSync('vid', { recursive: true });
// ٢) الشعار في ترويسة الموقع الحقيقية (الخادم المحلي) — الخيار ١
const logo = fs.readFileSync('hudhud-logo.svg', 'utf8');
const css = `.logo.hh{flex-direction:row!important;gap:4px!important;align-items:center}.logo.hh svg{height:62px;width:auto;margin-inline-end:-4px}
.logo.hh .t{display:flex;flex-direction:column;align-items:center;gap:5px;line-height:1}.logo.hh b{font-size:28px!important}.logo.hh b em{font-style:normal;color:#D9823F}
@media(max-width:560px){.logo.hh svg{height:46px}.logo.hh b{font-size:21px!important}}`;
for (const [w, name] of [[1280, 'site-desktop'], [390, 'site-mobile']]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 500 ? 760 : 700 }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await p.goto('http://localhost:8787/'); await p.waitForLoadState('networkidle');
  await p.evaluate(([svg, css]) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const a = document.querySelector('a.logo'); a.classList.add('hh');
    a.innerHTML = svg + '<span class="t"><b>هدهد <em>الصين</em></b><i>HUDHUD</i></span>';
    document.title = 'هدهد الصين | HUDHUD';
  }, [logo, css]);
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${name}.png` });
}
await b.close();
