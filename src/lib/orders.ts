// منطق الطلبات المشترك: تغيير الحالة، تأكيد الدفع، النقاط
import { ORDER_STATUS } from '../types';
import { notify } from './db';
import { loadSettings } from './pricing';
import { onOrderPaid } from './partner';

const MSGS: Record<string, string> = {
  paid: 'تم تأكيد دفع طلبك ✓ بدأ فريقنا في الصين شراء منتجاتك.',
  purchasing: 'بدأ فريقنا شراء منتجاتك من الموردين.', purchased: 'تم شراء كل منتجاتك وهي في طريقها إلى مخزننا.', at_warehouse: 'وصلت منتجاتك إلى مخزننا في الصين وجارٍ فحصها.',
  consolidated: 'ضُمّت منتجاتك إلى شحنة متجهة إلى ليبيا.', shipped: 'شُحن طلبك إلى ليبيا ✈️', arrived: 'وصل طلبك إلى ليبيا 🇱🇾', customs: 'طلبك في الجمارك.', ready: 'طلبك جاهز — سيتواصل معك المندوب للتسليم.',
  delivered: 'تم تسليم طلبك. شكرًا لتسوقك مع هدهدي 💕 قيّمي منتجاتك واكسبي نقاطًا.', cancelled: 'أُلغي طلبك.', refunded: 'تم استرجاع قيمة طلبك.',
};

export async function setOrderStatus(db: D1Database, code: string, status: string, byUserId: number | null, note?: string) {
  if (!ORDER_STATUS[status]) return null;
  const o = await db.prepare('SELECT id,user_id,status,total_lyd,points_earned,coupon_code,points_used FROM orders WHERE code=?').bind(code).first<any>();
  if (!o) return null;
  const stmts = [
    db.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?").bind(status, o.id),
    db.prepare('INSERT INTO order_events(order_id,status,note,by_user_id) VALUES(?,?,?,?)').bind(o.id, status, note ?? null, byUserId),
  ];
  // نقاط الولاء تُمنح عند التسليم مرة واحدة
  if (status === 'delivered' && !o.points_earned) {
    const s = await loadSettings(db);
    const pts = Math.floor(o.total_lyd * parseFloat(s.points_per_lyd || '1'));
    if (pts > 0) {
      stmts.push(db.prepare('UPDATE orders SET points_earned=? WHERE id=?').bind(pts, o.id));
      stmts.push(db.prepare('UPDATE users SET points=points+? WHERE id=?').bind(pts, o.user_id));
      stmts.push(db.prepare("INSERT INTO points_ledger(user_id,delta,reason,order_id) VALUES(?,?,'مكافأة طلب مُسلَّم',?)").bind(o.user_id, pts, o.id));
    }
  }
  // إلغاء طلب استُخدمت فيه نقاط → تُعاد
  if ((status === 'cancelled' || status === 'refunded') && o.points_used > 0 && !['cancelled', 'refunded'].includes(o.status)) {
    stmts.push(db.prepare('UPDATE users SET points=points+? WHERE id=?').bind(o.points_used, o.user_id));
    stmts.push(db.prepare("INSERT INTO points_ledger(user_id,delta,reason,order_id) VALUES(?,?,'إعادة نقاط طلب ملغي',?)").bind(o.user_id, o.points_used, o.id));
  }
  await db.batch(stmts);
  if (MSGS[status]) await notify(db, o.user_id, `تحديث طلبك ${code}`, MSGS[status], `/orders/${code}`);
  return o;
}

// تأكيد الدفع (من البوابة أو يدويًا)
export async function markOrderPaid(db: D1Database, orderId: number, ref: string, byUserId: number | null, note: string, origin = 'https://hudhude.com') {
  const o = await db.prepare('SELECT id,code,user_id,status,partner_id FROM orders WHERE id=?').bind(orderId).first<any>();
  if (!o) return null;
  if (o.status !== 'pending_payment') return o;   // idempotent
  let pid = o.partner_id;
  if (!pid) pid = (await db.prepare("SELECT id FROM partners WHERE active=1 ORDER BY share_percent DESC LIMIT 1").first<any>())?.id ?? null;
  await db.prepare("UPDATE orders SET payment_ref=?,partner_id=?,paid_at=datetime('now') WHERE id=?").bind(ref, pid, o.id).run();
  await setOrderStatus(db, o.code, 'paid', byUserId, note);
  // مستحقات الشريك بأسعاره يومها، ثم الإرسال إلى API شركة الشحن إن كان ربطها مفعّلًا. عطل هنا لا يُفسد الدفع:
  // السطر محفوظ في صندوق الإرسال والكرون يعيد المحاولة.
  try { await onOrderPaid(db, o.id, origin); } catch (e: any) { console.error('partner dispatch', e?.message ?? e); }
  return o;
}

export async function addPoints(db: D1Database, userId: number, delta: number, reason: string, byUserId: number | null, orderId?: number | null) {
  await db.batch([
    db.prepare('UPDATE users SET points=MAX(0,points+?) WHERE id=?').bind(delta, userId),
    db.prepare('INSERT INTO points_ledger(user_id,delta,reason,order_id,by_user_id) VALUES(?,?,?,?,?)').bind(userId, delta, reason, orderId ?? null, byUserId),
  ]);
}

export const ticketCode = (id: number) => `TK-${new Date().getFullYear()}-${String(id).padStart(6, '0')}`;
