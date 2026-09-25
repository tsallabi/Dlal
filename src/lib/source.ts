import { junkAttr } from './attr-en';
// ماذا تستلم الزبونة فعلًا؟ بعض إعلانات 1688 سليمة لكن عنوانها وحده لا يكفي:
// حامل عرض يصل فارغًا والبضاعة في صورته للتوضيح، وزهرة «طبيعية المظهر» صناعية.
// لا نُخفيها — صاحب المشروع طلب التوضيح لا الإخفاء (22/09/26) — بل نشرحها على الرف.
export type ListingKind = 'rack' | 'mannequin' | 'fake' | 'prop' | 'sauna';
const KIND_RULES: { k: ListingKind; words: string[] }[] = [
  { k: 'rack',      words: ['展示架', '陈列架', '陈列', '展架', '托架', '货架'] },
  { k: 'mannequin', words: ['模特', '人台'] },
  { k: 'fake',      words: ['仿真', '假花', '人造花'] },
  { k: 'sauna',     words: ['汗蒸服', '桑拿服'] },
  { k: 'prop',      words: ['摄影道具', '拍摄道具', '拍照道具'] },
];
export function kindOf(titleSrc: string | null | undefined): ListingKind | null {
  const t = String(titleSrc ?? '');
  if (!t) return null;
  for (const r of KIND_RULES) if (r.words.some(w => t.includes(w))) return r.k;
  return null;
}
// جملة عربية واحدة تُعرض للزبونة تحت السعر — تقول ما تستلمه بالضبط
export const KIND_NOTE: Record<ListingKind, { tag: string; note: string }> = {
  rack:      { tag: 'حامل عرض', note: 'حامل عرض للمحلات: يصلك الحامل وحده فارغًا، والبضاعة الظاهرة في الصورة للتوضيح فقط.' },
  mannequin: { tag: 'مجسّم عرض', note: 'مجسّم عرض (مانيكان) للمحلات: يصلك المجسّم وحده، والملابس في الصورة للتوضيح فقط.' },
  fake:      { tag: 'صناعي', note: 'زهور أو نباتات صناعية: ليست طبيعية ولا تحتاج ماءً ولا شمسًا — للزينة الدائمة.' },
  prop:      { tag: 'ديكور وتصوير', note: 'قطعة زينة وتصوير: للديكور والصور لا للاستعمال اليومي.' },
  sauna:     { tag: 'بدلة ساونا', note: 'بدلة ساونا وحمّام بخار: تُلبس في الحمّام أو أثناء التمرين للتعرّق، وليست ملابس خروج.' },
};

// ليست بضاعة تجزئة: إعلان مصنع تغليف أو طباعة أو تصنيع حسب الطلب (OEM)، أو لوط جملة.
// صاحب المشروع فتح «صندوق هدايا أزياء للهواتف والسماعات» فوجد أقل طلب 200 قطعة: الإعلان
// لمصنع علب (YIGAO PACKAGING PRINTING · 源头大厂 专属定制) يبيع العلبة الفارغة، والسماعات
// في الصورة محتوى توضيحي. 96 إعلانًا كهذا و306 لوط جملة في 22/09/26.
// الكلمات المستعملة قوية الدلالة فقط: 定制 و厂家直销 يرشّهما الباعة كدعاية على بضاعة سليمة.
const MFG_WORDS = ['包装', '印刷', '纸盒', '礼品盒', '包装袋', '包装盒', 'OEM', '贴牌', '代工'];
export function isPackagingListing(titleSrc: string | null | undefined): boolean {
  const t = String(titleSrc ?? '');
  return !!t && MFG_WORDS.some(w => t.includes(w));
}
// الحد الفاصل بين التجزئة والجملة قابل للضبط من `retail_max_moq` (الافتراضي 10)
export function isWholesaleLot(minQty: number | null | undefined, maxRetail = 10): boolean {
  return (Number(minQty) || 1) >= Math.max(2, maxRetail);
}
export function notRetail(titleSrc: string | null | undefined, minQty: number | null | undefined, maxRetail = 10): boolean {
  return isPackagingListing(titleSrc) || isWholesaleLot(minQty, maxRetail);
}

// رأس العمود ليس قيمة: قارئ جدول مواصفات 1688 يلتقط أحيانًا اسم الخاصية نفسه
// («尺码»، «颜色») فيُترجم إلى «المقاس» و«اللون» ويظهر للزبونة زرَّ مقاس اسمه «المقاس».
// 13 منتجًا حيًا في 22/09/26، منها الكيس الذي فتحه صاحب المشروع.
const ATTR_NOISE = new Set([
  '尺码', '尺寸', '规格', '颜色', '色系', '型号', '款式', '材质', '数量',
  'size', 'sizes', 'color', 'colour', 'colors', 'model', 'style', 'spec', 'specification', 'quantity',
  'المقاس', 'مقاس', 'المقاسات', 'مقاسات', 'الحجم', 'حجم', 'القياس', 'قياس',
  'اللون', 'لون', 'الألوان', 'ألوان', 'النوع', 'نوع', 'المواصفات', 'مواصفات', 'الكمية', 'الموديل', 'موديل',
]);
export function attrValue(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim().replace(/[:\uFF1A]\s*$/, '').trim();
  if (!t) return null;
  // شظايا جدول المواصفات («non-returnable]»، «Capacity»، «Length (cm)») ليست لونًا ولا مقاسًا
  return ATTR_NOISE.has(t.toLowerCase()) || junkAttr(t) ? null : t;
}

// وزن المورّد يأتي عادةً بالكيلوغرام، وبعضهم يكتبه بالغرام في نفس الحقل. ضربُ الغرامات
// في 1000 ثانيةً أنتج رفّ حمام وزنه 650 كغ وكوبًا حراريًا بـ500 كغ، فظهرا على الرف بـ54٬600
// و41٬930 د.ل (22/09/26). لا قطعة نشحنها جوًّا أو بحرًا تتجاوز 50 كغ، فما فوقها يُعاد تفسيره
// غرامات، وما بقي مستحيلًا يُهمل فيُستعمل تقدير القسم بدله.
export const MAX_WEIGHT_G = 50000;
export function normWeightG(raw: number | null | undefined, unit: 'kg' | 'raw' = 'kg'): number | undefined {
  const v = Number(raw);
  if (!isFinite(v) || v <= 0) return undefined;
  // 'raw' = رقم من جدول مواصفات بلا وحدة: أقل من 50 يعني كيلوغرامات، وإلا غرامات
  let g = unit === 'kg' || v < 50 ? Math.round(v * 1000) : Math.round(v);
  if (g > MAX_WEIGHT_G) g = Math.round(v);
  return g >= 1 && g <= MAX_WEIGHT_G ? g : undefined;
}

// وزن لا يُعقل (٢٥/٠٩/٢٦): جدول مواصفات 1688 يكتب «الوزن: 40» بلا وحدة وهو يقصد غرامات، والقاعدة
// «أقل من 50 = كيلوغرامات» جعلت ربطة عنق 40 كغ فبيعت بـ3,380 د.ل (146 منتجًا نشطًا يومها).
// المرفوض: فوق عشرة أضعاف وزن القسم التقديري (وثلاثة كيلو على الأقل)، في قسم خفيف (≤ 900 غ تقديرًا)
// أو بسعر أقل من يوانين للكيلو — الخيمة الحقيقية بـ1400 يوان و27 كغ تبقى كما هي.
// إن كان الرقم كيلوغرامات مضروبة في 1000 من رقم غرامات معقول، يُعاد غرامات؛ وإلا فلا وزن (يُسعَّر بوزن القسم
// ويدخل طابور الإثراء فتقرؤه الإضافة من جديد).
export function plausibleWeightG(w: number | null | undefined, estG: number, cny: number): number | undefined {
  const v = Math.round(Number(w));
  if (!isFinite(v) || v <= 0) return undefined;
  const est = estG > 0 ? estG : 300, kg = v / 1000;
  // وقاعدة ثانية لا تعرف القسم: أقل من نصف يوان للكيلو في 5 كغ فأكثر (فرشاة دهان بـ0.26 يوان «20 كغ» في أدوات البناء)
  const tooHeavy = (v > Math.max(est * 10, 3000) && (est <= 900 || cny < kg * 2)) || (v >= 5000 && cny < kg * 0.5);
  if (!tooHeavy) return v;
  // غرامات إن كانت معقولة للقسم، أو القطعة رخيصة (أقل من 5 يوان = صغيرة: رأس مفك 10 غ، إسفنجة 6 غ)
  if (v <= MAX_WEIGHT_G && v % 1000 === 0 && (kg >= est / 5 || cny < 5)) return kg;
  return undefined;
}

// وزن تقديري لمنتج لا يُعرف وزنه (٢٥/٠٩/٢٦): وزن القسم وحده جعل سكين معجون بـ1.5 يوان في «أدوات البناء»
// (تقديرها 2 كغ) بـ180 د.ل — ألفا منتج رخيص نشط تقريبًا سُعّرت بشحن كيلوغرامين. البضاعة الرخيصة خفيفة بطبعها:
// لا نفترض أكثر من 150 غ لكل يوان (أثقل ما في الكتالوج، الحديد المصبوب، نحو 8 يوان للكيلو = 125 غ لليوان)، ولا أقل من 100 غ.
export function estWeightG(estG: number | null | undefined, cny: number): number {
  const est = Number(estG) > 0 ? Number(estG) : 300;
  return Math.min(est, Math.max(100, Math.round((Number(cny) || 0) * 150)));
}

// الوزن من العنوان حين لا تذكره صفحة 1688: «دمبل 5 كجم»، «0.5KG»، «256g»، «2kg3kg» (يؤخذ الأكبر — الأحوط للشحن).
// يُرفض: المدى («40-50 كغ») والحمولة والسعة ووزن الجسم («يتحمل 20 كجم»، «适合100斤»)، و克 بلا رقم قبله
// (夹克 جاكيت، 马克笔 قلم، 克米特 كرسي)، و斤 كله (في الملابس وزن لابسها). وأقسام الملابس لا يُقرأ عنوانها أصلًا:
// «140 جرام» فيها وزن القماش للمتر، و«50-70 كجم» وزن من يلبسها.
const APPAREL = new Set(['dresses', 'abayas', 'tops', 'lingerie', 'hijab', 'kids', 'shoes']);
const W_UNIT = /(\d+(?:\.\d+)?)\s*(公斤|千克|kgs?|كيلو\s?(?:غرام|جرام)|كيلوغرام|كيلوجرام|كجم|كغ|كيلو|克|g|grams?|جرام|غرام|جم|غ)(?![a-z؀-ۿ])/gi;
const W_NOT = /(تتحمل|يتحمل|تحمل|حمولة|سعة|حتى|لوزن|للوزن|وزن الجسم|للأوزان|承重|载重|负重|适合|体重|load|capacity|up to|max|bearing|holds?)\s*$/i;
export function titleWeightG(titles: (string | null | undefined)[], catSlug: string | null | undefined, estG: number, cny: number): number | undefined {
  if (catSlug && APPAREL.has(catSlug)) return undefined;
  let best = 0;
  for (const t of titles) {
    if (!t) continue;
    const s = String(t);
    for (const m of s.matchAll(W_UNIT)) {
      const i = m.index ?? 0, before = s.slice(Math.max(0, i - 14), i), after = s.slice(i + m[0].length, i + m[0].length + 3);
      if (/[-~～–]\s*$/.test(before) || /^\s*[-~～–]\s*\d/.test(after) || W_NOT.test(before)) continue;
      const v = parseFloat(m[1]); const u = m[2].toLowerCase();
      const g = /公斤|千克|kg|كيلو|كجم|كغ/.test(u) ? v * 1000 : v;
      if (g > best) best = g;
    }
  }
  if (!(best >= 5)) return undefined;
  const g = Math.round(best);
  // والقاعدة نفسها التي تحرس وزن الإضافة: «40 كغ» في عنوان ربطة عنق ليست وزنها
  return g <= MAX_WEIGHT_G && plausibleWeightG(g, estG, cny) === g ? g : undefined;
}

// طبقة مصدر المنتجات — تُبدَّل دون تغيير باقي النظام
// اليوم: BrowserImportSource (الموظف يتصفح 1688 ويضغط "استورد")
// غدًا:  Api1688Source (بعد الحصول على AppKey من open.1688.com)

export type SourceProduct = {
  source: '1688' | 'manual' | 'api';
  offerId: string;
  url: string;
  title: string;            // بالصينية غالبًا
  titleAr?: string;
  priceCny: number;
  minQty: number;
  images: string[];
  supplier?: string;
  variants: { skuId?: string; color?: string; size?: string; priceCny?: number; inStock?: boolean; image?: string }[];
  inStock: boolean;
  weightG?: number;
  categoryHint?: string;
};

export interface ProductSource {
  name: string;
  /** يجلب بيانات منتج واحد بالمعرف (لفحص التوفر والسعر) */
  fetchOffer(offerId: string): Promise<SourceProduct | null>;
  /** بحث بالكلمات (للاستيراد الجماعي) */
  search?(keyword: string, page: number): Promise<SourceProduct[]>;
  /** بحث بالصورة */
  searchByImage?(imageUrl: string): Promise<SourceProduct[]>;
}

/**
 * مصدر المتصفح: لا يستطيع الخادم جلب شيء بنفسه، بل يستقبل ما يرسله
 * سكربت الاستيراد (public/importer.js) من متصفح الموظف عبر POST /api/import.
 * fetchOffer هنا يعيد null، والفحص يتم بأن يطلب الخادم من المتصفح فحص قائمة
 * معرفات (GET /api/import/queue) ثم يعيدها المتصفح.
 */
export class BrowserImportSource implements ProductSource {
  name = 'browser-1688';
  async fetchOffer(): Promise<SourceProduct | null> { return null; }
}

/**
 * مصدر API الرسمي — هيكل جاهز. يُفعَّل بوضع APP_KEY/APP_SECRET كأسرار.
 * التوقيع: HMAC-SHA1 على (مسار + بارامترات مرتبة) حسب توثيق open.1688.com.
 */
export class Api1688Source implements ProductSource {
  name = 'api-1688';
  constructor(private appKey: string, private appSecret: string, private accessToken: string) {}
  async fetchOffer(offerId: string): Promise<SourceProduct | null> {
    // TODO بعد الموافقة: com.alibaba.product/alibaba.product.get  → offerId
    void offerId;
    throw new Error('Api1688Source غير مفعّل بعد — بانتظار AppKey');
  }
  async search(keyword: string, page: number): Promise<SourceProduct[]> {
    // TODO: com.alibaba.fenxiao:cross.keywords.search
    void keyword; void page;
    return [];
  }
}

export function getSource(env: { API1688_KEY?: string; API1688_SECRET?: string; API1688_TOKEN?: string }): ProductSource {
  if (env.API1688_KEY && env.API1688_SECRET && env.API1688_TOKEN)
    return new Api1688Source(env.API1688_KEY, env.API1688_SECRET, env.API1688_TOKEN);
  return new BrowserImportSource();
}

export function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'p';
}
