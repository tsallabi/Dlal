import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getCategories } from '../lib/db';
import { importProducts } from './admin';

const api = new Hono<Env>();

api.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Headers', 'content-type,x-import-token');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

const tokenOk = (c: Context<Env>) => c.req.header('x-import-token') === c.env.IMPORT_TOKEN || c.get('user')?.role === 'admin';

api.get('/categories', async (c) => c.json(await getCategories(c.env.DB)));

// يستقبل منتجات من سكربت المتصفح
api.post('/import', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const body = await c.req.json<{ category_id: number; page_url: string; items: any[] }>();
  if (!Array.isArray(body.items)) return c.json({ error: 'items مطلوبة' }, 400);
  const r = await importProducts(c.env.DB, body.items.slice(0, 200), body.category_id ?? null, c.get('user')?.id ?? null, body.page_url ?? 'bookmarklet');
  return c.json(r);
});

// قائمة الفحص: الأهم أولًا ثم الأقدم فحصًا
api.get('/import/queue', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const { results } = await c.env.DB.prepare("SELECT source_offer_id FROM products WHERE status='active' AND source='1688' ORDER BY (sales*10+views) DESC, last_checked_at ASC LIMIT 300").all<{ source_offer_id: string }>();
  return c.json({ ids: results.map(r => r.source_offer_id) });
});

api.post('/import/check', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ offerId: string; inStock: boolean; priceCny: number | null }>();
  const p = await c.env.DB.prepare("SELECT id,source_price_cny FROM products WHERE source='1688' AND source_offer_id=?").bind(b.offerId).first<any>();
  if (!p) return c.json({ ok: false });
  // تغيّر السعر أكثر من 15% يوقف المنتج لمراجعة الأدمن بدل بيعه بخسارة
  const bigChange = b.priceCny && Math.abs(b.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
  await c.env.DB.prepare("UPDATE products SET in_stock=?,status=CASE WHEN ?=1 THEN 'hidden' ELSE status END,source_price_cny=COALESCE(?,source_price_cny),last_checked_at=datetime('now') WHERE id=?")
    .bind(b.inStock ? 1 : 0, bigChange ? 1 : 0, b.priceCny, p.id).run();
  return c.json({ ok: true, flagged: !!bigChange });
});

// فحص قبل الدفع: هل كل منتجات السلة متاحة؟
api.get('/cart/verify', async (c) => {
  const u = c.get('user'); if (!u) return c.json({ ok: false }, 401);
  const { results } = await c.env.DB.prepare("SELECT p.title_ar FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.user_id=? AND (p.in_stock=0 OR p.status<>'active')").bind(u.id).all<any>();
  return c.json({ ok: results.length === 0, unavailable: results.map(r => r.title_ar) });
});

export default api;
