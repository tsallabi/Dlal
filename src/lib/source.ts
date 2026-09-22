// ليست بضاعة تجزئة: إعلان مصنع تغليف أو طباعة أو تصنيع حسب الطلب (OEM)، أو لوط جملة.
// صاحب المشروع فتح «صندوق هدايا أزياء للهواتف والسماعات» فوجد أقل طلب ٢٠٠ قطعة: الإعلان
// لمصنع علب (YIGAO PACKAGING PRINTING · 源头大厂 专属定制) يبيع العلبة الفارغة، والسماعات
// في الصورة محتوى توضيحي. ٩٦ إعلانًا كهذا و٣٠٦ لوط جملة في ٢٢/٠٩/٢٦.
// الكلمات المستعملة قوية الدلالة فقط: 定制 و厂家直销 يرشّهما الباعة كدعاية على بضاعة سليمة.
const MFG_WORDS = ['包装', '印刷', '纸盒', '礼品盒', '包装袋', '包装盒', 'OEM', '贴牌', '代工'];
export function isPackagingListing(titleSrc: string | null | undefined): boolean {
  const t = String(titleSrc ?? '');
  return !!t && MFG_WORDS.some(w => t.includes(w));
}
// الحد الفاصل بين التجزئة والجملة قابل للضبط من `retail_max_moq` (الافتراضي ١٠)
export function isWholesaleLot(minQty: number | null | undefined, maxRetail = 10): boolean {
  return (Number(minQty) || 1) >= Math.max(2, maxRetail);
}
export function notRetail(titleSrc: string | null | undefined, minQty: number | null | undefined, maxRetail = 10): boolean {
  return isPackagingListing(titleSrc) || isWholesaleLot(minQty, maxRetail);
}

// رأس العمود ليس قيمة: قارئ جدول مواصفات 1688 يلتقط أحيانًا اسم الخاصية نفسه
// («尺码»، «颜色») فيُترجم إلى «المقاس» و«اللون» ويظهر للزبونة زرَّ مقاس اسمه «المقاس».
// ١٣ منتجًا حيًا في ٢٢/٠٩/٢٦، منها الكيس الذي فتحه صاحب المشروع.
const ATTR_NOISE = new Set([
  '尺码', '尺寸', '规格', '颜色', '色系', '型号', '款式', '材质', '数量',
  'size', 'sizes', 'color', 'colour', 'colors', 'model', 'style', 'spec', 'specification', 'quantity',
  'المقاس', 'مقاس', 'المقاسات', 'مقاسات', 'الحجم', 'حجم', 'القياس', 'قياس',
  'اللون', 'لون', 'الألوان', 'ألوان', 'النوع', 'نوع', 'المواصفات', 'مواصفات', 'الكمية', 'الموديل', 'موديل',
]);
export function attrValue(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim().replace(/[:\uFF1A]\s*$/, '').trim();
  if (!t) return null;
  return ATTR_NOISE.has(t.toLowerCase()) ? null : t;
}

// وزن المورّد يأتي عادةً بالكيلوغرام، وبعضهم يكتبه بالغرام في نفس الحقل. ضربُ الغرامات
// في ١٠٠٠ ثانيةً أنتج رفّ حمام وزنه ٦٥٠ كغ وكوبًا حراريًا بـ٥٠٠ كغ، فظهرا على الرف بـ٥٤٬٦٠٠
// و٤١٬٩٣٠ د.ل (٢٢/٠٩/٢٦). لا قطعة نشحنها جوًّا أو بحرًا تتجاوز ٥٠ كغ، فما فوقها يُعاد تفسيره
// غرامات، وما بقي مستحيلًا يُهمل فيُستعمل تقدير القسم بدله.
export const MAX_WEIGHT_G = 50000;
export function normWeightG(raw: number | null | undefined, unit: 'kg' | 'raw' = 'kg'): number | undefined {
  const v = Number(raw);
  if (!isFinite(v) || v <= 0) return undefined;
  // 'raw' = رقم من جدول مواصفات بلا وحدة: أقل من ٥٠ يعني كيلوغرامات، وإلا غرامات
  let g = unit === 'kg' || v < 50 ? Math.round(v * 1000) : Math.round(v);
  if (g > MAX_WEIGHT_G) g = Math.round(v);
  return g >= 1 && g <= MAX_WEIGHT_G ? g : undefined;
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
