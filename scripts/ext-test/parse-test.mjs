// اختبار قارئ صفحة المنتج مباشرة على صفحة وهمية مطابقة لبنية 1688 الحقيقية (بلا تسجيل دخول)
// التشغيل: node scripts/ext-test/server.mjs  ثم  xvfb-run -a node scripts/ext-test/parse-test.mjs
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync('extension/content.js', 'utf8')
  .replace('chrome.runtime.onMessage.addListener(', 'window.__dlalExtract = { detail: extractDetail, list: extractList };\n  (() => {})(');

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--host-resolver-rules=MAP *.1688.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));

let fail = 0;
const ok = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) fail++; };

await page.goto('https://detail.1688.com/offer/900000002.html', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: src });
const d = await page.evaluate(() => window.__dlalExtract.detail(null));
console.log(JSON.stringify(d, null, 1).slice(0, 900));

ok(d && d.offerId === '900000002', 'قرأ رقم المنتج من الرابط');
ok(/Summer Floral Chiffon Dress/.test(d.title) && !/阿里巴巴/.test(d.title), 'العنوان من عنوان الصفحة بلا لاحقة الموقع');
ok(d.priceCny === 39.9, `السعر من عنصر Price (${d.priceCny})`);
ok(d.images.length === 3 && d.images.every(u => /cbu\d*\.alicdn/.test(u)) && !d.images.some(u => /\.svg|imgextra/.test(u)), `الصور: منتج فقط بلا أيقونات (${d.images.length})`);
ok(d.images.every(u => !/_\.webp$/.test(u)), 'حُذفت لاحقة webp من روابط الصور');
ok(d.weightG === 320, `الوزن من جدول المواصفات (${d.weightG})`);
ok(d.variants.length === 12, `المتغيرات = ألوان × مقاسات (${d.variants.length})`);
ok(d.variants.some(v => v.color === '黑色' && v.size === 'M'), 'لون ومقاس صحيحان في المتغيرات');
ok(d.minQty === 2, `الحد الأدنى للطلب (${d.minQty})`);
ok(d.inStock === true, 'المنتج متوفر');
ok(/Hangzhou/.test(d.supplier), `اسم المورد (${d.supplier})`);

// الوحدة (1.7.3): «40g» كانت تُقرأ 40 كغ فبيعت ربطة عنق بـ3,380 د.ل
for (const [rows, want, what] of [
  ['<tr><td>Weight</td><td>40g</td></tr>', 40, '«40g» = 40 غ'],
  ['<tr><td>重量</td><td>40克</td></tr>', 40, '«40克» = 40 غ'],
  ['<tr><td>净重</td><td>0.5kg</td></tr>', 500, '«0.5kg» = 500 غ'],
  ['<tr><td>重量</td><td>1斤</td></tr>', 500, '«1斤» = 500 غ'],
  ['<tr><td>Weight (g)</td></tr><tr><td>40</td></tr>', 40, 'الوحدة في صف العنوان «Weight (g)» ثم 40 = 40 غ'],
  ['<tr><td>Weight</td><td>0.65</td></tr>', 650, 'رقم بلا وحدة أقل من 50 يبقى كيلوغرامات (0.65 = 650 غ)'],
]) {
  const w = await page.evaluate((r) => { document.querySelectorAll('table').forEach(t => t.innerHTML = r); return window.__dlalExtract.detail(null).weightG; }, rows);
  ok(w === want, `${what} (${w})`);
}

// قارئ صفحة النتائج لم يتأثر
await page.goto('https://s.1688.com/selloffer/offer_search.htm?keywords=test', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: src });
const items = await page.evaluate(() => window.__dlalExtract.list());
ok(Array.isArray(items) && items.length >= 2, `قارئ صفحة النتائج يعمل (${items.length} منتج)`);
ok(items.every(i => i.offerId && i.priceCny > 0), 'كل منتج في القائمة له رقم وسعر');

await browser.close();
console.log(fail ? `\n❌ فشل ${fail}` : '\n✓ كل فحوصات القارئ نجحت');
process.exit(fail ? 1 : 0);
