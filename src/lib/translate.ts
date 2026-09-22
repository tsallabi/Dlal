// ترجمة بيانات 1688 إلى العربية: قاموس فوري للألوان والمقاسات الشائعة + Workers AI (نموذج لغوي مع فحص جودة، ثم m2m100) للباقي + ذاكرة ترجمة في القاعدة
export const hasCJK = (s: string | null | undefined) => /[一-鿿]/.test(s ?? '');

// قاموس الألوان والمقاسات والكلمات المتكررة في متغيرات 1688
export const DICT: Record<string, string> = {
  黑色: 'أسود', 黑: 'أسود', 白色: 'أبيض', 白: 'أبيض', 米白: 'أبيض عاجي', 米色: 'بيج', 杏色: 'مشمشي', 卡其色: 'كاكي', 卡其: 'كاكي', 灰色: 'رمادي', 灰: 'رمادي', 深灰: 'رمادي غامق', 浅灰: 'رمادي فاتح',
  红色: 'أحمر', 红: 'أحمر', 酒红: 'عنابي', 酒红色: 'عنابي', 粉色: 'وردي', 粉红: 'وردي', 粉: 'وردي', 玫红: 'فوشيا', 玫红色: 'فوشيا', 橙色: 'برتقالي', 橘色: 'برتقالي', 黄色: 'أصفر', 黄: 'أصفر', 姜黄: 'خردلي',
  绿色: 'أخضر', 绿: 'أخضر', 军绿: 'أخضر عسكري', 军绿色: 'أخضر عسكري', 墨绿: 'أخضر غامق', 墨绿色: 'أخضر غامق', 浅绿: 'أخضر فاتح', 蓝色: 'أزرق', 蓝: 'أزرق', 深蓝: 'كحلي', 藏蓝: 'كحلي', 藏青: 'كحلي', 藏青色: 'كحلي', 浅蓝: 'أزرق فاتح', 天蓝: 'سماوي', 天蓝色: 'سماوي', 湖蓝: 'أزرق بحري',
  紫色: 'بنفسجي', 紫: 'بنفسجي', 浅紫: 'ليلكي', 香芋紫: 'ليلكي', 棕色: 'بني', 咖啡色: 'بني قهوة', 咖色: 'بني', 驼色: 'جملي', 卡拉梅尔: 'كراميل', 焦糖色: 'كراميل', 金色: 'ذهبي', 银色: 'فضي', 香槟色: 'شامبانيا',
  花色: 'منقوش', 碎花: 'مزهّر', 条纹: 'مخطط', 格子: 'كاروهات', 豹纹: 'نمري', 图案: 'بنقشة', 拼色: 'ألوان متعددة', 混色: 'ألوان مختلطة', 随机: 'عشوائي', 透明: 'شفاف',
  均码: 'مقاس واحد', 均码F: 'مقاس واحد', 均: 'مقاس واحد', 加大: 'مقاس كبير', 加大码: 'مقاس كبير', 大码: 'مقاس كبير', 小码: 'مقاس صغير', 中码: 'مقاس متوسط', 码: '',
  一件: 'قطعة', 一套: 'طقم', 单件: 'قطعة واحدة', 套装: 'طقم', 上衣: 'بلوزة', 裤子: 'بنطال', 裙子: 'تنورة', 儿童: 'أطفال', 女: 'نسائي', 男: 'رجالي',
  肤色: 'لون البشرة', 深蓝色: 'كحلي', 浅蓝色: 'أزرق فاتح', 深灰色: 'رمادي غامق', 浅灰色: 'رمادي فاتح', 玫瑰红: 'وردي غامق', 藕粉色: 'وردي باهت', 藕粉: 'وردي باهت', 姜黄色: 'خردلي', 草绿: 'أخضر عشبي', 薄荷绿: 'أخضر نعناعي', 湖蓝色: 'أزرق بحري', 宝蓝: 'أزرق ملكي', 宝蓝色: 'أزرق ملكي', 咖啡: 'بني قهوة', 深咖: 'بني غامق', 浅咖: 'بني فاتح', 裸色: 'لون البشرة', 奶白: 'أبيض حليبي', 奶白色: 'أبيض حليبي', 本白: 'أبيض طبيعي', 黑白: 'أسود وأبيض', 色: '', 号色: 'اللون رقم ', 号: 'رقم ',
  颜色: 'اللون', 尺码: 'المقاس', 尺寸: 'المقاس', 规格: 'المواصفة', 款式: 'الموديل', 型号: 'الطراز',
};
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
export function dictTranslate(s: string): string | null {
  const k = norm(s);
  if (DICT[k] !== undefined) return DICT[k] || k;
  // "黑色 M" أو "黑色-M" أو "M码"
  const m = k.match(/^(.+?)[\s\-_/]+(.+)$/);
  if (m) { const a = dictTranslate(m[1]); const b = dictTranslate(m[2]); if (a !== null && b !== null) return `${a} ${b}`.trim(); }
  const sz = k.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d{2,3})码?$/i);
  if (sz) return sz[1].toUpperCase();
  // مركّب بلا فاصل: "白色豹纹" = 白色 + 豹纹 → "أبيض نمري"
  if (hasCJK(k) && k.length >= 3 && k.length <= 8) for (let i = 1; i < k.length; i++) { const a = DICT[k.slice(0, i)], b = DICT[k.slice(i)]; if (a !== undefined && b !== undefined) return `${a} ${b}`.trim(); }
  return null;
}

const degenerate = (t: string) => { const w = t.split(/\s+/).filter(Boolean); if (w.length >= 4 && new Set(w).size / w.length < 0.5) return true; return /(\S{2,})(\s+\1){2,}/.test(t); };
export const goodArabic = (t: string | null | undefined) => !!t && /[\u0600-\u06FF]/.test(t) && !hasCJK(t) && !degenerate(t) && t.length <= 220;
// عنوان منتج مقبول: عربي سليم وخالٍ من حشو 1688 المترجم حرفيًا
const JUNK = /عبر الحدود|تجارة (أجنبية|خارجية)|الأسهم الحقيقية|أمازون|علي إكسبريس|بالجملة|مصدر البضائع|موسم (الخريف|الربيع|الصيف|الشتاء) الجديد|^\(?\s*20\d\d/;
export const goodTitle = (t: string | null | undefined) => goodArabic(t) && !JUNK.test(t!);
// عنوان عربي فيه حشو 1688: نُنظّفه بدل رفضه — رفضه كان يُبقي العنوان صينيًا وهو أسوأ بكثير
const JUNK_G = /عبر الحدود|تجارة (أجنبية|خارجية)|الأسهم الحقيقية|أمازون|علي إكسبريس|بالجملة|بيع بالجملة|مصدر البضائع|موسم (الخريف|الربيع|الصيف|الشتاء) الجديد|20\d\d/g;
export function cleanTitle(t: string): string {
  const out = t.replace(JUNK_G, ' ').replace(/[،,\-—_/|]{1,}\s*(?=[،,\-—_/|]|$)/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s،,\-—_/|()]+|[\s،,\-—_/|()]+$/g, '').trim();
  return out;
}

async function m2m(ai: any, text: string, source: 'chinese' | 'english'): Promise<string | null> {
  try { const r: any = await ai.run('@cf/meta/m2m100-1.2b', { text: text.slice(0, 300), source_lang: source, target_lang: 'arabic' }); const t = (r?.translated_text ?? '').trim(); return goodArabic(t) ? t.slice(0, 200) : null; } catch { return null; }
}
const SYS_TITLE = 'أنت مترجم لمتجر أزياء عربي. حوّل عنوان منتج من موقع 1688 (صيني محشو بكلمات مفتاحية) إلى عنوان منتج عربي قصير وطبيعي من 5 إلى 14 كلمة يصف المنتج للزبون. احذف عبارات مثل "تجارة خارجية"، "عبر الحدود"، "جديد 2025"، "بالجملة"، "موديل جديد". أجب بالعنوان العربي فقط، بلا شرح ولا علامات اقتباس.';
const SYS_ATTR = 'ترجم قيمة خاصية منتج (لون أو مقاس أو نمط) من الصينية إلى العربية بكلمة أو كلمتين كما تُكتب في متجر ملابس. احتفظ برموز المقاسات اللاتينية (S, M, L, XL, 2XL) والأرقام كما هي بلا تعريب. 均码 تعني "مقاس واحد". أجب بالترجمة فقط.';
const SYS_TEXT = 'ترجم النص التالي من الصينية إلى العربية بشكل طبيعي وقصير. أجب بالترجمة فقط.';
async function llm(ai: any, sys: string, user: string, models: string[]): Promise<string | null> {
  for (const model of models) {
    try {
      const r: any = await ai.run(model, { messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 120, temperature: 0.2 });
      const raw = String(r?.response ?? '').trim().split('\n')[0].replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, '').trim();
      const t = sys === SYS_TITLE && goodArabic(raw) && !goodTitle(raw) ? cleanTitle(raw) : raw;
      if (goodArabic(t) && (sys !== SYS_TITLE || goodTitle(t))) return t.slice(0, 200);
    } catch {}
  }
  return null;
}

// ترجمة بالذكاء الاصطناعي: نموذج لغوي (مع العنوان الإنجليزي كمساعد إن وُجد) → m2m100 من الإنجليزية → m2m100 من الصينية
export async function translateZhAr(ai: any, text: string, kind: 'text' | 'attr' | 'title' = 'text', hintEn?: string | null): Promise<string | null> {
  if (!ai || !text) return null;
  const sys = kind === 'attr' ? SYS_ATTR : kind === 'title' ? SYS_TITLE : SYS_TEXT;
  const user = hintEn && !hasCJK(hintEn) ? `الصينية: ${text.slice(0, 300)}\nالإنجليزية: ${hintEn.slice(0, 300)}` : text.slice(0, 300);
  // العناوين: النموذج الكبير ثم الصغير؛ الخصائص القصيرة: النموذج الصغير (أسرع) يكفي
  const models = kind === 'title' ? ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'] : ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
  return (await llm(ai, sys, user, models)) ?? (hintEn && !hasCJK(hintEn) ? await m2m(ai, hintEn, 'english') : null) ?? (await m2m(ai, text, 'chinese'));
}

// تشخيص عنوان عصيّ: ماذا ردّ كل نموذج بالضبط وأي بوابة رفضته — بلا تخمين
export async function diagnoseTitle(ai: any, text: string, hintEn?: string | null) {
  const out: any[] = [];
  const user = hintEn && !hasCJK(hintEn) ? `الصينية: ${text.slice(0, 300)}\nالإنجليزية: ${hintEn.slice(0, 300)}` : text.slice(0, 300);
  for (const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct']) {
    try {
      const r: any = await ai.run(model, { messages: [{ role: 'system', content: SYS_TITLE }, { role: 'user', content: user }], max_tokens: 120, temperature: 0.2 });
      const raw = String(r?.response ?? '').trim().split('\n')[0].replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, '').trim();
      const cleaned = cleanTitle(raw);
      out.push({ model, raw: raw.slice(0, 200), cleaned: cleaned.slice(0, 200), arabic: /[\u0600-\u06FF]/.test(raw), cjk: hasCJK(raw), degenerate: !goodArabic(raw) && /[\u0600-\u06FF]/.test(raw) && !hasCJK(raw), goodArabic: goodArabic(raw), goodTitle: goodTitle(raw), cleanedOk: goodTitle(cleaned) });
    } catch (e: any) { out.push({ model, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  const m2mEn = hintEn && !hasCJK(hintEn) ? await m2m(ai, hintEn, 'english') : null;
  const m2mZh = await m2m(ai, text, 'chinese');
  return { src: text.slice(0, 200), hintEn: hintEn ?? null, models: out, m2mEn, m2mZh };
}

// ترجمة مع ذاكرة: قاموس → ذاكرة القاعدة → الذكاء الاصطناعي → (العنوان الإنجليزي إن وُجد) → النص الأصلي
export class Translator {
  private mem = new Map<string, string>();
  public aiCalls = 0;
  constructor(private db: D1Database, private ai: any, private maxAi = 80) {}
  async t(text: string | null | undefined, kind: 'text' | 'attr' | 'title' = 'text', hintEn?: string | null): Promise<string | null> {
    if (!text || !hasCJK(text)) return text ?? null;
    const k = norm(text);
    if (this.mem.has(k)) return this.mem.get(k)!;
    const d = kind === 'attr' ? dictTranslate(k) : null;
    if (d !== null) { this.mem.set(k, d); return d; }
    const row = await this.db.prepare('SELECT dst FROM translations WHERE src=?').bind(k).first<{ dst: string }>().catch(() => null);
    if (row && goodArabic(row.dst)) { this.mem.set(k, row.dst); return row.dst; }
    const fallback = hintEn && !hasCJK(hintEn) ? hintEn.slice(0, 200) : text;
    if (this.aiCalls >= this.maxAi) return fallback;
    this.aiCalls++;
    let out = await translateZhAr(this.ai, k, kind, hintEn);
    if (!out) return fallback;
    // مقاس لاتيني داخل القيمة (مثل "加大码XL") يبقى كما هو حتى لو عرّبه النموذج
    if (kind === 'attr') { const sz = k.match(/(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL)(?![A-Za-z])/i); if (sz && !new RegExp(`\\b${sz[1]}\\b`, 'i').test(out)) { const rest = dictTranslate(k.replace(sz[1], '').replace(/码/g, '').trim()); out = rest ? `${rest} ${sz[1].toUpperCase()}` : sz[1].toUpperCase(); } }
    this.mem.set(k, out);
    await this.db.prepare('INSERT OR REPLACE INTO translations(src,dst,kind) VALUES(?,?,?)').bind(k, out, kind).run().catch(() => {});
    return out;
  }
}

// إعادة ترجمة ما بقي صينيًا أو ما تُرجم ترجمة رديئة (تكرار) — تُستخدم من الأدمن ومن /api/source/translate
export async function retranslatePending(db: D1Database, ai: any, limit = 40): Promise<{ products: number; variants: number; tried: number; remaining: number; held: number }> {
  const tr = new Translator(db, ai, limit + 60);
  // الأقل محاولةً أولًا: عنوان عصيّ على الترجمة لا يبتلع كل دفعة ويمنع بقية الكتالوج
  const { results } = await db.prepare("SELECT id,title_ar,title_src,supplier_name,tr_tries FROM products WHERE title_ar GLOB '*[一-龥]*' OR title_src GLOB '*[一-龥]*' OR supplier_name GLOB '*[一-龥]*' ORDER BY tr_tries ASC,(status='draft') DESC,sales DESC,id DESC LIMIT 400").all<any>();
  // العناوين الصينية أو الرديئة أولًا، ثم ما تبقى (موردون)
  const needs = (p: any) => hasCJK(p.title_ar) || !goodTitle(p.title_ar);
  results.sort((a, b) => Number(needs(b)) - Number(needs(a)));
  let n = 0, nv = 0, tried = 0;
  for (const p of results) {
    if (tried >= limit) break;
    const src = hasCJK(p.title_src) ? p.title_src : p.title_ar;
    const needTitle = hasCJK(p.title_ar) || !goodTitle(p.title_ar);
    const t = needTitle ? await tr.t(src, 'title') : p.title_ar;
    const sp = await tr.t(p.supplier_name);
    // عنوان صار عربيًا: المنتج المحجوز كمسودة يُنشر الآن (لا يُعرض عنوان صيني للزبونة أبدًا)
    if ((t && t !== p.title_ar) || (sp && sp !== p.supplier_name)) {
      const pub = t && !hasCJK(t) ? ",status=CASE WHEN status='draft' THEN 'active' ELSE status END" : '';
      await db.prepare(`UPDATE products SET title_src=COALESCE(title_src,title_ar),title_ar=?,supplier_name=?${pub},tr_tries=tr_tries+1 WHERE id=?`).bind(t ?? p.title_ar, sp ?? p.supplier_name, p.id).run(); n++;
    } else { await db.prepare('UPDATE products SET tr_tries=tr_tries+1 WHERE id=?').bind(p.id).run(); }
    tried++;
  }
  const vs = await db.prepare("SELECT id,color,size FROM variants WHERE color GLOB '*[一-龥]*' OR size GLOB '*[一-龥]*' LIMIT 300").all<any>();
  for (const v of vs.results) { const cc = await tr.t(v.color, 'attr'); const sz = await tr.t(v.size, 'attr'); if (cc !== v.color || sz !== v.size) { await db.prepare('UPDATE variants SET color=?,size=? WHERE id=?').bind(cc, sz, v.id).run(); nv++; } }
  // كم بقي عليه نص صيني — ليعرف المُشغِّل متى يتوقف
  const left = await db.prepare("SELECT COUNT(*) n,SUM(status='draft') d FROM products WHERE title_ar GLOB '*[一-龥]*'").first<{ n: number; d: number }>();
  return { products: n, variants: nv, tried, remaining: left?.n ?? 0, held: left?.d ?? 0 };
}
