import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getCategories } from '../lib/db';
import { importProducts } from './admin';
import { loadSettings } from '../lib/pricing';
import { getProvider } from '../lib/source-providers';
import { runServerJobs } from '../lib/crawl';

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
  const r = await importProducts(c.env.DB, body.items.slice(0, 200), body.category_id ?? null, c.get('user')?.id ?? null, body.page_url ?? 'bookmarklet', c.env.AI);
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

// ---------- إضافة المتصفح (الزاحف) ----------
const touch = (db: D1Database, ver: string | undefined) => db.batch([
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('crawler_last_seen',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'),updated_at=datetime('now')"),
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('crawler_version',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").bind(ver ?? ''),
]);

// المهام المستحقة الآن (الخادم يقرر الاستحقاق)
api.get('/crawl/jobs', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  await touch(c.env.DB, c.req.query('v'));
  const { results } = await c.env.DB.prepare(`SELECT j.*,c.name_ar AS category_name FROM crawl_jobs j LEFT JOIN categories c ON c.id=j.category_id
    WHERE j.active=1 AND (j.cooldown_until IS NULL OR j.cooldown_until < datetime('now'))
      AND (j.run_now=1 OR j.last_run_at IS NULL OR j.last_run_at < datetime('now', '-' || j.interval_hours || ' hours'))
    ORDER BY j.run_now DESC, j.last_run_at ASC LIMIT 5`).all<any>();
  return c.json({ jobs: results, all: (await c.env.DB.prepare('SELECT id,name,type,active,last_run_at FROM crawl_jobs ORDER BY id').all<any>()).results });
});
// تقرير تشغيل
api.post('/crawl/report', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<any>();
  const db = c.env.DB;
  const status = ['ok', 'blocked', 'error', 'partial'].includes(b.status) ? b.status : 'ok';
  await db.batch([
    db.prepare('INSERT INTO crawl_runs(job_id,started_at,status,pages,found,imported,updated,enriched,checked,note) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(b.job_id ?? null, b.started_at ?? new Date().toISOString(), status, b.pages ?? 0, b.found ?? 0, b.imported ?? 0, b.updated ?? 0, b.enriched ?? 0, b.checked ?? 0, b.note ? String(b.note).slice(0, 500) : null),
    db.prepare("UPDATE crawl_jobs SET run_now=0,last_run_at=datetime('now'),last_summary=?,cooldown_until=CASE WHEN ?='blocked' THEN datetime('now','+2 hours') ELSE NULL END WHERE id=?")
      .bind(`${status}: صفحات ${b.pages ?? 0} · وُجد ${b.found ?? 0} · جديد ${b.imported ?? 0} · محدّث ${b.updated ?? 0} · مُثرى ${b.enriched ?? 0} · مفحوص ${b.checked ?? 0}`, status, b.job_id ?? 0),
  ]);
  return c.json({ ok: true });
});

// اختبار مزوّد API الخارجي (OTAPI/TMAPI) بالرمز نفسه — للفحص الآلي من GitHub Actions
api.post('/source/test', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ id?: string; kw?: string }>();
  const prov = getProvider(await loadSettings(c.env.DB));
  if (!prov) return c.json({ error: 'لا يوجد مزوّد مضبوط' }, 400);
  const r = b.kw ? await prov.search(String(b.kw), 1) : await prov.item(String(b.id ?? '').replace(/\D/g, ''));
  const url = r.url.replace(/(instanceKey|apiToken)=[^&]+/g, '$1=***');
  await c.env.DB.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)').bind('in', 'SRC ' + url, r.status, '', r.raw.slice(0, 60000), r.ok ? 1 : 0).run();
  return c.json({ ok: r.ok, provider: prov.name, url, status: r.status, error: r.error, data: r.data, raw: r.raw.slice(0, 1500) });
});
api.post('/source/run', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ job_id?: number; limit?: number }>();
  return c.json(await runServerJobs(c.env, { limit: Math.min(3, b.limit ?? 1), jobId: b.job_id, byUserId: c.get('user')?.id ?? null }));
});

export default api;
