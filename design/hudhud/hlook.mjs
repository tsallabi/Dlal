import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
// العرض الحقيقي للتخطيط: في وضع الجوال يتّسع innerWidth مع المحتوى فلا يكشف الفيض
await p.goto('http://localhost:8787/'); await p.waitForLoadState('networkidle');
await p.screenshot({ path: 'design/hudhud/m-header.png', clip: { x: 0, y: 0, width: 390, height: 240 } });
for (const s of ['.burger', '.logo', '.hdr-icons', '.search']) console.log(s, JSON.stringify(await p.locator(s).first().evaluate(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })));
await b.close();
