// منشورات فيسبوك وإنستغرام بمنتجات حقيقية وأسعارها — 1080×1350 (4:5 أنسب مقاس للخلاصة في المنصّتين).
// يعمل على خوادم GitHub (workflow social-posts.yml): بيئة المساعد محجوبة عن صور 1688 وعن hudhude.com.
// يقرأ design/social/posts.json، ويرسم كل منشور، ويصوّر صفحة كل منتج الحية في الجوال للتأكد مما ستراه الزبونة
// حين تضغط الرابط، ويكتب captions.md بنصوص المنشورات وروابطها بوسم الحملة.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SITE = process.env.SITE || 'https://hudhude.com';
const OUT = process.env.OUT || 'social-out';
mkdirSync(OUT, { recursive: true });
const D = JSON.parse(readFileSync(new URL('./posts.json', import.meta.url), 'utf8'));
const bird = readFileSync(new URL('../hudhud/hudhud-logo-static.svg', import.meta.url), 'utf8');
const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const img = (u) => `${SITE}/img/${b64url(u)}`;   // وسيط الموقع نفسه: صور 1688 تمنع العرض من مواقع أخرى
const link = (slug, i) => `${SITE}/p/${slug}?utm_source=facebook&utm_medium=post&utm_campaign=${D.campaign}&utm_content=p${i}`;
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=block" rel="stylesheet">`;
const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1350px;overflow:hidden;font-family:Cairo,sans-serif;direction:rtl;background:#FFF8F0;position:relative}
.brand{position:absolute;top:34px;right:40px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.92);padding:6px 18px 6px 10px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.08)}
.brand svg{width:78px;height:auto}.brand b{font-size:34px;font-weight:900;color:#8A4416}
.foot{position:absolute;bottom:0;left:0;right:0;height:84px;background:#1C1A19;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:26px;font-weight:700}
.foot .url{font-family:Arial,sans-serif;font-weight:800;letter-spacing:1px;direction:ltr;font-size:30px}
.foot .pay{color:#F4C898}`;

const productPost = (p) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${CSS}
.ph{position:absolute;top:0;left:0;right:0;height:880px;background:#fff center/contain no-repeat;background-image:url("${img(p.img)}")}
.panel{position:absolute;top:880px;left:0;right:0;bottom:84px;background:linear-gradient(160deg,#B05A20,#7A3A12);color:#fff;padding:36px 48px 0}
.t{font-size:56px;font-weight:900;line-height:1.15}
.s{font-size:28px;font-weight:600;color:#FFE1C2;margin-top:6px}
.row{display:flex;align-items:flex-end;gap:26px;margin-top:22px}
.price{font-size:118px;font-weight:900;line-height:.95;letter-spacing:-2px}.price small{font-size:44px;font-weight:800;margin-inline-start:8px}
.note{font-size:24px;font-weight:700;color:#FFE1C2;padding-bottom:14px;line-height:1.4}
.sea{position:absolute;left:48px;top:40px;background:#FFF6EC;color:#6E3310;border-radius:22px;padding:14px 22px;text-align:center;font-weight:800}
.sea .k{font-size:24px}.sea .v{font-size:52px;font-weight:900;line-height:1.1}.sea .save{font-size:22px;color:#1a7f4b}
</style></head><body>
<div class="ph"></div>
<div class="brand">${bird}<b>هدهد</b></div>
<div class="panel">
  <div class="t">${p.short}</div><div class="s">${p.sub}</div>
  <div class="row"><div class="price">${p.air}<small>د.ل</small></div><div class="note">✈️ جوًّا · السعر النهائي<br>شامل الشحن والجمارك</div></div>
  ${p.sea && p.sea < p.air ? `<div class="sea"><div class="k">🚢 بحرًا</div><div class="v">${p.sea} د.ل</div><div class="save">وفّر ${p.air - p.sea} د.ل</div></div>` : ''}
</div>
<div class="foot"><span class="url">hudhude.com</span><span class="pay">ادفع محليًا: سداد · إدفعلي · موبي كاش · معاملات</span></div>
</body></html>`;

const introPost = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${CSS}
body{background:linear-gradient(165deg,#FFF3E6 0,#F6D2AE 100%)}
.hero{position:absolute;top:120px;left:0;right:0;text-align:center}
.hero svg{width:420px;height:auto}
.h1{font-size:92px;font-weight:900;color:#8A4416;line-height:1;margin-top:-10px}
.h2{font-size:40px;font-weight:800;color:#B05A20;margin-top:12px}
.steps{position:absolute;top:720px;left:70px;right:70px;display:grid;gap:22px}
.st{display:flex;align-items:center;gap:22px;background:#fff;border-radius:24px;padding:20px 26px;box-shadow:0 6px 18px rgba(138,68,22,.12)}
.n{flex:none;width:72px;height:72px;border-radius:50%;background:#B05A20;color:#fff;font-size:40px;font-weight:900;display:grid;place-items:center}
.st b{display:block;font-size:34px;color:#1C1A19}.st span{font-size:25px;color:#6B5A50;font-weight:600}
</style></head><body>
<div class="hero">${bird}<div class="h1">هدهد</div><div class="h2">من مصانع الصين إلى باب بيتك في ليبيا</div></div>
<div class="steps">
  <div class="st"><div class="n">1</div><div><b>تختار المنتج وترى سعره النهائي بالدينار</b><span>شامل الشحن من الصين والجمارك — لا مفاجآت</span></div></div>
  <div class="st"><div class="n">2</div><div><b>تدفع محليًا</b><span>سداد · إدفعلي · موبي كاش · بطاقة معاملات · أو كاش في الفرع</span></div></div>
  <div class="st"><div class="n">3</div><div><b>يصلك جوًّا في 12–18 يومًا أو بحرًا بسعر أقل</b><span>وتتابع طلبك مرحلة بمرحلة من حسابك</span></div></div>
</div>
<div class="foot"><span class="url">hudhude.com</span><span class="pay">بوابتك إلى الصين</span></div>
</body></html>`;

const linkPost = `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${CSS}
body{background:linear-gradient(160deg,#8A4416,#B05A20 60%,#C9712F);color:#fff}
.box{position:absolute;top:210px;left:70px;right:70px}
.h1{font-size:84px;font-weight:900;line-height:1.15}
.h2{font-size:36px;font-weight:700;color:#FFE1C2;margin-top:18px;line-height:1.5}
.paste{margin-top:46px;background:#fff;color:#1C1A19;border-radius:26px;padding:26px 30px;box-shadow:0 14px 40px rgba(0,0,0,.25)}
.paste .l{font-size:24px;color:#6B5A50;font-weight:700}
.paste .u{font-family:Arial,sans-serif;direction:ltr;text-align:left;font-size:30px;background:#F5F0EB;border-radius:14px;padding:16px 18px;margin-top:10px;color:#444}
.paste .btn{margin-top:16px;display:inline-block;background:#B05A20;color:#fff;font-size:30px;font-weight:800;padding:10px 30px;border-radius:14px}
.srcs{margin-top:40px;display:flex;flex-wrap:wrap;gap:14px}
.srcs span{background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 22px;font-size:30px;font-weight:800}
.bird{position:absolute;left:40px;bottom:110px;width:300px;height:auto;opacity:.95}
</style></head><body>
<div class="brand">${bird}<b>هدهد</b></div>
<div class="box">
  <div class="h1">رأيت منتجًا في الصين؟<br>أرسل لنا رابطه</div>
  <div class="h2">نوفّره لك بسعر نهائي بالدينار الليبي شامل الشحن والجمارك — وتدفع بعد أن ترى السعر.</div>
  <div class="paste"><div class="l">رابط المنتج</div><div class="u">https://detail.1688.com/offer/…</div><div class="btn">أرسل الطلب</div></div>
  <div class="srcs"><span>1688</span><span>تاوباو</span><span>علي بابا</span><span>شي إن</span><span>أمازون</span></div>
</div>
${bird.replace('<svg ', '<svg class="bird" ')}
<div class="foot"><span class="url">hudhude.com/request</span><span class="pay">اطلب أي منتج برابط</span></div>
</body></html>`;

const exe = process.env.CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const b = await chromium.launch(exe ? { executablePath: exe } : {});
let bad = 0;
const render = async (html, name, waitImg) => {
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  if (waitImg) {   // الصورة خلفية CSS: نتحقق أنها حُمّلت فعلًا لا أن المربع أبيض
    const ok = await p.evaluate(async (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = u; }), waitImg);
    const good = ok >= 300;   // الوسيط يعيد صورة بديلة صغيرة إن فشل المصدر: ليست صورة المنتج
    console.log(`${name}: صورة المنتج ${good ? `✓ (${ok}px)` : `✗ لم تُحمَّل (${ok}px)`}`); if (!good) bad++;
  }
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
};
// أوراق معاينة للمرشّحين: أول صور كل منتج جنبًا إلى جنب، لاختيار الصورة بالعين (بلا نص صيني، ومحتشمة)
for (const c of D.candidates ?? []) await render(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:1080px;height:1350px;display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#333}
div{background:#fff center/contain no-repeat;position:relative}b{position:absolute;top:8px;right:8px;background:#B05A20;color:#fff;font:700 40px Arial;padding:2px 16px;border-radius:10px}</style></head><body>
${c.imgs.map((u, k) => `<div style="background-image:url('${img(u)}')"><b>${k}</b></div>`).join('')}</body></html>`, `sheet-${c.id}`);
await render(introPost, '00-intro');
for (const [i, p] of D.products.entries()) await render(productPost(p), `${String(i + 1).padStart(2, '0')}-${p.slug}`, img(p.img));
await render(linkPost, '07-order-by-link');

// ما ستراه الزبونة حين تضغط الرابط: صفحة المنتج الحية في الجوال، وسعرها كما في المنشور
const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
for (const [i, p] of D.products.entries()) {
  const r = await mp.goto(link(p.slug, i + 1), { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
  const price = await mp.locator('.price').first().textContent().catch(() => '');
  const n = parseFloat(String(price).replace(/,/g, '').match(/\d+(\.\d+)?/)?.[0] ?? 'NaN');
  const same = n === p.air;
  console.log(`صفحة ${p.slug}: HTTP ${r?.status()} · السعر على الموقع ${n} ${same ? '= المنشور ✓' : `≠ المنشور ${p.air} ✗`}`);
  if (!r || r.status() !== 200 || !same) bad++;
  await mp.screenshot({ path: `${OUT}/page-${String(i + 1).padStart(2, '0')}.png` });
}
await b.close();

const cap = [`# منشورات الأسبوع الأول — ${D.campaign}`, '',
  '## 00 — التعريف (أول منشور، ثبّته أعلى الصفحة)', 'مرحبًا بكم في هدهد 🐦\nنشتري لك من مصانع الصين ونوصل إلى باب بيتك في ليبيا — بسعر نهائي بالدينار تراه قبل أن تدفع، شامل الشحن والجمارك.\nادفع محليًا: سداد، إدفعلي، موبي كاش، بطاقة معاملات، أو كاش في الفرع.', `\n${SITE}/?utm_source=facebook&utm_medium=post&utm_campaign=${D.campaign}&utm_content=intro\n\n${D.tags}`, '',
  ...D.products.flatMap((p, i) => [`## ${String(i + 1).padStart(2, '0')} — ${p.short}`, p.caption, `\nاطلبه من هنا 👇\n${link(p.slug, i + 1)}\n\n${D.tags}`, '']),
  '## 07 — اطلب أي منتج برابط', 'رأيت منتجًا في 1688 أو تاوباو أو علي بابا أو شي إن أو أمازون؟ 🔗\nأرسل لنا رابطه ونوفّره لك بسعر نهائي بالدينار الليبي شامل الشحن والجمارك — وتدفع بعد أن ترى السعر.',
  `\n${SITE}/request?utm_source=facebook&utm_medium=post&utm_campaign=${D.campaign}&utm_content=request\n\n${D.tags}`, ''];
writeFileSync(`${OUT}/captions.md`, cap.join('\n'));
console.log(`\n${bad ? `✗ ${bad} مشكلة` : '✓ كل المنشورات والصفحات سليمة'}`);
process.exit(bad ? 1 : 0);
