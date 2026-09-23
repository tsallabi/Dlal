// الإضافة الحقيقية تحرّك شريط التقدّم: تحميلها في كروميوم، دفعة إثراء صغيرة على صفحات 1688 وهمية،
// ومراقبة صفحة /admin/crawler ونافذة الإضافة تتقدّمان بإيقاعها البشري الحقيقي (بلا وضع سريع).
// يحتاج: الموقع محليًا على 8787، و`node scripts/ext-test/server.mjs` على 443. يُعيد مهمة الإثراء كما كانت.
import { chromium } from 'playwright';
import path from 'node:path';
import { execSync } from 'node:child_process';
const EXT = path.resolve('extension'); const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || 'shots';
const sql = (q) => execSync(`npx wrangler d1 execute dlal-db --local -c wrangler.local.toml --json --command "${q}"`, { encoding: 'utf8' });
const rows = (q) => JSON.parse(sql(q))[0].results;
const job = rows("SELECT id,active,max_new,run_now,runner,last_run_at FROM crawl_jobs WHERE type='stock' ORDER BY id LIMIT 1")[0];
console.log('stock job before:', job);
let ok = 0, bad = 0; const expect = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? ok++ : bad++; };
// ملف تعريف جديد في كل تشغيل: الملف المحفوظ أبقى عامل الخلفية القديم يعمل بعد تغيير الشيفرة
// فبدا الإصلاح فاشلًا وهو سليم
const PROFILE = (await import('node:fs')).mkdtempSync('/tmp/dlal-ext-live-');
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, executablePath: '/opt/pw-browsers/chromium', viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--host-resolver-rules=MAP *.1688.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'] });
try {
  sql(`UPDATE crawl_jobs SET active=1,max_new=4,run_now=1,runner='extension',cooldown_until=NULL WHERE id=${job.id}`);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.click('summary'); await pop.fill('#api', BASE); await pop.fill('#token', 'dev-import-token'); await pop.click('#save');
  await pop.evaluate(() => chrome.storage.local.set({ fast: false }));
  expect((await pop.locator('#open').textContent()).includes('افتح لوحة الزاحف'), 'زر «افتح لوحة الزاحف» في أعلى نافذة الإضافة');
  expect((await pop.locator('#dashUrl').textContent()).endsWith('/admin/crawler'), `ويعرض العنوان تحته (${await pop.locator('#dashUrl').textContent()})`);
  // صفحة الزاحف مفتوحة في تبويب آخر كما عند صاحب المشروع
  const adm = await ctx.newPage();
  await adm.goto(BASE + '/login'); await adm.fill('input[name=phone]', '0910000000'); await adm.fill('input[name=password]', 'admin123');
  await adm.click('button:has-text("دخول")'); await adm.waitForLoadState('networkidle');
  await adm.goto(BASE + '/admin/crawler');
  // HANG=1: أول صفحة منتج لا يكتمل تحميلها أبدًا — الدفعة يجب أن تتخطّاها وتكمل، لا أن تموت صامتة
  if (process.env.HANG) (await import('node:fs')).writeFileSync('/tmp/fx-hang', '1');
  await pop.bringToFront(); await pop.click('#run');
  const t0 = Date.now(); const seen = new Set(); let shotMid = false, started = false;
  while (Date.now() - t0 < (process.env.HANG ? +(process.env.HANG_WAIT || 480000) : 300000)) {
    await adm.waitForTimeout(3000);
    const st = await adm.locator('#live').getAttribute('data-state').catch(() => '');
    const cnt = ((await adm.locator('#live .live-count').textContent().catch(() => '')) || '').trim();
    if (!seen.has(st + '|' + cnt)) { seen.add(st + '|' + cnt); console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${st} · ${cnt}`); }
    if (!shotMid && st === 'running' && /^[12] من/.test(cnt)) {
      shotMid = true; await adm.screenshot({ path: `${OUT}/ext-live-page-mid.png` });
      await pop.waitForTimeout(5500); await pop.screenshot({ path: `${OUT}/ext-live-popup-mid.png` });
      console.log('  popup:', ((await pop.locator('#prog').textContent()) || '').replace(/\s+/g, ' ').trim());
    }
    // الدفعة السابقة قد تكون «اكتملت» على الشاشة: لا نقبل النهاية قبل أن نرى الجديدة تبدأ
    if (st === 'running') started = true;
    if (st === 'finished' && started) break;
  }
  const counts = [...seen].map(x => x.split('|')[1]);
  expect(counts.some(x => /^1 من 4/.test(x)) && counts.some(x => /^3 من 4/.test(x)), `الصفحة المفتوحة رأت الشريط يتقدّم منتجًا منتجًا (${counts.join(' | ')})`);
  expect(shotMid, 'التُقطت صورة للشريط في منتصف الدفعة');
  expect((await adm.locator('#live').getAttribute('data-state')) === 'finished', 'وبعد آخر منتج يقول الشريط «اكتملت الدفعة الأخيرة»');
  await adm.screenshot({ path: `${OUT}/ext-live-page-done.png` });
  const popTxt = ((await pop.locator('#prog').textContent()) || '').replace(/\s+/g, ' ');
  expect(/4 من 4/.test(popTxt), `نافذة الإضافة تعرض الشريط نفسه من الخادم (${popTxt.trim().slice(0, 100)})`);
  await pop.screenshot({ path: `${OUT}/ext-live-popup-done.png` });
  if (process.env.HANG) {
    const gains = (await adm.locator('#live .live-gains').textContent()) || '';
    expect(/لم يُقرأ\s*1/.test(gains), `الصفحة المعلّقة عُدّت «لم يُقرأ» ولم توقف الدفعة (${gains.replace(/\s+/g, ' ').trim()})`);
    const hung = ((await import('node:fs')).readFileSync(process.env.FXLOG || '/tmp/claude-0/fx.log', 'utf8').match(/FX HANG \/offer\/(\d+)/g) || []).pop()?.match(/(\d+)/)?.[1];
    const hp = hung ? rows(`SELECT in_stock,status FROM products WHERE source_offer_id='${hung}'`)[0] : null;
    expect(hp && hp.in_stock === 1 && hp.status !== 'unavailable', `والمنتج ${hung} بقي متوفرًا — صفحة بطيئة ليست منتجًا نزل (in_stock=${hp?.in_stock})`);
  }
  const run = rows(`SELECT status,checked,gain_img,gain_var,gain_wt FROM crawl_runs WHERE job_id=${job.id} ORDER BY id DESC LIMIT 1`)[0];
  expect(run && run.checked === 4, `تقرير الدفعة سُجّل: فُحص ${run?.checked} · صور +${run?.gain_img} · مقاسات +${run?.gain_var} · وزن +${run?.gain_wt}`);
} finally {
  try { const pg = ctx.pages().find(p => p.url().includes('popup.html')); if (pg) console.log('--- سجل الإضافة:\n' + (await pg.locator('#log').textContent())); } catch {}
  // قاعدة المشروع: أعد ما غيّرته
  sql(`UPDATE crawl_jobs SET active=${job.active},max_new=${job.max_new ?? 'NULL'},run_now=${job.run_now},runner='${job.runner}' WHERE id=${job.id}`);
  console.log('stock job restored:', rows(`SELECT id,active,max_new,run_now,runner FROM crawl_jobs WHERE id=${job.id}`)[0]);
  await ctx.close();
}
console.log(`\nنجح: ${ok} · فشل: ${bad}`);
process.exit(bad ? 1 : 0);
