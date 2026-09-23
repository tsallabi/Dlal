import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 520, height: 440 }, deviceScaleFactor: 2 });
const svg = fs.readFileSync(process.argv[2] || 'hudhud-logo.svg', 'utf8');
await p.setContent(`<body style="margin:0;background:#fff">${svg.replace('<svg ', '<svg width="520" height="433" ')}</body>`);
for (const [t, name] of [[500, 'closed'], [1300, 'peck'], [2300, 'open'], [2150, 'tail']]) {
  await p.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), t);
  await p.screenshot({ path: `frame-${name}.png` });
}
await b.close();
