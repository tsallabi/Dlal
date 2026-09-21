// منع تكرار نفس المنتج من موردين مختلفين: أسواق الصين تعرض القطعة نفسها بعشرات العروض.
// نبني بصمة من العنوان (بعد حذف كلمات التسويق والأرقام) ونحتفظ بالأرخص فقط.

const NOISE = [
  // عربي — كلمات تسويقية تتكرر في كل عنوان ولا تميّز منتجًا
  /عبر الحدود|تجارة (أجنبية|خارجية)|بالجملة|جملة|مصدر البضائع|توصيل سريع|جودة عالية|جديد|موضة|أزياء|نسائي|نسائية|رجالي|رجالية/g,
  /موسم (الخريف|الربيع|الصيف|الشتاء)|خريف|ربيع|صيف|شتاء|20\d\d/g,
  // صيني
  /跨境|外贸|批发|现货|厂家|新款|爆款|时尚|女式|男士|包邮|一件代发/g,
  // إنجليزي
  /\b(wholesale|cross[- ]border|new|fashion|hot|sale|dropshipping|free\s*shipping)\b/gi,
];

// الصينية بلا مسافات: نقطّعها أزواج حروف (石英 英表 表皮 …) وهي أدق من الكلمة الواحدة
export function tokens(title: string): Set<string> {
  let t = (title || '').toLowerCase();
  for (const r of NOISE) t = t.replace(r, ' ');
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const out = new Set<string>();
  for (const part of t.split(/\s+/)) {
    if (!part) continue;
    if (/[\u4e00-\u9fff]/.test(part)) {
      const cjk = part.replace(/[^\u4e00-\u9fff]/g, '');
      for (let i = 0; i + 1 < cjk.length; i++) out.add(cjk.slice(i, i + 2));
      for (const latin of part.match(/[a-z0-9]{2,}/g) ?? []) out.add(latin);
    } else if (part.length > 1) out.add(part);
  }
  return out;
}

// بصمة مختصرة للفهرسة (ليست الحكم النهائي — الحكم هو sameProduct)
export function fingerprint(title: string): string {
  return [...tokens(title)].sort().slice(0, 6).join('-').slice(0, 120);
}

// هل العنوانان لنفس المنتج؟ تقاطع الرموز ≥ 60% من الأقصر
export function sameProduct(a: string, b: string): boolean {
  const wa = tokens(a), wb = tokens(b);
  if (wa.size < 4 || wb.size < 4) return false;
  let hit = 0; wa.forEach(w => { if (wb.has(w)) hit++; });
  return hit / Math.min(wa.size, wb.size) >= 0.6;
}
