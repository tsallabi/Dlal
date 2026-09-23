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
const ctx = await chromium.launchPersistentContext('/tmp/dlal-ext-profile-live', { headless: false, executablePath: '/opt/pw-browsers/chromium', viewport: { width: 1280, height: 900 },
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
  await pop.bringToFront(); await pop.click('#run');
  const t0 = Date.now(); const seen = new Set(); let shotMid = false, started = false;
  while (Date.now() - t0 < 300000) {
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
  const run = rows(`SELECT status,checked,gain_img,gain_var,gain_wt FROM crawl_runs WHERE job_id=${job.id} ORDER BY id DESC LIMIT 1`)[0];
  expect(run && run.checked === 4, `تقرير الدفعة سُجّل: فُحص ${run?.checked} · صور +${run?.gain_img} · مقاسات +${run?.gain_var} · وزن +${run?.gain_wt}`);
} finally {
  // قاعدة المشروع: أعد ما غيّرته
  sql(`UPDATE crawl_jobs SET active=${job.active},max_new=${job.max_new ?? 'NULL'},run_now=${job.run_now},runner='${job.runner}' WHERE id=${job.id}`);
  console.log('stock job restored:', rows(`SELECT id,active,max_new,run_now,runner FROM crawl_jobs WHERE id=${job.id}`)[0]);
  await ctx.close();
}
console.log(`\nنجح: ${ok} · فشل: ${bad}`);
process.exit(bad ? 1 : 0);
