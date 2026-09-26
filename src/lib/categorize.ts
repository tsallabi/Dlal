// تصنيف بعنوان المنتج (٢٦/٠٩/٢٦، طلب صاحب المشروع: «اجلب السلع التي يتوفر شبيهها في شي إن وتيمو»).
// أقسام شي إن الأساسية التي لم تكن عندنا: البناطيل والتنانير، الجاكيتات والمعاطف، ملابس الرجال، الملابس الرياضية.
// الجلب المجاني يُدخل المنتج بقسم الصفحة التي وُجد فيه رابطه (توصيات صفحة فستان فيها تنانير وجاكيتات)،
// ومهام البحث تُدخل كل نتائج «连衣裙» فساتين ولو كانت تنورة — فكان على الرف الحي ~800 بنطال وتنورة
// و~500 جاكيت مدفونة في «فساتين» و«بلوزات». هنا نقرأ العنوان (عربي، صيني، إنجليزي) ونعطي القسم الصحيح.
// **محافظ عمدًا**: لا ننقل إلا إلى هذه الأقسام الأربعة، ولا ننقل إلا من أقسام الأزياء (لا من الأدوات ولا من
// المنزل)، ولا نمسّ بضاعة الأطفال (لها قسمها) ولا ما حكمت عليه الحشمة (ملابس داخلية ونوم لها قسمها).

export const FASHION_SLUGS = ['dresses', 'abayas', 'tops', 'bottoms', 'outerwear', 'men', 'sportswear', 'lingerie', 'hijab', 'shoes', 'bags', 'accessories', 'beauty', 'kids'];
// الأقسام التي يجوز النقل منها إلى الأقسام الجديدة
const MOVABLE = new Set(['dresses', 'abayas', 'tops', 'men-acc', 'sports', 'hijab', 'accessories', 'bottoms', 'outerwear', 'men', 'sportswear']);

// بضاعة أطفال تبقى في قسمها مهما كان نوعها
const KIDS = /童|儿童|婴|宝宝|亲子|\b(kids?|children|child|baby|toddler|boys?|girls?|infant)\b|أطفال|طفل|بيبي|ولادي|بناتي|رضيع|مواليد/i;
// كلمة ملبس: تشترطها قواعد الرجال والرياضة حتى لا تُنقل ساعة رجالية أو قارورة رياضية
const GARMENT = /衬衫|T恤|裤|外套|夹克|卫衣|毛衣|西装|短袖|长袖|polo|上衣|背心|风衣|大衣|针织|قميص|تيشيرت|تي شيرت|بنطال|بنطلون|جاكيت|جاكت|بدلة|سويتر|هودي|بولو|شورت|جينز|معطف|سترة|بلوزة|كنزة|\b(shirt|t-?shirt|tee|pants|trousers|jeans|jacket|hoodie|suit|polo|shorts|sweater|coat|sweatshirt|tracksuit|blazer|cardigan|vest|top)\b/i;

const RULES: { slug: string; re: RegExp; need?: RegExp; not?: RegExp }[] = [
  // ملابس رياضية: كلمة رياضة + ملبس («运动鞋» حذاء لا ملبس، و«运动内衣» تحكمها الحشمة قبلنا)
  { slug: 'sportswear', re: /瑜伽服|瑜伽裤|健身服|运动套装|运动裤|运动短裤|速干|骑行服|运动T恤|运动卫衣|运动上衣|运动背心|ملابس رياضية|بدلة رياضية|طقم رياضي|بنطال رياضي|ليقنز رياضي|ليغنز رياضي|تيشيرت رياضي|يوغا|يوجا|\b(sportswear|activewear|tracksuit|yoga (pants|set|leggings|top|suit)|gym (set|wear|leggings|shorts)|running (shorts|tights|top)|quick[- ]dry)\b/i, not: /鞋|حذاء|\bshoes?\b|袜|جورب|\bsocks?\b|水壶|قارورة|\bbottle\b/i },
  // ملابس رجالية: «رجالي» + ملبس (الساعة والحزام والمحفظة تبقى في «إكسسوارات رجالية»)
  // «男裤腰带» حزام و«哑铃男士套装» دمبل: كلمة الملبس داخل اسم إكسسوار أو عدّة لا تنقل
  { slug: 'men', re: /男士|男装|男款|男式|رجالي|للرجال|\bmen'?s?\b|\bmale\b/i, need: GARMENT, not: /鞋|حذاء|\bshoes?\b|男童|女|腰带|皮带|裤带|手表|腕表|钱包|领带|背包|眼镜|墨镜|剃须|刮胡|哑铃|器材|护具|护膝|护腕|水壶|手机|ساعة|حزام|محفظة|ربطة عنق|حقيبة|نظارة|شفرة|دمبل|\b(watch|belt|wallet|backpack|bag|dumbbell|razor|glasses)\b/i },
  // جاكيتات ومعاطف («开衫» الكارديغان الطويل في العبايات يبقى: نستثني ما فيه 长款 من قسم العبايات في المنطق أدناه)
  // «开衫» وحدها تعني أيضًا قميصًا مفتوح الأزرار وشالًا؛ نشترطها مع «针织/外套» ونستثني القمصان
  { slug: 'outerwear', re: /外套|夹克|大衣|风衣|羽绒服|棉服|棉衣|皮衣|西装外套|针织开衫|开衫外套|毛衣开衫|جاكيت|جاكت|معطف|سترة|كارديغان|كارديجان|بليزر|بلايزر|بلازر|\b(jacket|coat|cardigan|blazer|trench|parka|windbreaker|puffer|overcoat|outerwear)\b/i, not: /毛衣链|衬衫|衬衣|سترة نجاة|救生|\blife (jacket|vest)\b|\bcase\b|حافظة|غطاء/i },
  // بناطيل وتنانير («连衣裙» فستان و«长裙» فستان طويل/عباية يبقيان، و«内裤» تحكمها الحشمة، و«裙子» تنورة)
  { slug: 'bottoms', re: /半身裙|短裙|百褶裙|牛仔裙|包臀裙|裙子|牛仔裤|阔腿裤|打底裤|短裤|休闲裤|西裤|西装裤|工装裤|哈伦裤|直筒裤|喇叭裤|瑜伽裤|长裤|裤子|بنطال|بنطلون|بناطيل|جينز|تنورة|تنانير|شورت|ليقنز|ليغنز|ليجنز|\b(pants|trousers|jeans|skirt|shorts|leggings|culottes|joggers|palazzo)\b/i, not: /连衣裙|长裙|内裤|裤袜|فستان|سروال داخلي|\bdress\b|\bpanties\b|\btights\b|\bpantyhose\b|حزام|\bbelt\b|علاقة|\bhanger\b|شمّاعة/i },
];

export type CatLite = { id: number; slug: string };

// القسم الأنسب من العنوان، أو null إن لم تُوجب قاعدة نقلًا (يبقى في قسمه)
export function guessCategory(texts: (string | null | undefined)[], curSlug: string | null | undefined): string | null {
  const t = texts.filter(Boolean).join(' · ');
  if (!t) return null;
  if (curSlug && !MOVABLE.has(curSlug)) return null;
  if (KIDS.test(t)) return null;
  for (const r of RULES) {
    if (!r.re.test(t)) continue;
    if (r.not && r.not.test(t)) continue;
    if (r.need && !r.need.test(t)) continue;
    // الكارديغان الطويل المفتوح في «عبايات» ملبس محتشم عندنا لا جاكيت
    if (r.slug === 'outerwear' && curSlug === 'abayas' && /长款|طويل/.test(t)) return null;
    return r.slug === curSlug ? null : r.slug;
  }
  return null;
}

// مرور دوري على الرف: يُصلح ما دخل قبل هذا التصنيف. مؤشّر بالمعرّف في settings (cat_sweep_id) فلا يعيد نفس الدفعة.
// حين يبلغ آخر الرف يعود إلى الصفر بعد أسبوع (يكفي: الاستيراد نفسه يصنّف الجديد).
export async function categorySweep(db: D1Database, cats: CatLite[], limit = 1500): Promise<{ scanned: number; moved: number; last: number; done: boolean }> {
  const bySlug = new Map(cats.map(c => [c.slug, c.id])), byId = new Map(cats.map(c => [c.id, c.slug]));
  const need = ['bottoms', 'outerwear', 'men', 'sportswear'];
  if (need.some(s => !bySlug.has(s))) return { scanned: 0, moved: 0, last: 0, done: true };
  const st = await db.prepare("SELECT key,value FROM settings WHERE key IN ('cat_sweep_id','cat_sweep_done_at')").all<{ key: string; value: string }>();
  const get = (k: string) => st.results.find(r => r.key === k)?.value ?? '';
  let after = parseInt(get('cat_sweep_id')) || 0;
  const doneAt = get('cat_sweep_done_at');
  if (after === 0 && doneAt && Date.now() - new Date(doneAt + 'Z').getTime() < 7 * 86400000) return { scanned: 0, moved: 0, last: 0, done: true };
  const movable = cats.filter(c => MOVABLE.has(c.slug)).map(c => c.id).filter(Number.isInteger);
  if (!movable.length) return { scanned: 0, moved: 0, last: 0, done: true };
  const { results } = await db.prepare(`SELECT id,title_ar,title_src,category_id FROM products WHERE id>? AND status IN ('active','draft','hidden') AND category_id IN (${movable.join(',')}) ORDER BY id LIMIT ?`)
    .bind(after, limit).all<{ id: number; title_ar: string; title_src: string | null; category_id: number }>();
  const moves = new Map<number, number[]>();
  for (const r of results) {
    const to = guessCategory([r.title_src, r.title_ar], byId.get(r.category_id) ?? null);
    const toId = to ? bySlug.get(to) : undefined;
    if (toId && toId !== r.category_id) moves.set(toId, [...(moves.get(toId) ?? []), r.id]);
  }
  let moved = 0;
  for (const [toId, ids] of moves) for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).filter(Number.isInteger);
    await db.prepare(`UPDATE products SET category_id=${toId} WHERE id IN (${chunk.join(',')})`).run();
    moved += chunk.length;
  }
  const last = results.length ? results[results.length - 1].id : 0;
  const done = results.length < limit;
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('cat_sweep_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(done ? 0 : last)),
    ...(done ? [db.prepare("INSERT INTO settings(key,value) VALUES('cat_sweep_done_at',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value")] : []),
  ]);
  return { scanned: results.length, moved, last, done };
}
