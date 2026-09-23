// لقطات للموقع المحلي بعد تطبيق الهوية: الرئيسية (حاسوب/جوال)، صفحة منتج، لوحة الإدارة
import { chromium } from 'playwright';
const BASE = 'http://localhost:8787';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const shots = async (p, name) => { await p.waitForTimeout(2200); await p.screenshot({ path: `design/hudhud/applied-${name}.png` }); };
let p = await b.newPage({ viewport: { width: 1280, height: 760 } });
await p.goto(BASE + '/'); await shots(p, 'home-desktop');
console.log('title:', await p.title(), '| logo img ok:', await p.locator('.logo img').evaluate(i => i.naturalWidth > 0));
const slug = await p.locator('a.card').first().getAttribute('href');
await p.goto(BASE + slug); await shots(p, 'product');
await p.goto(BASE + '/login'); await p.fill('input[name=phone]', '0910000000'); await p.fill('input[name=password]', 'admin123'); await p.click('button:has-text("دخول")'); await p.waitForLoadState('networkidle');
await p.goto(BASE + '/admin/crawler'); await shots(p, 'admin');
p = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
await p.goto(BASE + '/'); await shots(p, 'home-mobile');
console.log('mobile overflow:', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
await b.close();
