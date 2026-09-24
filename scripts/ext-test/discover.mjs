// الاكتشاف المجاني بالإضافة الحقيقية: دفعتان على صفحات 1688 وهمية تحمل توصيات «看了又看».
// الأولى تثري منتجين قائمين وتلتقط روابط ثلاثة منتجات جديدة **وتستوردها في الدفعة نفسها** (1.7.1)، والثانية
// تفتح ما اكتُشف في صفحات الأولى **قبل** الإثراء — بلا حساب ولا مزوّد.
// يحتاج: الموقع محليًا على 8787، و`node scripts/ext-test/server.mjs` على 443. يُعيد كل ما غيّره.
import { chromium } from 'playwright';
import path from 'node:path'; import fs from 'node:fs';
import { execSync } from 'node:child_process';
const EXT = path.resolve('extension'); const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.env.OUT || 'shots';
const sql = (q) => execSync(`npx wrangler d1 execute dlal-db --local -c wrangler.local.toml --json --command "${q}"`, { encoding: 'utf8' });
const rows = (q) => JSON.parse(sql(q))[0].results;
const NEW = ['910200001', '910200002', '910200003'];
const job = rows("SELECT id,active,max_new,run_now,runner FROM crawl_jobs WHERE type='stock' ORDER BY id LIMIT 1")[0];
const per = rows("SELECT value FROM settings WHERE key='discover_per_batch'")[0]?.value ?? '20';
let ok = 0, bad = 0; const expect = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? ok++ : bad++; };
const clean = () => {
  sql("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE source_offer_id LIKE '9102%')");
  sql("DELETE FROM variants WHERE product_id IN (SELECT id FROM products WHERE source_offer_id LIKE '9102%')");
  sql("DELETE FROM products WHERE source_offer_id LIKE '9102%'");
  sql("DELETE FROM discovered_offers WHERE offer_id LIKE '9102%'");
};
// عيّنتنا وحدها في الطابور: ما تركته تشغيلات سابقة قد يسبق روابطنا
const stale = rows("SELECT offer_id FROM discovered_offers WHERE status='new'").map(r => r.offer_id);
clean();
if (stale.length) sql(`UPDATE discovered_offers SET status='skipped' WHERE offer_id IN (${stale.map(x => `'${x}'`).join(',')})`);
fs.writeFileSync('/tmp/fx-reco', '1');
const PROFILE = fs.mkdtempSync('/tmp/dlal-ext-disc-');
const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, executablePath: '/opt/pw-browsers/chromium', viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--host-resolver-rules=MAP *.1688.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'] });
try {
  sql(`UPDATE crawl_jobs SET active=1,max_new=2,run_now=1,runner='extension',cooldown_until=NULL WHERE id=${job.id}`);
  sql("UPDATE settings SET value='3' WHERE key='discover_per_batch'");
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.click('summary'); await pop.fill('#api', BASE); await pop.fill('#token', 'dev-import-token'); await pop.click('#save');
  await pop.evaluate(() => chrome.storage.local.set({ fast: true }));
  const adm = await ctx.newPage();
  await adm.goto(BASE + '/login'); await adm.fill('input[name=phone]', '0910000000'); await adm.fill('input[name=password]', 'admin123');
  await adm.click('button:has-text("دخول")'); await adm.waitForLoadState('networkidle');
  const batch = async (label) => {
    await adm.goto(BASE + '/admin/crawler');
    await pop.bringToFront(); await pop.click('#run');
    const t0 = Date.now(); let started = false;
    while (Date.now() - t0 < 240000) {
      await adm.waitForTimeout(2000);
      const st = await adm.locator('#live').getAttribute('data-state').catch(() => '');
      if (st === 'running') started = true;
      if (st === 'finished' && started) break;
    }
    const txt = ((await adm.locator('#live').textContent()) || '').replace(/\s+/g, ' ').trim();
    console.log(`  [${label}] ${Math.round((Date.now() - t0) / 1000)}s · ${txt.slice(0, 220)}`);
    return txt;
  };
  // الدفعة الأولى: إثراء منتجين قائمين، وصفحتاهما تحملان روابط ٩١٠٢٠٠٠٠١–٣ — تُستورد قبل نهاية الدفعة نفسها
  try { fs.unlinkSync('/tmp/fx-hits'); } catch {}
  const t1 = await batch('الأولى');
  const found = rows("SELECT offer_id,status,category_id,from_offer FROM discovered_offers WHERE offer_id LIKE '9102%' ORDER BY offer_id");
  expect(NEW.every(id => found.some(f => f.offer_id === id)), `الإضافة التقطت روابط المنتجات الثلاثة من صفحات الإثراء (${found.map(f => f.offer_id + ':' + f.status).join('، ')})`);
  expect(found.every(f => f.from_offer && f.category_id !== null), `وحُفظت بقسم الصفحة التي وُجدت فيها (${[...new Set(found.map(f => f.category_id))].join('،')})`);
  const got = rows("SELECT source_offer_id o,status,category_id,title_ar,min_qty,weight_g,(SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) imgs FROM products p WHERE source_offer_id LIKE '9102%' ORDER BY o");
  console.log('  ', JSON.stringify(got));
  expect(NEW.every(id => got.some(g => g.o === id)), `الدفعة الأولى نفسها استوردت المنتجات الثلاثة التي اكتشفتها — لا تنتظر ساعة الدفعة التالية (${got.map(g => g.o).join('، ')})`);
  expect(/اكتشاف مجاني: 6 رابط منتج جديد في 5 من 5 صفحة/.test(t1), 'الشريط يقول: ٦ روابط جديدة في ٥ صفحات من ٥ (صفحتا الإثراء + صفحات الجديد الثلاث)');
  await adm.screenshot({ path: `${OUT}/ext-discover-1.png`, fullPage: false });
  const a = got.find(g => g.o === '910200001');
  expect(a && a.status === 'active' && a.imgs === 2 && a.weight_g === 450 && /مصباح مكتب/.test(a.title_ar), `المنتج الجديد على الرف كاملًا: عنوان وصورتان ووزن ٤٥٠ غ (${a?.status})`);
  const lot = got.find(g => g.o === '910200003');
  expect(lot && lot.status === 'hidden' && lot.min_qty === 5, `ومنتج الجملة (أقل طلب ٥) دخل مخفيًا لا على الرف (${lot?.status})`);
  expect(/منتجات جديدة \+3/.test(t1), 'الشريط يعدّ «منتجات جديدة +3» في الدفعة الأولى');
  const st = rows("SELECT status,COUNT(*) n FROM discovered_offers WHERE offer_id IN ('910200001','910200002','910200003') GROUP BY status");
  expect(st.length === 1 && st[0].status === 'imported' && st[0].n === 3, `وخرجت من طابور الاكتشاف «مستوردة» (${JSON.stringify(st)})`);
  const snow = rows("SELECT COUNT(*) n FROM discovered_offers WHERE offer_id IN ('910200004','910200005','910200006') AND status='new'")[0].n;
  expect(snow === 3, `وصفحاتها الجديدة أضافت روابط أخرى للطابور (${snow})`);
  // الدفعة الثانية: ما اكتُشف في صفحات الأولى يُفتح **أولًا** — لو أُغلق كروم بعد دقائق يكون الجديد قد دخل
  try { fs.unlinkSync('/tmp/fx-hits'); } catch {}
  sql(`UPDATE crawl_jobs SET run_now=1 WHERE id=${job.id}`);
  const t2 = await batch('الثانية');
  const hits = (fs.existsSync('/tmp/fx-hits') ? fs.readFileSync('/tmp/fx-hits', 'utf8') : '').trim().split('\n').filter(Boolean);
  console.log('   ترتيب الفتح:', hits.join(' '));
  expect(['910200004', '910200005', '910200006'].every(id => hits.slice(0, 3).includes(id)) && hits.length > 3, `الدفعة الثانية فتحت المنتجات الجديدة الثلاثة قبل صفحات الإثراء (${hits.slice(0, 5).join('، ')})`);
  const got2 = rows("SELECT COUNT(*) n FROM products WHERE source_offer_id IN ('910200004','910200005','910200006')")[0].n;
  expect(got2 === 3 && /منتجات جديدة \+3/.test(t2), `واستوردتها (${got2}) والشريط يعدّها`);
  await adm.goto(BASE + '/admin/crawler'); await adm.locator('#discover').scrollIntoViewIfNeeded();
  const card = ((await adm.locator('#discover').textContent()) || '').replace(/\s+/g, ' ');
  expect(/أضافت [3-9]\d* منتجًا جديدًا/.test(card), `بطاقة الاكتشاف تقول ما أُضيف في ٢٤ ساعة (${(card.match(/آخر ٢٤ ساعة:[^·]*·[^·]*·[^·]*/) || [''])[0]})`);
  await adm.screenshot({ path: `${OUT}/ext-discover-2.png` });
  await adm.locator('#discover').screenshot({ path: `${OUT}/ext-discover-card.png` });
  const slug = rows("SELECT slug FROM products WHERE source_offer_id='910200001'")[0]?.slug;
  const shop = await ctx.newPage(); await shop.goto(BASE + '/p/' + slug);
  expect(await shop.locator('h1', { hasText: 'مصباح مكتب' }).count() > 0, 'الزبونة تفتح صفحة المنتج المكتشف في المتجر');
  await shop.screenshot({ path: `${OUT}/ext-discover-product.png` });
} finally {
  try { const pg = ctx.pages().find(p => p.url().includes('popup.html')); if (pg) console.log('--- سجل الإضافة:\n' + (await pg.locator('#log').textContent())); } catch {}
  // قاعدة المشروع: أعد ما غيّرته
  try { fs.unlinkSync('/tmp/fx-reco'); } catch {}
  try { fs.unlinkSync('/tmp/fx-hits'); } catch {}
  sql(`UPDATE crawl_jobs SET active=${job.active},max_new=${job.max_new ?? 'NULL'},run_now=${job.run_now},runner='${job.runner}' WHERE id=${job.id}`);
  sql(`UPDATE settings SET value='${per}' WHERE key='discover_per_batch'`);
  if (!process.env.KEEP) clean();
  if (stale.length) sql(`UPDATE discovered_offers SET status='new' WHERE offer_id IN (${stale.map(x => `'${x}'`).join(',')})`);
  console.log('restored job:', rows(`SELECT id,active,max_new,run_now,runner FROM crawl_jobs WHERE id=${job.id}`)[0], 'per=', rows("SELECT value FROM settings WHERE key='discover_per_batch'")[0]?.value);
  await ctx.close();
}
console.log(`\nنجح: ${ok} · فشل: ${bad}`);
process.exit(bad ? 1 : 0);
