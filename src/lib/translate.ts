// ترجمة بيانات 1688 إلى العربية: قاموس فوري للألوان والمقاسات الشائعة + نماذج Workers AI اللغوية مع فحص جودة + ذاكرة ترجمة في القاعدة
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
  // مقاس برقم: «8号» في الخواتم والأحذية = المقاس ٨، و«2号色» = اللون رقم ٢
  const no = k.match(/^(\d{1,3}(?:\.\d)?)\s*号(色)?$/);
  if (no) return no[2] ? `اللون رقم ${no[1]}` : `مقاس ${no[1]}`;
  // مركّب بلا فاصل: "白色豹纹" = 白色 + 豹纹 → "أبيض نمري"
  if (hasCJK(k) && k.length >= 3 && k.length <= 8) for (let i = 1; i < k.length; i++) { const a = DICT[k.slice(0, i)], b = DICT[k.slice(i)]; if (a !== undefined && b !== undefined) return `${a} ${b}`.trim(); }
  return null;
}

// بعد حذف كلمة قد يبقى حرف عطف يتيمًا في أول العنوان أو آخره («… والسماعات مع»)
const tidyJoin = (t: string) => t
  .replace(/\s+(و|مع|من|في|على)(\s+\1)+\s+/g, ' $1 ')     // «و و» بعد حذف كلمة بينهما
  .replace(/^\s*(و|مع|من|في|على|,|،|-)\s+/, '')
  .replace(/\s+(و|مع|من|في|على|ب|ل|,|،|-)\s*$/, '')
  .replace(/\s+([,،])/g, '$1').replace(/\s{2,}/g, ' ').trim();

// النموذج يخلط أبجديات أخرى لا لاتينية فقط: «بال스타يل» كورية، «تنورةチュチュ» يابانية،
// «розية» سيريلية، «đế مسطح» فيتنامية. ١٤٣ عنوانًا حيًا في ٢٢/٠٩/٢٦.
// اللاتينية مسموحة (XL، USB)، وكل ما عداها في عنوان عربي خطأ نموذج لا محالة.
const FOREIGN_SCRIPT = /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0370-\u03FF\u0102\u0103\u0110\u0111\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]/;
// النموذج يلصق أحيانًا بقية كلمة لاتينية بكلمة عربية: «زippers»، «الكitchen»، «كاردigan»،
// «بheel»، «مفتاحsheetmetal». نص مكسور يراه الزبون على الرف، فلا يُعدّ عنوانًا مقبولًا.
// الشرط التصاق حرفين من أبجديتين بلا مسافة، فلا يمسّ «مقاس XL» ولا «USB» ولا «2XL».
export const mixedScript = (t: string | null | undefined) => /[\u0600-\u06FF][A-Za-z]|[A-Za-z][\u0600-\u06FF]/.test(t ?? '');
// إصلاح أخير قبل الرفض: نحذف الكلمة المكسورة وحدها إن بقي أغلب العنوان (مثل dropCJKWords)
export function dropMixedWords(t: string): string | null {
  const words = t.split(/\s+/).filter(Boolean);
  // نحذف أيضًا الكلمة المكتوبة بأبجدية ثالثة («용»، «고급») — أعجزت النماذج الأربعة كلها
  const kept = words.filter(w => !mixedScript(w) && !FOREIGN_SCRIPT.test(w));
  if (kept.length < 3 || kept.length < words.length * 0.6) return null;
  const out = tidyJoin(kept.join(' '));
  return out.length >= 8 && !mixedScript(out) && !FOREIGN_SCRIPT.test(out) ? out : null;
}

// تكرار بلا مسافة واحدة: «الوسومالوسومالوسوم…» ملأ خمسة عناوين حية (شُعيرات، أقراط،
// دمبل، أحمرا شفاه) ومرّ من الحارس القديم لأنه يقسّم على المسافات ولا مسافة هنا إطلاقًا.
const REPEAT_NOSPACE = /(.{2,12}?)\1{3,}/;
// عنوان عربي طبيعي لا يتجاوز ٢٥ حرفًا بكلمة واحدة: غيابُ المسافات علامة نصٍّ ملتصق
const GLUED = (t: string) => t.length > 25 && (t.match(/\s/g)?.length ?? 0) < 2;
const degenerate = (t: string) => {
  const w = t.split(/\s+/).filter(Boolean);
  if (w.length >= 4 && new Set(w).size / w.length < 0.5) return true;
  if (REPEAT_NOSPACE.test(t) || GLUED(t)) return true;
  return /(\S{2,})(\s+\1){2,}/.test(t);
};
export const goodArabic = (t: string | null | undefined) => !!t && /[\u0600-\u06FF]/.test(t) && !hasCJK(t) && !mixedScript(t) && !degenerate(t) && t.length <= 220;
// ترجمة عربية سليمة نحويًا لكنها ليست ترجمة العنوان:
//  · «حقيبة رياضية… ومقابض للزلازل» ⟵ 登山杖 عصا تسلّق، لا زلزال في الأصل إطلاقًا
//  · «حمراء مزيفة لديكور المنزل» ⟵ 嘉兰百合 زنبق الجلوريوزا: ضاع اسم المنتج كله
// الكلمة المشبوهة لا تكفي وحدها: خيمة إغاثة أصلها 抗震救灾 فيها «زلازل» صحيحة.
// نطالب بوجود أثرها في العنوان الصيني، فإن غاب فهي هلوسة نموذج.
// كلمة مكرّرة مرتين متتاليتين: «سلة طويلة طويلة»، «للسيارات للسيارات»، «منصة منصة».
// حارس التكرار القديم يشترط ثلاث مرات فلم يرَ ٢٧ عنوانًا حيًا.
const DUP_ADJACENT = /(\S{2,})\s+\1(\s|$)/;
const LEAD_ADJ = /^(حمراء|زرقاء|بيضاء|سوداء|خضراء|صفراء|وردية|ذهبية|فضية|بنفسجية|رمادية|كبيرة|صغيرة|جميلة|أنيقة|ناعمة|سميكة|خفيفة|مزيفة|صناعية|جديدة|فاخرة|مريحة|شفافة|طويلة|قصيرة)\s/;
// السوابق العربية تلتصق بالكلمة: «للزلازل» = لِ + الزلازل. بدونها لا يُمسك شيء.
const AR_PRE = '(?:^|\\s)[\u0648\u0641\u0628\u0643\u0644]{0,3}(?:\u0627\u0644)?';
const AR_END = '(?:\\s|$|[,\u060C.])';
const sus = (stem: string) => new RegExp(`${AR_PRE}(?:${stem})${AR_END}`);
const SUSPECT: { re: RegExp; src: string[]; why: string }[] = [
  { re: sus('زلازل|زلزال'), src: ['地震', '抗震', '震'], why: 'زلازل' },
  { re: sus('قنبلة|قنابل'), src: ['炸弹', '爆炸', '手雷'], why: 'قنبلة' },
  { re: sus('جثة|جثث'), src: ['尸'], why: 'جثة' },
  { re: sus('مخدرات|مخدر'), src: ['毒品', '麻醉'], why: 'مخدرات' },
  { re: sus('قرصنة'), src: ['海盗', '盗版'], why: 'قرصنة' },
];
// المكافئ في SQL لاختيار المرشّحين من القاعدة (التكرار بلا مسافات يغطّيه شرط الالتصاق).
// يُستعمل في طابور الترجمة وفي الإحصاءات وفي فلتر اللوحة — تعريف واحد لا ثلاثة.
export const BROKEN_SQL = `(
  (length(title_ar) > 25 AND (length(title_ar) - length(replace(title_ar,' ',''))) < 2)
  OR title_ar LIKE 'حمراء %' OR title_ar LIKE 'زرقاء %' OR title_ar LIKE 'بيضاء %' OR title_ar LIKE 'سوداء %'
  OR title_ar LIKE 'خضراء %' OR title_ar LIKE 'صفراء %' OR title_ar LIKE 'وردية %' OR title_ar LIKE 'ذهبية %'
  OR title_ar LIKE 'فضية %' OR title_ar LIKE 'بنفسجية %' OR title_ar LIKE 'رمادية %' OR title_ar LIKE 'مزيفة %'
  OR title_ar LIKE 'صناعية %' OR title_ar LIKE 'شفافة %' OR title_ar LIKE 'ناعمة %' OR title_ar LIKE 'سميكة %'
  OR (title_ar LIKE '%زلازل%' AND COALESCE(title_src,'') NOT LIKE '%震%')
  OR (title_ar LIKE '%زلزال%' AND COALESCE(title_src,'') NOT LIKE '%震%')
  OR (title_ar LIKE '%قنبلة%' AND COALESCE(title_src,'') NOT LIKE '%炸%' AND COALESCE(title_src,'') NOT LIKE '%爆%')
  OR (title_ar LIKE '%قرصنة%' AND COALESCE(title_src,'') NOT LIKE '%盗%')
  OR length(title_ar) > 120
  OR title_ar GLOB '*[\uAC00-\uD7AF]*' OR title_ar GLOB '*[\u3040-\u30FF]*'
  OR title_ar GLOB '*[\u0400-\u04FF]*' OR title_ar GLOB '*[\u0E00-\u0E7F]*'
  OR title_ar GLOB '*[\u1EA0-\u1EF9]*' OR title_ar GLOB '*[\u0370-\u03FF]*'
  OR needs_tr = 1
)`;

// يعيد سبب الكسر بالعربية ليراه الأدمن، أو null إن كان العنوان سليمًا
export function brokenTitle(titleAr: string | null | undefined, titleSrc: string | null | undefined): string | null {
  const t = String(titleAr ?? '').trim(); const src = String(titleSrc ?? '');
  if (!t) return null;
  if (REPEAT_NOSPACE.test(t)) return 'كلمة مكرّرة بلا مسافات';
  if (FOREIGN_SCRIPT.test(t)) return 'حروف من أبجدية أخرى (كورية أو يابانية أو سيريلية)';
  if (DUP_ADJACENT.test(t)) return 'كلمة مكرّرة مرتين متتاليتين';
  if (t.length > 120) return 'عنوان أطول من ١٢٠ حرفًا — حشو كلمات مفتاحية';
  if (GLUED(t)) return 'نص ملتصق بلا مسافات';
  if (LEAD_ADJ.test(t)) return 'يبدأ بصفة ولا اسم منتج فيه';
  for (const w of SUSPECT) if (w.re.test(t) && !w.src.some(x => src.includes(x))) return `كلمة «${w.why}» لا أصل لها في العنوان الصيني`;
  return null;
}

// عنوان منتج مقبول: عربي سليم وخالٍ من حشو 1688 المترجم حرفيًا
const JUNK = /عبر الحدود|تجارة (أجنبية|خارجية)|الأسهم الحقيقية|أمازون|علي إكسبريس|بالجملة|مصدر البضائع|موسم (الخريف|الربيع|الصيف|الشتاء) الجديد|^\(?\s*20\d\d/;
export const goodTitle = (t: string | null | undefined) => goodArabic(t) && !JUNK.test(t!);
// عنوان عربي فيه حشو 1688: نُنظّفه بدل رفضه — رفضه كان يُبقي العنوان صينيًا وهو أسوأ بكثير
const JUNK_G = /عبر الحدود|تجارة (أجنبية|خارجية)|الأسهم الحقيقية|أمازون|علي إكسبريس|بالجملة|بيع بالجملة|مصدر البضائع|موسم (الخريف|الربيع|الصيف|الشتاء) الجديد|20\d\d/g;
// النموذج يترك أحيانًا كلمة صينية أو حرفًا واحدًا داخل عربية سليمة («م耙 حديدي…»، «بتصميم豹 مع…»).
// نحذف الكلمة الحاملة للصيني كلها بدل رفض العنوان كله، ونقبل النتيجة إن بقي أغلب الكلام.
export function dropCJKWords(t: string): string | null {
  const words = t.split(/\s+/).filter(Boolean);
  const kept = words.filter(w => !hasCJK(w));
  if (kept.length < 3 || kept.length < words.length * 0.6) return null;
  const out = tidyJoin(kept.join(' '));
  return out.length >= 8 ? out : null;
}

export function cleanTitle(t: string): string {
  const out = t.replace(JUNK_G, ' ').replace(/[،,\-—_/|]{1,}\s*(?=[،,\-—_/|]|$)/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s،,\-—_/|()]+|[\s،,\-—_/|()]+$/g, '').trim();
  return out;
}

// m2m100 يُنتج تكرارًا فارغًا («سباحة سباحة سباحة…») على عناوين 1688 — مقيس على الموقع الحي، فلم يعد في السلسلة.
// النماذج أدناه مرتبة بنتيجة قياس فعلي على عنوان عباية حقيقي (سبتمبر ٢٠٢٦):
//   llama-4-scout 645ms أدقها · llama-3.3-70b 876ms · mistral-small 263ms أسرعها · llama-3.1-8b-fp8 738ms
// المحذوفة: llama-3.1-8b (5028 مُلغى) · qwen1.5-14b (مُلغى) · qwen2.5-14b (غير موجود) · gemma-3 (ممنوع للحساب)
const TITLE_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8'];
const SHORT_MODELS = ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const SYS_TITLE = 'أنت مترجم لمتجر أزياء عربي. حوّل عنوان منتج من موقع 1688 (صيني محشو بكلمات مفتاحية) إلى عنوان منتج عربي قصير وطبيعي من 5 إلى 14 كلمة يصف المنتج للزبون. احذف عبارات مثل "تجارة خارجية"، "عبر الحدود"، "جديد 2025"، "بالجملة"، "موديل جديد". اذكر ما يميّز هذه القطعة تحديدًا (الخامة أو المقاس أو عدد القطع أو الاستعمال) ولا تكتفِ بوصف عام يصلح لعشرات المنتجات. أجب بالعنوان العربي فقط، بلا شرح ولا علامات اقتباس.';
const SYS_ATTR = 'ترجم قيمة خاصية منتج (لون أو مقاس أو نمط) من الصينية إلى العربية بكلمة أو كلمتين كما تُكتب في متجر ملابس. احتفظ برموز المقاسات اللاتينية (S, M, L, XL, 2XL) والأرقام كما هي بلا تعريب. 均码 تعني "مقاس واحد". أجب بالترجمة فقط.';
const SYS_TEXT = 'ترجم النص التالي من الصينية إلى العربية بشكل طبيعي وقصير. أجب بالترجمة فقط.';
// مسرد مصطلحات: كلمات صينية أخطأ فيها النموذج فعلًا على الرف الحي، تُمرَّر إليه في الطلب
// بدل انتظار أن يصيبها من تلقائه. أضف هنا أي كلمة تتكرر خطأً — أرخص من إعادة الترجمة مرارًا.
const GLOSS: Record<string, string> = {
  '登山杖': 'عصا تسلّق الجبال',      // كان يترجمها «زلازل»
  '风炮': 'مفتاح صدمي هوائي',        // كان يترجمها «قنبلة»
  '嘉兰百合': 'زنبق الجلوريوزا',
  '抗震': 'مقاوم للاهتزاز',
  '筷子': 'عيدان طعام',
  '哑铃': 'دمبل',
};
function glossFor(text: string): string {
  const hits = Object.entries(GLOSS).filter(([zh]) => text.includes(zh));
  return hits.length ? `\nمصطلحات ثابتة: ${hits.map(([zh, ar]) => `${zh} = ${ar}`).join('، ')}` : '';
}
async function llm(ai: any, sys: string, user: string, models: string[]): Promise<string | null> {
  for (const model of models) {
    try {
      const r: any = await ai.run(model, { messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 120, temperature: 0.2 });
      let raw = String(r?.response ?? '').trim().split('\n')[0].replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, '').trim();
      // عربية سليمة بقيت فيها كلمة صينية: نحذف تلك الكلمة بدل رمي الترجمة كلها
      if (hasCJK(raw) && /[\u0600-\u06FF]/.test(raw)) raw = dropCJKWords(raw) ?? raw;
      if (mixedScript(raw)) raw = dropMixedWords(raw) ?? raw;
      const t = sys === SYS_TITLE && goodArabic(raw) && !goodTitle(raw) ? cleanTitle(raw) : raw;
      if (goodArabic(t) && (sys !== SYS_TITLE || goodTitle(t))) return t.slice(0, 200);
    } catch {}
  }
  return null;
}

// ترجمة بالذكاء الاصطناعي: النماذج اللغوية بالترتيب المقيس (مع العنوان الإنجليزي كمساعد إن وُجد)
export async function translateZhAr(ai: any, text: string, kind: 'text' | 'attr' | 'title' = 'text', hintEn?: string | null, extra?: string): Promise<string | null> {
  if (!ai || !text) return null;
  const sys = kind === 'attr' ? SYS_ATTR : kind === 'title' ? SYS_TITLE : SYS_TEXT;
  const base = hintEn && !hasCJK(hintEn) ? `الصينية: ${text.slice(0, 300)}\nالإنجليزية: ${hintEn.slice(0, 300)}` : text.slice(0, 300);
  const user = base + glossFor(text) + (extra ? `\n${extra}` : '');
  // العناوين: النموذج الكبير ثم الصغير؛ الخصائص القصيرة: النموذج الصغير (أسرع) يكفي
  const models = kind === 'title' ? TITLE_MODELS : SHORT_MODELS;
  return await llm(ai, sys, user, models);
}

// تشخيص عنوان عصيّ: ماذا ردّ كل نموذج بالضبط وأي بوابة رفضته — بلا تخمين
export async function diagnoseTitle(ai: any, text: string, hintEn?: string | null) {
  const out: any[] = [];
  const user = hintEn && !hasCJK(hintEn) ? `الصينية: ${text.slice(0, 300)}\nالإنجليزية: ${hintEn.slice(0, 300)}` : text.slice(0, 300);
  for (const model of TITLE_MODELS) {
    try {
      const r: any = await ai.run(model, { messages: [{ role: 'system', content: SYS_TITLE }, { role: 'user', content: user }], max_tokens: 120, temperature: 0.2 });
      const raw = String(r?.response ?? '').trim().split('\n')[0].replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, '').trim();
      const cleaned = cleanTitle(raw);
      out.push({ model, raw: raw.slice(0, 200), cleaned: cleaned.slice(0, 200), arabic: /[\u0600-\u06FF]/.test(raw), cjk: hasCJK(raw), degenerate: !goodArabic(raw) && /[\u0600-\u06FF]/.test(raw) && !hasCJK(raw), goodArabic: goodArabic(raw), goodTitle: goodTitle(raw), cleanedOk: goodTitle(cleaned) });
    } catch (e: any) { out.push({ model, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  return { src: text.slice(0, 200), hintEn: hintEn ?? null, models: out };
}

// ترجمة مع ذاكرة: قاموس → ذاكرة القاعدة → الذكاء الاصطناعي → (العنوان الإنجليزي إن وُجد) → النص الأصلي
export class Translator {
  private mem = new Map<string, string>();
  public aiCalls = 0;
  constructor(private db: D1Database, private ai: any, private maxAi = 80) {}
  // `extra` تعليمة سياقية لهذه القطعة وحدها (مثل «العنوان مستعمل لمنتج آخر، ميّزه»).
  // الناتج يخصّها فلا يُقرأ من الذاكرة ولا يُكتب فيها — وإلا سرى على كل من يشاركها المصدر.
  async t(text: string | null | undefined, kind: 'text' | 'attr' | 'title' = 'text', hintEn?: string | null, extra?: string): Promise<string | null> {
    // النص المكسور (عربي ملتصق بلاتيني) يمرّ إلى الترجمة كما يمرّ الصيني: كلاهما لا يُقرأ.
    // بدون هذا كانت الدالة تُعيد «الرetro الأسود» كما هي لأنها بلا حرف صيني واحد.
    if (!text || (!hasCJK(text) && !mixedScript(text))) return text ?? null;
    const k = norm(text);
    if (!extra && this.mem.has(k)) return this.mem.get(k)!;
    const d = kind === 'attr' ? dictTranslate(k) : null;
    if (d !== null) { this.mem.set(k, d); return d; }
    const row = extra ? null : await this.db.prepare('SELECT dst FROM translations WHERE src=?').bind(k).first<{ dst: string }>().catch(() => null);
    // الذاكرة قد تكون مسمومة: ترجمة مكسورة محفوظة تُعاد إلى الأبد فلا يتغيّر العنوان مهما
    // أُعيدت المحاولة (أربعة عناوين بلغت سبع محاولات بلا تغيير). نحذفها ونسأل النموذج من جديد.
    if (row && goodArabic(row.dst) && !(kind === 'title' && brokenTitle(row.dst, k))) { this.mem.set(k, row.dst); return row.dst; }
    if (row) await this.db.prepare('DELETE FROM translations WHERE src=?').bind(k).run().catch(() => {});
    const fallback = hintEn && !hasCJK(hintEn) ? hintEn.slice(0, 200) : text;
    if (this.aiCalls >= this.maxAi) return fallback;
    this.aiCalls++;
    let out = await translateZhAr(this.ai, k, kind, hintEn, extra);
    if (!out) return fallback;
    // مقاس لاتيني داخل القيمة (مثل "加大码XL") يبقى كما هو حتى لو عرّبه النموذج
    if (kind === 'attr') { const sz = k.match(/(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL)(?![A-Za-z])/i); if (sz && !new RegExp(`\\b${sz[1]}\\b`, 'i').test(out)) { const rest = dictTranslate(k.replace(sz[1], '').replace(/码/g, '').trim()); out = rest ? `${rest} ${sz[1].toUpperCase()}` : sz[1].toUpperCase(); } }
    if (kind === 'title' && brokenTitle(out, k)) return fallback;   // مكسور أيضًا: لا يُحفظ ولا يُستبدل به القديم
    if (extra) return out;                                          // ناتج سياقي: لا يدخل الذاكرة
    this.mem.set(k, out);
    await this.db.prepare('INSERT OR REPLACE INTO translations(src,dst,kind) VALUES(?,?,?)').bind(k, out, kind).run().catch(() => {});
    return out;
  }
}

// مسودة حجزها النظام لأن عنوانها كان صينيًا، ثم صار عنوانها عربيًا بطريق آخر (تحرير، إثراء، استيراد ثانٍ)،
// كانت تبقى محجوزة إلى الأبد: النشر كان معلّقًا على أن تُغيّر دفعةُ الترجمة شيئًا في نفس التمريرة.
// هذا الفحص ينشرها بلا أي استدعاء نموذج، ويقتصر على ما حجزه النظام (title_src موجود = جاء من مستورد)
// فلا يمسّ منتجًا سوّاه الأدمن مسودةً بيده — وإخفاء المنتج عمدًا حالته 'hidden' لا 'draft'.
export async function releaseHeldDrafts(db: D1Database): Promise<number> {
  const r = await db.prepare(`UPDATE products SET status='active'
     WHERE status='draft' AND title_src IS NOT NULL
       AND title_ar NOT GLOB '*[一-龥]*' AND title_ar GLOB '*[ء-ي]*'`).run();
  return r.meta?.changes ?? 0;
}

// كنس مجاني بلا استدعاء نموذج: عنوان بقي مكسورًا بعد محاولتي ترجمة تُحذف منه الكلمة المكسورة.
// نتركه للنموذج أولًا لأن الحذف يُفقد معنى («كاردigan» ⟵ تختفي الكاردigan)، وهذا آخر ما نلجأ إليه
// حتى لا يبقى نص مكسور أمام الزبونة إلى الأبد.
export async function sweepMashedTitles(db: D1Database, minTries = 2): Promise<number> {
  const { results } = await db.prepare(`SELECT id,title_ar FROM products
     WHERE tr_tries >= ? AND (title_ar GLOB '*[\u0621-\u064A][a-zA-Z]*' OR title_ar GLOB '*[a-zA-Z][\u0621-\u064A]*'
        OR title_ar GLOB '*[\uAC00-\uD7AF]*' OR title_ar GLOB '*[\u3040-\u30FF]*' OR title_ar GLOB '*[\u0400-\u04FF]*') LIMIT 200`).bind(minTries).all<{ id: number; title_ar: string }>();
  let n = 0;
  for (const p of results) {
    const fixed = dropMixedWords(p.title_ar);
    if (fixed && goodTitle(fixed)) { await db.prepare('UPDATE products SET title_ar=?,updated_at=datetime(\'now\') WHERE id=?').bind(fixed, p.id).run(); n++; }
  }
  return n;
}

// إعادة ترجمة ما بقي صينيًا أو ما تُرجم ترجمة رديئة (تكرار) — تُستخدم من الأدمن ومن /api/source/translate
export async function retranslatePending(db: D1Database, ai: any, limit = 40): Promise<{ products: number; variants: number; tried: number; remaining: number; held: number; variantsLeft: number; released: number; swept: number }> {
  const tr = new Translator(db, ai, limit + 60);
  // الأقل محاولةً أولًا: عنوان عصيّ على الترجمة لا يبتلع كل دفعة ويمنع بقية الكتالوج
  // العنوان المكسور («زippers»، «الكitchen») يدخل الطابور كما يدخله الصيني: كلاهما نص لا يُقرأ.
  const MASHED = `(title_ar GLOB '*[\u0621-\u064A][a-zA-Z]*' OR title_ar GLOB '*[a-zA-Z][\u0621-\u064A]*')`;
  // عنوان بلا حرف عربي واحد: ترجمة المزوّد الإنجليزية حُفظت كما هي حين فشلت العربية.
  // ٢٧ منتجًا حيًا أصلها الصيني محفوظ ومحاولاتها صفر: هي في الطابور ولا يصلها الدور أبدًا
  // لأن الترتيب يدفنها تحت آلاف الصفوف. ترتفع هنا إلى المرتبة الثانية بعد الصيني.
  const NO_AR = `(title_ar NOT GLOB '*[\u0621-\u064A]*')`;
  const DUP_SQL = `(tr_tries < 12 AND lower(title_ar) IN (SELECT lower(title_ar) FROM products
     WHERE status IN ('active','draft') GROUP BY lower(title_ar) HAVING COUNT(*) >= 2))`;
  const { results } = await db.prepare(`SELECT id,title_ar,title_src,supplier_name,tr_tries,needs_tr FROM products
     WHERE title_ar GLOB '*[一-龥]*' OR supplier_name GLOB '*[一-龥]*' OR title_src GLOB '*[一-龥]*' OR ${MASHED} OR ${NO_AR} OR ${BROKEN_SQL} OR ${DUP_SQL}
     ORDER BY (title_ar GLOB '*[一-龥]*') DESC, needs_tr DESC, ${DUP_SQL} DESC, ${BROKEN_SQL} DESC, ${NO_AR} DESC, ${MASHED} DESC, tr_tries ASC, (status='draft') DESC, sales DESC, id DESC LIMIT 400`).all<any>();
  // العناوين الصينية أو الرديئة أولًا، ثم ما تبقى (موردون)
  // عنوان يتقاسمه منتجان فأكثر: النموذج طوى إعلانات مختلفة في وصف عام. الفرق موجود في
  // العنوان الصيني (خامة، نوع، ماركة، مقاس) فنطلب منه تمييزه صراحةً بدل إعادة الاسم نفسه.
  const { results: dups } = await db.prepare(`SELECT lower(title_ar) t, COUNT(*) n FROM products
     WHERE status IN ('active','draft') GROUP BY lower(title_ar) HAVING n >= 2`).all<{ t: string; n: number }>();
  const dupSet = new Set(dups.map(d => d.t));
  // بعد اثنتي عشرة محاولة نكفّ: إعلانان متطابقان فعلًا عند المورّد لا يفرّقهما نموذج،
  // وإصرارنا يسدّ الطابور على غيرهما. يظهران في تقرير التفتيش ليقرر صاحب المشروع.
  const isDup = (p: any) => dupSet.has(String(p.title_ar ?? '').toLowerCase()) && (p.tr_tries ?? 0) < 12;
  const needs = (p: any) => hasCJK(p.title_ar) || !goodTitle(p.title_ar) || !!brokenTitle(p.title_ar, p.title_src) || isDup(p);
  results.sort((a, b) => Number(needs(b)) - Number(needs(a)));
  let n = 0, nv = 0, tried = 0;
  for (const p of results) {
    if (tried >= limit) break;
    const src = hasCJK(p.title_src) ? p.title_src : p.title_ar;
    const dup = isDup(p);
    const needTitle = hasCJK(p.title_ar) || !goodTitle(p.title_ar) || !!brokenTitle(p.title_ar, p.title_src) || dup;
    // المنتج الذي عنوانه عربي سليم واسم مورّده عربي لا يحتاج شيئًا: نتخطاه بلا أن يُحسب من الدفعة.
    // (كان يُحسب فيبتلع الأربعين مكانًا ولا يصل الدور إلى العناوين الصينية الحقيقية.)
    if (!needTitle && !hasCJK(p.supplier_name)) {
      // معلَّم لكن عنوانه يمرّ من كل قاعدة عندنا: العلامة قديمة (سببها تكرار اسم مع منتج
      // آخر، وهذا لا تُصلحه إعادة ترجمة). نمسحها هنا وإلا دار الطابور عليها بلا نهاية
      // ولم يصل الدور إلى ما يُصلَح فعلًا — هذا الفرع كان يتخطّى قبل أن يمسح.
      if (p.needs_tr) await db.prepare('UPDATE products SET needs_tr=0 WHERE id=?').bind(p.id).run();
      continue;
    }
    // `tr.t` تُعيد النص الأصلي حين تعجز كل النماذج. قبوله يعني استبدال عنوان عربي مكسور
    // بعنوان صيني — أسوأ. لا نقبل إلا ترجمة عربية سليمة غير مكسورة، وإلا تُترك كما هي.
    const extra = dup ? `تنبيه: العنوان «${p.title_ar}» مستعمل لمنتج آخر في المتجر. اكتب عنوانًا مختلفًا عنه يذكر ما يميّز هذه القطعة تحديدًا من النص الصيني: الخامة أو النوع أو الماركة أو المقاس أو عدد القطع.` : undefined;
    const cand = needTitle ? await tr.t(src, 'title', null, extra) : p.title_ar;
    let ok = !!cand && goodTitle(cand) && !brokenTitle(cand, src);
    // عنوان جديد يصطدم بعنوان منتج آخر لا يحلّ شيئًا: نرفضه ونُبقي القديم لتعود المحاولة لاحقًا
    if (ok && cand !== p.title_ar) {
      const clash = await db.prepare('SELECT 1 FROM products WHERE lower(title_ar)=lower(?) AND id<>? LIMIT 1').bind(cand, p.id).first();
      if (clash) ok = false;
    }
    const t = !needTitle ? p.title_ar : ok ? cand : (hasCJK(p.title_ar) ? cand : p.title_ar);
    const sp = await tr.t(p.supplier_name);
    // عنوان صار عربيًا: المنتج المحجوز كمسودة يُنشر الآن (لا يُعرض عنوان صيني للزبونة أبدًا)
    if ((t && t !== p.title_ar) || (sp && sp !== p.supplier_name)) {
      const pub = t && !hasCJK(t) ? ",status=CASE WHEN status='draft' THEN 'active' ELSE status END" : '';
      // العلامة تُمسح فقط إن صار العنوان سليمًا فعلًا — وإلا بقيت ليعود الدور عليه
      const clear = ok ? ',needs_tr=0' : '';
      await db.prepare(`UPDATE products SET title_src=COALESCE(title_src,title_ar),title_ar=?,supplier_name=?${pub}${clear},tr_tries=tr_tries+1 WHERE id=?`).bind(t ?? p.title_ar, sp ?? p.supplier_name, p.id).run(); n++;
    } else {
      // لم يتغيّر شيء: إن كان العنوان سليمًا أصلًا فالعلامة أدّت دورها (سألنا النموذج فعلًا)
      // وتُمسح، وإلا بقي معلّمًا. بدون هذا تعلق العناوين المتكرّرة إلى الأبد وتُعطّل الطابور.
      const ok = !hasCJK(p.title_ar) && goodTitle(p.title_ar) && !brokenTitle(p.title_ar, p.title_src);
      await db.prepare(`UPDATE products SET tr_tries=tr_tries+1${ok ? ',needs_tr=0' : ''} WHERE id=?`).bind(p.id).run();
    }
    tried++;
  }
  // ١٢٠ قيمة لكل دفعة: ٣٠٠ كانت تُطيل الاستدعاء إلى دقائق فتتأخر كل دفعة ويقترب الكرون من حدّه
  // قيم المتغيّرات المكسورة تُعرض للزبونة في منتقي اللون والمقاس مثل «الرetro الأسود» و«خaki»
  const vs = await db.prepare(`SELECT id,color,size FROM variants
     WHERE color GLOB '*[一-龥]*' OR size GLOB '*[一-龥]*'
        OR color GLOB '*[\u0621-\u064A][a-zA-Z]*' OR color GLOB '*[a-zA-Z][\u0621-\u064A]*'
        OR size  GLOB '*[\u0621-\u064A][a-zA-Z]*' OR size  GLOB '*[a-zA-Z][\u0621-\u064A]*' LIMIT 120`).all<any>();
  for (const v of vs.results) { const cc = await tr.t(v.color, 'attr'); const sz = await tr.t(v.size, 'attr'); if (cc !== v.color || sz !== v.size) { await db.prepare('UPDATE variants SET color=?,size=? WHERE id=?').bind(cc, sz, v.id).run(); nv++; } }
  // كم بقي عليه نص لا يُقرأ (صيني أو مكسور) — ليعرف المُشغِّل متى يتوقف
  const left = await db.prepare(`SELECT COUNT(*) n,SUM(status='draft') d FROM products
     WHERE title_ar GLOB '*[一-龥]*' OR ${MASHED} OR ${NO_AR} OR ${BROKEN_SQL}`).first<{ n: number; d: number }>();
  const vLeft = await db.prepare(`SELECT COUNT(*) n FROM variants
     WHERE color GLOB '*[一-龥]*' OR size GLOB '*[一-龥]*'
        OR color GLOB '*[\u0621-\u064A][a-zA-Z]*' OR color GLOB '*[a-zA-Z][\u0621-\u064A]*'
        OR size  GLOB '*[\u0621-\u064A][a-zA-Z]*' OR size  GLOB '*[a-zA-Z][\u0621-\u064A]*'`).first<{ n: number }>();
  const released = await releaseHeldDrafts(db);
  const swept = await sweepMashedTitles(db);
  return { products: n, variants: nv, tried, remaining: left?.n ?? 0, held: left?.d ?? 0, variantsLeft: vLeft?.n ?? 0, released, swept };
}
