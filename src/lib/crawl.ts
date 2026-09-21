// تنفيذ مهام الزحف من الخادم عبر مزوّد API (بديل الإضافة عندما يوجد مفتاح مزوّد)
import { loadSettings } from './pricing';
import { getProvider } from './source-providers';
import { importProducts } from '../routes/admin';

async function logRaw(db: D1Database, direction: 'out' | 'in', url: string, status: number, body: string, ok: boolean) {
  await db.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)').bind(direction, 'SRC ' + url.replace(/(instanceKey|apiToken)=[^&]+/g, '$1=***'), status, '', body.slice(0, 60000), ok ? 1 : 0).run();
}

// maxItems: سقف المنتجات المفحوصة في الاستدعاء الواحد (مهمة المخزون) حتى لا يتجاوز الطلب حدود Worker؛ الاستدعاء التالي (كرون كل ساعة) يكمل من حيث توقف
export async function runServerJobs(env: { DB: D1Database; AI?: any }, opts: { limit?: number; jobId?: number; byUserId?: number | null; maxItems?: number; pages?: number; fromPage?: number; enrichOnly?: boolean; keyword?: string } = {}) {
  const db = env.DB; const s = await loadSettings(db); const prov = getProvider(s);
  if (!prov) return { ran: 0, error: 'لا يوجد مزوّد API مضبوط' };
  const maxItems = Math.max(1, Math.min(opts.maxItems ?? 8, 25));
  // مهمة المخزون لا تُقيَّد بـ last_run_at: تعمل كل مرة وتفحص فقط المنتجات المستحقة (أقدم من interval_hours)
  const where = opts.jobId ? 'j.id=?' : "j.active=1 AND j.runner IN ('any','server') AND (j.run_now=1 OR j.type='stock' OR j.last_run_at IS NULL OR j.last_run_at < datetime('now', '-' || j.interval_hours || ' hours'))";
  const { results: jobs } = await db.prepare(`SELECT j.* FROM crawl_jobs j WHERE ${where} ORDER BY j.run_now DESC, j.last_run_at ASC LIMIT ?`).bind(...(opts.jobId ? [opts.jobId] : []), opts.limit ?? 3).all<any>();
  const out: any[] = [];
  for (const job of jobs) {
    const started = new Date().toISOString();
    const rep = { status: 'ok', pages: 0, found: 0, imported: 0, updated: 0, enriched: 0, checked: 0, dupes: 0, note: '' };
    try {
      if (job.type === 'stock') {
        // الأقدم فحصًا أولًا؛ فقط منتجات لها معرف 1688 حقيقي (رقمي)
        // enrichOnly: المنتجات الناقصة (صورة واحدة أو بلا مقاسات) أولًا مهما كان وقت آخر فحص —
        // منتجات استُوردت من صفحة البحث تصل بصورة واحدة بلا ألوان ولا مقاسات ولا وزن.
        const dueSql = "SELECT source_offer_id,source_price_cny,category_id FROM products WHERE status='active' AND source='1688' AND source_offer_id GLOB '[0-9]*' AND length(source_offer_id)>=9 AND (last_checked_at IS NULL OR last_checked_at < datetime('now', '-' || ? || ' hours')) ORDER BY last_checked_at ASC, (sales*10+views) DESC LIMIT ?";
        const thinSql = "SELECT p.source_offer_id,p.source_price_cny,p.category_id FROM products p WHERE p.status='active' AND p.source='1688' AND p.source_offer_id GLOB '[0-9]*' AND length(p.source_offer_id)>=9 AND ((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1 OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0 OR p.weight_g IS NULL) ORDER BY (p.sales*10+p.views) DESC, p.id LIMIT ?";
        const batch = opts.maxItems ? maxItems : Math.min(job.max_new || 100, maxItems);
        const { results } = opts.enrichOnly
          ? await db.prepare(thinSql).bind(batch).all<any>()
          : await db.prepare(dueSql).bind(job.interval_hours || 12, batch).all<any>();
        if (!results.length) { rep.note += opts.enrichOnly ? ' كل المنتجات مُثراة بالفعل.' : ' لا منتجات مستحقة للفحص الآن.'; }
        for (const p of results) {
          const r = await prov.item(p.source_offer_id); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (!r.ok) { rep.note += ` ${p.source_offer_id}: ${r.error}`; if (/NotFound/i.test(r.error ?? '')) await db.prepare("UPDATE products SET in_stock=0,last_checked_at=datetime('now') WHERE source='1688' AND source_offer_id=?").bind(p.source_offer_id).run(); continue; }
          const it = r.data!; const big = it.priceCny && Math.abs(it.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
          // السعر يُعاد حسابه في importProducts أدناه، فلا داعي لإخفاء المنتج؛ نسجّل القفزة فقط
          if (big) rep.note += ` ${p.source_offer_id}: السعر ${p.source_price_cny}→${it.priceCny}.`;
          await db.prepare("UPDATE products SET in_stock=?,source_price_cny=COALESCE(?,source_price_cny),last_checked_at=datetime('now') WHERE source='1688' AND source_offer_id=?").bind(it.inStock ? 1 : 0, it.priceCny || null, p.source_offer_id).run();
          rep.checked++;
          // إثراء بالتفاصيل الكاملة (صور، مقاسات/ألوان، عنوان عربي، حد أدنى) إن كانت ناقصة
          if (it.priceCny && (it.variants.length || it.images.length > 1 || it.weightG)) { const res = await importProducts(db, [it], p.category_id ?? null, opts.byUserId ?? null, `api:${prov.name}:stock`, env.AI); rep.enriched += res.enriched; }
        }
      } else {
        const newIds: string[] = [];
        // تعبئة قسم ناقص: نبدأ من صفحة متقدّمة حتى لا نعيد جلب نفس أول 20 منتجًا
        const first = Math.max(1, opts.fromPage ?? 1);
        const last = first + (opts.pages ?? job.max_pages ?? 1) - 1;
        for (let p = first; p <= last; p++) {
          // كلمة بديلة لهذا التشغيل فقط: حين تنفد نتائج كلمة القسم الأصلية
          const kw = opts.keyword || (job.type === 'url' ? (job.query.match(/keywords=([^&]+)/) ? decodeURIComponent(job.query.match(/keywords=([^&]+)/)![1]) : job.query) : job.query);
          const r = await prov.search(kw, p); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (!r.ok) { rep.status = 'error'; rep.note += ` صفحة ${p}: ${r.error}`; break; }
          rep.pages++; rep.found += r.data.length;
          if (!r.data.length) { rep.note += ` صفحة ${p} فارغة.`; break; }
          const res = await importProducts(db, r.data.map(x => ({ ...x, titleAr: x.titleEn && !/[一-鿿]/.test(x.titleEn) ? undefined : undefined })), job.category_id, opts.byUserId ?? null, `api:${prov.name}:${kw}#${p}`, env.AI);
          rep.imported += res.imported; rep.updated += res.updated; rep.dupes += res.dupes ?? 0; newIds.push(...res.newIds);
        }
        if (job.enrich) for (const id of newIds.slice(0, job.max_new || 40)) {
          const r = await prov.item(id); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (r.ok && r.data && r.data.priceCny) { await importProducts(db, [r.data], job.category_id, opts.byUserId ?? null, `api:${prov.name}:item`, env.AI); rep.enriched++; }
        }
      }
    } catch (e: any) { rep.status = 'error'; rep.note += ' ' + e.message; }
    if (job.type === 'stock' && rep.status === 'ok' && rep.checked === 0 && !rep.note.includes(':')) { out.push({ job: job.name, ...rep, skipped: true }); continue; }
    await db.batch([
      db.prepare('INSERT INTO crawl_runs(job_id,started_at,status,pages,found,imported,updated,enriched,checked,note) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(job.id, started, rep.status, rep.pages, rep.found, rep.imported, rep.updated, rep.enriched, rep.checked, (`[خادم/${prov.name}]` + rep.note).slice(0, 500)),
      db.prepare("UPDATE crawl_jobs SET run_now=0,last_run_at=datetime('now'),last_summary=? WHERE id=?").bind(`${rep.status} (خادم): صفحات ${rep.pages} · وُجد ${rep.found} · جديد ${rep.imported} · محدّث ${rep.updated} · مُثرى ${rep.enriched} · مكرر ${rep.dupes} · مفحوص ${rep.checked}`, job.id),
    ]);
    out.push({ job: job.name, ...rep });
  }
  return { ran: out.length, results: out };
}
