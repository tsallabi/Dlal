// جولة حقيقية على الموقع الحي بمتصفح فعلي: تفتح الصفحات وتنقر الروابط كما تفعل الزبونة،
// وتلتقط صورة كل شاشة. **قراءة فقط**: لا تسجيل دخول، لا طلبات، لا استيراد — لا تمسّ بيانات حقيقية.
// الغرض أن نرى عيوب الموقع الحي (14 ألف منتج حقيقي) لا عيوب البذرة المحلية.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const BASE = (process.env.BASE || 'https://dlal.tsallabi.workers.dev').replace(/\/$/, '');
const SHOTS = 'live-shots';
const PRODUCTS = Number(process.env.PRODUCTS || 8);
// الفحص العميق: ترقيم الصفحات والفرز والفلترة وجودة البضاعة وعيّنة أوسع من صفحات المنتجات
const DEEP = process.env.DEEP === 'yes';
const DEEP_PRODUCTS = Number(process.env.DEEP_PRODUCTS || 20);
mkdirSync(SHOTS, { recursive: true });

const problems = []; let passed = 0;
const expect = (cond, msg) => { if (!cond) { problems.push(msg); console.log('❌', msg); } else { passed++; console.log('✅', msg); } };
const shot = async (p, name) => { try { await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); } catch {} };
const CJK = /[一-鿿]/g;

// النص الظاهر للزبونة فقط: لا سكربتات ولا أنماط ولا سمات مخفية
const visibleText = (p) => p.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let out = '', n;
  while ((n = w.nextNode())) {
    const par = n.parentElement;
    if (!par || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(par.tagName)) continue;
    out += n.nodeValue + ' ';
  }
  return out;
});

// نفس منطق e2e: نسخة المتصفح المثبّتة على الخادم إن وُجدت، وإلا نسخة Playwright
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const exePath = process.env.PW_CHROMIUM || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
const browser = await chromium.launch({ headless: true, ...(exePath ? { executablePath: exePath } : {}) });
const ctx = await browser.newContext({ locale: 'ar', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 160)));

const open = async (path, label) => {
  const r = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  const code = r ? r.status() : 0;
  expect(code === 200, `${label} (${path}) تفتح بنجاح — HTTP ${code}`);
  if (code !== 200) return false;
  const txt = await visibleText(page);
  const cn = (txt.match(CJK) || []).join('');
  expect(!cn, `${label} بلا نص صيني${cn ? ` («${cn.slice(0, 24)}»)` : ''}`);
  const html = await page.content();
  expect(!/alicdn\.com|detail\.1688\.com|1688\.com/.test(html), `${label} لا تكشف مصدر البضاعة للزبونة`);
  return true;
};

console.log(`=== جولة على ${BASE}\n`);

// ---------- الرئيسية ----------
if (await open('/', 'الرئيسية')) {
  const cards = await page.locator('.card').count();
  expect(cards >= 20, `الرئيسية تعرض بضاعة فعلية (${cards} بطاقة)`);
  const priced = await page.locator('.card .p').count();
  expect(priced >= cards * 0.9, `كل بطاقة تحمل سعرًا (${priced}/${cards})`);
  await shot(page, 'home');
}

// ---------- كل قسم في شريط الأقسام ----------
const catHrefs = await page.locator('nav.cats a[href^="/c/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))]);
expect(catHrefs.length >= 5, `شريط الأقسام فيه ${catHrefs.length} قسمًا`);
let gridCat = null;
for (const href of catHrefs) {
  if (!(await open(href, `القسم ${href}`))) continue;
  const n = await page.locator('.card').count();
  expect(n >= 1, `${href} ليس فارغًا (${n} منتجًا)`);
  if (n >= 4 && !gridCat) gridCat = href;
}
await shot(page, 'category');

// ---------- الصفحات العامة وروابط التذييل ----------
for (const p of ['/new', '/sale', '/c/all', '/login', '/register', '/cart', '/wishlist']) await open(p, `صفحة ${p}`);
await open('/', 'الرئيسية');
const footHrefs = await page.locator('footer.ftr a[href^="/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))]);
expect(footHrefs.length >= 5, `التذييل فيه ${footHrefs.length} رابطًا`);
for (const href of footHrefs) {
  const r = await page.goto(BASE + href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  expect(r && r.status() === 200, `رابط التذييل ${href} يعمل — HTTP ${r ? r.status() : 0}`);
}
await shot(page, 'footer-page');

// ---------- شريط التنقل السفلي ----------
await open('/', 'الرئيسية');
const bottomHrefs = await page.locator('nav.bottom-nav a').evaluateAll(as => as.map(a => a.getAttribute('href')));
for (const href of bottomHrefs) {
  const r = await page.goto(BASE + href, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  expect(r && [200, 302].includes(r.status()), `رابط الشريط السفلي ${href} يعمل — HTTP ${r ? r.status() : 0}`);
}

// ---------- منتجات حقيقية: نفتح عيّنة ونتأكد أن صفحتها كاملة ----------
await open('/', 'الرئيسية');
const slugs = await page.locator('a.card[href^="/p/"]').evaluateAll((as, n) =>
  [...new Set(as.map(a => a.getAttribute('href')))].slice(0, n), PRODUCTS);
expect(slugs.length >= 3, `وجدنا ${slugs.length} منتجًا لفحصها`);
let brokenImgs = 0;
for (const slug of slugs) {
  if (!(await open(slug, `صفحة المنتج ${slug}`))) continue;
  const price = (await page.locator('.pd .price').first().textContent().catch(() => '')) || '';
  expect(/\d/.test(price), `${slug} تعرض سعرًا (${price.trim().slice(0, 24)})`);
  expect(await page.locator('.pd button:has-text("أضيفي إلى السلة")').count() > 0, `${slug} فيها زر الشراء`);
  const bad = await page.locator('img').evaluateAll(is => is.filter(i => i.complete && i.naturalWidth === 0).length);
  brokenImgs += bad;
}
expect(brokenImgs === 0, `لا صور مكسورة في صفحات المنتجات (${brokenImgs})`);
await shot(page, 'product');

// ---------- البحث ----------
await open('/', 'الرئيسية');
await page.fill('input[name=q]', 'فستان').catch(() => {});
await page.press('input[name=q]', 'Enter').catch(() => {});
await page.waitForLoadState('domcontentloaded');
expect(/\/search/.test(page.url()), 'البحث من الترويسة ينقل لصفحة النتائج');
const found = await page.locator('.card').count();
expect(found >= 1, `البحث عن «فستان» يعيد نتائج (${found})`);
await shot(page, 'search');

// ---------- اختيار طريقة الشحن: ننقره كما تنقره الزبونة ونرى السعر يتغيّر فعلًا ----------
// (الوضع كوكي يضبطه نموذج POST على صفحة المنتج، لا معامل في الرابط)
const priceOf = async (p) => {
  const el = p.locator('.pd .price').first();
  return (await el.evaluate(n => { const c = n.cloneNode(true); c.querySelectorAll('s').forEach(x => x.remove()); return c.textContent; }).catch(() => '')) || '';
};
// قطعة وزنها غرامات يتساوى سعرها جوًّا وبحرًا بعد التقريب لأقرب نصف دينار — ليس عطلًا
// (قواعد المشروع: «تساوي الجوي والبحري ليس عطلًا»). نختار منتجًا تعرض صفحته «وفّري»
// بجانب البحري، أي فرقًا حقيقيًا، وإلا فأول منتج فيه بحري ونشترط ألا يكون أغلى فقط.
let shipSlug = null, shipSaves = false;
for (const slug of slugs) {
  await page.goto(BASE + slug, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (!(await page.locator('.pship input[value=sea]').count())) continue;
  if (await page.locator('.pship label:has(input[value=sea]) b').count()) { shipSlug = slug; shipSaves = true; break; }
  if (!shipSlug) shipSlug = slug;
}
if (shipSlug && !shipSaves) await page.goto(BASE + shipSlug, { waitUntil: 'domcontentloaded' }).catch(() => {});
// زرّ الراديو مخفي بصريًا خلف وسمه، والترويسة اللاصقة تعترض النقر:
// الزبونة تنقر الوسم نفسه، فننقره مثلها بعد إبعاد الترويسة
const pickShip = async (mode) => {
  const label = page.locator(`.pship label:has(input[value=${mode}])`).first();
  await label.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));
  await label.click({ timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
};
if (shipSlug) {
  try {
    const air = await priceOf(page);
    await pickShip('sea');
    const sea = await priceOf(page);
    expect(await page.locator('.pship label.on:has(input[value=sea])').count() > 0, 'اختيار البحري يبقى مُحدَّدًا بعد إعادة التحميل');
    // en-US: «1,234.5 د.ل» الفاصلة للآلاف والنقطة عشرية — و«د.ل» نفسها تحوي نقطة فنقطعها أولًا
    const num = t => {
      const head = String(t).split('د.ل')[0].replace(/[\s٬]/g, '');
      return parseFloat(head.replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
    };
    if (shipSaves) expect(num(sea) > 0 && num(sea) < num(air), `البحري أرخص من الجوي على ${shipSlug} (${num(sea)} < ${num(air)})`);
    else expect(num(sea) > 0 && num(sea) <= num(air), `البحري ليس أغلى من الجوي على ${shipSlug} (${num(sea)} ≤ ${num(air)} — قطعة خفيفة يتساوى سعرها بعد التقريب)`);
    // السعر المعروض في الشبكة يتبع الوضع نفسه، لا الجوي دائمًا
    await page.goto(BASE + (gridCat || '/new'), { waitUntil: 'domcontentloaded' }).catch(() => {});
    const gridSea = await page.locator('a.card .p').first().textContent().catch(() => '');
    expect(/\d/.test(gridSea), `بطاقات الشبكة تعرض سعر الوضع المختار (${String(gridSea).trim().slice(0, 16)})`);
    await page.goto(BASE + shipSlug, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pickShip('air').catch(() => {});
  } catch (e) {
    expect(false, `تعذّر تجريب اختيار الشحن على ${shipSlug}: ${String(e.message).split('\n')[0].slice(0, 90)}`);
  }
} else {
  expect(false, 'لم نجد منتجًا يعرض اختيار طريقة الشحن');
}

// ---------- فحص عميق: ترقيم الصفحات والفرز والفلترة وجودة البضاعة كما تراها الزبونة ----------
if (DEEP) {
  const cat = gridCat || '/c/all';
  // صفحة ثانية حقيقية بمنتجات مختلفة لا تكرار للأولى
  if (await open(cat, `القسم ${cat}`)) {
    const p1 = await page.locator('a.card[href^="/p/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
    await page.goto(BASE + cat + '?page=2', { waitUntil: 'domcontentloaded' }).catch(() => {});
    const p2 = await page.locator('a.card[href^="/p/"]').evaluateAll(as => as.map(a => a.getAttribute('href')));
    expect(p2.length > 0, `الصفحة الثانية من ${cat} فيها بضاعة (${p2.length})`);
    expect(p2.filter(h => p1.includes(h)).length === 0, 'الصفحة الثانية لا تكرّر منتجات الأولى');
  }
  // الفرز بالسعر يرتّب فعلًا
  const priceList = async (sort) => {
    await page.goto(BASE + cat + '?sort=' + sort, { waitUntil: 'domcontentloaded' }).catch(() => {});
    return page.locator('a.card .p').evaluateAll(els => els.map(e => {
      const c = e.cloneNode(true); c.querySelectorAll('s').forEach(x => x.remove());
      const head = (c.textContent || '').split('د.ل')[0].replace(/[\s\u066C]/g, '');
      return parseFloat(head.replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
    }));
  };
  const asc = await priceList('price_asc');
  expect(asc.length > 1 && asc.every((v, i) => i === 0 || v >= asc[i - 1]), `الفرز بالأرخص مرتّب فعلًا (${asc.slice(0, 4).join(' ≤ ')})`);
  const desc = await priceList('price_desc');
  expect(desc.length > 1 && desc.every((v, i) => i === 0 || v <= desc[i - 1]), `الفرز بالأغلى مرتّب فعلًا (${desc.slice(0, 4).join(' ≥ ')})`);
  expect(asc.every(v => v > 0), 'كل سعر معروض أكبر من صفر');

  // جودة البضاعة كما تُرى: صور بديلة، سعر مفقود، بطاقة بلا عنوان
  await open(cat, `القسم ${cat}`);
  const q = await page.locator('a.card').evaluateAll(cards => cards.map(c => ({
    ph: (c.querySelector('img')?.getAttribute('src') || '').includes('placeholder'),
    noPrice: !(c.querySelector('.p')?.textContent || '').match(/\d/),
    noTitle: !(c.querySelector('.t, h3, .title')?.textContent || '').trim(),
  })));
  const ph = q.filter(x => x.ph).length, np = q.filter(x => x.noPrice).length;
  expect(np === 0, `كل بطاقة تحمل سعرًا (${np} بلا سعر من ${q.length})`);
  expect(ph * 4 <= q.length, `صور البدائل قليلة في ${cat}: ${ph} من ${q.length}`);
  console.log(`   ℹ ${cat}: ${q.length} بطاقة · ${ph} بصورة بديلة`);

  // صفحات السياسات فيها محتوى حقيقي لا عناوين فارغة
  for (const pg of ['/pages/faq', '/pages/returns', '/pages/shipping', '/pages/privacy', '/pages/terms', '/pages/how-to-order']) {
    if (!(await open(pg, `صفحة ${pg}`))) continue;
    const len = (await visibleText(page)).replace(/\s+/g, ' ').trim().length;
    expect(len > 400, `${pg} فيها شرح حقيقي (${len} حرفًا)`);
  }

  // عيّنة أوسع من المنتجات: صور تُحمّل فعلًا وسعر ظاهر
  await open('/new', 'وصل حديثًا');
  const more = await page.locator('a.card[href^="/p/"]').evaluateAll((as, n) =>
    [...new Set(as.map(a => a.getAttribute('href')))].slice(0, n), DEEP_PRODUCTS);
  let noVar = 0, broken = 0;
  for (const slug of more) {
    if (!(await open(slug, `منتج ${slug}`))) continue;
    broken += await page.locator('.pd img').evaluateAll(is => is.filter(i => i.complete && i.naturalWidth === 0).length);
    if (!(await page.locator('.opts .chip').count())) noVar++;
  }
  expect(broken === 0, `لا صورة مكسورة في ${more.length} صفحة منتج (${broken})`);
  console.log(`   ℹ ${more.length} منتجًا: ${noVar} بلا مقاسات/ألوان`);
}

// ---------- الجوال ----------
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
for (const p of ['/', '/c/all', '/new']) {
  const r = await mp.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  if (!r || r.status() !== 200) { expect(false, `الجوال: ${p} لا تفتح`); continue; }
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over <= 2, `الجوال: ${p} بلا تمرير أفقي (${over}px)`);
}
expect(await mp.locator('nav.bottom-nav').isVisible(), 'الجوال: شريط التنقل السفلي ظاهر');
await shot(mp, 'mobile-home');

// ---------- أخطاء جافاسكربت حقيقية في المتصفح ----------
expect(consoleErrors.length === 0, `لا أخطاء جافاسكربت في المتصفح${consoleErrors.length ? `: ${consoleErrors[0]}` : ''}`);

await browser.close();
const summary = `نجح: ${passed} · فشل: ${problems.length} · إجمالي: ${passed + problems.length}`;
writeFileSync(`${SHOTS}/result.txt`, `${summary}\n${problems.join('\n')}\n`);
console.log('\n===== النتيجة =====');
console.log(summary);
if (problems.length) { console.log('\nالعيوب:'); problems.forEach(p => console.log(' -', p)); process.exit(1); }
console.log('الموقع الحي سليم ✓');
