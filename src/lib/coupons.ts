// التحقق من الكوبونات وحساب الخصم
export type CouponResult = { ok: true; coupon: any; discount: number; freeShip: boolean } | { ok: false; error: string };

export async function checkCoupon(db: D1Database, code: string, userId: number, subtotal: number): Promise<CouponResult> {
  const cp = await db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE').bind(code.trim()).first<any>();
  if (!cp || !cp.active) return { ok: false, error: 'الكوبون غير صالح' };
  const now = new Date().toISOString();
  if (cp.starts_at && cp.starts_at > now) return { ok: false, error: 'الكوبون لم يبدأ بعد' };
  if (cp.ends_at && cp.ends_at < now) return { ok: false, error: 'انتهت صلاحية الكوبون' };
  if (cp.usage_limit && cp.used_count >= cp.usage_limit) return { ok: false, error: 'استُنفد هذا الكوبون' };
  if (subtotal < cp.min_order_lyd) return { ok: false, error: `الحد الأدنى للطلب ${cp.min_order_lyd} د.ل` };
  const used = await db.prepare('SELECT COUNT(*) n FROM coupon_uses WHERE coupon_id=? AND user_id=?').bind(cp.id, userId).first<{ n: number }>();
  if ((used?.n ?? 0) >= cp.per_user_limit) return { ok: false, error: 'استخدمتِ هذا الكوبون من قبل' };
  let discount = 0, freeShip = false;
  if (cp.type === 'percent') discount = Math.round(subtotal * cp.value) / 100;
  else if (cp.type === 'fixed') discount = Math.min(cp.value, subtotal);
  else freeShip = true;
  if (cp.max_discount_lyd && discount > cp.max_discount_lyd) discount = cp.max_discount_lyd;
  return { ok: true, coupon: cp, discount: Math.round(discount * 100) / 100, freeShip };
}
