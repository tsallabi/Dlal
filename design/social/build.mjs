// صورة البروفايل وصورة الغلاف لصفحة فيسبوك «هدهدي» — تُولَّد من الشعار نفسه (design/hudhud/hudhud-logo-static.svg)
// وبألوان الموقع (القرفة). node design/social/build.mjs ⟵ design/social/*.png
// المقاسات كما يطلبها فيسبوك (٢٠٢٦): البروفايل 720×720 ويُعرض دائرة، والغلاف 1640×624 (ضعف 820×312 على الحاسوب).
// الجوال يقصّ جانبي الغلاف فيبقى الوسط ~1110 بكسل: كل ما يُقرأ داخله، والحوافّ زخرفة فقط.
import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const DIR = new URL('.', import.meta.url).pathname;
const bird = readFileSync(new URL('../hudhud/hudhud-logo-static.svg', import.meta.url), 'utf8')
  .replace('<svg ', '<svg class="bird" ');
const N = process.env.PRODUCTS || '11,000+';   // يُحدَّث من القاعدة الحية عند كل توليد

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=block" rel="stylesheet">`;
const BASE = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:Cairo,sans-serif;direction:rtl}`;

const plane = `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`;
const ship = `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M20 21c-1.4 0-2.8-.5-4-1.3-2.4 1.7-5.6 1.7-8 0-1.2.8-2.6 1.3-4 1.3H2v2h2c1.4 0 2.7-.3 4-1 2.5 1.3 5.5 1.3 8 0 1.3.7 2.6 1 4 1h2v-2h-2zM3.9 19H4c1.6 0 3-.9 4-2 1 1.1 2.4 2 4 2s3-.9 4-2c1 1.1 2.4 2 4 2h.1l1.9-6.7c.1-.5-.1-1-.6-1.2L20 10.6V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.6l-1.3.5c-.5.2-.7.7-.6 1.2L3.9 19zM6 6h12v3.97L12 8 6 9.97V6z"/></svg>`;
const tag = `<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .6.2 1.1.6 1.4l9 9c.4.4.9.6 1.4.6s1-.2 1.4-.6l7-7c.4-.4.6-.9.6-1.4s-.2-1-.6-1.4zM5.5 7A1.5 1.5 0 1 1 7 5.5 1.5 1.5 0 0 1 5.5 7z"/></svg>`;
// رابط لا رقم: الغلاف صورة ثابتة، وعدد المنتجات يتغيّر مع كل دفعة استيراد — و«اطلب برابط» يجعل كل 1688 متاحًا
const link = `<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>`;
const box = `<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M21 16.5c0 .4-.2.7-.5.9l-7.9 4.4c-.2.1-.4.2-.6.2s-.4-.1-.6-.2l-7.9-4.4c-.3-.2-.5-.5-.5-.9v-9c0-.4.2-.7.5-.9l7.9-4.4c.2-.1.4-.2.6-.2s.4.1.6.2l7.9 4.4c.3.2.5.5.5.9v9zM12 4.2 6 7.5l6 3.3 6-3.3-6-3.3z"/></svg>`;

// ---------- البروفايل 720×720 (يُعرض دائرة) ----------
const profile = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{width:720px;height:720px;background:radial-gradient(circle at 50% 38%,#FFF8F0 0,#FDEBD8 55%,#F6D2AE 100%);display:grid;place-items:center;overflow:hidden}
.ring{position:absolute;inset:18px;border-radius:50%;border:14px solid #B05A20}
.wrap{position:relative;display:grid;justify-items:center;margin-top:-6px}
.bird{width:470px;height:auto;margin-bottom:-26px;transform:translateX(-18px)}
.name{font-weight:900;font-size:118px;line-height:1;color:#8A4416;letter-spacing:-1px}
.latin{font-family:Arial,sans-serif;font-weight:800;font-size:30px;letter-spacing:12px;color:#B05A20;margin-top:34px;direction:ltr}
</style></head><body><div class="ring"></div><div class="wrap">${bird}<div class="name">هدهدي</div><div class="latin">HUDHUDE</div></div></body></html>`;

// ---------- الغلاف 1640×624 ----------
const cover = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{width:1640px;height:624px;overflow:hidden;position:relative;color:#fff;
  background:linear-gradient(115deg,#6E3310 0%,#8A4416 30%,#B05A20 68%,#C9712F 100%)}
/* زخرفة الحواف (يقصّها الجوال) */
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.09) 2px,transparent 2.5px);background-size:34px 34px;mask:linear-gradient(90deg,#000 0,transparent 22%,transparent 78%,#000 100%)}
.glow{position:absolute;width:760px;height:760px;border-radius:50%;left:195px;top:-120px;background:radial-gradient(circle,rgba(255,236,214,.95) 0,rgba(255,236,214,.55) 38%,rgba(255,236,214,0) 70%)}
/* الطائر في الوسط الأيسر، والنص في الوسط الأيمن — كلاهما داخل الـ1110 الوسطى */
.bird{position:absolute;left:330px;top:70px;width:470px;height:auto;filter:drop-shadow(0 18px 24px rgba(60,25,5,.35))}
.route{position:absolute;left:305px;top:430px;width:520px;height:120px;color:#FFE9D2}
.route .lbl{position:absolute;bottom:0;font-weight:800;font-size:26px;color:#fff}
.txt{position:absolute;right:300px;top:30px;width:600px}
.name{font-weight:900;font-size:124px;line-height:1}
.name small{display:block;font-size:44px;font-weight:800;color:#FFE1C2;margin-top:10px}
.lead{font-size:31px;font-weight:700;line-height:1.5;margin-top:22px;color:#FFF6EC}
.lead b{color:#fff;background:rgba(0,0,0,.18);padding:0 10px;border-radius:10px}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.chip{display:flex;align-items:center;gap:8px;background:#FFF6EC;color:#6E3310;font-weight:800;font-size:23px;padding:8px 16px;border-radius:999px}
.chip svg{color:#B05A20;width:26px;height:26px}
.url{display:inline-block;margin-top:14px;font-family:Arial,sans-serif;font-weight:800;font-size:30px;letter-spacing:1px;direction:ltr;
  background:#1C1A19;color:#fff;padding:8px 22px;border-radius:12px}
.pay{margin-top:16px;font-size:22px;font-weight:700;color:#FFE1C2}
</style></head><body>
<div class="dots"></div><div class="glow"></div>
${bird}
<svg class="route" viewBox="0 0 520 120">
  <path d="M40 70 C150 -10 370 -10 480 70" fill="none" stroke="#FFE9D2" stroke-width="4" stroke-dasharray="3 12" stroke-linecap="round"/>
  <circle cx="40" cy="70" r="10" fill="#fff"/><circle cx="480" cy="70" r="10" fill="#fff"/>
  <g transform="translate(246 2) rotate(90 15 15)" color="#fff">${plane.replace('<svg ', '<svg x="0" y="0" ')}</g>
</svg>
<div class="route" style="pointer-events:none"><span class="lbl" style="left:0">الصين</span><span class="lbl" style="right:0">ليبيا</span></div>
<div class="txt">
  <div class="name">هدهدي<small>بوابتك إلى الصين</small></div>
  <p class="lead">من مصانع الصين إلى باب بيتك في ليبيا<br><b>بسعر نهائي بالدينار الليبي</b></p>
  <div class="chips">
    <span class="chip">${plane} جوًّا 12–18 يومًا</span>
    <span class="chip">${ship} بحرًا 30–45 يومًا</span>
    <span class="chip">${tag} شامل الشحن والجمارك</span>
    <span class="chip">${link} اطلب أي منتج برابط</span>
  </div>
  <div class="pay">ادفع محليًا: معاملات · سداد · إدفعلي · موبي كاش</div>
  <div class="url">hudhude.com</div>
</div>
</body></html>`;

// ---------- معاينة كما تظهر في فيسبوك: الحاسوب والجوال ----------
const preview = (coverB64, profB64) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{background:#f0f2f5;padding:24px;width:1400px;font-family:Cairo}
h3{margin:18px 0 8px;color:#333}
.desk{width:1100px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px #0002}
.desk .cv{width:1100px;height:419px;background:url(data:image/png;base64,${coverB64}) center/cover}
.desk .row{display:flex;align-items:flex-end;gap:16px;padding:0 40px 20px;margin-top:-60px}
.pf{border-radius:50%;border:5px solid #fff;background:url(data:image/png;base64,${profB64}) center/cover}
.desk .pf{width:168px;height:168px}
.desk h1{font-size:32px}.desk p{color:#65676b}
.mob{width:390px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px #0002}
.mob .cv{width:390px;height:219px;background:url(data:image/png;base64,${coverB64}) center/cover}
.mob .pf{width:120px;height:120px;margin:-60px auto 0}
.mob h1{text-align:center;font-size:24px;padding:6px 0 18px}
.pair{display:flex;gap:30px;align-items:flex-start}
</style></head><body>
<h3>الحاسوب</h3>
<div class="desk"><div class="cv"></div><div class="row"><div class="pf"></div><div><h1>هدهدي HUDHUDE</h1><p>تسوّق · بوابتك إلى الصين</p></div></div></div>
<div class="pair"><div><h3>الجوال</h3><div class="mob"><div class="cv"></div><div class="pf"></div><h1>هدهدي HUDHUDE</h1></div></div>
<div><h3>صورة البروفايل في التعليقات (40 بكسل)</h3><div class="pf" style="width:40px;height:40px;border:0"></div></div></div>
</body></html>`;

const exe = process.env.CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const shot = async (html, w, h, out) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const cairo = await p.evaluate(() => document.fonts.check('900 40px Cairo'));
  await p.screenshot({ path: DIR + out, fullPage: h === 0 });
  await p.close();
  console.log(out, cairo ? '(Cairo ✓)' : '(⚠️ Cairo لم يُحمَّل)');
};
await shot(profile, 720, 720, 'hudhude-profile-720.png');
await shot(cover, 1640, 624, 'hudhude-cover-1640x624.png');
const b64 = (f) => readFileSync(DIR + f).toString('base64');
await shot(preview(b64('hudhude-cover-1640x624.png'), b64('hudhude-profile-720.png')), 1450, 0, 'preview-facebook.png');
writeFileSync(DIR + 'cover.html', cover); writeFileSync(DIR + 'profile.html', profile);
await b.close();
