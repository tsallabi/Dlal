// تصنيف الحشمة: ليبيا بلد محافظ، فالصفحة الرئيسية تعرض الأقسام العامة فقط.
// ملابس النوم والداخلية والسباحة تُنقل تلقائيًا إلى قسمها ولا تظهر على الرئيسية،
// ويُفحص العنوان بالعربية والصينية والإنجليزية لأن المصدر قد يصل بأي منها.

const INTIMATE = [
  // عربي
  /بيجام|بجام|ملابس\s*(ال)?نوم|لباس\s*نوم|قميص\s*نوم|ثوب\s*نوم|فستان\s*نوم|تنورة\s*نوم|رداء\s*نوم|روب\s*(نوم|حمام)/,
  /لانجي?ري|ملابس\s*داخلية|ملابس\s*تحتية|حمّ?الة\s*صدر|سوتيان|صدرية\s*داخلية|كيلوت|سروال\s*داخلي|شورت\s*داخلي/,
  /بيكيني|مايوه|ملابس\s*سباحة|لباس\s*سباحة/,
  // صيني
  /睡衣|睡袍|睡裙|家居服|内衣|文胸|内裤|胸罩|情趣|比基尼|泳衣|吊带睡/,
  // إنجليزي
  /\b(lingerie|nightwear|nightgown|nightdress|pajama|pyjama|sleepwear|bathrobe|underwear|bra|panties|thong|bikini|swimsuit|swimwear)\b/i,
];

// عناوين تبقى في قسمها لكنها لا تُعرض على الرئيسية
const REVEALING = [
  /مفتوح\s*الخلف|عاري\s*الظهر|مكشوف\s*الظهر|بدون\s*حمالات|بدون\s*أكتاف|مثير|إيروتيك/,
  /露背|吊带|性感|低胸/,
  /\b(backless|strapless|sexy|see[- ]through|sheer)\b/i,
];

// «شفاف» وحدها ليست دليلًا: حافظة هاتف شفافة وكيس شفاف منتجات عادية
const SHEER_OK = /حافظة|غطاء|علبة|لاصق|كيس|زجاج|شاشة|أكريليك/;

const hit = (list: RegExp[], t: string) => list.some(r => r.test(t));

export type ModestyVerdict = { intimate: boolean; homeOk: boolean };

export function classifyModesty(...texts: (string | null | undefined)[]): ModestyVerdict {
  const t = texts.filter(Boolean).join(' · ');
  if (!t) return { intimate: false, homeOk: true };
  const intimate = hit(INTIMATE, t);
  const sheer = /شفاف|透明/.test(t) && !SHEER_OK.test(t);
  const homeOk = !intimate && !hit(REVEALING, t) && !sheer;
  return { intimate, homeOk };
}
