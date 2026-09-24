// جولة على موقع منافس بمتصفح حقيقي — لدراسته لا لنسخه. **قراءة فقط**: لا تسجيل ولا نماذج ولا طلبات.
// تفتح الصفحة الأولى على الحاسوب والجوال، ثم تمرّ على الروابط الداخلية (حتى MAX صفحة) بإيقاع هادئ،
// وتسجّل ما يراه الزائر: العناوين والنصوص والأسعار والأزرار وروابط التطبيق والتواصل، وسرعة التحميل،
// والصور المكسورة، وأخطاء جافاسكربت، والتمرير الأفقي في الجوال. ثم تقرأ صفحات تطبيقاتهم في المتاجر.
// التشغيل: workflow `competitor.yml` (بيئة المساعد محجوبة عن الخارج). المخرجات في competitor/ .
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const START = process.env.URL || 'https://bizznass-co.com/';
const MAX = parseInt(process.env.MAX || '25', 10);
const EXTRA = (process.env.EXTRA || '').split(/\s+/).filter(Boolean);   // صفحات خارجية (متجر التطبيقات، فيسبوك)
const OUT = 'competitor';
mkdirSync(OUT, { recursive: true });
const origin = new URL(START).origin;
const host = new URL(START).hostname.replace(/^www\./, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const report = { start: START, at: new Date().toISOString(), pages: [], extra: [], mobile: {} };
const log = (...a) => console.log(...a);

// محليًا (بيئة المساعد) المتصفح مثبّت في مسار ثابت؛ على GitHub يثبّته playwright install
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ locale: 'ar', viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
const failed = []; page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));

// ما يراه الزائر في صفحة واحدة
async function inspect(p) {
  return p.evaluate((host) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const txt = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n');
    const links = [...document.querySelectorAll('a[href]')].map(a => ({ t: (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 60), h: a.href }));
    const buttons = [...document.querySelectorAll('button,[role=button],input[type=submit]')].filter(vis).map(b => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean);
    const forms = [...document.querySelectorAll('form')].map(f => ({ action: f.getAttribute('action') || '', fields: [...f.querySelectorAll('input,select,textarea')].map(i => i.name || i.placeholder || i.type).slice(0, 12) }));
    const imgs = [...document.images];
    const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content || '';
    const scripts = [...document.scripts].map(s => s.src).filter(Boolean).map(u => { try { return new URL(u).hostname; } catch { return ''; } });
    return {
      title: document.title, lang: document.documentElement.lang, dir: document.documentElement.dir || getComputedStyle(document.body).direction,
      description: meta('description') || meta('og:description'), generator: meta('generator'),
      h: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(e => e.tagName + ': ' + e.innerText.trim().replace(/\s+/g, ' ').slice(0, 100)).slice(0, 40),
      text: txt.slice(0, 6000), textLen: txt.length,
      prices: [...new Set((txt.match(/[\d.,]+\s*(?:د\.?\s?ل|دينار|LYD|\$|USD|دولار|يوان|¥|CNY|كجم|كيلو|kg)/gi) || []))].slice(0, 40),
      days: [...new Set((txt.match(/[\d٠-٩]+\s*(?:[-–—إلى]+\s*[\d٠-٩]+\s*)?(?:يوم|أيام|days?|أسبوع|أسابيع)/gi) || []))].slice(0, 20),
      internal: [...new Set(links.filter(l => { try { return new URL(l.h).hostname.replace(/^www\./, '') === host; } catch { return false; } }).map(l => l.h.split('#')[0]))],
      external: links.filter(l => { try { return new URL(l.h).hostname.replace(/^www\./, '') !== host && /^http/.test(l.h); } catch { return false; } }).slice(0, 60),
      apps: links.filter(l => /play\.google|apps\.apple|appgallery|\.apk/i.test(l.h)),
      contact: links.filter(l => /wa\.me|whatsapp|tel:|mailto:|t\.me|facebook|instagram|tiktok|snapchat|youtube|twitter|x\.com/i.test(l.h)),
      buttons: [...new Set(buttons)].slice(0, 50), forms,
      imgs: imgs.length, brokenImgs: imgs.filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map(i => i.src.slice(0, 120)).slice(0, 10),
      scriptHosts: [...new Set(scripts)].slice(0, 30),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, host);
}

async function visit(url, i) {
  const t0 = Date.now();
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => ({ err: e.message }));
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const ms = Date.now() - t0;
  if (!r || r.err) { report.pages.push({ url, error: r?.err || 'no response', ms }); log(`\n### [${i}] ${url}\n  ❌ ${r?.err || 'no response'}`); return null; }
  // تمرير كما يفعل الإنسان: مواقع القوالب تُظهر أقسامها بحركة عند الوصول إليها، وبلا تمرير تبقى فارغة في الصورة
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } window.scrollTo(0, 0); }).catch(() => {});
  await page.waitForTimeout(800);
  const info = await inspect(page);
  const slug = String(i).padStart(2, '0') + '-' + (new URL(url).pathname.replace(/[^\w]+/g, '_').slice(0, 40) || 'home');
  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true }).catch(() => {});
  const rec = { url, final: page.url(), status: r.status(), ms, ...info, shot: `${slug}.png` };
  report.pages.push(rec);
  log(`\n### [${i}] ${url} → HTTP ${r.status()} في ${ms}ms · ${info.title}`);
  log(`  lang=${info.lang} dir=${info.dir} · نص ${info.textLen} حرفًا · صور ${info.imgs} (مكسورة ${info.brokenImgs.length}) · روابط داخلية ${info.internal.length}`);
  if (info.description) log(`  وصف: ${info.description}`);
  if (info.h.length) log('  عناوين: ' + info.h.join(' | '));
  if (info.prices.length) log('  أسعار/أوزان: ' + info.prices.join(' · '));
  if (info.days.length) log('  مدد: ' + info.days.join(' · '));
  if (info.buttons.length) log('  أزرار: ' + info.buttons.join(' · '));
  if (info.forms.length) log('  نماذج: ' + JSON.stringify(info.forms));
  if (info.apps.length) log('  تطبيقات: ' + info.apps.map(a => a.h).join(' '));
  if (info.contact.length) log('  تواصل: ' + [...new Set(info.contact.map(a => a.h))].join(' '));
  log('  النص الظاهر:\n' + info.text.split('\n').filter(l => l.trim()).map(l => '    ' + l.trim().slice(0, 200)).join('\n'));
  return info;
}

// ١) الصفحة الأولى ثم الروابط الداخلية بالعرض، بإيقاع هادئ
const queue = [START], seen = new Set();
let i = 0;
while (queue.length && i < MAX) {
  const url = queue.shift(); const key = url.replace(/\/$/, '');
  if (seen.has(key)) continue; seen.add(key);
  if (/\.(pdf|zip|apk|jpg|png|webp|mp4)(\?|$)|logout|wp-admin|cart\/add|add-to-cart/i.test(url)) continue;
  const info = await visit(url, ++i);
  if (info) for (const u of info.internal) if (!seen.has(u.replace(/\/$/, '')) && !queue.includes(u)) queue.push(u);
  await sleep(1500);
}
log(`\n=== زرتُ ${i} صفحة داخلية · بقي في الطابور ${queue.length}: ${queue.slice(0, 30).join(' ')}`);

// ٢) الجوال: الصفحة الأولى بعرض 390 كما يراها زبون ليبي على هاتفه
const m = await browser.newContext({ locale: 'ar', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
const mp = await m.newPage();
const t0 = Date.now();
await mp.goto(START, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await mp.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await mp.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } window.scrollTo(0, 0); }).catch(() => {});
await mp.waitForTimeout(800);
report.mobile = { ms: Date.now() - t0, width: await mp.evaluate(() => document.documentElement.scrollWidth).catch(() => 0),
  height: await mp.evaluate(() => document.documentElement.scrollHeight).catch(() => 0) };
await mp.screenshot({ path: `${OUT}/mobile-home.png`, fullPage: true }).catch(() => {});
await mp.screenshot({ path: `${OUT}/mobile-first-screen.png` }).catch(() => {});
log(`\n### الجوال: تحميل ${report.mobile.ms}ms · عرض الصفحة ${report.mobile.width}px من 390 · طولها ${report.mobile.height}px`);

// ٣) صفحات خارجية: التطبيقات في المتاجر وصفحات التواصل
for (const url of EXTRA) {
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => ({ err: e.message }));
  await page.waitForTimeout(3000);
  if (!r || r.err) { log(`\n### خارجي ${url}\n  ❌ ${r?.err}`); continue; }
  const txt = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n')).catch(() => '');
  const name = 'x-' + url.replace(/^https?:\/\//, '').replace(/[^\w]+/g, '_').slice(0, 50);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }).catch(() => {});
  report.extra.push({ url, status: r.status(), text: txt.slice(0, 8000) });
  log(`\n### خارجي ${url} → HTTP ${r.status()}\n` + txt.split('\n').filter(l => l.trim()).slice(0, 160).map(l => '    ' + l.trim().slice(0, 220)).join('\n'));
  await sleep(1500);
}

report.jsErrors = [...new Set(errs)].slice(0, 20);
report.failedRequests = [...new Set(failed)].slice(0, 30);
log(`\n=== أخطاء جافاسكربت (${report.jsErrors.length}): ${report.jsErrors.join(' | ')}`);
log(`=== طلبات فشلت (${report.failedRequests.length}): ${report.failedRequests.slice(0, 15).join(' | ')}`);
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
