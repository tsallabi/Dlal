// تنفيذ مهام الزحف من الخادم عبر مزوّد API (بديل الإضافة عندما يوجد مفتاح مزوّد)
import { loadSettings } from './pricing';
import { getProvider } from './source-providers';
import { importProducts } from '../routes/admin';

async function logRaw(db: D1Database, direction: 'out' | 'in', url: string, status: number, body: string, ok: boolean) {
  await db.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)').bind(direction, 'SRC ' + url.replace(/(instanceKey|apiToken)=[^&]+/g, '$1=***'), status, '', body.slice(0, 4000), ok ? 1 : 0).run();
}

export async function runServerJobs(env: { DB: D1Database; AI?: any }, opts: { limit?: number; jobId?: number; byUserId?: number | null } = {}) {
  const db = env.DB; const s = await loadSettings(db); const prov = getProvider(s);
  if (!prov) return { ran: 0, error: 'لا يوجد مزوّد API مضبوط' };
  const where = opts.jobId ? 'j.id=?' : "j.active=1 AND (j.run_now=1 OR j.last_run_at IS NULL OR j.last_run_at < datetime('now', '-' || j.interval_hours || ' hours'))";
  const { results: jobs } = await db.prepare(`SELECT j.* FROM crawl_jobs j WHERE ${where} ORDER BY j.run_now DESC, j.last_run_at ASC LIMIT ?`).bind(...(opts.jobId ? [opts.jobId] : []), opts.limit ?? 3).all<any>();
  const out: any[] = [];
  for (const job of jobs) {
    const started = new Date().toISOString();
    const rep = { status: 'ok', pages: 0, found: 0, imported: 0, updated: 0, enriched: 0, checked: 0, note: '' };
    try {
      if (job.type === 'stock') {
        const { results } = await db.prepare("SELECT source_offer_id,source_price_cny FROM products WHERE status='active' AND source='1688' ORDER BY (sales*10+views) DESC, last_checked_at ASC LIMIT ?").bind(job.max_new || 100).all<any>();
        for (const p of results) {
          const r = await prov.item(p.source_offer_id); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (!r.ok) { rep.note += ` ${p.source_offer_id}: ${r.error}`; continue; }
          const it = r.data!; const big = it.priceCny && Math.abs(it.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
          await db.prepare("UPDATE products SET in_stock=?,status=CASE WHEN ?=1 THEN 'hidden' ELSE status END,source_price_cny=COALESCE(?,source_price_cny),last_checked_at=datetime('now') WHERE source='1688' AND source_offer_id=?").bind(it.inStock ? 1 : 0, big ? 1 : 0, it.priceCny || null, p.source_offer_id).run();
          rep.checked++;
        }
      } else {
        const newIds: string[] = [];
        for (let p = 1; p <= (job.max_pages || 1); p++) {
          const kw = job.type === 'url' ? (job.query.match(/keywords=([^&]+)/) ? decodeURIComponent(job.query.match(/keywords=([^&]+)/)![1]) : job.query) : job.query;
          const r = await prov.search(kw, p); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (!r.ok) { rep.status = 'error'; rep.note += ` صفحة ${p}: ${r.error}`; break; }
          rep.pages++; rep.found += r.data.length;
          if (!r.data.length) { rep.note += ` صفحة ${p} فارغة.`; break; }
          const res = await importProducts(db, r.data.map(x => ({ ...x, titleAr: x.titleEn && !/[一-鿿]/.test(x.titleEn) ? undefined : undefined })), job.category_id, opts.byUserId ?? null, `api:${prov.name}:${kw}#${p}`, env.AI);
          rep.imported += res.imported; rep.updated += res.updated; newIds.push(...res.newIds);
        }
        if (job.enrich) for (const id of newIds.slice(0, job.max_new || 40)) {
          const r = await prov.item(id); await logRaw(db, 'in', r.url, r.status, r.raw, r.ok);
          if (r.ok && r.data && r.data.priceCny) { await importProducts(db, [r.data], job.category_id, opts.byUserId ?? null, `api:${prov.name}:item`, env.AI); rep.enriched++; }
        }
      }
    } catch (e: any) { rep.status = 'error'; rep.note += ' ' + e.message; }
    await db.batch([
      db.prepare('INSERT INTO crawl_runs(job_id,started_at,status,pages,found,imported,updated,enriched,checked,note) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(job.id, started, rep.status, rep.pages, rep.found, rep.imported, rep.updated, rep.enriched, rep.checked, (`[خادم/${prov.name}]` + rep.note).slice(0, 500)),
      db.prepare("UPDATE crawl_jobs SET run_now=0,last_run_at=datetime('now'),last_summary=? WHERE id=?").bind(`${rep.status} (خادم): صفحات ${rep.pages} · وُجد ${rep.found} · جديد ${rep.imported} · محدّث ${rep.updated} · مُثرى ${rep.enriched} · مفحوص ${rep.checked}`, job.id),
    ]);
    out.push({ job: job.name, ...rep });
  }
  return { ran: out.length, results: out };
}
