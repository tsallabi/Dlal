// ترجمة بيانات 1688 إلى العربية: قاموس فوري للألوان والمقاسات الشائعة + Workers AI (m2m100) للباقي + ذاكرة ترجمة في القاعدة
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
  return null;
}

export async function translateZhAr(ai: any, text: string): Promise<string | null> {
  if (!ai || !text) return null;
  try {
    const r: any = await ai.run('@cf/meta/m2m100-1.2b', { text: text.slice(0, 300), source_lang: 'chinese', target_lang: 'arabic' });
    const t = (r?.translated_text ?? '').trim();
    return t && !hasCJK(t) ? t.slice(0, 200) : null;
  } catch { return null; }
}

// ترجمة مع ذاكرة: قاموس → ذاكرة القاعدة → الذكاء الاصطناعي
export class Translator {
  private mem = new Map<string, string>();
  public aiCalls = 0;
  constructor(private db: D1Database, private ai: any, private maxAi = 80) {}
  async t(text: string | null | undefined, kind: 'text' | 'attr' = 'text'): Promise<string | null> {
    if (!text || !hasCJK(text)) return text ?? null;
    const k = norm(text);
    if (this.mem.has(k)) return this.mem.get(k)!;
    const d = kind === 'attr' ? dictTranslate(k) : null;
    if (d !== null) { this.mem.set(k, d); return d; }
    const row = await this.db.prepare('SELECT dst FROM translations WHERE src=?').bind(k).first<{ dst: string }>().catch(() => null);
    if (row) { this.mem.set(k, row.dst); return row.dst; }
    if (this.aiCalls >= this.maxAi) return text;
    this.aiCalls++;
    const out = await translateZhAr(this.ai, k);
    if (!out) return text;
    this.mem.set(k, out);
    await this.db.prepare('INSERT OR IGNORE INTO translations(src,dst,kind) VALUES(?,?,?)').bind(k, out, kind).run().catch(() => {});
    return out;
  }
}
