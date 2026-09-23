// أيقونة شاشة الجوال (PNG ١٨٠) من أيقونة SVG — iOS لا يقبل SVG هنا
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 180, height: 180 } });
const svg = fs.readFileSync('public/favicon.svg', 'utf8').replace('rx="28"', 'rx="0"').replace('<svg ', '<svg width="180" height="180" ');
await p.setContent(`<body style="margin:0">${svg}</body>`);
await p.screenshot({ path: 'public/apple-touch-icon.png', omitBackground: false });
await b.close();
