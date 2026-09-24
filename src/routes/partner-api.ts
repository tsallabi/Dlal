// واجهة برمجية لشركة الشحن: تحدّث حالة طلباتها عندنا وترفع صور المراحل وفواتيرها من نظامها مباشرة.
// المصادقة: Authorization: Bearer <api_token> (يظهر للشريك في لوحته ← «ربط API»).
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { PARTNER_FLOW } from '../types';
import { setOrderStatus } from '../lib/orders';
import { saveMedia, b64ToBytes, createInvoice } from '../lib/partner';

const papi = new Hono<Env>();

async function partnerOf(c: Context<Env>) {
  const tok = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (tok.length < 20) return null;
  return await c.env.DB.prepare('SELECT id,name FROM partners WHERE api_token=? AND active=1').bind(tok).first<{ id: number; name: string }>();
}
async function orderOf(c: Context<Env>, pid: number) {
  return await c.env.DB.prepare('SELECT id,code,status FROM orders WHERE code=? AND partner_id=?').bind(c.req.param('code'), pid).first<{ id: number; code: string; status: string }>();
}
const unauth = (c: Context<Env>) => c.json({ ok: false, error: 'رمز الشريك غير صحيح (Authorization: Bearer …)' }, 401);
const notFound = (c: Context<Env>) => c.json({ ok: false, error: 'الطلب غير موجود أو ليس مسندًا إليكم' }, 404);

// طلباتكم (افتراضيًا المدفوعة بانتظار الشراء)
papi.get('/orders', async (c) => {
  const p = await partnerOf(c); if (!p) return unauth(c);
  const st = c.req.query('status') ?? 'paid';
  const { results } = await c.env.DB.prepare('SELECT code,status,ship_method,ship_city,paid_at,updated_at FROM orders WHERE partner_id=? AND status=? ORDER BY id DESC LIMIT 100').bind(p.id, st).all();
  return c.json({ ok: true, partner: p.name, orders: results });
});

papi.post('/orders/:code/status', async (c) => {
  const p = await partnerOf(c); if (!p) return unauth(c);
  const o = await orderOf(c, p.id); if (!o) return notFound(c);
  const b = await c.req.json<{ status?: string; note?: string }>().catch(() => ({} as any));
  const st = String(b.status ?? '');
  if (!PARTNER_FLOW.includes(st) || st === 'paid') return c.json({ ok: false, error: `حالة غير مسموحة. المسموح: ${PARTNER_FLOW.filter(x => x !== 'paid').join(', ')}` }, 400);
  await setOrderStatus(c.env.DB, o.code, st, null, `${p.name} (API)${b.note ? ' — ' + String(b.note).slice(0, 300) : ''}`);
  return c.json({ ok: true, code: o.code, status: st });
});

papi.post('/orders/:code/photos', async (c) => {
  const p = await partnerOf(c); if (!p) return unauth(c);
  const o = await orderOf(c, p.id); if (!o) return notFound(c);
  const b = await c.req.json<{ stage?: string; url?: string; image_base64?: string; caption?: string; public?: boolean }>().catch(() => ({} as any));
  const stage = PARTNER_FLOW.includes(String(b.stage)) ? String(b.stage) : o.status;
  const img = b.image_base64 ? b64ToBytes(String(b.image_base64)) : null;
  if (b.image_base64 && !img) return c.json({ ok: false, error: 'image_base64 غير صالح' }, 400);
  const r = await saveMedia(c.env.DB, o.id, stage, img ? { bytes: img.bytes, mime: img.mime } : { url: b.url ?? null }, b.caption ? String(b.caption).slice(0, 200) : null, !!b.public, null, c.env.MEDIA);
  return c.json(r, r.ok ? 200 : 400);
});

papi.post('/orders/:code/invoices', async (c) => {
  const p = await partnerOf(c); if (!p) return unauth(c);
  const o = await orderOf(c, p.id); if (!o) return notFound(c);
  const b = await c.req.json<{ stage?: string; lines?: { desc: string; amount: number }[]; note?: string }>().catch(() => ({} as any));
  const stage = PARTNER_FLOW.includes(String(b.stage)) ? String(b.stage) : o.status;
  const r = await createInvoice(c.env.DB, o.id, p.id, stage, Array.isArray(b.lines) ? b.lines : [], b.note ? String(b.note).slice(0, 500) : null, null);
  return c.json(r, r.ok ? 200 : 400);
});

export default papi;
