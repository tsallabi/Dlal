// استيراد منتج حقيقي من 1688 إلى تالين من سطر الأوامر (يُشغَّل من GitHub Actions حيث يتوفر الوصول إلى 1688 والموقع الحي)
// الاستخدام: BASE=https://dlal.tsallabi.workers.dev IMPORT_TOKEN=... node scripts/import-1688.mjs <رابط منتج أو كلمة بحث> [slug القسم]
import { chromium } from 'playwright';

const BASE = process.env.BASE, TOKEN = process.env.IMPORT_TOKEN;
const target = process.argv[2] || '连衣裙';
const catSlug = process.argv[3] || 'dresses';
if (!BASE || !TOKEN) { console.error('BASE و IMPORT_TOKEN مطلوبان'); process.exit(2); }
const num = (s) => parseFloat((String(s || '').match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
const offerIdFrom = (u) => (String(u || '').match(/offer\/(\d+)/) || [])[1] || (String(u || '').match(/[?&]offerId=(\d+)/) || [])[1] || '';
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--lang=zh-CN'] });
const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' });
const page = await ctx.newPage();

let offerUrl = /^https?:/.test(target) ? target : null;
if (!offerUrl) {
  const s = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(target)}`;
  log('🔎 بحث في 1688:', s);
  await page.goto(s, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log('search goto:', e.message));
  await page.waitForTimeout(4000);
  const links = await page.$$eval('a[href*="detail.1688.com/offer/"]', as => as.map(a => a.href));
  log('روابط منتجات في نتائج البحث:', links.length, '| العنوان:', await page.title());
  if (!links.length) { await page.screenshot({ path: 'shot-search.png', fullPage: false }); }
  offerUrl = links[0] ? `https://detail.1688.com/offer/${offerIdFrom(links[0])}.html` : null;
}
if (!offerUrl) { log('❌ لم أصل إلى صفحة منتج (غالبًا صفحة تحقق/دخول من 1688). لقطة: shot-search.png'); await browser.close(); process.exit(3); }

const extract = () => page.evaluate(() => {
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.textContent.trim() : ''); const num = (s) => parseFloat((String(s || '').match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
  const id = (location.href.match(/offer\/(\d+)/) || [])[1] || '';
  let data = null; try { data = (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) || window.iDetailData || null; } catch (e) {}
  const title = txt($('h1,[class*="title-text"],[class*="offer-title"]')) || document.title;
  const images = $$('img').map(i => i.src || i.dataset.src || '').filter(u => /cbu01\.alicdn|img\.alicdn/.test(u) && !/\.gif/.test(u))
    .map(u => u.replace(/\.\d+x\d+(\.\w+)$/, '$1').replace(/_\d+x\d+\w*\.jpg$/, '.jpg')).filter((u, i, a) => a.indexOf(u) === i).slice(0, 8);
  const prices = $$('[class*="price"]').map(e => num(txt(e))).filter(v => v > 0 && v < 100000);
  let priceCny = prices.length ? Math.min(...prices) : 0;
  const html = document.documentElement.innerHTML;
  if (!priceCny) { const m = html.match(/"price":"?([\d.]+)/); if (m) priceCny = parseFloat(m[1]); }
  const variants = [];
  try { const skuMap = data && (data.skuModel?.skuInfoMap || data.skuInfoMap); const props = data && (data.skuModel?.skuProps || data.skuProps);
    if (skuMap && props) Object.entries(skuMap).forEach(([key, v]) => { const parts = key.split('&gt;').join('>').split('>'); variants.push({ skuId: String(v.skuId), color: props[0] ? parts[0] : null, size: props[1] ? parts[1] : null, priceCny: num(v.price || v.discountPrice), inStock: (v.canBookCount ?? 1) > 0 }); }); } catch (e) {}
  if (!variants.length) {
    const colors = $$('[class*="sku"] [class*="prop"] [class*="value"],[class*="color-item"],[class*="prop-item"]').map(txt).filter(Boolean).slice(0, 20);
    const sizes = $$('[class*="sku-item"] [class*="name"],[class*="size-item"]').map(txt).filter(Boolean).slice(0, 20);
    colors.forEach(c => sizes.length ? sizes.forEach(s => variants.push({ color: c, size: s, inStock: true })) : variants.push({ color: c, inStock: true }));
    if (!colors.length) sizes.forEach(s => variants.push({ size: s, inStock: true }));
  }
  const minQty = num(txt($('[class*="min-order"],[class*="begin-amount"],[class*="mix-amount"]'))) || 1;
  const blocked = /验证|滑动|login\.1688|passport|security/i.test(location.href + ' ' + document.title);
  return { offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: title.slice(0, 200), priceCny, images, variants, minQty, inStock: priceCny > 0, supplier: txt($('[class*="company-name"],[class*="supplier-name"]')), blocked, htmlLen: html.length };
});
// محاولة 1: صفحة سطح المكتب — محاولة 2: صفحة الجوال (أقل حجبًا)
const id0 = offerIdFrom(offerUrl);
let detail = null;
for (const [label, u] of [['desktop', `https://detail.1688.com/offer/${id0}.html`], ['mobile', `https://m.1688.com/offer/${id0}.html`]]) {
  log(`📄 فتح المنتج (${label}):`, u);
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => log('goto:', e.message));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `shot-${label}.png`, fullPage: false });
  log('   عنوان الصفحة:', await page.title(), '| URL:', page.url());
  const d = await extract();
  log('   استخراج:', JSON.stringify({ offerId: d.offerId, price: d.priceCny, images: d.images.length, variants: d.variants.length, blocked: d.blocked, title: d.title.slice(0, 60) }));
  if (d.offerId && d.priceCny && !d.blocked) { detail = d; break; }
}
await browser.close();
if (!detail) { log('❌ 1688 لم يعرض بيانات المنتج في أي من الصفحتين (تحقق/دخول مطلوب من عنوان خادم أجنبي). اللقطات مرفقة.'); process.exit(4); }
log('📦 المستخرج:', JSON.stringify({ ...detail, images: detail.images.length, variants: detail.variants.length }, null, 0));
detail.images.slice(0, 3).forEach(u => log('   صورة:', u));

// إرسال إلى تالين كما يفعل زر الاستيراد
const cats = await (await fetch(BASE + '/api/categories')).json();
const cat = cats.find(c => c.slug === catSlug) || cats[0];
const r = await fetch(BASE + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': TOKEN }, body: JSON.stringify({ category_id: cat.id, page_url: offerUrl, items: [{ ...detail, titleAr: detail.title }] }) });
const j = await r.json().catch(() => ({}));
log('📨 رد /api/import:', r.status, JSON.stringify(j));
if (!r.ok) process.exit(5);
// تحقق: هل ظهر في الموقع؟
const q = await fetch(BASE + '/search?q=' + encodeURIComponent(detail.offerId)).then(x => x.text()).catch(() => '');
const admin = await fetch(BASE + '/admin/products').then(x => x.status);
log('🔎 ظهر في الموقع (بالعنوان):', (await fetch(BASE + '/search?q=' + encodeURIComponent(detail.title.slice(0, 12))).then(x => x.text())).includes('class="card"') ? 'نعم' : 'لا (قد يكون مخفيًا أو العنوان صينيًا بدون ترجمة)');
console.log(JSON.stringify({ offerId: detail.offerId, title: detail.title, priceCny: detail.priceCny, images: detail.images.length, variants: detail.variants.length, result: j }));
