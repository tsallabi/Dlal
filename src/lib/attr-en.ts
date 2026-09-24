// قيم الألوان والمقاسات الإنجليزية على الرف (٢٤/٠٩/٢٦): ١٬٤٩٧ منتجًا نشطًا و١٩٬٠٥٦ سطرًا — «Beige»،
// «Navy blue»، «Female XL»، و«2008 double short - black». كانت Translator.t تُعيد أي نص بلا صيني كما هو،
// وعدّادات الإحصاء تبحث عن الصيني والمكسور وحدهما، فبقيت بالإنجليزية أمام الزبونة في منتقي اللون والمقاس.
// وتحتها طبقة ثانية: شظايا من جدول المواصفات قُطّعت بالفواصل فصارت «ألوانًا» — «non-returnable]»،
// «Capacity»، «Main picture»، «Length (cm)»، «skin-friendly». هذه لا تُترجم بل تُحذف من المنتقي.

// ألوان شائعة: القاموس يغطي أكثر ما على الرف بلا استدعاء نموذج (مقيس: black ١١٥٠، White ٥٧١، Pink ٣٩٦ …)
const COLORS: Record<string, string> = {
  black: 'أسود', white: 'أبيض', pink: 'وردي', blue: 'أزرق', red: 'أحمر', green: 'أخضر', brown: 'بني', purple: 'بنفسجي',
  violet: 'بنفسجي', yellow: 'أصفر', orange: 'برتقالي', gray: 'رمادي', grey: 'رمادي', beige: 'بيج', khaki: 'كاكي',
  apricot: 'مشمشي', silver: 'فضي', gold: 'ذهبي', golden: 'ذهبي', champagne: 'شامبانيا', camel: 'جملي', coffee: 'بني قهوة',
  burgundy: 'عنابي', maroon: 'عنابي', navy: 'كحلي', 'navy blue': 'كحلي', 'wine red': 'نبيتي', wine: 'نبيتي', 'sky blue': 'سماوي',
  'royal blue': 'أزرق ملكي', 'peacock blue': 'أزرق طاووسي', 'lake blue': 'أزرق بحري', 'mist blue': 'أزرق ضبابي', 'haze blue': 'أزرق ضبابي',
  'army green': 'أخضر زيتي', 'olive green': 'أخضر زيتي', olive: 'زيتي', 'mint green': 'أخضر نعناعي', mint: 'نعناعي',
  'rose red': 'وردي غامق', rose: 'وردي', 'orange red': 'أحمر برتقالي', 'brick red': 'أحمر طوبي', 'off-white': 'أوف وايت', 'off white': 'أوف وايت',
  'cream white': 'أبيض كريمي', cream: 'كريمي', 'milky white': 'أبيض حليبي', 'milk white': 'أبيض حليبي', 'pure white': 'أبيض ناصع', 'simple white': 'أبيض',
  ivory: 'عاجي', 'all black': 'أسود بالكامل', 'black and white': 'أسود وأبيض', 'black white': 'أسود وأبيض',
  'skin tone': 'لون البشرة', 'skin color': 'لون البشرة', nude: 'لون البشرة', 'fluorescent yellow': 'أصفر فسفوري', fluorescent: 'فسفوري',
  'leopard print': 'نمري', leopard: 'نمري', caramel: 'كراميل', lilac: 'ليلكي', lavender: 'لافندر', 'taro purple': 'ليلكي', fuchsia: 'فوشيا',
  turquoise: 'فيروزي', teal: 'أزرق مخضر', cyan: 'سماوي', coral: 'مرجاني', peach: 'خوخي', tan: 'جملي فاتح', 'rose gold': 'ذهبي وردي',
  rosewood: 'خشب الورد', 'red sandalwood': 'خشب الصندل الأحمر', 'black walnut': 'خشب الجوز', walnut: 'خشب الجوز', 'classic gray': 'رمادي كلاسيكي', 'classic grey': 'رمادي كلاسيكي',
  transparent: 'شفاف', clear: 'شفاف', multicolor: 'متعدد الألوان', colorful: 'متعدد الألوان', 'mixed colors': 'ألوان مشكلة', random: 'لون عشوائي', 'random color': 'لون عشوائي',
  lined: 'مبطّن', 'fleece-lined': 'مبطّن بالفرو', 'fleece lined': 'مبطّن بالفرو', 'lilac purple': 'ليلكي', 'jujube red': 'أحمر عنابي', 'dark blue': 'أزرق غامق', 'deep blue': 'أزرق غامق', 'light blue': 'أزرق فاتح', 'as shown in picture': 'كما في الصورة', 'as shown in the picture': 'كما في الصورة', 'as shown in the figure': 'كما في الصورة', 'real shot images': 'كما في الصورة', 'real shot': 'كما في الصورة',
  printed: 'مطبوع', floral: 'مزهّر', striped: 'مخطط', plaid: 'كاروهات', 'dusty pink': 'وردي باهت',
  'as picture': 'كما في الصورة', 'as shown': 'كما في الصورة', 'picture color': 'كما في الصورة', 'image color': 'كما في الصورة', 'photo color': 'كما في الصورة',
  'main picture': 'كما في الصورة', 'main picture model': 'كما في الصورة', 'main picture style': 'كما في الصورة', 'same as picture': 'كما في الصورة', 'as the picture': 'كما في الصورة',
  image: 'كما في الصورة', picture: 'كما في الصورة', photo: 'كما في الصورة',
};
const SHADE: Record<string, string> = { light: 'فاتح', dark: 'غامق', deep: 'غامق', pale: 'باهت', bright: 'فاتح' };
const WHO: [RegExp, string][] = [[/^(men'?s|male|man'?s|mens)\s+/i, 'رجالي'], [/^(women'?s|female|ladies|lady'?s|womens)\s+/i, 'نسائي'], [/^(kids'?|children'?s|child)\s+/i, 'أطفال']];

// شظايا جدول المواصفات: رأس عمود أو صفة دعائية وليست لونًا ولا مقاسًا
const JUNK = new Set([
  'capacity', 'specifications', 'specification', 'size specifications', 'size specification', 'net content', 'weight', 'length', 'length (cm)', 'length(cm)',
  'length cm', 'suitable height', 'suitable for height', 'applicable number of people', 'safe and odorless', 'skin-friendly', 'skin friendly', 'lightweight', 'wear-resistant',
  'wear resistant', 'non-slip', 'non slip', 'non-returnable', 'no returns or exchanges', 'no return', 'newly upgraded', 'upgraded version', 'high quality',
  'reinforced and strengthened', 'comfortable', 'breathable', 'durable', 'soft', 'with lining', 'with fleece lining', 'material', 'style', 'size', 'color', 'colour',
  'جميع المقاسات متوفرة', 'جميع المقاسات', 'المقاسات متوفرة',
]);
const bare = (v: string) => v.toLowerCase().replace(/[\[\]【】()（）"'“”]/g, ' ').replace(/\s+/g, ' ').trim();
export function junkAttr(v: string | null | undefined): boolean {
  const t = String(v ?? '').trim();
  if (!t) return false;
  if (JUNK.has(bare(t))) return true;
  // «Specifications (length*width)»، «Parameters»، «المواصفات (الطول * العرض)»: رأس جدول لا خيار
  if (/^(size\s+)?(specifications?|parameters?|product parameters)\b/i.test(t) || /^(ال)?مواصفات/.test(t)) return true;
  // «Weight: S: 530g XXL: 600g» و«حجم المادة: حرير الحليب 230 جرام…» — وصف لا قيمة
  if (/[:：]/.test(t) && (t.length > 20 || /\d/.test(t))) return true;
  return false;
}

// كلمة لاتينية لا تُفهم بالعربية؟ المقاسات والوحدات ورموز الطراز (K06، B72، 4008) تبقى كما هي
const KEEP = /^(x{0,6}s|x{0,7}l|m|[2-9]xl|x{0,6}l|cm|mm|kg|ml|mah|usb|led|lcd|hd|abc|pro|max|mini|plus|iphone|ipad|type-?c|eu|us|uk)$/i;
export function needsEnTr(v: string | null | undefined): boolean {
  const t = String(v ?? '');
  if (!t || /[؀-ۿ]/.test(t) || /[一-鿿]/.test(t)) return false;
  return (t.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).some(w => w.replace(/[-']/g, '').length >= 3 && !KEEP.test(w.replace(/'/g, '')));
}

const kgRange = (s: string) => { const m = s.match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)\s*(kg|jin|斤)?/i); return m ? ` (${m[1]}-${m[2]}${m[3] && /kg/i.test(m[3]) ? ' كغ' : ''})` : ''; };
const SIZE_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|XXXXXL|[2-7]XL)\b/i;

// ترجمة بالقاموس بلا نموذج؛ null = يحتاج النموذج
export function enAttr(raw: string): string | null {
  let t = raw.trim().replace(/\s+/g, ' ');
  // «Purple [main picture]»، «XL【European size in stock】»، «40 [Standard Size]»: الحاشية ضجيج
  t = t.replace(/[\[【(（]\s*(main picture|standard size|positive code|regular code|european size in stock|in stock|hot sale|new)\s*[\]】)）]/gi, '').trim();
  let who = '';
  for (const [re, ar] of WHO) if (re.test(t)) { who = ar; t = t.replace(re, '').trim(); }
  const low = t.toLowerCase().replace(/\s+(colou?r)$/, '').trim();
  const add = (s: string) => (who ? `${s} ${who}` : s);
  if (COLORS[low]) return add(COLORS[low]);
  const one = (c: string): string | null => { const x = c.trim(); if (COLORS[x]) return COLORS[x]; const m = x.match(/^(light|dark|deep|pale|bright)\s+(.+)$/); return m && COLORS[m[2]] ? `${COLORS[m[2]]} ${SHADE[m[1]]}` : null; };
  if (one(low)) return add(one(low)!);
  // لونان معًا: «black-green»، «black and white»
  const two = low.split(/\s*(?:-|&|\/|\band\b)\s*/).filter(Boolean);
  if (two.length === 2 && one(two[0]) && one(two[1])) return add(`${one(two[0])} و${one(two[1])}`);
  // رمز طراز ثم لون: «B72 black»، «K06 black-green» — الرمز يبقى، واللون يُترجم
  const code = t.match(/^([A-Za-z]{0,3}\d{1,5}[A-Za-z]?)\s+(.+)$/);
  if (code) { const rest = enAttr(code[2]); if (rest && !needsEnTr(rest)) return add(`${code[1].toUpperCase()} ${rest}`); }
  // المقاسات
  if (/^(one size( fits all)?|free size|all yards|all code|average size|universal|one size fits most)\b/i.test(low)) return add('مقاس واحد' + kgRange(low));
  if (/^large size$/.test(low)) return add('مقاس كبير');
  if (/^small size$/.test(low)) return add('مقاس صغير');
  if (/^(medium|middle) size$/.test(low)) return add('مقاس متوسط');
  if (/^(normal|standard|regular) size$/.test(low)) return add('مقاس عادي');
  const sz = t.match(SIZE_TOKEN);
  // «L size»، «Size L»، «M [recommendation 40-50kg]»، «Female XL»، «4xl (recommended 80-90kg )»
  if (sz && /^(size\s+)?\S+(\s+size)?(\s*[\[(（【].*(recommend|kg|weight).*)?$/i.test(t)) return add(sz[1].toUpperCase() + kgRange(t));
  // مقاس رقمي بحاشية: «40 [Standard Size]» بعد حذفها صار «40»
  if (/^\d{2,3}(\.\d)?$/.test(t) || /^\d{2}-\d{2}$/.test(t)) return add(t);
  const szn = t.match(/^size\s*(\d{2,3}(?:\.\d)?)$/i); if (szn) return add(`مقاس ${szn[1]}`);   // «Size 36»
  // «44-45 recommended 43-44 feet»: مقاس حذاء وتحته مقاس القدم المناسب
  const shoe = t.match(/^(\d{2}-\d{2})\s*(?:\[\s*)?recommended\s+(\d{2}-\d{2})\s*(feet|foot)?\s*\]?$/i);
  if (shoe) return add(`${shoe[1]} (يناسب قدم ${shoe[2]})`);
  // «Blue1»، «Blue 2»: لون ورقم تصميم
  const num = low.match(/^([a-z][a-z ]*?)\s*(\d{1,2})$/);
  if (num && one(num[1])) return add(`${one(num[1])} ${num[2]}`);
  return null;
}

// «Xxl»، «xl»: رمز مقاس لاتيني صحيح لكن بحروف مختلطة — يُوحَّد كبيرًا ولا يحتاج ترجمة
export const sizeCase = (v: string): string | null => /^(x{0,6}[sl]|m|[2-9]xl)$/i.test(v.trim()) && v.trim() !== v.trim().toUpperCase() ? v.trim().toUpperCase() : null;

// اللون في الأصل يجب أن يبقى في الترجمة: النموذج كان يُسقطه («double short-coffee» ⟵ «قميص قصير»)
const GUARD: Record<string, string[]> = {
  black: ['أسود'], white: ['أبيض'], pink: ['وردي', 'زهري'], blue: ['أزرق', 'كحلي', 'سماوي'], red: ['أحمر', 'نبيتي', 'عنابي'], green: ['أخضر', 'زيتي'],
  brown: ['بني'], purple: ['بنفسجي', 'ليلكي', 'أرجواني'], violet: ['بنفسجي'], yellow: ['أصفر'], orange: ['برتقالي'], gray: ['رمادي'], grey: ['رمادي'],
  beige: ['بيج'], khaki: ['كاكي'], silver: ['فضي'], gold: ['ذهبي'], golden: ['ذهبي'], navy: ['كحلي', 'بحري'], apricot: ['مشمشي'],
  burgundy: ['عنابي', 'بورغندي', 'برغندي', 'خمري', 'نبيتي', 'أحمر'], champagne: ['شامبانيا', 'شمبانيا'], coffee: ['قهوة', 'قهوي', 'بني'], camel: ['جملي', 'بني'],
};
// كلمة عربية بصيغتها الأساسية: بلا «ال» ولا تاء التأنيث، والمؤنث اللوني إلى مذكّره (سوداء ⟵ أسود)
const FEM: Record<string, string> = { سوداء: 'أسود', بيضاء: 'أبيض', حمراء: 'أحمر', خضراء: 'أخضر', زرقاء: 'أزرق', صفراء: 'أصفر' };
const base = (w: string) => { const x = w.replace(/^(و?ب?ال|ال)(?=..)/, ''); return FEM[x] ?? x.replace(/ة$/, ''); };
export function colorsKept(src: string, out: string): boolean {
  const low = src.toLowerCase(), have = new Set(out.split(/[\s\-–/+،,()]+/).map(base));
  return Object.entries(GUARD).filter(([c]) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(low)).every(([, ok]) => ok.some(w => have.has(w)));
}
