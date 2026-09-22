import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { getCategories } from '../lib/db';
import { importProducts } from './admin';
import { classifyModesty } from '../lib/modesty';
import { fingerprint, sameProduct } from '../lib/dedupe';
import { computePrice, loadSettings } from '../lib/pricing';
import { getProvider } from '../lib/source-providers';
import { runServerJobs } from '../lib/crawl';
import { retranslatePending, releaseHeldDrafts, diagnoseTitle, hasCJK, dropCJKWords, dictTranslate } from '../lib/translate';

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
  return c.json({ ids: results.map(r => r.source_offer_id) });
});

api.post('/import/check', async (c) => {
  if (!tokenOk(c)) return c.json({ error: 'رمز غير صحيح' }, 401);
  const b = await c.req.json<{ offerId: string; inStock: boolean; priceCny: number | null }>();
  const p = await c.env.DB.prepare("SELECT id,source_price_cny FROM products WHERE source='1688' AND source_offer_id=?").bind(b.offerId).first<any>();
  if (!p) return c.json({ ok: false });
  // تغيّر السعر أكثر من 15% يوقف المنتج لمراجعة الأدمن بدل بيعه بخسارة
  const bigChange = b.priceCny && Math.abs(b.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
  await c.env.DB.prepare("UPDATE products SET in_stock=?,status=CASE WHEN ?=1 THEN 'hidden' ELSE status END,source_price_cny=COALESCE(?,source_price_cny),enrich_tries=enrich_tries+1,last_checked_at=datetime('now') WHERE id=?")
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
    WHERE j.active=1 AND j.runner IN ('any','extension') AND (j.cooldown_until IS NULL OR j.cooldown_until < datetime('now'))
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
    ? await db.prepare('SELECT id,source_price_cny,weight_g,volume_cm3,category_id FROM products WHERE id>? ORDER BY id LIMIT ?').bind(after, limit).all<any>()
    : await db.prepare('SELECT id,source_price_cny,weight_g,volume_cm3,category_id FROM products WHERE price_sea_lyd IS NULL ORDER BY id LIMIT ?').bind(limit).all<any>();
  const stmts = results.map((p: any) => {
    const cat = cats.find(x => x.id === p.category_id);
    const w = p.weight_g ?? cat?.est_weight_g ?? 300;
    const air = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3);
    const sea = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3, 'sea');
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
  return c.json({
    modesty,
    dict: Object.fromEntries(attrs.map(t => [t, dictTranslate(t)])),
    strays: Object.fromEntries(strays.map(t => [t, dropCJKWords(t)])),
    dedupe: { same: sameProduct(w1, w2), different: sameProduct(w1, bag), noiseOnly: sameProduct('跨境 批发 新款', '外贸 现货 爆款'), fp: fingerprint(w1) },
    pricing: {
      light: computePrice(s, 25, 800, null, 1500),                       // صغيرة وثقيلة
      bulky: computePrice(s, 25, 300, null, 40000),                      // كبيرة وخفيفة
      byKg: computePrice({ ...s, ship_mode: 'kg' }, 25, 300, null, 40000),
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
  // ما زال ينقصه فحص تفاصيل: صورة واحدة أو بلا مقاسات أو بلا وزن — هذه هي حصة الإثراء المتبقية
  const thin = await db.prepare(`SELECT COUNT(*) n FROM products p WHERE p.status IN ('active','draft') AND p.source='1688'
     AND ((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1
       OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0
       OR p.weight_g IS NULL)`).first<any>();
  const { results: jobs } = await db.prepare('SELECT id,name,type,query,runner,active,max_pages,max_new,interval_hours,last_run_at,last_summary FROM crawl_jobs ORDER BY id').all<any>();
  return c.json({ totals: { products: tot?.n ?? 0, active: tot?.a ?? 0, from1688: tot?.s ?? 0, providerCalls: src?.n ?? 0, outOfStock: tot?.oos ?? 0, chineseTitles: cn?.n ?? 0, chineseVisible: cn?.a ?? 0, heldDraft: tot?.dr ?? 0, needEnrich: thin?.n ?? 0 }, categories: cats, jobs });
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
  const b = await c.req.json<{ limit?: number }>().catch(() => ({} as any));
  // إطلاق المسودات المحجوزة لا يحتاج نموذجًا: يعمل حتى حيث لا يوجد Workers AI (النسخة المحلية)
  if (!c.env.AI) return c.json({ error: 'لا يوجد Workers AI', released: await releaseHeldDrafts(c.env.DB) }, 200);
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
