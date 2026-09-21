// اختبار الإضافة على الشاشة: تحميلها في كروميوم، ضبطها، تشغيل المهام مع صفحات 1688 وهمية محلية
import { chromium } from 'playwright';
import path from 'node:path';
// التشغيل: انظر README في هذا المجلد. يحتاج شهادة محلية وخادم fixtures على 443 وربط *.1688.com بـ 127.0.0.1
const EXT = path.resolve('extension'); const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ctx = await chromium.launchPersistentContext(process.env.PROFILE || '/tmp/dlal-ext-profile', { headless: false, executablePath: '/opt/pw-browsers/chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox', '--host-resolver-rules=MAP *.1688.com 127.0.0.1', '--ignore-certificate-errors', '--no-proxy-server'] });
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
console.log('extension id:', extId);
const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${extId}/popup.html`);
await pop.click('summary'); await pop.fill('#api', BASE); await pop.fill('#token', 'dev-import-token'); await pop.click('#save');
await pop.evaluate(() => chrome.storage.local.set({ fast: true }));   // اختصار الإيقاع البشري في الاختبار
await pop.waitForTimeout(500);
console.log('status after save:', (await pop.textContent('#st')).replace(/\s+/g, ' '));
await pop.click('#run');
// انتظار حتى تُسجَّل تقارير التشغيل للمهمتين
const t0 = Date.now(); let runs = 0;
while (Date.now() - t0 < 240000) { await pop.waitForTimeout(5000); const st = (await pop.textContent('#log')) || ''; runs = (st.match(/— جديد/g) || []).length; if (runs >= 2) break; }
console.log('--- popup log:\n' + (await pop.textContent('#log')));

await pop.screenshot({ path: 'shots/ext-popup.png' });
await ctx.close();
