import { MANUAL } from './attr-manual';
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
  'fog blue': 'أزرق ضبابي', 'earthy brown': 'بني ترابي', 'turquoise green': 'أخضر فيروزي', 'strawberry red': 'أحمر فراولة', bordeaux: 'عنابي', 'bordeaux red': 'عنابي', 'bean red': 'أحمر طوبي', 'aqua blue': 'أزرق مائي', aqua: 'أزرق مائي', lined: 'مبطّن', 'fleece-lined': 'مبطّن بالفرو', 'fleece lined': 'مبطّن بالفرو', 'lilac purple': 'ليلكي', 'jujube red': 'أحمر عنابي', 'dark blue': 'أزرق غامق', 'deep blue': 'أزرق غامق', 'light blue': 'أزرق فاتح', 'as shown in picture': 'كما في الصورة', 'as shown in the picture': 'كما في الصورة', 'as shown in the figure': 'كما في الصورة', 'real shot images': 'كما في الصورة', 'real shot': 'كما في الصورة',
  printed: 'مطبوع', floral: 'مزهّر', striped: 'مخطط', plaid: 'كاروهات', 'dusty pink': 'وردي باهت',
  'as picture': 'كما في الصورة', 'as shown': 'كما في الصورة', 'picture color': 'كما في الصورة', 'image color': 'كما في الصورة', 'photo color': 'كما في الصورة',
  'main picture': 'كما في الصورة', 'main picture model': 'كما في الصورة', 'main picture style': 'كما في الصورة', 'same as picture': 'كما في الصورة', 'as the picture': 'كما في الصورة',
  image: 'كما في الصورة', picture: 'كما في الصورة', photo: 'كما في الصورة',
};
const SETS: Record<string, string> = { 'double short': 'نصف كم وشورت', 'short long': 'نصف كم وبنطلون طويل', 'double long': 'كم طويل وبنطلون طويل', 'long short': 'كم طويل وشورت' };
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
  // «detail.1688.com»، «694844693951.html?sp»: رابط المورّد التصق بجدول المواصفات
  if (/1688\.com|\.html?\b|https?:|www\./i.test(t)) return true;
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
  // كلمة ملتصقة برقم رمزُ طراز («PPA17»، «MJL925»، «Jltx02–fc0003») لا إنجليزية — إلا إن كانت لونًا («Blue1») أو «5customized»
  return t.split(/\s+/).some(tok => {
    const words = tok.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    if (/\d/.test(tok)) return words.some(w => !!COLORS[w.toLowerCase()] || /^customi[sz]ed$/i.test(w));
    return words.some(w => w.replace(/[-']/g, '').length >= 3 && !KEEP.test(w.replace(/'/g, '')));
  });
}

const GARMENT: Record<string, string> = { dress: 'فستان', shawl: 'شال', skirt: 'تنورة', coat: 'معطف', jacket: 'جاكيت', shirt: 'قميص', pants: 'بنطلون', trousers: 'بنطلون', scarf: 'وشاح', hat: 'قبعة', bag: 'حقيبة' };
const VARIANT_WORD: Record<string, string> = { 'silver fox fleece': 'مبطّن بفرو ناعم', 'silver fox velvet': 'مبطّن بفرو ناعم', 'fleece style': 'مبطّن بالفرو', 'fleece': 'مبطّن بالفرو', 'spring and autumn': 'ربيعي وخريفي', 'suit style': 'بدلة', 'regular style': 'عادي', petite: 'لقصيرات القامة', 'tall guy': 'لطوال القامة', 'little guy': 'لقصار القامة', twill: 'قماش تويل', corrugated: 'مموّج', ripple: 'مموّج', 'chiffon print': 'شيفون مطبوع', 'new model': 'موديل جديد', 'new style': 'موديل جديد', 'upgraded version': 'نسخة مطوّرة', 'upgraded': 'نسخة مطوّرة', regular: 'عادي', 'regular model': 'موديل عادي', standard: 'قياسي', 'already made': 'جاهز', 'high quality version': 'نسخة عالية الجودة' };
// أطول بداية لونية في القيمة ثم ما بعدها: «Yellow and black leopard print» ⟵ {أصفر وأسود، leopard print}
function leadColor(t: string, one: (c: string) => string | null): { c: string; rest: string } | null {
  const words = t.replace(/[-–]\s*\(/g, ' (').replace(/(\S)([\[【(（])/g, '$1 $2').replace(/[-–](?=[A-Za-z]{1,4}\d)/g, ' ').replace(/\s*[-–]\s*$/, '').split(/\s+/);
  for (let k = Math.min(5, words.length - 1); k >= 1; k--) {
    const ph = words.slice(0, k).join(' ').toLowerCase().replace(/\s+colou?r$/, '').replace(/[-–]$/, '').trim();
    const both = ph.match(/^(.+?) and (.+)$/);
    const c = one(ph) ?? (both && one(both[1]) && one(both[2]) ? `${one(both[1])} و${one(both[2])}` : null);
    if (c) return { c, rest: words.slice(k).join(' ').replace(/^colou?r\s+/i, '').replace(/^[\[【(（]\s*(.*?)\s*[\]】)）]$/, '$1').trim() };
  }
  return null;
}
const kgRange = (s: string) => { const m = s.match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)\s*(kg|jin|斤)?/i); return m ? ` (${m[1]}-${m[2]}${m[3] && /kg/i.test(m[3]) ? ' كغ' : ''})` : ''; };
const SIZE_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|XXXXXL|[2-7]XL)\b/i;

// ترجمة بالقاموس بلا نموذج؛ null = يحتاج النموذج
export function enAttr(raw: string): string | null {
  const man = MANUAL[raw.trim().replace(/\s+/g, ' ').toLowerCase()]; if (man) return man;
  let t = raw.trim().replace(/\s+/g, ' ');
  // «Purple [main picture]»، «XL【European size in stock】»، «40 [Standard Size]»: الحاشية ضجيج
  t = t.replace(/[\[【(（]\s*(main picture|standard size|positive code|regular code|european size in stock|in stock|hot sale|new)\s*[\]】)）]/gi, '').trim();
  // «navy blue]» قوس يتيم، «Navy blue*809» نجمة بدل المسافة، «Apricot-colored»
  if (!/[\[【(（]/.test(t)) t = t.replace(/[\]】)）]+$/, '').trim();
  t = t.replace(/\*/g, ' ').replace(/[-\s]colou?red$/i, '').replace(/\s+/g, ' ').trim();
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
  // طقم البيجامة: «double short-pink» = 双短 نصف كم وشورت، «short long» = 短长 نصف كم وبنطلون طويل (٢٤/٠٩/٢٦:
  // النموذج أعطاها «قميص قصير» و«قصير جداً» وضاع اللون)
  const setw = low.match(/^(double short|short long|double long|long short)\s+(women|woman|ladies|men|man)\s*[-–]\s*(.+)$/);   // «Double short women-navy blue»
  if (setw && one(setw[3].trim())) return add(`${SETS[setw[1]]} ${/^(wom|lad)/.test(setw[2]) ? 'نسائي' : 'رجالي'} - ${one(setw[3].trim())}`);
  const set = low.match(/^(double short|short long|double long|long short)\s*[-–]?\s*(.+)$/);
  if (set && one(set[2].trim())) return add(`${SETS[set[1]]} - ${one(set[2].trim())}`);
  // رمز طراز ثم لون: «B72 black»، «K06 black-green» — الرمز يبقى، واللون يُترجم
  // و«2333 # Wine red»، «1609#apricot»، «Ybl-t218 navy»، «JEPJ navy blue»
  const code = t.match(/^([A-Za-z]{0,4}\d{1,6}[A-Za-z]?|[A-Za-z]{1,4}[-–][A-Za-z]?\d{1,5}|[A-Z]{2,5})\s*(?:#\s*|\s+|[-–]\s*(?=[A-Za-z]))(.+)$/);
  if (code && code[2] !== t) { const rest = enAttr(code[2]); if (rest && !needsEnTr(rest)) return add(`${code[1].toUpperCase()} ${rest}`); }
  // المقاسات
  if (/^(one size( fits all)?|free size|all yards|all code|average size|universal|one size fits most)\b/i.test(low)) return add('مقاس واحد' + kgRange(low));
  if (/^large size$/.test(low)) return add('مقاس كبير');
  if (/^small size$/.test(low)) return add('مقاس صغير');
  if (/^(medium|middle) size$/.test(low)) return add('مقاس متوسط');
  if (/^(normal|standard|regular) size$/.test(low)) return add('مقاس عادي');
  const sz = t.match(SIZE_TOKEN);
  // «L size»، «Size L»، «M [recommendation 40-50kg]»، «Female XL»، «4xl (recommended 80-90kg )»
  if (sz && /^(size\s+)?\S+(\s+size)?(\s*[\[(（【].*(recommend|suggest|kg|weight).*|\s+(is\s+)?(recommend(ed|ation|s)?|suggest(ed|ion|s)?)\b[^A-Za-z]*(kg|jin)?\s*\)?)?$/i.test(t)) return add(sz[1].toUpperCase() + kgRange(t));
  // مقاس رقمي بحاشية: «40 [Standard Size]» بعد حذفها صار «40»
  if (/^\d{2,3}(\.\d)?$/.test(t) || /^\d{2}-\d{2}$/.test(t)) return add(t);
  const szn = t.match(/^size\s*(\d{2,3}(?:\.\d)?)$/i); if (szn) return add(`مقاس ${szn[1]}`);   // «Size 36»
  // «44-45 recommended 43-44 feet»: مقاس حذاء وتحته مقاس القدم المناسب
  const shoe = t.match(/^(\d{2}-\d{2})\s*(?:\[\s*)?recommended\s+(\d{2}-\d{2})\s*(feet|foot)?\s*\]?$/i);
  const shoe2 = t.match(/^(\d{2}-\d{2})\s*[(\[（]\s*(\d{2}-\d{2})\s*(feet|foot)\s*recommended\s*[)\]）]$/i);   // «36-37 (35-36 feet recommended)»
  if (shoe2) return add(`${shoe2[1]} (يناسب قدم ${shoe2[2]})`);
  if (shoe) return add(`${shoe[1]} (يناسب قدم ${shoe[2]})`);
  // «Blue1»، «Blue 2»: لون ورقم تصميم
  const num = low.match(/^([a-z][a-z ]*?)\s*(\d{1,2})$/);
  if (num && one(num[1])) return add(`${one(num[1])} ${num[2]}`);
  // «and yellow»: شظيّة من «Black and yellow» قُطّعت عند الفاصلة
  const andc = low.match(/^and\s+(.+)$/); if (andc && one(andc[1])) return add(one(andc[1])!);
  const skirt = t.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-7]XL)\s*[【\[(（]?\s*(skirt|dress|pants) length\s*(\d+(?:\.\d+)?)\s*cm\s*[】\])）]?$/i);   // «M【skirt length 90cm】»
  if (skirt) return add(`${skirt[1].toUpperCase()} (طول ${({ skirt: 'التنورة', dress: 'الفستان', pants: 'البنطلون' } as any)[skirt[2].toLowerCase()]} ${skirt[3]} سم)`);
  const cust = low.match(/^(\d{1,3})\s*customi[sz]ed$/); if (cust) return add(`تصميم خاص ${cust[1]}`);   // «5customized»
  // «M pure cotton 210g 40-50kg»، «Lpure cotton…»: المقاس ملتصق أحيانًا
  const cot = t.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-7]XL)\s*pure cotton\s*(\d+)\s*g\s*(\d+(?:\.\d+)?-\d+(?:\.\d+)?)\s*(kg)?$/i);
  if (cot) return add(`${cot[1].toUpperCase()} قطن خالص ${cot[2]} غ (${cot[3]}${cot[4] ? ' كغ' : ''})`);
  // لون ثم وصف: «Apricot 9cm»، «Off-white 4cm high heel»، «Khaki leopard print»، «Navy blue A-line skirt»، «Royal Blue-Z142»
  const lead = leadColor(t, one);
  if (lead) {
    const c = lead.c, rest = lead.rest.replace(/^[-–]\s*/, ''), r = rest.toLowerCase();
    let m: RegExpMatchArray | null;
    if ((m = r.match(/^(\d+(?:\.\d+)?)\s*cm$/))) return add(`${c} ${m[1]} سم`);
    if ((m = rest.match(/^(\d+(?:\.\d+)?)\s*cm\s+([A-Za-z]{0,4}\d[\w-]*)$/i))) return add(`${c} ${m[1]} سم ${m[2].toUpperCase()}`);   // «Off-white 5.5 cm 6102-1»
    // «new model»، «[Upgraded Version]»، «(regular)» تُترجم ولا تُحذف: «Navy blue» و«Navy blue new model» خياران مختلفان في المنتج نفسه
    if (VARIANT_WORD[r]) return add(`${c} ${VARIANT_WORD[r]}`);
    if ((m = r.match(/^(\d+(?:\.\d+)?)\s*cm\s+(buckle|smooth board|smooth panel)$/))) return add(`${c} ${m[1]} سم ${m[2] === 'buckle' ? 'بإبزيم' : 'بلوحة ملساء'}`);   // أحزمة
    if ((m = r.match(/^dress length\s*(\d+(?:\.\d+)?)\s*cm$/))) return add(`فستان ${c} طول ${m[1]} سم`);
    if ((m = r.match(/^(dress|shawl|skirt|coat|jacket|shirt|pants|trousers|scarf|hat|bag)$/))) return add(`${GARMENT[m[1]]} ${c}`);
    if ((m = r.match(/^(\d+(?:\.\d+)?)\s*cm\s+high[- ]heels?$/))) return add(`${c} كعب ${m[1]} سم`);
    if (/^(with )?(lining|lined)$/.test(r)) return add(`${c} مبطّن`);
    if (/^(with )?(fleece[- ]lined|fleece lining|velvet lining)$/.test(r)) return add(`${c} مبطّن بالفرو`);
    if (/^(with rhinestones?|\(?rhinestone style\)?)$/.test(r)) return add(`${c} مرصّع بالستراس`);
    if (/^leopard( print)?$/.test(r)) return add(`نمري ${c}`);
    if (/^a-line skirt$/.test(r)) return add(`تنورة قصة A ${c}`);
    if (/^a-line dress$/.test(r)) return add(`فستان قصة A ${c}`);
    if ((m = r.match(/^with (.+?) (lettering|letters|words|print)$/)) && one(m[1])) return add(`${c} بكتابة ${one(m[1])}`);
    if ((m = rest.match(/^([A-Za-z]{0,4}[-–]?\d[\w–-]*)$/))) return add(`${c} ${m[1].toUpperCase()}`);
  }
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
  // «أسود وأبيض»: واو العطف ملتصقة — نضيف الكلمة بدونها أيضًا (لا نحذفها وحدها: «وردي» تبدأ بواو)
  const words = out.split(/[\s\-–/+،,()]+/);
  const low = src.toLowerCase(), have = new Set([...words.map(base), ...words.filter(w => /^و../.test(w)).map(w => base(w.slice(1)))]);
  return Object.entries(GUARD).filter(([c]) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(low)).every(([, ok]) => ok.some(w => have.has(w)));
}
