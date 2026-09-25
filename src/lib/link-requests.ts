// «اطلبي برابط»: قطعة رأتها الزبونة في 1688 أو تاوباو أو شي إن وليست على رفّنا.
// المنافس الوحيد في ليبيا (بزناس) يقوم كله على لصق رابط أمازون أو علي بابا ويسعّر بالدولار؛ عندنا الرابط
// يصير منتجًا على الرف بسعر نهائي بالدينار: رابط 1688 يدخل طابور الاكتشاف فتستورده الإضافة مجانًا،
// و`settleLinkRequests` تربط الطلب بالمنتج لحظة وصوله وتُعلم الزبونة. غير 1688 يسعّره الفريق ويربطه يدويًا.
import { notify } from './db';

export const LINK_SOURCES: Record<string, string> = {
  '1688': '1688', taobao: 'تاوباو / تيمول', alibaba: 'علي بابا', amazon: 'أمازون', shein: 'شي إن', other: 'موقع آخر',
};
export const LINK_STATUS: Record<string, [string, string]> = {
  new: ['قيد التجهيز', 'blue'], ready: ['جاهز للشراء', 'green'], rejected: ['تعذّر توفيره', 'red'],
};

// الناس يلصقون نص المشاركة كله («【淘宝】… https://m.tb.cn/xyz 复制…»): نأخذ أول رابط فيه
export function parseLink(raw: string): { url: string; source: string; offerId: string | null } | null {
  const m = String(raw ?? '').match(/https?:\/\/[^\s"'<>，。、）)】]+/i);
  if (!m) return null;
  let u: URL; try { u = new URL(m[0]); } catch { return null; }
  const h = u.hostname.toLowerCase();
  const source = /(^|\.)1688\.com$/.test(h) ? '1688'
    : /(^|\.)(taobao\.com|tmall\.com|tb\.cn)$/.test(h) ? 'taobao'
    : /(^|\.)alibaba\.com$/.test(h) ? 'alibaba'
    : /(^|\.)(amazon\.[a-z.]+|amzn\.[a-z]+|a\.co)$/.test(h) ? 'amazon'
    : /(^|\.)(shein\.com|shein\.[a-z.]+)$/.test(h) ? 'shein' : 'other';
  const offerId = source === '1688' ? ((u.pathname.match(/offer\/(\d{9,15})/) || [])[1] || u.searchParams.get('offerId') || null) : null;
  return { url: u.toString().slice(0, 1000), source, offerId: offerId && /^\d{9,15}$/.test(offerId) ? offerId : null };
}

// يربط كل طلب ينتظر بمنتجه إن وصل: نشط ⟵ جاهز، مخفي (جملة أو إعلان تغليف) ⟵ تعذّر مع السبب، مسودة ⟵ ينتظر ترجمته.
// تُنادى بعد كل استيراد ومن الكرون ومن الصفحتين؛ لا تستدعي أي خدمة خارجية.
export async function settleLinkRequests(db: D1Database): Promise<number> {
  const { results } = await db.prepare(`SELECT r.id,r.user_id,p.id pid,p.slug,p.status,p.min_qty,p.title_ar FROM link_requests r
     JOIN products p ON p.source='1688' AND p.source_offer_id=r.offer_id
     WHERE r.status='new' AND r.offer_id IS NOT NULL AND p.status IN ('active','hidden','unavailable') LIMIT 100`).all<any>();
  for (const r of results) {
    if (r.status === 'active') {
      await db.prepare("UPDATE link_requests SET status='ready',product_id=?,updated_at=datetime('now') WHERE id=?").bind(r.pid, r.id).run();
      await notify(db, r.user_id, 'منتجك صار في هدهد ✓', `${String(r.title_ar).slice(0, 80)} — بسعر نهائي بالدينار شامل الشحن والجمارك.`, `/p/${r.slug}`);
    } else {
      const why = r.status === 'unavailable' ? 'نفد عند المورّد' : (r.min_qty ?? 1) > 1 ? `المورّد يبيعه بالجملة فقط (أقل طلب ${r.min_qty} قطعة)` : 'لا يمكن بيعه بالقطعة';
      await db.prepare("UPDATE link_requests SET status='rejected',product_id=?,admin_note=?,updated_at=datetime('now') WHERE id=?").bind(r.pid, why, r.id).run();
      await notify(db, r.user_id, 'تعذّر توفير المنتج الذي طلبته', `${why}. جرّب رابطًا من مورّد آخر.`, '/request');
    }
  }
  return results.length;
}
