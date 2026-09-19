// الدفع الإلكتروني عبر ماي باي: بدء الدفع، العودة، الإلغاء، الويبهوك، وصفحة محاكاة للاختبار المحلي
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { PAYMENT_METHODS } from '../types';
import { Layout, Flash } from '../views/layout';
import { getCategories, fmt } from '../lib/db';
import { loadSettings } from '../lib/pricing';
import { loadMyPay, createPayment, verifySignature, parseWebhook, hmacHex } from '../lib/mypay';
import { markOrderPaid } from '../lib/orders';

const pay = new Hono<Env>();

const base = async (c: Context<Env>) => ({ user: c.get('user'), cartCount: c.get('cartCount'), categories: await getCategories(c.env.DB) });

async function log(db: D1Database, paymentId: number | null, direction: 'out' | 'in', url: string | null, status: number, request: any, response: string, ok = true) {
  await db.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(?,?,?,?,?,?,?)')
    .bind(paymentId, direction, url, status, typeof request === 'string' ? request : JSON.stringify(request), response.slice(0, 4000), ok ? 1 : 0).run();
}

// ---------- بدء الدفع ----------
pay.get('/pay/start/:code', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login?next=' + encodeURIComponent(c.req.path));
  const db = c.env.DB;
  const o = await db.prepare('SELECT * FROM orders WHERE code=? AND user_id=?').bind(c.req.param('code'), u.id).first<any>();
  if (!o) return c.notFound();
  if (o.status !== 'pending_payment') return c.redirect(`/orders/${o.code}`);
  const method = c.req.query('method') && PAYMENT_METHODS[c.req.query('method')!] ? c.req.query('method')! : o.payment_method;
  const pm = PAYMENT_METHODS[method];
  if (!pm?.online) return c.redirect(`/orders/${o.code}`);
  if (method !== o.payment_method) await db.prepare('UPDATE orders SET payment_method=? WHERE id=?').bind(method, o.id).run();
  const s = await loadSettings(db);
  const cfg = loadMyPay(s, c.env);
  const origin = new URL(c.req.url).origin;
  // دفعة جديدة لكل محاولة
  const n = await db.prepare('SELECT COUNT(*) n FROM payments WHERE order_id=?').bind(o.id).first<{ n: number }>();
  const trxRef = `${o.code}-${(n?.n ?? 0) + 1}`;
  const ins = await db.prepare("INSERT INTO payments(order_id,provider,gateway,amount_lyd,currency,status,trx_ref) VALUES(?,'mypay',?,?,'LYD','created',?)").bind(o.id, pm.gateway, o.total_lyd, trxRef).run();
  const pid = ins.meta.last_row_id as number;
  const r = await createPayment(cfg, {
    trxRef, orderCode: o.code, amount: o.total_lyd, currency: 'LYD', gateway: pm.gateway!, name: o.ship_name, phone: o.ship_phone, email: u.email,
    returnUrl: `${origin}/pay/return?ref=${trxRef}`, cancelUrl: `${origin}/pay/cancel?ref=${trxRef}`, webhookUrl: `${origin}/api/mypay/webhook`,
  }, origin);
  await log(db, pid, 'out', cfg.mode === 'mock' ? '(mock)' : cfg.baseUrl + cfg.createPath, r.status, r.request, r.response, r.ok);
  if (!r.ok) {
    await db.prepare("UPDATE payments SET status='failed',raw=?,updated_at=datetime('now') WHERE id=?").bind(r.error ?? r.response, pid).run();
    const b = await base(c);
    return c.html(<Layout {...b} title="تعذر بدء الدفع"><div class="form"><h1>تعذر بدء الدفع</h1><Flash type="err" msg={r.error} /><p style="font-size:14px;color:#666">يمكنك المحاولة مرة أخرى أو اختيار طريقة دفع أخرى من صفحة الطلب.</p><a class="btn" href={`/pay/start/${o.code}`}>إعادة المحاولة</a> <a class="btn ghost" href={`/orders/${o.code}`}>صفحة الطلب</a></div></Layout>);
  }
  await db.prepare("UPDATE payments SET status='pending',token=?,provider_ref=?,checkout_url=?,raw=?,updated_at=datetime('now') WHERE id=?").bind(r.token ?? null, r.providerRef ?? null, r.url!, r.response, pid).run();
  return c.redirect(r.url!);
});

// ---------- العودة من البوابة ----------
pay.get('/pay/return', async (c) => {
  const ref = c.req.query('ref') ?? '';
  const p = await c.env.DB.prepare('SELECT p.*,o.code FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.trx_ref=?').bind(ref).first<any>();
  if (!p) return c.notFound();
  if (p.status === 'paid') return c.redirect(`/orders/${p.code}?paid=1`);
  const b = await base(c);
  return c.html(
    <Layout {...b} title="جارٍ تأكيد الدفع">
      <div class="form" style="text-align:center" id="payWait" data-ref={ref} data-order={p.code}>
        <div class="spinner"></div>
        <h1>جارٍ تأكيد الدفع…</h1>
        <p style="color:#666;font-size:14px">ننتظر تأكيد ماي باي لعملية <b class="mono" style="display:inline">{ref}</b>. لا تغلقي الصفحة.</p>
        <p id="payMsg" style="font-size:13px;color:#888"></p>
        <a class="btn ghost sm" href={`/orders/${p.code}`}>الذهاب لصفحة الطلب</a>
      </div>
    </Layout>,
  );
});
pay.get('/pay/status', async (c) => {
  const p = await c.env.DB.prepare('SELECT p.status,o.code,o.status AS order_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.trx_ref=?').bind(c.req.query('ref') ?? '').first<any>();
  return c.json(p ? { status: p.status, order: p.code, order_status: p.order_status } : { status: 'unknown' });
});
pay.get('/pay/cancel', async (c) => {
  const ref = c.req.query('ref') ?? '';
  const p = await c.env.DB.prepare('SELECT p.id,p.status,o.code FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.trx_ref=?').bind(ref).first<any>();
  if (!p) return c.notFound();
  if (p.status === 'pending' || p.status === 'created') await c.env.DB.prepare("UPDATE payments SET status='cancelled',updated_at=datetime('now') WHERE id=?").bind(p.id).run();
  return c.redirect(`/orders/${p.code}?pay=cancelled`);
});

// ---------- الويبهوك (مصدر الحقيقة) ----------
export async function handleWebhook(env: Env['Bindings'], rawBody: string, signature: string | undefined, origin: string) {
  const db = env.DB;
  const s = await loadSettings(db);
  const cfg = loadMyPay(s, env);
  const valid = await verifySignature(cfg.webhookSecret, rawBody, signature);
  let j: any = null; try { j = JSON.parse(rawBody); } catch {}
  const w = parseWebhook(j);
  const p = w.trxRef ? await db.prepare('SELECT * FROM payments WHERE trx_ref=? OR provider_ref=?').bind(w.trxRef, w.trxRef).first<any>() : null;
  if (!valid) {
    await log(db, p?.id ?? null, 'in', origin + '/api/mypay/webhook', 401, rawBody, 'توقيع غير صالح — رُفض', false);
    return { status: 401, body: { ok: false, error: 'invalid signature' } };
  }
  if (!p) {
    await log(db, null, 'in', origin + '/api/mypay/webhook', 404, rawBody, 'لا توجد دفعة بهذا المرجع', false);
    return { status: 404, body: { ok: false, error: 'unknown reference' } };
  }
  if (w.success) {
    if (Math.abs((w.amount || p.amount_lyd) - p.amount_lyd) > 0.01) {
      await log(db, p.id, 'in', origin + '/api/mypay/webhook', 400, rawBody, `المبلغ ${w.amount} لا يطابق ${p.amount_lyd}`, false);
      return { status: 400, body: { ok: false, error: 'amount mismatch' } };
    }
    await db.prepare("UPDATE payments SET status='paid',provider_ref=COALESCE(?,provider_ref),gateway=COALESCE(?,gateway),raw=?,updated_at=datetime('now') WHERE id=?").bind(w.providerRef ?? null, w.gateway ?? null, rawBody.slice(0, 4000), p.id).run();
    await markOrderPaid(db, p.order_id, `MyPay ${w.providerRef ?? p.trx_ref}`, null, `دفع إلكتروني عبر ماي باي (${w.gateway ?? p.gateway}) — ${w.providerRef ?? ''}`);
    await log(db, p.id, 'in', origin + '/api/mypay/webhook', 200, rawBody, 'تم تأكيد الدفع وتحويل الطلب إلى مدفوع');
  } else if (w.failed) {
    await db.prepare("UPDATE payments SET status='failed',raw=?,updated_at=datetime('now') WHERE id=? AND status<>'paid'").bind(rawBody.slice(0, 4000), p.id).run();
    await log(db, p.id, 'in', origin + '/api/mypay/webhook', 200, rawBody, 'الدفع فشل/أُلغي');
  } else {
    await log(db, p.id, 'in', origin + '/api/mypay/webhook', 200, rawBody, `حدث غير معروف: ${w.status}`);
  }
  return { status: 200, body: { ok: true } };
}
pay.post('/api/mypay/webhook', async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header('x-mypay-signature') ?? c.req.header('http_x_mypay_signature');
  const r = await handleWebhook(c.env, raw, sig, new URL(c.req.url).origin);
  return c.json(r.body, r.status as any);
});

// ---------- صفحة محاكاة بوابة ماي باي (للاختبار المحلي فقط: mypay_mode=mock) ----------
const GW: Record<string, string> = { moamalat: 'بطاقة معاملات', sadad: 'سداد', edfali: 'إدفعلي', mobicash: 'موبي كاش', 'yasr-pay': 'يسر باي', 'masrafi-pay': 'مصرفي باي', 'sahary-pay': 'صحاري باي' };
pay.get('/pay/mock/:token', async (c) => {
  const s = await loadSettings(c.env.DB);
  if (s.mypay_mode !== 'mock') return c.text('المحاكاة معطلة', 404);
  const p = await c.env.DB.prepare('SELECT p.*,o.code,o.ship_name FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.token=?').bind(c.req.param('token')).first<any>();
  if (!p) return c.notFound();
  return c.html(
    <html lang="ar" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>MyPay — محاكاة</title><link rel="stylesheet" href="/style.css" /></head>
      <body style="background:#eef2f7;padding-bottom:0">
        <div class="mock-gw">
          <div class="mock-hdr"><b>MyPay</b> <span>بيئة محاكاة — لا يتم خصم أي مبلغ</span></div>
          <div class="mock-body">
            <div class="row"><span>التاجر</span><b>دلال</b></div>
            <div class="row"><span>الطلب</span><b>{p.code}</b></div>
            <div class="row"><span>المرجع</span><b class="mono" style="display:inline">{p.trx_ref}</b></div>
            <div class="row"><span>الوسيلة</span><b>{GW[p.gateway] ?? p.gateway}</b></div>
            <div class="row tot"><span>المبلغ</span><b>{fmt(p.amount_lyd)}</b></div>
            {p.status === 'paid' ? <Flash msg="هذه الدفعة مؤكدة مسبقًا" /> : (
              <form method="post" action={`/pay/mock/${p.token}`} style="margin-top:14px">
                {p.gateway === 'moamalat' ? <><label>رقم البطاقة</label><input type="text" name="card" value="6394 1234 5678 9010" /><div class="inline"><div><label>انتهاء</label><input type="text" name="exp" value="12/28" /></div><div><label>CVV</label><input type="text" name="cvv" value="123" /></div></div></>
                  : <><label>رقم الهاتف</label><input type="tel" name="phone" value="0910000000" /><label>رمز التحقق OTP</label><input type="text" name="otp" value="1234" /></>}
                <div class="inline" style="margin-top:14px">
                  <button class="btn ok" name="result" value="success" style="flex:1">تأكيد الدفع ✓</button>
                  <button class="btn" name="result" value="failed" style="background:#d3262b">فشل الدفع</button>
                  <a class="btn ghost" href={`/pay/cancel?ref=${p.trx_ref}`}>إلغاء</a>
                </div>
              </form>
            )}
          </div>
          <div class="mock-ftr">هذه الصفحة تحاكي صفحة الدفع المستضافة لدى ماي باي وترسل Webhook موقّعًا إلى دلال تمامًا كما تفعل البوابة الحقيقية.</div>
        </div>
      </body></html>,
  );
});
pay.post('/pay/mock/:token', async (c) => {
  const db = c.env.DB;
  const s = await loadSettings(db);
  if (s.mypay_mode !== 'mock') return c.text('المحاكاة معطلة', 404);
  const p = await db.prepare('SELECT p.*,o.code FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.token=?').bind(c.req.param('token')).first<any>();
  if (!p) return c.notFound();
  const f = await c.req.parseBody();
  const ok = f.result === 'success';
  const payload = JSON.stringify({ event: ok ? 'payment.success' : 'payment.failed', type: 'payment', transaction_id: 'MP' + Date.now(), token: p.token, trx_ref: p.trx_ref, status: ok ? 'success' : 'failed', gateway: (p.gateway ?? 'moamalat').toUpperCase(), amount: p.amount_lyd, currency: 'LYD', timestamp: new Date().toISOString() });
  const secret = c.env.MYPAY_WEBHOOK_SECRET || s.mypay_webhook_secret || 'mock-secret';
  if (!s.mypay_webhook_secret && !c.env.MYPAY_WEBHOOK_SECRET) await db.prepare("INSERT INTO settings(key,value) VALUES('mypay_webhook_secret','mock-secret') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  const sig = await hmacHex(secret, payload);
  const origin = new URL(c.req.url).origin;
  // تُرسل كما ترسلها البوابة: طلب HTTP حقيقي إلى نقطة الويبهوك مع الترويسة الموقّعة
  let delivered = false;
  try {
    const res = await fetch(`${origin}/api/mypay/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mypay-signature': sig }, body: payload });
    delivered = res.ok;
  } catch {}
  if (!delivered) await handleWebhook(c.env, payload, sig, origin);   // احتياط إن لم يسمح البيئة بالطلب الذاتي
  return c.redirect(ok ? `/pay/return?ref=${p.trx_ref}` : `/orders/${p.code}?pay=failed`);
});

export default pay;
