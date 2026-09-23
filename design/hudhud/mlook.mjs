// لقطات صفحة القسم على الجوال (٣٩٠) بعد إعادة التصميم على نمط شي إن
import { chromium } from 'playwright';
const BASE = 'http://localhost:8787', OUT = 'design/hudhud/m-';
const path = process.argv[2] || '/c/dresses';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(BASE + path); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
await p.screenshot({ path: OUT + 'list.png' });
console.log('overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
console.log('first card top', await p.locator('.grid .card').first().evaluate(e => Math.round(e.getBoundingClientRect().top)));
await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'scrolled.png' });
await p.evaluate(() => scrollTo(0, 0));
await p.click('.ms-rec summary'); await p.waitForTimeout(200); await p.screenshot({ path: OUT + 'sortmenu.png' });
await p.click('.ms-rec summary');
await p.click('.ms-filter'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + 'sheet.png' });
await p.click('.fs-tabs [data-tab=size]'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + 'sheet-size.png' });
await p.click('.fs-tabs [data-tab=color]'); await p.waitForTimeout(400); await p.screenshot({ path: OUT + 'sheet-color.png' });
await b.close();
