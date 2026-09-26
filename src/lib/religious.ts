// كنس الرموز الدينية غير الإسلامية من الرف (قرار صاحب المشروع ٢٥/٠٩/٢٦). الاستيراد يُدخلها مخفية أصلًا؛
// هذا للقائم ولما تغيّر عنوانه بعد الترجمة. يمرّ على ما لا سبب إخفاء له فقط (انظر ترحيل 0044).
import { religiousMark } from './source';

export async function religiousSweep(db: D1Database): Promise<{ scanned: number; hidden: { id: number; mark: string; title: string }[] }> {
  const { results } = await db.prepare("SELECT id,title_ar,title_src FROM products WHERE status IN ('active','draft') AND hide_reason IS NULL").all<{ id: number; title_ar: string; title_src: string | null }>();
  const hit = results.map(r => ({ id: r.id, mark: religiousMark(r.title_src, r.title_ar), title: r.title_ar })).filter(x => x.mark) as { id: number; mark: string; title: string }[];
  // المعرّفات أرقامًا بعد Number.isInteger: D1 يرفض أكثر من 100 متغيّر مربوط
  for (let i = 0; i < hit.length; i += 200) {
    const ids = hit.slice(i, i + 200).map(h => h.id).filter(Number.isInteger);
    if (ids.length) await db.prepare(`UPDATE products SET status='hidden',hide_reason='relig' WHERE id IN (${ids.join(',')})`).run();
  }
  return { scanned: results.length, hidden: hit };
}
