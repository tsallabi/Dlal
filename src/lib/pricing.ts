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
  volume_cm3: number;
  chargeable_kg: number;     // الوزن المحاسبي الذي تحاسبنا به شركة الشحن
  ship_basis: 'وزن' | 'حجم';
  mode: ShipMode;
  cost_lyd: number;          // تكلفتنا الحقيقية (بلا هامش ولا احتياطي)
  profit_lyd: number;        // الربح المتوقع من القطعة
};

export type ShipMode = 'air' | 'sea';

// معدّلات الشحن حسب الطريقة: الجوي أسرع وأغلى، والبحري أرخص وأبطأ
export function shipRates(s: Settings, mode: ShipMode) {
  return mode === 'sea'
    ? { perKg: parseFloat(s.ship_usd_per_kg_sea || '2.3'), perCbm: parseFloat(s.ship_usd_per_cbm_sea || '120'), days: s.sea_days || '٣٠ — ٤٥ يومًا', ar: 'بحري' as const }
    : { perKg: parseFloat(s.ship_usd_per_kg || '9'), perCbm: parseFloat(s.ship_usd_per_cbm || '260'), days: s.air_days || '١٢ — ١٨ يومًا', ar: 'جوي' as const };
}
export const seaOn = (s: Settings) => (s.sea_enabled ?? '1') === '1';

// الشحن يُحاسب بالوزن أو بالحجم أيهما أكبر (الوزن الحجمي = السم³ ÷ المقسوم)
export function chargeableKg(s: Settings, weightG: number, volumeCm3: number) {
  const mode = s.ship_mode || 'max';
  const divisor = parseFloat(s.volumetric_divisor || '6000') || 6000;
  const real = weightG / 1000;
  const vol = volumeCm3 > 0 ? volumeCm3 / divisor : 0;
  if (mode === 'kg' || !vol) return { kg: real, basis: 'وزن' as const };
  if (mode === 'cbm') return { kg: vol, basis: 'حجم' as const };
  return vol > real ? { kg: vol, basis: 'حجم' as const } : { kg: real, basis: 'وزن' as const };
}

export function computePrice(
  s: Settings,
  sourcePriceCny: number,
  weightG: number,
  categoryMarkup?: number | null,
  volumeCm3?: number | null,
  mode: ShipMode = 'air',
): PriceBreakdown {
  const fx = parseFloat(s.fx_cny_lyd || '0.95');
  const usd = parseFloat(s.fx_usd_lyd || '6.9');
  const markup = (categoryMarkup ?? parseInt(s.markup_percent || '35')) / 100;
  const safety = parseInt(s.safety_percent || '7') / 100;
  const rates = shipRates(s, mode);
  const shipPerKg = rates.perKg;
  const customs = parseInt(s.customs_percent || '5') / 100;
  const domestic = parseFloat(s.domestic_cn_ship_cny || '6');

  // سعر المتر المكعب من شركة الشحن ⟵ سعر الكيلو المحاسبي (1 م³ = 1,000,000 سم³)
  const perCbm = rates.perCbm;
  const divisor = parseFloat(s.volumetric_divisor || '6000') || 6000;
  const vol = Math.max(0, volumeCm3 ?? parseFloat(s.default_volume_cm3 || '0') ?? 0);
  const ch = chargeableKg(s, weightG, vol);
  // إن حُدّد سعر المتر المكعب استُخدم للحصة الحجمية، وإلا فسعر الكيلو
  const usdPerKg = ch.basis === 'حجم' && perCbm > 0 ? perCbm / (1000000 / divisor) : shipPerKg;

  const goods = sourcePriceCny * fx;
  const domesticShip = domestic * fx;
  const intlShip = ch.kg * usdPerKg * usd;
  const customsFee = goods * customs;
  const safetyFee = goods * safety;
  const base = goods + domesticShip + intlShip + customsFee + safetyFee;
  const markupFee = base * markup;
  const total = roundPrice(base + markupFee);
  const cost = goods + domesticShip + intlShip + customsFee;
  return {
    goods_lyd: r2(goods), domestic_ship_lyd: r2(domesticShip), intl_ship_lyd: r2(intlShip),
    customs_lyd: r2(customsFee), safety_lyd: r2(safetyFee), markup_lyd: r2(markupFee),
    total_lyd: total, weight_g: weightG, volume_cm3: vol, chargeable_kg: Math.round(ch.kg * 1000) / 1000,
    ship_basis: ch.basis, mode, cost_lyd: r2(cost), profit_lyd: r2(total - cost),
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
