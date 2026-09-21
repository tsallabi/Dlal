// وسيط صور المنتجات: يجلب صور 1688 من الخادم (مع Referer الصحيح) ويقدّمها من نطاقنا
// السبب: alicdn يرفض عرض الصور في مواقع أخرى، والزبونة يجب ألا ترى رابط المصدر.
import { Hono } from 'hono';
import type { Env } from '../types';
import { unb64url } from '../lib/db';

const img = new Hono<Env>();
const ALLOWED = /(^|\.)(alicdn\.com|1688\.com|taobao\.com|tbcdn\.cn|aliyuncs\.com)$/i;

img.get('/img/:enc{.+}', async (c) => {
  let raw = '';
  try { raw = unb64url(c.req.param('enc')); } catch { return c.redirect('/placeholder.svg', 302); }
  let url: URL;
  try { url = new URL(raw); } catch { return c.redirect('/placeholder.svg', 302); }
  if (url.protocol !== 'https:' || !ALLOWED.test(url.hostname)) return c.redirect('/placeholder.svg', 302);

  try {
    const r = await fetch(url.toString(), {
      headers: {
        referer: 'https://detail.1688.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      cf: { cacheEverything: true, cacheTtl: 604800 },
    } as RequestInit);
    const ct = r.headers.get('content-type') ?? '';
    if (!r.ok || !ct.startsWith('image/')) return c.redirect('/placeholder.svg', 302);
    const h = new Headers();
    h.set('content-type', ct);
    h.set('cache-control', 'public, max-age=604800, immutable');
    h.set('x-content-type-options', 'nosniff');
    const len = r.headers.get('content-length'); if (len) h.set('content-length', len);
    return new Response(r.body, { status: 200, headers: h });
  } catch {
    return c.redirect('/placeholder.svg', 302);
  }
});

export default img;
