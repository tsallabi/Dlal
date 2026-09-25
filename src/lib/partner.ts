// نظام شركاء الشحن: إرسال الطلب المدفوع إلى API الشريك، ومستحقاته، وتسعير الرف بأسعاره.
// طلب صاحب المشروع (٢٤/٠٩/٢٦): الطلب يذهب إلى شركة الشحن مباشرة بعد تأكيد الدفع، والشريك يضع أسعاره
// بنفسه، ولنا «دينار على كل بند ينفّذه» + ٣٥٪ على سعر البضاعة لا تظهر له.
import type { Settings } from './pricing';
import { setOrderStatus } from './orders';
import { notify } from './db';

export type PartnerRates = {
  fee_commission_pct: number;   // عمولة الشراء % من سعر البضاعة
  fee_domestic_lyd: number;     // النقل الداخلي في الصين للقطعة
  fee_air_kg_lyd: number;       // الشحن الجوي للكيلو
  fee_sea_kg_lyd: number;       // الشحن البحري للكيلو
  fee_delivery_lyd: number;     // التوصيل داخل ليبيا للطلب
};
export const RATE_KEYS: (keyof PartnerRates)[] = ['fee_commission_pct', 'fee_domestic_lyd', 'fee_air_kg_lyd', 'fee_sea_kg_lyd', 'fee_delivery_lyd'];
export const RATE_AR: Record<keyof PartnerRates, { ar: string; unit: string }> = {
  fee_commission_pct: { ar: 'عمولة الشراء', unit: '% من سعر البضاعة' },
  fee_domestic_lyd: { ar: 'النقل الداخلي في الصين', unit: 'د.ل للقطعة' },
  fee_air_kg_lyd: { ar: 'الشحن الجوي', unit: 'د.ل للكيلو' },
  fee_sea_kg_lyd: { ar: 'الشحن البحري', unit: 'د.ل للكيلو' },
  fee_delivery_lyd: { ar: 'التوصيل داخل ليبيا', unit: 'د.ل للطلب' },
};
// مفاتيح الإعدادات التي تحمل أسعار «شريك التسعير» ليقرأها computePrice (دالة متزامنة تأخذ الإعدادات فقط)
export const PP_KEY: Record<keyof PartnerRates, string> = {
  fee_commission_pct: 'pp_commission_pct', fee_domestic_lyd: 'pp_domestic_lyd', fee_air_kg_lyd: 'pp_air_kg_lyd', fee_sea_kg_lyd: 'pp_sea_kg_lyd', fee_delivery_lyd: 'pp_delivery_lyd',
};
export const feeMargin = (s: Settings) => Math.max(0, parseFloat(s.partner_fee_margin_lyd ?? '1') || 0);
export const pricingPartnerId = (s: Settings) => Math.max(0, parseInt(s.pricing_partner_id ?? '0') || 0);

// أجرة التوصيل داخل ليبيا بأسعار شريك التسعير (+ رسم المنصة)، أو null فتُستعمل أجرة المدن العامة
export function partnerDelivery(s: Settings): number | null {
  if (!pricingPartnerId(s)) return null;
  const d = parseFloat(s.pp_delivery_lyd ?? '0') || 0;
  return d > 0 ? Math.round((d + feeMargin(s)) * 100) / 100 : null;
}

// يُنسخ سعر شريك التسعير إلى الإعدادات عند اختياره وكلما عدّل أسعاره — ثم يلزم إعادة تسعير الرف
export async function syncPricingPartner(db: D1Database): Promise<boolean> {
  const id = parseInt((await db.prepare("SELECT value FROM settings WHERE key='pricing_partner_id'").first<{ value: string }>())?.value ?? '0') || 0;
  if (!id) return false;
  const p = await db.prepare('SELECT * FROM partners WHERE id=?').bind(id).first<any>();
  if (!p) return false;
  await db.batch(RATE_KEYS.map(k => db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").bind(PP_KEY[k], String(p[k] ?? 0))));
  return true;
}

// ما يستحقه الشريك عن الطلب بأسعاره هو (بلا رسم المنصة ولا ربحنا): البضاعة يدفعها للمورد + خدماته
export async function partnerDues(db: D1Database, orderId: number, p: PartnerRates) {
  const o = await db.prepare('SELECT ship_method,ship_city,ship_zone_id FROM orders WHERE id=?').bind(orderId).first<{ ship_method: string; ship_city: string; ship_zone_id: number | null }>();
  // التوصيل داخل ليبيا بسعر منطقة الزبونة عند هذا الشريك إن وضع مناطق لمدينتها، وإلا سعره الموحّد
  const pid = (p as any).id as number | undefined;
  const zone = pid ? await db.prepare('SELECT price_lyd FROM partner_zones WHERE partner_id=? AND (id=? OR city=?) ORDER BY (id=?) DESC, km_from LIMIT 1')
    .bind(pid, o?.ship_zone_id ?? 0, o?.ship_city ?? '', o?.ship_zone_id ?? 0).first<{ price_lyd: number }>() : null;
  const { results } = await db.prepare(`SELECT oi.qty,oi.unit_goods_lyd,COALESCE(pr.weight_g,c.est_weight_g,300) w
     FROM order_items oi LEFT JOIN products pr ON pr.id=oi.product_id LEFT JOIN categories c ON c.id=pr.category_id WHERE oi.order_id=?`).bind(orderId).all<any>();
  const sea = o?.ship_method === 'sea';
  const perKg = sea ? p.fee_sea_kg_lyd : p.fee_air_kg_lyd;
  let goods = 0, commission = 0, domestic = 0, shipping = 0, kg = 0;
  for (const r of results) {
    const g = (r.unit_goods_lyd ?? 0) * r.qty;
    goods += g; commission += g * (p.fee_commission_pct / 100); domestic += p.fee_domestic_lyd * r.qty;
    const k = (r.w / 1000) * r.qty; kg += k; shipping += k * perKg;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const out = { method: sea ? 'sea' : 'air', kg: r2(kg), goods: r2(goods), commission: r2(commission), domestic: r2(domestic), shipping: r2(shipping), delivery: r2(zone ? zone.price_lyd : p.fee_delivery_lyd) } as any;
  out.total = r2(out.goods + out.commission + out.domestic + out.shipping + out.delivery);
  out.rates = Object.fromEntries(RATE_KEYS.map(k => [k, p[k]]));
  return out;
}

// ---------- الإرسال إلى API الشريك ----------
export const newSecret = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function orderPayload(db: D1Database, orderId: number, origin: string) {
  const o = await db.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first<any>();
  if (!o) return null;
  const { results: items } = await db.prepare(`SELECT oi.id,oi.title_ar,oi.color,oi.size,oi.qty,oi.source_offer_id,oi.source_url,pr.source_price_cny,pr.weight_g
     FROM order_items oi LEFT JOIN products pr ON pr.id=oi.product_id WHERE oi.order_id=?`).bind(orderId).all<any>();
  return {
    event: 'order.paid',
    order: {
      code: o.code, paid_at: o.paid_at, ship_method: o.ship_method, note: o.note,
      customer: { name: o.ship_name, phone: o.ship_phone, city: o.ship_city, address: o.ship_address },
      items: items.map(i => ({ item_id: i.id, title: i.title_ar, color: i.color, size: i.size, qty: i.qty, offer_id: i.source_offer_id,
        url: i.source_url ?? (i.source_offer_id ? `https://detail.1688.com/offer/${i.source_offer_id}.html` : null), supplier_price_cny: i.source_price_cny, weight_g: i.weight_g })),
      dues: o.partner_fees_json ? JSON.parse(o.partner_fees_json) : null,
    },
    // الشريك يحدّث الطلب عندنا بهذه الروابط ورمزه (Authorization: Bearer)
    callbacks: {
      status: `${origin}/api/partner/v1/orders/${o.code}/status`,
      photos: `${origin}/api/partner/v1/orders/${o.code}/photos`,
      invoices: `${origin}/api/partner/v1/orders/${o.code}/invoices`,
    },
  };
}

// محاولة إرسال واحدة لسطر في صندوق الإرسال. السطر مكتوب قبل الاتصال (sending)، ومهلة ٢٠ ثانية،
// والرد يُحفظ كما هو — «لا أثر» كان درس ماي باي.
export async function attemptDispatch(db: D1Database, dispatchId: number, origin: string, test = false, timeoutMs = 20000): Promise<{ ok: boolean; http?: number; error?: string; body?: string }> {
  const d = await db.prepare('SELECT d.*,p.api_url,p.api_secret,p.api_enabled FROM partner_dispatch d JOIN partners p ON p.id=d.partner_id WHERE d.id=?').bind(dispatchId).first<any>();
  if (!d) return { ok: false, error: 'لا يوجد' };
  if (!d.api_url) {
    await db.prepare("UPDATE partner_dispatch SET status='failed',error=? WHERE id=?").bind('الشريك لم يضع رابط API', dispatchId).run();
    return { ok: false, error: 'الشريك لم يضع رابط API' };
  }
  const payload = await orderPayload(db, d.order_id, origin);
  if (!payload) return { ok: false, error: 'الطلب غير موجود' };
  if (test) (payload as any).event = 'order.test';
  const body = JSON.stringify(payload);
  // next_at بعد دقيقتين: إن مات الطلب في منتصفه (قتل Cloudflare العامل) بقي السطر «يُرسل» — والكرون يلتقطه بعدها
  await db.prepare("UPDATE partner_dispatch SET status='sending',attempts=attempts+1,next_at=datetime('now','+2 minutes') WHERE id=?").bind(dispatchId).run();
  try {
    const sig = await hmacHex(d.api_secret ?? '', body);
    const r = await fetch(d.api_url, {
      method: 'POST', body, signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', 'x-hudhude-event': (payload as any).event, 'x-hudhude-signature': 'sha256=' + sig, 'x-hudhude-order': payload.order.code },
    });
    const text = (await r.text()).slice(0, 2000);
    const ok = r.status >= 200 && r.status < 300;
    await db.prepare(`UPDATE partner_dispatch SET status=?,http_status=?,response=?,error=NULL,sent_at=CASE WHEN ? THEN datetime('now') ELSE sent_at END,
        next_at=CASE WHEN ? THEN NULL ELSE datetime('now', '+' || (5 * attempts * attempts) || ' minutes') END WHERE id=?`)
      .bind(test ? 'test' : ok ? 'sent' : (d.attempts + 1 >= 8 ? 'failed' : 'pending'), r.status, text, ok ? 1 : 0, ok || test ? 1 : 0, dispatchId).run();
    return { ok, http: r.status, body: text };
  } catch (e: any) {
    const err = String(e?.message ?? e).slice(0, 500);
    await db.prepare(`UPDATE partner_dispatch SET status=?,error=?,next_at=datetime('now', '+' || (5 * attempts * attempts) || ' minutes') WHERE id=?`)
      .bind(test ? 'test' : (d.attempts + 1 >= 8 ? 'failed' : 'pending'), err, dispatchId).run();
    return { ok: false, error: err };
  }
}

// بعد تأكيد الدفع: لقطة مستحقات الشريك، ثم سطر في صندوق الإرسال ومحاولة فورية إن كان ربطه مفعّلًا
export async function onOrderPaid(db: D1Database, orderId: number, origin: string) {
  const o = await db.prepare('SELECT partner_id FROM orders WHERE id=?').bind(orderId).first<{ partner_id: number | null }>();
  if (!o?.partner_id) return;
  const p = await db.prepare('SELECT * FROM partners WHERE id=?').bind(o.partner_id).first<any>();
  if (!p) return;
  const dues = await partnerDues(db, orderId, p);
  await db.prepare('UPDATE orders SET partner_fees_json=? WHERE id=?').bind(JSON.stringify(dues), orderId).run();
  if (!p.api_enabled || !p.api_url) return;
  const ins = await db.prepare("INSERT INTO partner_dispatch(order_id,partner_id,event,status) VALUES(?,?,'order.paid','pending')").bind(orderId, p.id).run();
  // المحاولة الأولى تجري داخل إشعار ماي باي نفسه: ٨ ثوانٍ لا ٢٠ حتى لا يُبطئ نظامُ الشريك ردَّنا على البوابة؛ ما لم يصل يعيده الكرون
  await attemptDispatch(db, ins.meta.last_row_id as number, origin, false, 8000);
}

// الكرون: ما تعذّر إرساله يُعاد بمهلة متزايدة (٥، ٢٠، ٤٥… دقيقة) حتى ٨ محاولات
export async function retryDispatch(db: D1Database, origin: string) {
  const { results } = await db.prepare("SELECT id FROM partner_dispatch WHERE status IN ('pending','sending') AND (next_at IS NULL OR next_at <= datetime('now')) AND attempts < 8 ORDER BY id LIMIT 20").all<{ id: number }>();
  for (const r of results) await attemptDispatch(db, r.id, origin);
  return results.length;
}

// زر «إرسال طلب تجريبي» في لوحة الشريك: طلب نموذجي بلا زبونة حقيقية، ليرى الشريك شكل البيانات والتوقيع
export async function testDispatch(p: { api_url: string | null; api_secret: string | null }, origin: string) {
  if (!p.api_url) return { ok: false, error: 'ضع رابط API أولًا' };
  const body = JSON.stringify({
    event: 'order.test',
    order: { code: 'DL-TEST-000000', paid_at: new Date().toISOString(), ship_method: 'air', note: 'طلب تجريبي — لا تشترِه',
      customer: { name: 'زبون تجريبي', phone: '0910000000', city: 'طرابلس', address: 'عنوان تجريبي' },
      items: [{ item_id: 0, title: 'منتج تجريبي', color: 'أسود', size: 'M', qty: 1, offer_id: '000000000', url: 'https://detail.1688.com/offer/000000000.html', supplier_price_cny: 10, weight_g: 300 }],
      dues: null },
    callbacks: { status: `${origin}/api/partner/v1/orders/DL-TEST-000000/status` },
  });
  try {
    const sig = await hmacHex(p.api_secret ?? '', body);
    const r = await fetch(p.api_url, { method: 'POST', body, signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-hudhude-event': 'order.test', 'x-hudhude-signature': 'sha256=' + sig, 'x-hudhude-order': 'DL-TEST-000000' } });
    return { ok: r.status >= 200 && r.status < 300, http: r.status, body: (await r.text()).slice(0, 500) };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
}

// ---------- صور المراحل والفواتير (مشتركة بين لوحة الشريك وواجهته البرمجية) ----------
export const MEDIA_MAX = 1_500_000;   // الصورة تُصغَّر في المتصفح إلى ~٢٠٠ ك.ب؛ السقف يحمي القاعدة من صورة كاميرا خام
const MIME_OK = /^image\/(jpeg|png|webp)$/;
export async function saveMedia(db: D1Database, orderId: number, stage: string, file: { bytes?: ArrayBuffer | null; mime?: string; url?: string | null },
  caption: string | null, pub: boolean, byUserId: number | null, bucket?: R2Bucket): Promise<{ ok: boolean; error?: string; id?: number }> {
  if (file.url) {
    if (!/^https:\/\//.test(file.url)) return { ok: false, error: 'رابط الصورة يجب أن يبدأ بـ https://' };
    const r = await db.prepare('INSERT INTO order_media(order_id,stage,url,caption,public,by_user_id) VALUES(?,?,?,?,?,?)').bind(orderId, stage, file.url.slice(0, 500), caption, pub ? 1 : 0, byUserId).run();
    return { ok: true, id: r.meta.last_row_id as number };
  }
  const n = file.bytes?.byteLength ?? 0;
  if (!n) return { ok: false, error: 'لم تصل صورة' };
  if (n > MEDIA_MAX) return { ok: false, error: `الصورة ${Math.round(n / 1024)} ك.ب — الحد ${Math.round(MEDIA_MAX / 1024)} ك.ب` };
  const mime = MIME_OK.test(file.mime ?? '') ? file.mime! : 'image/jpeg';
  // R2 أولًا؛ إن تعذّر (غير مربوط أو عطل مؤقت) تُحفظ في D1 فلا تضيع صورة الموظف، والكرون ينقلها لاحقًا
  if (bucket) {
    const key = `orders/${orderId}/${Date.now()}-${newSecret().slice(0, 8)}.${mime.split('/')[1].replace('jpeg', 'jpg')}`;
    try {
      await bucket.put(key, file.bytes!, { httpMetadata: { contentType: mime } });
      const r = await db.prepare('INSERT INTO order_media(order_id,stage,mime,r2_key,bytes,caption,public,by_user_id) VALUES(?,?,?,?,?,?,?,?)')
        .bind(orderId, stage, mime, key, n, caption, pub ? 1 : 0, byUserId).run();
      return { ok: true, id: r.meta.last_row_id as number };
    } catch (e: any) { console.error('R2 put', e?.message ?? e); }
  }
  const r = await db.prepare('INSERT INTO order_media(order_id,stage,mime,data,bytes,caption,public,by_user_id) VALUES(?,?,?,?,?,?,?,?)')
    .bind(orderId, stage, mime, file.bytes, n, caption, pub ? 1 : 0, byUserId).run();
  return { ok: true, id: r.meta.last_row_id as number };
}
// يقدّم الصورة من R2 أو من D1 (ما لم يُنقل بعد) — m: صفّ فيه r2_key و data و mime و url
export async function mediaResponse(m: { r2_key?: string | null; data?: ArrayBuffer | null; mime: string; url?: string | null }, bucket?: R2Bucket): Promise<Response | null> {
  if (m.url) return Response.redirect(m.url, 302);
  const h = { 'content-type': m.mime, 'cache-control': 'private, max-age=86400' };
  if (m.r2_key && bucket) { const o = await bucket.get(m.r2_key); if (o) return new Response(o.body, { headers: h }); }
  if (m.data) return new Response(new Uint8Array(m.data), { headers: h });
  return null;
}
export async function deleteMedia(db: D1Database, id: number, orderCode: string, bucket?: R2Bucket) {
  const m = await db.prepare('SELECT m.r2_key FROM order_media m JOIN orders o ON o.id=m.order_id WHERE m.id=? AND o.code=?').bind(id, orderCode).first<{ r2_key: string | null }>();
  if (!m) return;
  if (m.r2_key && bucket) await bucket.delete(m.r2_key).catch(() => {});
  await db.prepare('DELETE FROM order_media WHERE id=?').bind(id).run();
}
// الكرون: ما حُفظ في D1 (قبل تفعيل R2 أو عند عطل مؤقت) يُنقل إلى R2 ويُفرغ من القاعدة، عشرون صورة في المرة
export async function moveMediaToR2(db: D1Database, bucket?: R2Bucket, limit = 20): Promise<number> {
  if (!bucket) return 0;
  const { results } = await db.prepare('SELECT id,order_id,mime,data FROM order_media WHERE data IS NOT NULL AND r2_key IS NULL ORDER BY id LIMIT ?').bind(limit).all<any>();
  let n = 0;
  for (const m of results) {
    const key = `orders/${m.order_id}/moved-${m.id}.${String(m.mime).split('/')[1].replace('jpeg', 'jpg')}`;
    await bucket.put(key, new Uint8Array(m.data), { httpMetadata: { contentType: m.mime } });
    await db.prepare('UPDATE order_media SET r2_key=?,data=NULL WHERE id=?').bind(key, m.id).run(); n++;
  }
  return n;
}
export function b64ToBytes(b64: string): { bytes: ArrayBuffer; mime: string } | null {
  const m = b64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const raw = m ? m[2] : b64;
  try { const bin = atob(raw.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return { bytes: u.buffer, mime: m?.[1] ?? 'image/jpeg' }; } catch { return null; }
}
export type InvoiceLine = { desc: string; amount: number };
export async function createInvoice(db: D1Database, orderId: number, partnerId: number, stage: string, lines: InvoiceLine[], note: string | null, byUserId: number | null) {
  const clean = lines.map(l => ({ desc: String(l.desc ?? '').trim().slice(0, 200), amount: Math.round((Number(l.amount) || 0) * 100) / 100 })).filter(l => l.desc && l.amount);
  if (!clean.length) return { ok: false as const, error: 'أضف بندًا واحدًا على الأقل بوصف ومبلغ' };
  const total = Math.round(clean.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  const r = await db.prepare('INSERT INTO partner_invoices(order_id,partner_id,stage,lines,total_lyd,note,by_user_id) VALUES(?,?,?,?,?,?,?)').bind(orderId, partnerId, stage, JSON.stringify(clean), total, note, byUserId).run();
  const id = r.meta.last_row_id as number;
  const number = `INV-${partnerId}-${String(id).padStart(5, '0')}`;
  await db.prepare('UPDATE partner_invoices SET number=? WHERE id=?').bind(number, id).run();
  return { ok: true as const, id, number, total };
}

// الحساب مع الشريك: مستحقاته (لقطة كل طلب جارٍ أو مسلَّم) ناقص ما دفعناه، وما حصّله من الزبائن عند الاستلام
// (70% من طلبات العربون) ناقص ما سلّمه لنا. يُعرض في «لوحتي» عند الشريك وفي /admin/partners عندنا بالأرقام نفسها.
export async function partnerBalance(db: D1Database, pid: number) {
  const [d, l, cod] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(json_extract(partner_fees_json,'$.total')),0) total FROM orders WHERE partner_id=? AND status NOT IN ('pending_payment','cancelled','refunded')`).bind(pid),
    db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='payout' THEN amount_lyd END),0) paid, COALESCE(SUM(CASE WHEN kind='collect' THEN amount_lyd END),0) got FROM partner_ledger WHERE partner_id=?").bind(pid),
    db.prepare("SELECT COALESCE(SUM(total_lyd*0.7),0) v FROM orders WHERE partner_id=? AND status='delivered' AND payment_method='cod_deposit'").bind(pid),
  ]);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const dues = (d.results[0] as any).total, paid = (l.results[0] as any).paid, got = (l.results[0] as any).got, codv = (cod.results[0] as any).v;
  return { dues: r2(dues), paid: r2(paid), toPartner: r2(dues - paid), cod: r2(codv), got: r2(got), toUs: r2(codv - got), net: r2(dues - paid - (codv - got)) };
}

// ---------- التوصيل داخل ليبيا: مناطق كل مدينة بالكيلومتر، وتسليم الطرد لشركة التوصيل (أميال) ----------
export type Zone = { id: number; city: string; zone: string; km_from: number; km_to: number; price_lyd: number };
export async function zonesFor(db: D1Database, partnerId: number, city?: string | null): Promise<Zone[]> {
  if (!partnerId) return [];
  const { results } = await db.prepare(`SELECT id,city,zone,km_from,km_to,price_lyd FROM partner_zones WHERE partner_id=? ${city ? 'AND city=?' : ''} ORDER BY city,km_from`)
    .bind(...(city ? [partnerId, city] : [partnerId])).all<Zone>();
  return results;
}
export const zoneLabel = (z: Zone) => `${z.zone} (${z.km_from}–${z.km_to} كم من المركز)`;
// أجرة التوصيل للزبونة: منطقة المدينة عند «شريك التسعير» + رسم المنصة، أو null فيُستعمل التسعير القديم
export async function zoneQuote(db: D1Database, s: Settings, city: string | null, zoneId?: number | null) {
  const pid = pricingPartnerId(s);
  const zones = city ? await zonesFor(db, pid, city) : [];
  if (!zones.length) return { zones, zone: null as Zone | null, fee: null as number | null };
  const zone = zones.find(z => z.id === Number(zoneId)) ?? zones[0];   // بلا اختيار: وسط المدينة (الأقرب)
  return { zones, zone, fee: Math.round((zone.price_lyd + feeMargin(s)) * 100) / 100 };
}

export const courierTrack = (p: { courier_track_url?: string | null }, ref?: string | null) =>
  p.courier_track_url && ref ? p.courier_track_url.replace('{code}', encodeURIComponent(ref)) : null;

// إرسال الطرد إلى واجهة شركة التوصيل (إن وضع الشريك رابطها): JSON بالمستلمة والمدينة والمنطقة والمبلغ المطلوب تحصيله.
// لا نعرف صيغة أميال (موقعها لا ينشر واجهة برمجية): نقبل رقم التتبع من أي حقل شائع في الرد، ونحفظ الرد كما هو.
export async function courierCreate(db: D1Database, p: any, orderId: number): Promise<{ ok: boolean; ref?: string; error?: string }> {
  if (!p.courier_api_url) return { ok: false, error: 'لا رابط API لشركة التوصيل' };
  const o = await db.prepare('SELECT o.*,(SELECT COUNT(*) FROM order_items WHERE order_id=o.id) items FROM orders o WHERE o.id=?').bind(orderId).first<any>();
  if (!o) return { ok: false, error: 'الطلب غير موجود' };
  const cod = o.payment_method === 'cod_deposit' ? Math.round(o.total_lyd * 0.7 * 100) / 100 : 0;
  const body = JSON.stringify({ reference: o.code, receiver: { name: o.ship_name, phone: o.ship_phone, city: o.ship_city, area: o.ship_zone, address: o.ship_address },
    pieces: o.items, cod_amount: cod, note: o.note ?? '' });
  try {
    const r = await fetch(p.courier_api_url, { method: 'POST', body, signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', ...(p.courier_api_key ? { authorization: `Bearer ${p.courier_api_key}` } : {}) } });
    const text = (await r.text()).slice(0, 1000);
    let j: any = {}; try { j = JSON.parse(text); } catch { /* ليس JSON */ }
    const ref = String(j.tracking ?? j.tracking_number ?? j.code ?? j.shipment_id ?? j.id ?? j.data?.tracking ?? j.data?.code ?? j.data?.id ?? '').trim();
    if (!r.ok || !ref) return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 160)}` };
    return { ok: true, ref };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e).slice(0, 200) }; }
}

// تسليم الطرد لشركة التوصيل: الحالة تبقى «جاهز للتسليم» وتُسجَّل الخطوة في سجل الطلب وتُبلَّغ الزبونة برقم الشحنة
export async function courierHandover(db: D1Database, code: string, courier: string, ref: string, byUserId: number | null) {
  const o = await db.prepare("SELECT id,user_id FROM orders WHERE code=? AND status='ready'").bind(code).first<{ id: number; user_id: number }>();
  if (!o) return false;
  await db.batch([
    db.prepare("UPDATE orders SET courier=?,courier_ref=?,courier_status='with_courier',courier_at=datetime('now'),courier_note=NULL,updated_at=datetime('now') WHERE id=?").bind(courier, ref, o.id),
    db.prepare("INSERT INTO order_events(order_id,status,note,by_user_id) VALUES(?,'ready',?,?)").bind(o.id, `سُلِّم لـ${courier} للتوصيل — رقم الشحنة ${ref}`, byUserId),
  ]);
  await notify(db, o.user_id, `طلبك ${code} في الطريق إليك 🚚`, `سلّمناه لـ${courier} للتوصيل داخل ليبيا — رقم الشحنة ${ref}.`, `/orders/${code}`);
  return true;
}
// نتيجة شركة التوصيل: وصل ⟵ «تم التسليم» (بنقاطه)، تعذّر ⟵ يعود لقائمة الجاهز مع السبب
export async function courierResult(db: D1Database, code: string, result: 'delivered' | 'failed', note: string | null, byUserId: number | null) {
  const o = await db.prepare("SELECT id,courier FROM orders WHERE code=? AND courier_status='with_courier'").bind(code).first<{ id: number; courier: string }>();
  if (!o) return false;
  if (result === 'delivered') {
    await db.prepare("UPDATE orders SET courier_status='delivered' WHERE id=?").bind(o.id).run();
    await setOrderStatus(db, code, 'delivered', byUserId, `سلّمه ${o.courier} للزبون`);
  } else {
    await db.batch([
      db.prepare("UPDATE orders SET courier_status='failed',courier_note=?,updated_at=datetime('now') WHERE id=?").bind(note, o.id),
      db.prepare("INSERT INTO order_events(order_id,status,note,by_user_id) VALUES(?,'ready',?,?)").bind(o.id, `تعذّر التوصيل عبر ${o.courier}${note ? ' — ' + note : ''}`, byUserId),
    ]);
  }
  return true;
}
