// محرك التسعير — يراه الأدمن فقط. الزبون يرى price_lyd النهائي.
export type Settings = Record<string, string>;

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key,value FROM settings').all<{ key: string; value: string }>();
  const s: Settings = {};
  for (const r of results) s[r.key] = r.value;
  return s;
}

export type PriceBreakdown = {
  goods_lyd: number;
  domestic_ship_lyd: number;
  intl_ship_lyd: number;
  customs_lyd: number;
  safety_lyd: number;
  markup_lyd: number;
  total_lyd: number;
  weight_g: number;
};

export function computePrice(
  s: Settings,
  sourcePriceCny: number,
  weightG: number,
  categoryMarkup?: number | null,
): PriceBreakdown {
  const fx = parseFloat(s.fx_cny_lyd || '0.95');
  const usd = parseFloat(s.fx_usd_lyd || '6.9');
  const markup = (categoryMarkup ?? parseInt(s.markup_percent || '35')) / 100;
  const safety = parseInt(s.safety_percent || '7') / 100;
  const shipPerKg = parseFloat(s.ship_usd_per_kg || '9');
  const customs = parseInt(s.customs_percent || '5') / 100;
  const domestic = parseFloat(s.domestic_cn_ship_cny || '6');

  const goods = sourcePriceCny * fx;
  const domesticShip = domestic * fx;
  const intlShip = (weightG / 1000) * shipPerKg * usd;
  const customsFee = goods * customs;
  const safetyFee = goods * safety;
  const base = goods + domesticShip + intlShip + customsFee + safetyFee;
  const markupFee = base * markup;
  const total = roundPrice(base + markupFee);
  return {
    goods_lyd: r2(goods), domestic_ship_lyd: r2(domesticShip), intl_ship_lyd: r2(intlShip),
    customs_lyd: r2(customsFee), safety_lyd: r2(safetyFee), markup_lyd: r2(markupFee),
    total_lyd: total, weight_g: weightG,
  };
}

// تقريب نفسي: 47.3 → 48 ، 123.6 → 125
export function roundPrice(v: number) {
  if (v < 20) return Math.ceil(v * 2) / 2;
  if (v < 100) return Math.ceil(v);
  return Math.ceil(v / 5) * 5;
}
const r2 = (v: number) => Math.round(v * 100) / 100;

export function fmtLyd(v: number) {
  return new Intl.NumberFormat('ar-LY', { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v) + ' د.ل';
}
