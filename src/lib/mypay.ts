// عميل بوابة ماي باي (mypay.ly)
// المصدر: docs.mypay.ly — المصادقة بمفتاح API من لوحة التاجر، إنشاء دفعة عبر /payment/create،
// وتأكيد الدفع عبر Webhook موقّع بـ HMAC-SHA256 في الترويسة X-MyPay-Signature.
// الحقول أدناه قابلة للضبط من لوحة الإدارة، وكل طلب/رد يُسجَّل في payment_log لتصحيح أي اختلاف بسرعة.
import type { Settings } from './pricing';

export type MyPayConfig = {
  mode: 'mock' | 'live';
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  gateways: string[];
  createPath: string;
  statusPath: string;
};

export function loadMyPay(s: Settings, env: { MYPAY_API_KEY?: string; MYPAY_WEBHOOK_SECRET?: string }): MyPayConfig {
  return {
    mode: s.mypay_mode === 'live' ? 'live' : 'mock',
    baseUrl: (s.mypay_base_url || 'https://api.mypay.ly').replace(/\/+$/, ''),
    apiKey: env.MYPAY_API_KEY || s.mypay_api_key || '',
    webhookSecret: env.MYPAY_WEBHOOK_SECRET || s.mypay_webhook_secret || '',
    gateways: (s.mypay_gateways || 'moamalat,sadad,edfali,mobicash').split(',').map(x => x.trim()).filter(Boolean),
    createPath: s.mypay_create_path || '/payment/create',
    statusPath: s.mypay_status_path || '/payment/status',
  };
}

export type CreateReq = {
  trxRef: string; orderCode: string; amount: number; currency: string; gateway: string;
  name: string; phone: string; email?: string | null;
  returnUrl: string; cancelUrl: string; webhookUrl: string;
};
export type CreateRes = { ok: boolean; url?: string; token?: string; providerRef?: string; status: number; request: any; response: string; error?: string };

// يستخرج رابط الدفع من أي شكل رد محتمل
function pickUrl(j: any): string | undefined {
  if (!j || typeof j !== 'object') return;
  for (const k of ['url', 'payment_url', 'checkout_url', 'redirect_url', 'paymentUrl', 'checkoutUrl', 'redirectUrl', 'link']) if (typeof j[k] === 'string' && /^https?:/.test(j[k])) return j[k];
  for (const k of ['data', 'result', 'payment', 'payload']) { const u = pickUrl(j[k]); if (u) return u; }
}
function pickStr(j: any, keys: string[]): string | undefined {
  if (!j || typeof j !== 'object') return;
  for (const k of keys) if (j[k] != null && typeof j[k] !== 'object') return String(j[k]);
  for (const k of ['data', 'result', 'payment', 'payload']) { const v = pickStr(j[k], keys); if (v) return v; }
}

export async function createPayment(cfg: MyPayConfig, r: CreateReq, origin: string): Promise<CreateRes> {
  const body = {
    amount: r.amount, currency: r.currency, order_id: r.orderCode, reference: r.trxRef, trx_ref: r.trxRef,
    billing_name: r.name, billing_phone: r.phone, billing_email: r.email ?? undefined,
    return_url: r.returnUrl, cancel_url: r.cancelUrl, webhook_url: r.webhookUrl, gateway: r.gateway, description: `طلب دلال ${r.orderCode}`,
  };
  if (cfg.mode === 'mock') {
    const token = 'mock_' + r.trxRef;
    return { ok: true, url: `${origin}/pay/mock/${token}`, token, status: 200, request: body, response: JSON.stringify({ mock: true, token }) };
  }
  if (!cfg.apiKey) return { ok: false, status: 0, request: body, response: '', error: 'لم يُضبط مفتاح API لماي باي' };
  const url = cfg.baseUrl + cfg.createPath;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${cfg.apiKey}`, 'x-api-key': cfg.apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let j: any = null; try { j = JSON.parse(text); } catch {}
    const link = pickUrl(j);
    if (!res.ok || !link) return { ok: false, status: res.status, request: body, response: text, error: !res.ok ? `البوابة ردت ${res.status}` : 'الرد لا يحتوي رابط دفع' };
    return { ok: true, url: link, token: pickStr(j, ['token', 'payment_token', 'id', 'payment_id']), providerRef: pickStr(j, ['transaction_id', 'trx_id', 'id']), status: res.status, request: body, response: text };
  } catch (e: any) {
    return { ok: false, status: 0, request: body, response: '', error: 'تعذر الاتصال بالبوابة: ' + e.message };
  }
}

export async function checkConnection(cfg: MyPayConfig): Promise<{ ok: boolean; status: number; detail: string }> {
  if (cfg.mode === 'mock') return { ok: true, status: 200, detail: 'وضع المحاكاة — لا اتصال خارجي' };
  if (!cfg.apiKey) return { ok: false, status: 0, detail: 'مفتاح API فارغ' };
  try {
    const res = await fetch(cfg.baseUrl + '/authentication/token', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}`, 'x-api-key': cfg.apiKey }, body: JSON.stringify({ api_key: cfg.apiKey }) });
    const t = (await res.text()).slice(0, 600);
    return { ok: res.ok, status: res.status, detail: t };
  } catch (e: any) { return { ok: false, status: 0, detail: e.message }; }
}

const enc = new TextEncoder();
export async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export async function verifySignature(secret: string, rawBody: string, header: string | undefined) {
  if (!secret || !header) return false;
  const hex = await hmacHex(secret, rawBody);
  const h = header.trim().replace(/^sha256=/i, '');
  if (safeEq(h.toLowerCase(), hex)) return true;
  // بعض البوابات ترسل base64
  const b64 = btoa(hex.match(/../g)!.map(x => String.fromCharCode(parseInt(x, 16))).join(''));
  return safeEq(h, b64);
}

// يفسّر حمولة الويبهوك أيًا كان شكلها
export function parseWebhook(j: any) {
  const g = (keys: string[]) => pickStr(j, keys);
  const status = (g(['status', 'event', 'type']) ?? '').toLowerCase();
  return {
    trxRef: g(['trx_ref', 'reference', 'order_id', 'merchant_reference', 'ref']),
    providerRef: g(['transaction_id', 'trx_id', 'id', 'payment_id']),
    gateway: g(['gateway', 'method', 'channel']),
    amount: parseFloat(g(['amount', 'total']) ?? '0'),
    success: /success|paid|completed|approved/.test(status) && !/fail|cancel|reject/.test(status),
    failed: /fail|cancel|reject|declin/.test(status),
    status,
  };
}
