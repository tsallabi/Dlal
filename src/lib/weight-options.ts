// تسعير كل خيار بوزنه (٢٥/٠٩/٢٦، طلب صاحب المشروع).
// «دمبل 10 كجم و 5 كجم» كان منتجًا واحدًا بسعر واحد: وزن الأثقل وسعر مورّد الأخفّ، فيدفع من يشتري 5 كغ شحن 10.
// الآن: المنتج يُعرض بسعر أخفّ خياراته، ولكل خيار وزنه وفرق سعره للجوي وللبحري (w_delta_lyd / w_delta_sea_lyd)
// يُضاف في صفحة المنتج والسلة والطلب. مصدر الأوزان: اسم الخيار («200*230cm 3.5kg»)، وإلا العنوان حين يذكر
// وزنين فأكثر ولا خيارات للمنتج — فتُولَّد خيارات منه (auto_w=1).
// سعر المورد في 1688 هو سعر أرخص خيار، والبضاعة التي تُباع بالوزن (حديد، لحاف) يزيد ثمنها بوزنها:
// فبضاعة الخيار الأثقل = سعر المورد × (وزنه ÷ أخفّ وزن) ما لم يكن للخيار فرق سعر مورّد خاص به.
import { computePrice, type Settings } from './pricing';
import { titleWeightsG, labelWeightG, weightLabel } from './source';

type Cat = { id: number; slug: string; est_weight_g: number; markup_percent: number | null };
type Prod = { id: number; source_price_cny: number; weight_g: number | null; volume_cm3: number | null; category_id: number | null; min_qty: number | null; title_ar: string; title_src: string | null };

// المرشّحون: عنوان أو خيار فيه وحدة وزن. أنماط ثابتة قصيرة (D1 يرفض LIKE فوق 50 بايتًا)
const HAS_W = (col: string) => `(${col} LIKE '%كجم%' OR ${col} LIKE '%كغ%' OR ${col} LIKE '%كيلو%' OR ${col} LIKE '%kg%' OR ${col} LIKE '%公斤%' OR ${col} LIKE '%千克%' OR ${col} LIKE '%جرام%' OR ${col} LIKE '%غرام%' OR ${col} LIKE '%克%')`;
const APPAREL_SQL = "('dresses','abayas','tops','lingerie','hijab','kids','shoes','bottoms','outerwear','men','sportswear')";

export async function syncWeightOptions(db: D1Database, s: Settings, cats: Cat[], p: Prod): Promise<number> {
  const cat = cats.find(x => x.id === p.category_id);
  const est = cat?.est_weight_g ?? 300, cny = p.source_price_cny, moq = p.min_qty ?? 1;
  const vars = (await db.prepare('SELECT id,color,size,price_delta_lyd,auto_w FROM variants WHERE product_id=?').bind(p.id).all<any>()).results;
  const real = vars.filter(v => !v.auto_w);
  const stmts: D1PreparedStatement[] = [];
  // 1) أوزان الخيارات الحقيقية
  let weighted = real.map(v => ({ id: v.id as number, w: labelWeightG(`${v.color ?? ''} ${v.size ?? ''}`, cat?.slug, est, cny), pd: Number(v.price_delta_lyd) || 0 }));
  let ws = [...new Set(weighted.map(x => x.w).filter(Boolean))] as number[];
  if (ws.length < 2) {
    weighted = [];
    // 2) لا خيارات حقيقية ويذكر العنوان وزنين فأكثر: خيارات من العنوان
    const tws = real.length ? [] : titleWeightsG([p.title_src, p.title_ar], cat?.slug, est, cny);
    const auto = vars.filter(v => v.auto_w);
    const same = auto.length === tws.length && auto.every(a => tws.some(w => a.size === weightLabel(w)));
    if (tws.length >= 2 && !same) {
      stmts.push(db.prepare('DELETE FROM variants WHERE product_id=? AND auto_w=1').bind(p.id));
      await db.batch(stmts.splice(0));
      for (const w of tws) {
        const r = await db.prepare('INSERT INTO variants(product_id,color,size,price_delta_lyd,in_stock,auto_w,weight_g) VALUES(?,NULL,?,0,1,1,?)').bind(p.id, weightLabel(w), w).run();
        weighted.push({ id: r.meta.last_row_id as number, w, pd: 0 });
      }
    } else if (tws.length >= 2) {
      weighted = auto.map(a => ({ id: a.id, w: tws.find(w => a.size === weightLabel(w)), pd: 0 }));
    } else if (auto.length) {
      stmts.push(db.prepare('DELETE FROM variants WHERE product_id=? AND auto_w=1').bind(p.id));   // العنوان لم يعد يذكر أوزانًا
    }
    ws = [...new Set(weighted.map(x => x.w).filter(Boolean))] as number[];
  }
  if (ws.length < 2) {
    // لا أوزان متعددة: لا فرق وزن لأي خيار
    stmts.push(db.prepare('UPDATE variants SET w_delta_lyd=0,w_delta_sea_lyd=0,weight_g=NULL WHERE product_id=? AND auto_w=0 AND (w_delta_lyd<>0 OR w_delta_sea_lyd<>0 OR weight_g IS NOT NULL)').bind(p.id));
    stmts.push(db.prepare("UPDATE products SET wopt_at=datetime('now') WHERE id=?").bind(p.id));
    await db.batch(stmts);
    return 0;
  }
  const base = Math.min(...ws);
  const mk = cat?.markup_percent;
  const air0 = computePrice(s, cny, base, mk, null, 'air', moq).total_lyd, sea0 = computePrice(s, cny, base, mk, null, 'sea', moq).total_lyd;
  for (const v of weighted) {
    if (!v.w) { stmts.push(db.prepare('UPDATE variants SET w_delta_lyd=0,w_delta_sea_lyd=0,weight_g=NULL WHERE id=?').bind(v.id)); continue; }
    const goods = v.pd ? cny : cny * v.w / base;
    const da = computePrice(s, goods, v.w, mk, null, 'air', moq).total_lyd - air0, ds = computePrice(s, goods, v.w, mk, null, 'sea', moq).total_lyd - sea0;
    stmts.push(db.prepare('UPDATE variants SET weight_g=?,w_delta_lyd=?,w_delta_sea_lyd=? WHERE id=?').bind(v.w, Math.round(da * 2) / 2, Math.round(ds * 2) / 2, v.id));
  }
  // المنتج بسعر أخفّ خياراته
  const air = computePrice(s, cny, base, mk, p.volume_cm3, 'air', moq).total_lyd, sea = computePrice(s, cny, base, mk, p.volume_cm3, 'sea', moq).total_lyd;
  stmts.push(db.prepare("UPDATE products SET weight_g=?,price_lyd=?,price_sea_lyd=?,wopt_at=datetime('now') WHERE id=?").bind(base, air, sea, p.id));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return ws.length;
}

// دفعة: منتجات لم تُفحص خياراتها بالوزن بعد وفي عنوانها أو خياراتها وحدة وزن
export async function syncWeightOptionsBatch(db: D1Database, s: Settings, cats: Cat[], limit = 60): Promise<{ checked: number; priced: number }> {
  const { results } = await db.prepare(`SELECT p.id,p.source_price_cny,p.weight_g,p.volume_cm3,p.category_id,p.min_qty,p.title_ar,p.title_src
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     WHERE p.wopt_at IS NULL AND p.status IN ('active','draft','hidden') AND COALESCE(c.slug,'') NOT IN ${APPAREL_SQL}
       AND (${HAS_W('p.title_ar')} OR ${HAS_W('p.title_src')} OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND (${HAS_W('v.size')} OR ${HAS_W('v.color')})))
     ORDER BY p.status='active' DESC, p.id LIMIT ?`).bind(limit).all<Prod>();
  let priced = 0;
  for (const p of results) if (await syncWeightOptions(db, s, cats, p)) priced++;
  return { checked: results.length, priced };
}
