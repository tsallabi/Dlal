// كتالوج المنتجات لمدير التجارة في ميتا (فيسبوك وإنستغرام): يُضاف رابطه مرة واحدة كـ«مصدر بيانات مجدول»
// فتسحبه ميتا يوميًا — إعلانات ديناميكية تعرض لكل زبونة ما شاهدته، ومتجر على الصفحة، وكله بالسعر النهائي بالدينار.
// لا سعر مشطوب: compare_price_lyd ليس سعرًا سابقًا حقيقيًا، وسياسة ميتا ترفض التخفيض المُختلق.
import { Hono } from 'hono';
import type { Env } from '../types';
import { imgUrl } from '../lib/db';
import { hasCJK } from '../lib/translate';
import { csvCell } from '../lib/meta';

const feeds = new Hono<Env>();
const COLS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'product_type'];

feeds.get('/meta.csv', async (c) => {
  const origin = new URL(c.req.url).origin;
  const cacheKey = new Request(origin + '/feeds/meta.csv');
  const cached = c.req.query('fresh') ? undefined : await caches.default?.match(cacheKey).catch(() => undefined);
  if (cached) return cached;
  const { results } = await c.env.DB.prepare(`SELECT p.id,p.slug,p.title_ar,p.description_ar,p.price_lyd,p.in_stock,c.name_ar cat,
       (SELECT group_concat(url,'|') FROM (SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 5)) imgs
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' AND p.price_lyd > 0 ORDER BY p.id`).all<any>();
  const abs = (u: string) => { const x = imgUrl(u); return x.startsWith('/') ? origin + x : x; };
  const lines = [COLS.join(',')];
  for (const p of results) {
    const imgs = String(p.imgs ?? '').split('|').filter(Boolean);
    if (!imgs.length || hasCJK(p.title_ar)) continue;   // ميتا ترفض منتجًا بلا صورة، والزبونة لا ترى صينيًا
    const title = String(p.title_ar).slice(0, 150);
    const desc = (p.description_ar && !hasCJK(p.description_ar) ? String(p.description_ar) : title) + ' — سعر نهائي بالدينار الليبي شامل الشحن من الصين والجمارك.';
    lines.push([p.id, title, desc.slice(0, 5000), p.in_stock ? 'in stock' : 'out of stock', 'new', `${Number(p.price_lyd).toFixed(2)} LYD`,
      `${origin}/p/${p.slug}?utm_source=facebook&utm_medium=catalog`, abs(imgs[0]), imgs.slice(1).map(abs).join(','), 'هدهد HUDHUDE', p.cat ?? ''].map(csvCell).join(','));
  }
  const res = new Response(lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'public, max-age=21600' } });
  c.executionCtx?.waitUntil?.(caches.default?.put(cacheKey, res.clone()).catch(() => {}) ?? Promise.resolve());
  return res;
});

export default feeds;
