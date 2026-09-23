import { chromium } from 'playwright';
import path from 'node:path';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, name] of [[1100, 'desk'], [390, 'mobile']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await p.goto('file://' + path.resolve('preview.html')); await p.waitForTimeout(2800);
  await p.screenshot({ path: `preview-${name}.png`, fullPage: true });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, 'horizontal overflow px:', over);
}
await b.close();
