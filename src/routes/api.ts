import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getCategories } from '../lib/db';
import { importProducts } from './admin';
import { classifyModesty } from '../lib/modesty';
import { fingerprint, sameProduct } from '../lib/dedupe';
import { computePrice, loadSettings } from '../lib/pricing';
import { normWeightG, attrValue, kindOf } from '../lib/source';
import { getProvider } from '../lib/source-providers';
import { runServerJobs } from '../lib/crawl';
import { liveState } from '../lib/crawl-live';
import { settleLinkRequests } from '../lib/link-requests';
import { fixEnglishVariants, englishVariantsLeft, Translator } from '../lib/translate';
import { retranslatePending, releaseHeldDrafts, diagnoseTitle, hasCJK, dropCJKWords, dictTranslate, mixedScript, dropMixedWords, goodTitle, sweepMashedTitles, brokenTitle, BROKEN_SQL } from '../lib/translate';

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
  // منتج قرأته دفعة الإثراء في الإضافة: خطوة في شريط التقدّم
  if (body.page_url === 'ext:stock') await liveStep(c.env.DB, body.items.length, r.gain, 0, String(body.items[body.items.length - 1]?.offerId ?? ''));
  // منتج جديد اكتشفته الإضافة في صفحة منتج آخر: أُضيف، أو رُفض (توأم أرخص منه، أو بلا سعر)
  if (body.page_url === 'ext:discover') {
    const id = String(body.items[0]?.offerId ?? '');
    await c.env.DB.prepare("UPDATE discovered_offers SET status=?,tries=tries+1,done_at=datetime('now') WHERE offer_id=?").bind(r.imported ? 'imported' : 'skipped', id).run();
    await liveStep(c.env.DB, 1, null, 0, r.imported ? id : '', r.imported);
  }
  // رابط طلبته زبونة («اطلبي برابط») ووصل منتجه الآن: يصير جاهزًا وتصلها إشعارة
  if (r.imported || r.updated) await settleLinkRequests(c.env.DB);
  return c.json(r);
});

// ---------- شريط تقدّم الإضافة ----------
// الإضافة (حتى 1.5.0) لا تكلّم الخادم إلا في آخر الدفعة — 100 منتج ≈ نصف ساعة من الصمت.
// لكنها تمرّ على الخادم عند كل منتج أصلًا: الطابور في البداية، ثم /import (ext:stock) أو
// /import/check لكل منتج، ثم /crawl/report في النهاية. نسجّل هذه المرور فيصير للصمت شريط.
export async function liveStep(db: D1Database, n: number, g: { img: number; vars: number; wt: number } | null, gone: number, offer: string, neu = 0) {
  await db.prepare(`UPDATE crawler_live SET done=done+?,gain_img=gain_img+?,gain_var=gain_var+?,gain_wt=gain_wt+?,gone=gone+?,gain_new=gain_new+?,
      last_offer=COALESCE(?,last_offer),last_at=datetime('now'),status=CASE WHEN status='idle' THEN 'running' ELSE status END WHERE id=1`)
    .bind(n, g?.img ?? 0, g?.vars ?? 0, g?.wt ?? 0, gone, neu, offer || null).run();
}

// قائمة الفحص: الأهم أولًا ثم الأقدم فحصًا
api.get('/import/queue', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  // الإضافة تقرأ صفحة 1688 من متصفح صاحب المشروع: **بلا أي تكلفة** من حصة المزوّد.
  // فالطابور يقدّم ما ينقصه صور/مقاسات/وزن، ثم المحجوزات (إثراؤها يُخرجها للمتجر)، ثم الأقدم فحصًا.
  // بهذا تُنجز الإضافة المجانية ركام الإثراء بينما تبقى حصة الـAPI لفحص المخزون والأسعار.
  const THIN = `((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1
       OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0 OR p.weight_g IS NULL)`;
  const { results } = await c.env.DB.prepare(`SELECT p.source_offer_id FROM products p
     WHERE p.status IN ('active','draft') AND p.source='1688'
       AND p.source_offer_id GLOB '[0-9]*' AND length(p.source_offer_id)>=9
     ORDER BY (${THIN} AND p.enrich_tries < 3) DESC, (p.status='draft') DESC, p.enrich_tries ASC,
              (p.last_checked_at IS NULL) DESC, p.last_checked_at ASC, (p.sales*10+p.views) DESC LIMIT 300`).all<{ source_offer_id: string }>();
  // بداية دفعة: الإضافة تأخذ من الطابور بقدر حدّ مهمة الإثراء (max_new)
  const job = await c.env.DB.prepare("SELECT id,max_new FROM crawl_jobs WHERE type='stock' AND runner IN ('any','extension') ORDER BY active DESC,id LIMIT 1").first<{ id: number; max_new: number | null }>();
  // دفعة سابقة لم ترسل تقريرها (مات عامل الخلفية في كروم): نسجّلها في سجل التشغيل بما أضافته،
  // وإلا ضاع ما أُضيف من «أضافته في 24 ساعة» ولم يعرف صاحب المشروع أن الدفعات تنقطع.
  const prev = await c.env.DB.prepare('SELECT * FROM crawler_live WHERE id=1').first<any>();
  if (job && prev?.status === 'running' && prev.done > 0) {
    await c.env.DB.prepare(`INSERT INTO crawl_runs(job_id,started_at,status,pages,found,imported,updated,enriched,checked,note,gain_img,gain_var,gain_wt,gain_new,links_new) VALUES(?,?,'partial',?,0,?,?,?,?,?,?,?,?,?,?)`)
      .bind(job.id, prev.started_at ?? prev.last_at, prev.pages_read ?? 0, prev.gain_new ?? 0, prev.done, Math.max(prev.gain_img, prev.gain_var, prev.gain_wt), prev.done,
        `انقطعت الدفعة بعد ${prev.done}${prev.total ? ' من ' + prev.total : ''} منتج بلا تقرير (أُغلق كروم أو توقف عامل الإضافة)`, prev.gain_img, prev.gain_var, prev.gain_wt, prev.gain_new ?? 0, prev.links_new ?? 0).run();
  }
  // منتجات جديدة اكتُشفت في صفحات الدفعات السابقة — للإضافة 1.7.0 فما فوق فقط (الأقدم تتجاهلها
  // فيبقى الشريط ناقصًا إلى الأبد لو حُسبت في المجموع)
  const v = (c.req.query('v') ?? '').split('.').map(Number);
  const canDiscover = (v[0] ?? 0) > 1 || ((v[0] ?? 0) === 1 && (v[1] ?? 0) >= 7);
  const fresh = canDiscover ? await freshOffers(c.env.DB, await discoverPer(c.env.DB)) : [];
  const total = Math.min(results.length, job?.max_new || 100) + fresh.length;
  await c.env.DB.prepare(`UPDATE crawler_live SET started_at=datetime('now'),finished_at=NULL,status='running',total=?,done=0,gain_img=0,gain_var=0,gain_wt=0,gone=0,
      pages_read=0,pages_linked=0,links_new=0,gain_new=0,last_offer=NULL,last_at=datetime('now') WHERE id=1`).bind(total).run();
  return c.json({ ids: results.map(r => r.source_offer_id), fresh });
});

// الدفعة نفسها تستورد ما اكتشفته (الإضافة 1.7.1): كانت الروابط تنتظر الدفعة التالية (ساعة) وتُستورد في آخرها
// بعد مئة منتج إثراء، فإن أُغلق كروم قبل النهاية لم يدخل المتجر منها شيء. `taken` = ما أخذته الدفعة من حصتها في بدايتها.
api.get('/crawl/fresh', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const taken = Math.max(0, parseInt(c.req.query('taken') ?? '0') || 0);
  const fresh = await freshOffers(c.env.DB, Math.max(0, (await discoverPer(c.env.DB)) - taken));
  if (fresh.length) await c.env.DB.prepare("UPDATE crawler_live SET total=total+? WHERE id=1 AND status='running'").bind(fresh.length).run();
  return c.json({ fresh });
});
const discoverPer = async (db: D1Database) => Math.max(0, Math.min(100, parseInt((await db.prepare("SELECT value FROM settings WHERE key='discover_per_batch'").first<{ value: string }>())?.value ?? '') || 0));
async function freshOffers(db: D1Database, n: number) {
  if (n <= 0) return [];
  return (await db.prepare(`SELECT d.offer_id id,d.category_id FROM discovered_offers d
     WHERE d.status='new' AND d.tries < 2 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.source='1688' AND p.source_offer_id=d.offer_id)
     ORDER BY (d.from_offer='request') DESC, d.tries, d.found_at LIMIT ?`).bind(n).all<{ id: string; category_id: number | null }>()).results;
}

api.post('/import/check', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ offerId: string; inStock: boolean; priceCny: number | null; skipped?: boolean }>();
  const p = await c.env.DB.prepare("SELECT id,source_price_cny FROM products WHERE source='1688' AND source_offer_id=?").bind(b.offerId).first<any>();
  if (!p) return c.json({ ok: false });
  // صفحة لم تُحمَّل أو لم تُجب (الإضافة 1.5.3+): ليست «غير متوفر». نؤخّرها في الطابور فقط، ولا نكتب
  // last_checked_at لأنها لم تُفحص فعلًا، ونعدّها «لم يُقرأ» في شريط التقدّم.
  if (b.skipped) {
    await c.env.DB.prepare('UPDATE products SET enrich_tries=enrich_tries+1 WHERE id=?').bind(p.id).run();
    await liveStep(c.env.DB, 1, null, 1, String(b.offerId));
    return c.json({ ok: true, skipped: true });
  }
  // تغيّر السعر أكثر من 15% يوقف المنتج لمراجعة الأدمن بدل بيعه بخسارة
  const bigChange = b.priceCny && Math.abs(b.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
  await c.env.DB.prepare("UPDATE products SET in_stock=?,status=CASE WHEN ?=1 THEN 'hidden' ELSE status END,source_price_cny=COALESCE(?,source_price_cny),enrich_tries=enrich_tries+1,last_checked_at=datetime('now') WHERE id=?")
    .bind(b.inStock ? 1 : 0, bigChange ? 1 : 0, b.priceCny, p.id).run();
  // الإضافة تنادي هذا حين لا تقرأ الصفحة سعرًا (المنتج نزل أو لم تُحمَّل الصفحة): خطوة بلا إضافة
  await liveStep(c.env.DB, 1, null, b.inStock ? 0 : 1, String(b.offerId));
  return c.json({ ok: true, flagged: !!bigChange });
});

// ---------- اكتشاف مجاني ----------
// الإضافة ترسل روابط المنتجات التي وجدتها في كل صفحة قرأتها (ولو صفرًا: عدد الصفحات بلا روابط
// هو الدليل على أن 1688 لا تعرض توصيات لزائر غير مسجّل). يُحفظ الجديد وحده، بقسم الصفحة التي وُجد فيها.
const DISCOVER_CAP = 20000;   // سقف الطابور: الاكتشاف يتضاعف كالشجرة، ولا نريد جدولًا بلا قاع
api.post('/crawl/discover', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ from: string; ids: string[] }>().catch(() => ({ from: '', ids: [] as string[] }));
  const db = c.env.DB;
  const from = String(b.from ?? '');
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String).filter(x => /^\d{9,15}$/.test(x) && x !== from))].slice(0, 80);
  const pending = (await db.prepare("SELECT COUNT(*) n FROM discovered_offers WHERE status='new'").first<{ n: number }>())?.n ?? 0;
  let added = 0;
  if (ids.length && pending < DISCOVER_CAP) {
    const res = await db.batch(ids.map(id => db.prepare(`INSERT OR IGNORE INTO discovered_offers(offer_id,from_offer,category_id)
      SELECT ?,?,(SELECT category_id FROM products WHERE source='1688' AND source_offer_id=?)
      WHERE NOT EXISTS (SELECT 1 FROM products WHERE source='1688' AND source_offer_id=?)`).bind(id, from || null, from, id)));
    added = res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  await db.prepare('UPDATE crawler_live SET pages_read=pages_read+1,pages_linked=pages_linked+?,links_new=links_new+? WHERE id=1').bind(ids.length ? 1 : 0, added).run();
  return c.json({ ok: true, found: ids.length, added, capped: pending >= DISCOVER_CAP });
});
// صفحة منتج مكتشف لم تُقرأ (لم تُحمَّل، أو بلا سعر): محاولتان ثم نكفّ عنه
api.post('/crawl/discover/fail', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ offerId: string }>();
  await c.env.DB.prepare("UPDATE discovered_offers SET tries=tries+1,status=CASE WHEN tries+1>=2 THEN 'failed' ELSE status END,done_at=datetime('now') WHERE offer_id=?").bind(String(b.offerId ?? '')).run();
  await liveStep(c.env.DB, 1, null, 1, '');
  return c.json({ ok: true });
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

// المهام المستحقة الآن (الخادم يقرر الاستحقاق). للإضافة مهمة فحص المخزون وحدها: صفحة المنتج تفتح بلا حساب
// 1688، أما البحث فيحوّلها إلى صفحة الدخول فتعود «ok — 0» (حدث 24/09/26 لثماني مهام بحث)
api.get('/crawl/jobs', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  await touch(c.env.DB, c.req.query('v'));
  const { results } = await c.env.DB.prepare(`SELECT j.*,c.name_ar AS category_name FROM crawl_jobs j LEFT JOIN categories c ON c.id=j.category_id
    WHERE j.active=1 AND j.runner IN ('any','extension') AND j.type='stock' AND (j.cooldown_until IS NULL OR j.cooldown_until < datetime('now'))
      AND (j.run_now=1 OR j.last_run_at IS NULL OR j.last_run_at < datetime('now', '-' || j.interval_hours || ' hours'))
    ORDER BY j.run_now DESC, j.last_run_at ASC LIMIT 5`).all<any>();
  return c.json({ jobs: results, all: (await c.env.DB.prepare('SELECT id,name,type,active,last_run_at FROM crawl_jobs ORDER BY id').all<any>()).results });
});
// حالة الدفعة الجارية لنافذة الإضافة (نفس ما يعرضه شريط /admin/crawler)
api.get('/crawl/live', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  return c.json(await liveState(c.env.DB));
});
// تقرير تشغيل
api.post('/crawl/report', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<any>();
  const db = c.env.DB;
  const status = ['ok', 'blocked', 'error', 'partial'].includes(b.status) ? b.status : 'ok';
  // دفعة الإثراء: ما أُضيف فعلًا يأتي من سجلّ الخادم الحي لا من عدّاد الإضافة
  // (الإضافة 1.5.0 تعدّ كل مرور «مُثرى» فتكتب 100 من 100 دائمًا)
  const job = await db.prepare('SELECT type FROM crawl_jobs WHERE id=?').bind(b.job_id ?? 0).first<{ type: string }>();
  const live = job?.type === 'stock' ? await db.prepare('SELECT * FROM crawler_live WHERE id=1').first<any>() : null;
  const g = { img: live?.gain_img ?? 0, vars: live?.gain_var ?? 0, wt: live?.gain_wt ?? 0 };
  const enriched = live ? Math.max(g.img, g.vars, g.wt) : (b.enriched ?? 0);
  // الاكتشاف المجاني يُذكر حين قرأت الإضافة صفحات (1.7.0+): وجدت روابط أم لا
  const disc = live && live.pages_read ? ` · منتجات جديدة +${live.gain_new ?? 0} · روابط جديدة ${live.links_new ?? 0} من ${live.pages_linked ?? 0}/${live.pages_read} صفحة` : '';
  const summary = live
    ? `${status}: فُحص ${b.checked ?? 0} · صور +${g.img} · مقاسات/ألوان +${g.vars} · وزن +${g.wt} · لم يُقرأ ${live.gone ?? 0}${disc}`
    : `${status}: صفحات ${b.pages ?? 0} · وُجد ${b.found ?? 0} · جديد ${b.imported ?? 0} · محدّث ${b.updated ?? 0} · مُثرى ${b.enriched ?? 0} · مفحوص ${b.checked ?? 0}`;
  await db.batch([
    db.prepare('INSERT INTO crawl_runs(job_id,started_at,status,pages,found,imported,updated,enriched,checked,note,gain_img,gain_var,gain_wt,gain_new,links_new) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(b.job_id ?? null, b.started_at ?? new Date().toISOString(), status, live ? (live.pages_read ?? 0) : (b.pages ?? 0), b.found ?? 0,
        live ? (live.gain_new ?? 0) : (b.imported ?? 0), b.updated ?? 0, enriched, b.checked ?? 0, b.note ? String(b.note).slice(0, 500) : null, g.img, g.vars, g.wt, live?.gain_new ?? 0, live?.links_new ?? 0),
    db.prepare("UPDATE crawl_jobs SET run_now=0,last_run_at=datetime('now'),last_summary=?,cooldown_until=CASE WHEN ?='blocked' THEN datetime('now','+2 hours') ELSE NULL END WHERE id=?")
      .bind(summary, status, b.job_id ?? 0),
    ...(live ? [db.prepare("UPDATE crawler_live SET finished_at=datetime('now'),status=?,last_at=datetime('now') WHERE id=1").bind(status === 'ok' ? 'done' : status)] : []),
  ]);
  return c.json({ ok: true });
});

// اختبار مزوّد API الخارجي (OTAPI/TMAPI) بالرمز نفسه — للفحص الآلي من GitHub Actions
// إعادة تسعير الكتالوج من الخادم (جوي + بحري) — دفعات حتى لا تتجاوز حدود الـ Worker
api.post('/source/reprice', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ limit?: number; only_missing_sea?: boolean; after_id?: number }>().catch(() => ({} as any));
  const db = c.env.DB;
  const s = await loadSettings(db);
  const cats = await getCategories(db);
  const limit = Math.max(1, Math.min(b.limit ?? 400, 800));
  // «الناقص فقط» يتقدّم وحده لأن الصفوف تخرج من الشرط بعد تسعيرها؛
  // أما إعادة تسعير الكل فتحتاج مؤشّرًا على id وإلا أعادت نفس الدفعة كل مرة
  const all = b.only_missing_sea === false;
  const after = Number(b.after_id ?? 0) || 0;
  const { results } = all
    ? await db.prepare('SELECT id,source_price_cny,weight_g,volume_cm3,category_id,min_qty FROM products WHERE id>? ORDER BY id LIMIT ?').bind(after, limit).all<any>()
    : await db.prepare('SELECT id,source_price_cny,weight_g,volume_cm3,category_id,min_qty FROM products WHERE price_sea_lyd IS NULL ORDER BY id LIMIT ?').bind(limit).all<any>();
  const stmts = results.map((p: any) => {
    const cat = cats.find(x => x.id === p.category_id);
    const w = p.weight_g ?? cat?.est_weight_g ?? 300;
    const air = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
    const sea = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3, 'sea', p.min_qty ?? 1);
    return db.prepare('UPDATE products SET price_lyd=?,price_sea_lyd=? WHERE id=?').bind(air.total_lyd, sea.total_lyd, p.id);
  });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  const left = await db.prepare('SELECT COUNT(*) n FROM products WHERE price_sea_lyd IS NULL').first<{ n: number }>();
  const lastId = results.length ? results[results.length - 1].id : after;
  return c.json({ ok: true, repriced: results.length, last_id: lastId, missing_sea_left: left?.n ?? 0 });
});

// فحص منطق الحشمة والبصمة والشحن على الكود الحقيقي (scripts/logic-test)
api.get('/logic-check', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const s = await loadSettings(c.env.DB);
  const titles = ['بيجامة نسائية شتاء', '跨境速卖通女式长款睡衣家居服', 'عباية سوداء بتطريز ذهبي', 'فستان مفتوح الخلف', 'حافظة هاتف شفافة'];
  const modesty: Record<string, any> = {};
  for (const t of titles) modesty[t] = classifyModesty(t);
  const w1 = '跨境外贸商务石英表皮带腕表日内瓦三眼六针潮流watch男士手表';
  const w2 = '厂家现货跨境石英表男士手表批发watch皮带腕表日内瓦三眼六针';
  const bag = '新款女士单肩包时尚百搭大容量手提包';
  // حذف الكلمة الصينية العالقة داخل ترجمة عربية سليمة — أمثلة حقيقية من ردود النموذج
  const strays = [
    'م耙 حديدي لحراثة التربة ومجالسة الحدائق',
    'عباءة طويلة بتصميم豹 مع زينة بذرة اللؤلؤ',
    'مجموعة مجوهرات蝴蝶吊坠耳环 و项链 و خاتم',
    '调色盘 调色棒 化妆',
  ];
  // قيم متغيّرات حقيقية بقيت صينية على الموقع الحي: يجب أن يترجمها القاموس بلا استدعاء نموذج
  const attrs = ['8号', '9号', '10号', '2号色', '黑色 M', '均码', '藏青色'];
  // كلمات عربية ملتصقة ببقية لاتينية — أمثلة حقيقية من الموقع الحي (22/09/26)
  const mashed = [
    'كيس شفاف للهاتف والسماعات مع زippers',
    'حذاء صيفي أنثوي بheel عريض ومستقر',
    'فستان بناتي طويل الأكمام بالكorean ستايل للربيع والخريف',
    'صندوق تخزين بلاستيكي كبير للعلب البلاستيكية والمنزل والكitchen',
  ];
  const okLatin = ['عباية سوداء مقاس XL', 'كابل شحن USB طويل', 'بلوزة قطن 2XL'];
  return c.json({
    modesty,
    dict: Object.fromEntries(attrs.map(t => [t, dictTranslate(t)])),
    strays: Object.fromEntries(strays.map(t => [t, dropCJKWords(t)])),
    mashed: Object.fromEntries(mashed.map(t => [t, { mixed: mixedScript(t), good: goodTitle(t), fixed: dropMixedWords(t) }])),
    okLatin: Object.fromEntries(okLatin.map(t => [t, { mixed: mixedScript(t), good: goodTitle(t) }])),
    dedupe: { same: sameProduct(w1, w2), different: sameProduct(w1, bag), noiseOnly: sameProduct('跨境 批发 新款', '外贸 现货 爆款'), fp: fingerprint(w1) },
    // ترجمة سليمة نحويًا لكنها ليست ترجمة العنوان — أمثلة حقيقية من الرف الحي
    brokenT: {
      repeat: brokenTitle('الوسومالوسومالوسومالوسومالوسوم', '网红高档合金筷子'),
      quake: brokenTitle('حقيبة رياضية للخارج مع حاملات ماء ومقابض للزلازل', '户外双肩运动背包登山杖外挂设计'),
      quakeOk: brokenTitle('خيمة طبية عازلة للزلازل للطوارئ', '应急救援帐篷抗震救灾消防演习'),
      noNoun: brokenTitle('حمراء مزيفة لديكور المنزل وتصوير الفوتوغرافيا', '嘉兰百合红色装饰仿真花'),
      fine: brokenTitle('عباءة سوداء بتطريز ذهبي مقاس XL', '黑色刺绣长袍'),
      korean: brokenTitle('فستان أنيق بدون أكمام بال스타يل الفرنسي', '无袖连衣裙'),
      kana: brokenTitle('فستان بناتي ليلة هالوين مع تنورةチュチュ', '万圣节儿童连衣裙'),
      cyrillic: brokenTitle('مجموعة أدوات تجميل розية مع فرشاة', '化妆刷套装'),
      dupWord: brokenTitle('المعدات الرياضية للسيارات للسيارات الرياضية', '汽车运动器材'),
      tooLong: brokenTitle('ملابس ' + 'الصيف الجديدة للأطفال بتصميم عصري وألوان زاهية '.repeat(3), '童装'),
      swept: dropMixedWords('إبريق شاي حراري مزدوج الطبقات من الستانلس ستيل 316 용'),
    },
    // نوع الإعلان: ماذا تستلم الزبونة فعلًا (حامل عرض فارغ، زهرة صناعية، بدلة ساونا)
    kinds: { rack: kindOf('蓝牙耳机展示架 手机壳挂件架'), fake: kindOf('仿真向日葵假花家居装饰'), sauna: kindOf('加厚面料男女款汗蒸服桑拿服'), prop: kindOf('木质蝴蝶墙贴摄影道具'), mannequin: kindOf('服装店模特展示'), none: kindOf('新款女士单肩包时尚百搭'), empty: kindOf(null) },
    // رأس عمود جدول المواصفات بدل القيمة: «المقاس» كمقاس و«اللون» كلون
    attrs2: { cjkSize: attrValue('尺码'), cjkColor: attrValue('颜色：'), arSize: attrValue('المقاس'), arColor: attrValue('اللون'), realColor: attrValue('أحمر'), realSize: attrValue('XL'), empty: attrValue('  ') },
    // وزن المورّد: كيلو أم غرام؟ قيم حقيقية من TMAPI أنتجت رفّ حمام بـ650 كغ
    weights: { kg: normWeightG(0.65) ?? null, gramsInKgField: normWeightG(650) ?? null, absurd: normWeightG(650000) ?? null, zero: normWeightG(0) ?? null, specKg: normWeightG(0.3, 'raw') ?? null, specG: normWeightG(800, 'raw') ?? null },
    pricing: {
      light: computePrice(s, 25, 800, null, 1500),                       // صغيرة وثقيلة
      bulky: computePrice(s, 25, 300, null, 40000),                      // كبيرة وخفيفة
      byKg: computePrice({ ...s, ship_mode: 'kg' }, 25, 300, null, 40000),
      // الشحن الداخلي في الصين للطرد الواحد: قطعة أقلّها 100 لا تحمل 100 ضعفه
      lot1: computePrice(s, 0.05, 1, null, null, 'air', 1),
      lot100: computePrice(s, 0.05, 1, null, null, 'air', 100),
      lot100Sea: computePrice(s, 0.05, 1, null, null, 'sea', 100),
    },
  });
});

api.post('/source/test', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ id?: string; kw?: string; provider?: string; base_url?: string; key?: string; lang?: string }>();
  // تجاوز الإعدادات المحفوظة: لتجربة مزوّد أو مفتاح جديد قبل حفظه (ولفحص المحوّل بخادم وهمي)
  const saved = await loadSettings(c.env.DB);
  const s2 = b.provider ? { ...saved, src_provider: b.provider, src_base_url: b.base_url ?? saved.src_base_url, src_key: b.key ?? saved.src_key, src_lang: b.lang ?? saved.src_lang } : saved;
  const prov = getProvider(s2);
  if (!prov) return c.json({ error: 'لا يوجد مزوّد مضبوط' }, 400);
  const r = b.kw ? await prov.search(String(b.kw), 1) : await prov.item(String(b.id ?? '').replace(/\D/g, ''));
  const url = r.url.replace(/(instanceKey|apiToken)=[^&]+/g, '$1=***');
  await c.env.DB.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)').bind('in', 'SRC ' + url, r.status, '', r.raw.slice(0, 60000), r.ok ? 1 : 0).run();
  let meta: any = null; try { const j = JSON.parse(r.raw); const it = j.OtapiItemFullInfo ?? j.Result?.Item ?? j.data?.item ?? j.data; if (it && typeof it === 'object' && !Array.isArray(it)) meta = { keys: Object.keys(it), cfg: Array.isArray(it.ConfigurationItems) ? it.ConfigurationItems.length : null, attrs: Array.isArray(it.Attributes) ? it.Attributes.length : null, cfgSample: (it.ConfigurationItems ?? [])[0] ?? null }; } catch {}
  return c.json({ ok: r.ok, provider: prov.name, url, status: r.status, error: r.error, data: r.data, meta, raw: r.raw.slice(0, 1500) });
});
api.post('/source/run', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ job_id?: number; limit?: number; max_items?: number; pages?: number; from_page?: number; enrich_only?: boolean; keyword?: string }>();
  return c.json(await runServerJobs(c.env, { limit: Math.min(3, b.limit ?? 1), jobId: b.job_id, byUserId: c.get('user')?.id ?? null, maxItems: b.max_items ?? 8, pages: b.pages, fromPage: b.from_page, enrichOnly: b.enrich_only === true, keyword: b.keyword }));
});
// حالة المتجر الحقيقية من القاعدة الحية (أرقام لكل قسم) — للفحص عن بُعد بلا لوحة إدارة
// تفتيش الكتالوج كله بحثًا عن ترجمات مكسورة لم تلتقطها القواعد بعد.
// يجري **على الخادم** حيث البيانات ويعيد أعدادًا وخمس عيّنات لكل نوع — قراءة فقط، بلا كريدت.
// شغّله من workflow source-check بمدخل audit=yes كلما دخلت بضاعة جديدة.
api.post('/source/audit', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const db = c.env.DB;
  const rows: { id: number; t: string; src: string | null; cat: string | null }[] = [];
  for (let after = 0; ; ) {
    const { results } = await db.prepare(
      `SELECT p.id, p.title_ar t, p.title_src src, c.name_ar cat FROM products p LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.status IN ('active','draft') AND p.id > ? ORDER BY p.id LIMIT 4000`).bind(after).all<any>();
    if (!results.length) break;
    rows.push(...results); after = results[results.length - 1].id;
    if (rows.length >= 30000) break;
  }
  const hit: Record<string, { n: number; ex: string[] }> = {};
  const add = (k: string, id: number, t: string) => {
    hit[k] ??= { n: 0, ex: [] };
    hit[k].n++;
    if (hit[k].ex.length < 5) hit[k].ex.push(`${id}: ${t.slice(0, 90)}`);
  };
  const seen = new Map<string, number>();
  for (const r of rows) {
    const t = String(r.t ?? '').trim();
    const words = t.split(/\s+/).filter(Boolean);
    if (!t) { add('عنوان فارغ', r.id, '(فارغ)'); continue; }
    const why = brokenTitle(t, r.src);
    if (why) add(`مكسور: ${why}`, r.id, t);
    if (/(\S{2,})\s+\1(\s|$)/.test(t)) add('كلمة مكرّرة مرتين متتاليتين', r.id, t);
    if (words.length <= 1) add('عنوان من كلمة واحدة', r.id, t);
    if (words.length === 2 && t.length < 12) add('عنوان قصير جدًا (كلمتان تحت 12 حرفًا)', r.id, t);
    if (t.length > 120) add('عنوان أطول من 120 حرفًا', r.id, t);
    if ((t.match(/\d+/g) ?? []).length >= 4) add('أرقام كثيرة في العنوان (4 فأكثر)', r.id, t);
    // الصيني له عدّاده المستقل فلا يُحسب هنا مرتين؛ نبحث عن رموز لا لغة لها
    if (!/[\u4e00-\u9fff]/.test(t) && /[^\u0600-\u06FF\s\d(),.\/\-x×+%A-Za-z،؛:'"«»&]/.test(t)) add('رموز غريبة في العنوان', r.id, t);
    if (/\b(الوسوم|العلامات|الكلمات المفتاحية|نص|عنوان المنتج)\b/.test(t)) add('كلمة من تعليمات النموذج تسرّبت', r.id, t);
    const key = t.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupTitles = [...seen.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  // عنوان يتقاسمه ثلاثة منتجات فأكثر: النموذج طوى منتجات مختلفة في اسم واحد، فالزبونة
  // ترى سبعة عشر صفًّا بالاسم نفسه ولا تعرف أيها تريد. كلها تحتاج إعادة ترجمة.
  const dupSet = new Set(dupTitles.map(([t]) => t));
  const flag: number[] = [];
  for (const r of rows) {
    const t = String(r.t ?? '').trim();
    if (brokenTitle(t, r.src) || dupSet.has(t.toLowerCase()) || (t.match(/\d+/g) ?? []).length >= 4) flag.push(r.id);
  }
  // `fix: true` يضع علامة needs_tr فيتصدّرون طابور الترجمة في الدفعة التالية
  const body = await c.req.json<{ fix?: boolean }>().catch(() => ({} as any));
  let flagged = 0;
  if (body.fix && flag.length) {
    // D1 يرفض ما يزيد على 100 متغيّر مربوط في الجملة الواحدة («too many SQL variables»)،
    // والمعرّفات أرقام صحيحة من القاعدة نفسها فنكتبها حرفيًا بعد التحقق من أنها أعداد.
    const ids = flag.filter(Number.isInteger);
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await db.prepare(`UPDATE products SET needs_tr=1 WHERE id IN (${part.join(',')})`).run();
      flagged += part.length;
    }
  }
  return c.json({
    flaggedForRetranslation: flagged, wouldFlag: flag.length,
    scanned: rows.length,
    findings: Object.fromEntries(Object.entries(hit).sort((a, b) => b[1].n - a[1].n)),
    repeatedTitles: { n: dupTitles.length, ex: dupTitles.slice(0, 5).map(([t, n]) => `${n}× ${t.slice(0, 70)}`) },
  });
});

api.post('/source/stats', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const db = c.env.DB;
  const { results: cats } = await db.prepare(
    `SELECT c.id,c.name_ar,c.slug,
       COUNT(p.id) AS total,
       SUM(CASE WHEN p.status='active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN p.source='1688' THEN 1 ELSE 0 END) AS from1688,
       SUM(CASE WHEN p.title_ar GLOB '*[\u4e00-\u9fff]*' THEN 1 ELSE 0 END) AS chinese,
       SUM(CASE WHEN p.status='draft' THEN 1 ELSE 0 END) AS draft,
       SUM(CASE WHEN p.home_ok=0 THEN 1 ELSE 0 END) AS hidden_home,
       SUM(CASE WHEN p.price_sea_lyd IS NULL THEN 1 ELSE 0 END) AS no_sea,
       MAX(c.show_home) AS show_home
     FROM categories c LEFT JOIN products p ON p.category_id=c.id
     GROUP BY c.id ORDER BY active ASC`,
  ).all<any>();
  const tot = await db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) a, SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) dr, SUM(CASE WHEN source='1688' THEN 1 ELSE 0 END) s, SUM(CASE WHEN in_stock=0 THEN 1 ELSE 0 END) oos FROM products").first<any>();
  const src = await db.prepare("SELECT COUNT(*) n FROM payment_log WHERE url LIKE 'SRC %'").first<any>();
  const cn = await db.prepare("SELECT COUNT(*) n, SUM(status='active') a FROM products WHERE title_ar GLOB '*[一-龥]*'").first<any>();
  // نص مكسور يراه الزبون: عربي ملتصق بلاتيني، أو عنوان بلا حرف عربي، أو قيمة متغيّر مكسورة.
  // يجب أن تؤول كلها إلى صفر كما تؤول chineseVisible.
  const broken = await db.prepare(`SELECT
     (SELECT COUNT(*) FROM products WHERE status IN ('active','draft')
        AND (title_ar GLOB '*[\u0621-\u064A][a-zA-Z]*' OR title_ar GLOB '*[a-zA-Z][\u0621-\u064A]*')) t,
     (SELECT COUNT(*) FROM products WHERE status IN ('active','draft') AND title_ar NOT GLOB '*[\u0621-\u064A]*') e,
     (SELECT COUNT(*) FROM variants WHERE color GLOB '*[\u0621-\u064A][a-zA-Z]*' OR color GLOB '*[a-zA-Z][\u0621-\u064A]*'
        OR size GLOB '*[\u0621-\u064A][a-zA-Z]*' OR size GLOB '*[a-zA-Z][\u0621-\u064A]*') v,
     (SELECT COUNT(*) FROM products WHERE status IN ('active','draft') AND ${BROKEN_SQL}) b`).first<any>();
  // ما زال ينقصه فحص تفاصيل: صورة واحدة أو بلا مقاسات أو بلا وزن — هذه هي حصة الإثراء المتبقية
  const thin = await db.prepare(`SELECT COUNT(*) n FROM products p WHERE p.status IN ('active','draft') AND p.source='1688'
     AND ((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1
       OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0
       OR p.weight_g IS NULL)`).first<any>();
  const { results: jobs } = await db.prepare('SELECT id,name,type,query,runner,active,max_pages,max_new,interval_hours,last_run_at,last_summary FROM crawl_jobs ORDER BY id').all<any>();
  return c.json({ totals: { products: tot?.n ?? 0, active: tot?.a ?? 0, from1688: tot?.s ?? 0, providerCalls: src?.n ?? 0, outOfStock: tot?.oos ?? 0, chineseTitles: cn?.n ?? 0, chineseVisible: cn?.a ?? 0, heldDraft: tot?.dr ?? 0, needEnrich: thin?.n ?? 0, mashedTitles: broken?.t ?? 0, englishTitles: broken?.e ?? 0, mashedVariants: broken?.v ?? 0, brokenTitles: broken?.b ?? 0, englishVariants: await englishVariantsLeft(db) }, categories: cats, jobs });
});

// لماذا يرفض النظام ترجمة عناوين بعينها؟ يعيد الردّ الخام وحكم كل بوابة على أول N عنوان عالق
api.post('/source/translate/why', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  if (!c.env.AI) return c.json({ error: 'لا يوجد Workers AI' }, 400);
  const b = await c.req.json<{ limit?: number }>().catch(() => ({} as any));
  const n = Math.max(1, Math.min(b.limit ?? 3, 8));
  const { results } = await c.env.DB.prepare("SELECT id,title_ar,title_src,tr_tries FROM products WHERE title_ar GLOB '*[一-龥]*' ORDER BY tr_tries DESC, id LIMIT ?").bind(n).all<any>();
  const out = [];
  for (const p of results) out.push({ id: p.id, tries: p.tr_tries, ...(await diagnoseTitle(c.env.AI, p.title_src && hasCJK(p.title_src) ? p.title_src : p.title_ar)) });
  // قيم الألوان والمقاسات العالقة: نعرض نصها كما هو لنضيف ما يتكرر منها إلى القاموس بلا ذكاء اصطناعي
  const { results: vs } = await c.env.DB.prepare(`SELECT color,size,COUNT(*) n FROM variants
     WHERE color GLOB '*[一-龥]*' OR size GLOB '*[一-龥]*' GROUP BY color,size ORDER BY n DESC LIMIT 40`).all<any>();
  return c.json({ checked: out.length, cases: out, stuckVariants: vs });
});

// أي نماذج Workers AI تعمل فعلًا اليوم؟ نجرّبها بنصّ قصير ونعرض من نجح ومن أُلغي
api.post('/source/models', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  if (!c.env.AI) return c.json({ error: 'لا يوجد Workers AI' }, 400);
  const CHAT = [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.1-8b-instruct-fast', '@cf/meta/llama-3.1-8b-instruct-fp8',
    '@cf/qwen/qwen2.5-14b-instruct', '@cf/qwen/qwen1.5-14b-chat-awq', '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/google/gemma-3-12b-it', '@cf/openai/gpt-oss-120b',
  ];
  const zh = '爆款跨境中东长袍女长裙子穆斯林连衣裙豹纹印花钉珠阿巴亚连衣裙';
  const out: any[] = [];
  for (const model of CHAT) {
    const t0 = Date.now();
    try {
      const r: any = await c.env.AI.run(model, { messages: [{ role: 'system', content: 'ترجم عنوان المنتج إلى عربي قصير. أجب بالترجمة فقط.' }, { role: 'user', content: zh }], max_tokens: 90, temperature: 0.2 });
      const txt = String(r?.response ?? '').trim().split('\n')[0].slice(0, 120);
      out.push({ model, ok: true, ms: Date.now() - t0, arabic: /[\u0600-\u06FF]/.test(txt), cjk: hasCJK(txt), out: txt });
    } catch (e: any) { out.push({ model, ok: false, error: String(e?.message ?? e).slice(0, 160) }); }
  }
  for (const model of ['@cf/meta/m2m100-1.2b']) {
    try { const r: any = await c.env.AI.run(model, { text: zh, source_lang: 'chinese', target_lang: 'arabic' }); out.push({ model, ok: true, out: String(r?.translated_text ?? '').slice(0, 120) }); }
    catch (e: any) { out.push({ model, ok: false, error: String(e?.message ?? e).slice(0, 160) }); }
  }
  return c.json({ tried: out.length, models: out });
});

api.post('/source/translate', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ limit?: number; sweepFrom?: number }>().catch(() => ({} as any));
  // إطلاق المسودات وكنس العناوين المكسورة لا يحتاجان نموذجًا: يعملان حتى بلا Workers AI (النسخة المحلية)
  // وكذلك قيم المتغيّرات الإنجليزية: القاموس يترجم أغلبها ويحذف الشظايا بلا نموذج
  if (!c.env.AI) {
    const en = await fixEnglishVariants(c.env.DB, new Translator(c.env.DB, null, 0));
    return c.json({
      error: 'لا يوجد Workers AI',
      released: await releaseHeldDrafts(c.env.DB),
      swept: await sweepMashedTitles(c.env.DB, Math.max(0, b.sweepFrom ?? 2)),
      enFixed: en.fixed, enDropped: en.dropped, enLeft: await englishVariantsLeft(c.env.DB),
    }, 200);
  }
  return c.json(await retranslatePending(c.env.DB, c.env.AI, Math.min(60, b.limit ?? 30)));
});
// تشخيص صفحة 1688 مفتوحة في متصفح المستخدم: تُرسل الإضافة ما وجدته فعلًا لنضبط القارئ على البنية الحقيقية
api.post('/crawl/probe', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<any>();
  const url = String(b.url ?? '').slice(0, 300);
  await c.env.DB.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)')
    .bind('in', 'PROBE ' + url, 200, '', JSON.stringify(b).slice(0, 60000), 1).run();
  return c.json({ ok: true });
});
// ===== الدردشة المباشرة وصندوق الرسائل =====
// مبنية على التذاكر نفسها: كل محادثة تذكرة، فيراها الموظف في /admin/tickets وترتبط بالطلب إن وُجد.
const chatSubject = 'دردشة مباشرة';

async function findOrCreateChat(c: Context<Env>, orderCode?: string | null) {
  const db = c.env.DB; const u = c.get('user')!;
  let orderId: number | null = null;
  if (orderCode) {
    const o = await db.prepare('SELECT id FROM orders WHERE code=? AND user_id=?').bind(orderCode, u.id).first<{ id: number }>();
    orderId = o?.id ?? null;
  }
  const existing = await db.prepare(
    `SELECT id,code FROM tickets WHERE user_id=? AND status IN ('open','in_progress') AND ${orderId ? 'order_id=?' : 'order_id IS NULL AND subject=?'} ORDER BY id DESC LIMIT 1`,
  ).bind(u.id, orderId ?? chatSubject).first<{ id: number; code: string }>();
  if (existing) return existing;
  const code = 'TK-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
  const r = await db.prepare("INSERT INTO tickets(code,user_id,order_id,type,subject,status) VALUES(?,?,?,'question',?,'open')")
    .bind(code, u.id, orderId, orderCode ? `استفسار عن الطلب ${orderCode}` : chatSubject).run();
  return { id: r.meta.last_row_id as number, code };
}

// قراءة المحادثة (وإنشاؤها كسولًا فقط عند أول رسالة)
api.get('/chat', async (c) => {
  const u = c.get('user'); if (!u) return c.json({ needLogin: true, messages: [] });
  const db = c.env.DB;
  const orderCode = c.req.query('order') ?? null;
  const t = await db.prepare(
    `SELECT t.id,t.code,t.status FROM tickets t WHERE t.user_id=? AND t.status IN ('open','in_progress') AND ${orderCode ? 't.order_id=(SELECT id FROM orders WHERE code=? AND user_id=t.user_id)' : 't.order_id IS NULL'} ORDER BY t.id DESC LIMIT 1`,
  ).bind(u.id, ...(orderCode ? [orderCode] : [])).first<any>();
  if (!t) return c.json({ ticket: null, messages: [] });
  const since = Number(c.req.query('since') ?? 0);
  const { results } = await db.prepare('SELECT id,is_staff,body,created_at FROM ticket_messages WHERE ticket_id=? AND id>? ORDER BY id LIMIT 100').bind(t.id, since).all<any>();
  return c.json({ ticket: { code: t.code, status: t.status }, messages: results });
});

// إرسال رسالة (تُنشئ المحادثة إن لم توجد)
api.post('/chat', async (c) => {
  const u = c.get('user'); if (!u) return c.json({ needLogin: true }, 401);
  const b = await c.req.json<{ body?: string; order?: string }>();
  const body = String(b.body ?? '').trim().slice(0, 1000);
  if (!body) return c.json({ error: 'الرسالة فارغة' }, 400);
  const t = await findOrCreateChat(c, b.order ?? null);
  await c.env.DB.prepare('INSERT INTO ticket_messages(ticket_id,by_user_id,is_staff,body) VALUES(?,?,0,?)').bind(t.id, u.id, body).run();
  await c.env.DB.prepare("UPDATE tickets SET status=CASE WHEN status='resolved' THEN 'open' ELSE status END,updated_at=datetime('now') WHERE id=?").bind(t.id).run();
  return c.json({ ok: true, code: t.code });
});

export default api;
