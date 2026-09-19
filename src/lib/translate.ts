// ترجمة عناوين المنتجات من الصينية إلى العربية عبر Cloudflare Workers AI (m2m100)
// اختيارية: إن لم يوجد ربط AI أو فشل الاستدعاء يبقى العنوان كما هو
export const hasCJK = (s: string | null | undefined) => /[\u4e00-\u9fff]/.test(s ?? '');

export async function translateZhAr(ai: any, text: string): Promise<string | null> {
  if (!ai || !text) return null;
  try {
    const r: any = await ai.run('@cf/meta/m2m100-1.2b', { text: text.slice(0, 300), source_lang: 'chinese', target_lang: 'arabic' });
    const t = (r?.translated_text ?? '').trim();
    return t && !hasCJK(t) ? t.slice(0, 200) : null;
  } catch { return null; }
}
