import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS } from '../types';
import { PartnerShell } from '../views/dash';
import { Flash } from '../views/layout';
import { fmt, imgUrl, timeAgo, notify } from '../lib/db';
import { setOrderStatus } from '../lib/orders';
import { requireRole } from '../lib/auth';
import { PARTNER_FLOW } from '../types';
import { loadSettings } from '../lib/pricing';
import { saveMedia, createInvoice, newSecret, testDispatch, RATE_KEYS, RATE_AR, feeMargin, syncPricingPartner, pricingPartnerId } from '../lib/partner';

const partner = new Hono<Env>();
partner.use('*', requireRole('partner', 'admin'));

async function ctx(c: Context<Env>) {
  const u = c.get('user')!;
  const db = c.env.DB;
  // الأدمن يستطيع عرض لوحة أي شريك عبر ?partner=ID
  const pid = u.role === 'admin' ? Number(c.req.query('partner') ?? 0) || (await db.prepare('SELECT id FROM partners ORDER BY id LIMIT 1').first<any>())?.id : u.partner_id;
  const p = await db.prepare('SELECT * FROM partners WHERE id=?').bind(pid).first<any>();
  const counts = await db.prepare('SELECT status,COUNT(*) n FROM orders WHERE partner_id=? GROUP BY status').bind(pid).all<any>();
  return { u, db, pid, p: p ?? { name: '—' }, counts: Object.fromEntries(counts.results.map((r: any) => [r.status, r.n])) };
}
// الأدمن يفتح لوحة شريك بعينه بـ?partner=ID: النماذج والتحويلات تحمل المعرّف وإلا حفظت على الشريك الأول
const pq = (x: { u: any; pid: number }) => (x.u.role === 'admin' ? `?partner=${x.pid}` : '');
const pq2 = (x: { u: any; pid: number }) => (x.u.role === 'admin' ? `&partner=${x.pid}` : '');
const shell = (c: Context<Env>, x: any, active: string, title: string, body: any) => c.html(<PartnerShell user={x.u} partner={x.p} active={active} title={title} counts={x.counts}>{body}</PartnerShell>);

async function ordersWithItems(db: D1Database, pid: number, statuses: string[]) {
  const q = statuses.map(() => '?').join(',');
  const orders = await db.prepare(`SELECT o.*,u.name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.partner_id=? AND o.status IN (${q}) ORDER BY o.updated_at ASC`).bind(pid, ...statuses).all<any>();
  if (!orders.results.length) return [];
  // D1 يرفض أكثر من 100 متغيّر مربوط في الجملة: بـ101 طلب مدفوع سقطت صفحة شاهين كلها بـ500
  // («too many SQL variables»). المعرّفات أعداد صحيحة من القاعدة نفسها فتُكتب حرفيًا.
  const ids = orders.results.map(o => Number(o.id)).filter(Number.isInteger);
  const items = await db.prepare(`SELECT oi.*,(SELECT url FROM product_images i WHERE i.product_id=oi.product_id ORDER BY sort LIMIT 1) AS image FROM order_items oi WHERE order_id IN (${ids.join(',')})`).all<any>();
  return orders.results.map(o => ({ ...o, items: items.results.filter(i => i.order_id === o.id) }));
}

const ItemRow = (i: any, o: any) => (
  <tr>
    <td><img src={imgUrl(i.image)} /></td>
    <td>{i.title_ar}<br /><a class="src-link" href={i.source_url ?? `https://detail.1688.com/offer/${i.source_offer_id}.html`} target="_blank">🔗 فتح في 1688 — {i.source_offer_id}</a></td>
    <td><b>{[i.color, i.size].filter(Boolean).join(' · ') || '—'}</b></td>
    <td><b style="font-size:16px">× {i.qty}</b></td>
    <td>
      {i.purchase_status === 'pending' ? (
        <form method="post" action={`/partner/item/${i.id}/purchased`} class="inline">
          <input type="hidden" name="code" value={o.code} />
          <input type="text" name="supplier_order_no" placeholder="رقم طلب 1688" style="width:130px" required />
          <input type="number" step="0.01" name="actual_cost_cny" placeholder="التكلفة ¥" style="width:90px" required />
          <button class="btn sm ok">تم الشراء</button>
          <button class="btn sm" formaction={`/partner/item/${i.id}/unavailable`} style="background:#d3262b">نفد</button>
        </form>
      ) : <span class={`status ${i.purchase_status === 'purchased' ? 'green' : 'red'}`}>{{ purchased: `تم — ${i.supplier_order_no} — ${i.actual_cost_cny} ¥`, unavailable: 'نفد عند المورد', substituted: 'بديل' }[i.purchase_status as string]}</span>}
    </td>
  </tr>
);

const OrderCard = (o: any, extra?: any) => (
  <div class="card-box">
    <div class="inline" style="justify-content:space-between"><h3 style="margin:0"><a href={`/partner/order/${o.code}`} class="po-link">{o.code}</a> <span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></h3><small style="color:#888">{o.name} · {o.ship_city} · {timeAgo(o.updated_at)}</small></div>
    <div class="tbl-wrap"><table class="tbl" style="margin-top:8px"><tr><th></th><th>المنتج</th><th>اللون / المقاس</th><th>الكمية</th><th>الشراء</th></tr>{o.items.map((i: any) => ItemRow(i, o))}</table></div>
    {extra}
  </div>
);

// ---------- بانتظار الشراء ----------
partner.get('/', async (c) => {
  const x = await ctx(c);
  const orders = await ordersWithItems(x.db, x.pid, ['paid']);
  return shell(c, x, 'queue', `بانتظار الشراء (${orders.length})`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <p style="font-size:13px;color:#666">هذه الطلبات دُفعت. افتح رابط كل منتج، اشترِه بالمواصفة والكمية المحددة، وأدخل رقم طلب 1688 والتكلفة. عنوان الاستلام: <b>{x.p.warehouse_address ?? 'مخزن الشريك'}</b></p>
      {orders.length === 0 && <div class="empty">لا طلبات بانتظار الشراء 🎉</div>}
      {orders.map(o => OrderCard(o, <form method="post" action={`/partner/order/${o.code}/status`} class="inline" style="margin-top:8px"><input type="hidden" name="status" value="purchasing" /><button class="btn sm dark">بدأت الشراء ⏳</button></form>))}
    </>
  ));
});

// ---------- قيد الشراء ----------
partner.get('/purchasing', async (c) => {
  const x = await ctx(c);
  const orders = await ordersWithItems(x.db, x.pid, ['purchasing', 'purchased']);
  return shell(c, x, 'purchasing', `قيد الشراء / تم الشراء (${orders.length})`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {orders.length === 0 && <div class="empty">لا شيء هنا</div>}
      {orders.map(o => OrderCard(o, (
        <div class="inline" style="margin-top:8px">
          {o.items.every((i: any) => i.purchase_status !== 'pending') && o.status !== 'purchased' && <form method="post" action={`/partner/order/${o.code}/status`}><input type="hidden" name="status" value="purchased" /><button class="btn sm ok">اكتمل الشراء ✓</button></form>}
          {o.status === 'purchased' && <form method="post" action={`/partner/order/${o.code}/status`}><input type="hidden" name="status" value="at_warehouse" /><button class="btn sm ok">وصلت البضاعة للمخزن 🏭</button></form>}
        </div>
      )))}
    </>
  ));
});

// ---------- في المخزن ----------
partner.get('/warehouse', async (c) => {
  const x = await ctx(c);
  const orders = await ordersWithItems(x.db, x.pid, ['at_warehouse']);
  const open = await x.db.prepare("SELECT id,code,method FROM shipments WHERE partner_id=? AND status='open'").bind(x.pid).all<any>();
  return shell(c, x, 'warehouse', `في المخزن — جاهز للتجميع (${orders.length})`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <div class="card-box inline"><form method="post" action="/partner/shipments/new" class="inline"><select name="method"><option value="air">شحنة جوية ✈️</option><option value="sea">شحنة بحرية 🚢</option></select><button class="btn sm dark">+ فتح شحنة جديدة</button></form>
        {open.results.length > 0 && <span style="font-size:13px">الشحنات المفتوحة: {open.results.map(s => <a href="/partner/shipments" class="status purple">{s.code}</a>)}</span>}</div>
      {orders.length === 0 && <div class="empty">لا طلبات في المخزن</div>}
      {orders.map(o => (
        <div class="card-box">
          <div class="inline" style="justify-content:space-between"><h3 style="margin:0"><a href={`/partner/order/${o.code}`} class="po-link">{o.code}</a></h3><small style="color:#888">{o.name} · {o.ship_city}</small></div>
          <table class="tbl" style="margin-top:8px"><tr><th></th><th>المنتج</th><th>المواصفة</th><th>الكمية</th><th>الوزن الفعلي (غ)</th><th>صورة الفحص</th></tr>
            {o.items.map((i: any) => <tr><form method="post" action={`/partner/item/${i.id}/inspect`}><input type="hidden" name="code" value={o.code} /><td><img src={imgUrl(i.image)} /></td><td>{i.title_ar}</td><td>{[i.color, i.size].filter(Boolean).join(' · ') || '—'}</td><td>× {i.qty}</td><td><input type="number" name="actual_weight_g" value={i.actual_weight_g ?? ''} style="width:90px" /></td><td class="inline"><input type="url" name="proof_image_url" value={i.proof_image_url ?? ''} placeholder="رابط الصورة" style="width:180px" /><button class="btn sm ghost">حفظ</button></td></form></tr>)}
          </table>
          {open.results.length > 0 && <form method="post" action={`/partner/order/${o.code}/consolidate`} class="inline" style="margin-top:8px"><select name="shipment_id">{open.results.map(s => <option value={s.id}>{s.code} ({s.method === 'air' ? 'جوي' : 'بحري'})</option>)}</select><button class="btn sm ok">ضمّ إلى الشحنة 📦</button></form>}
        </div>
      ))}
    </>
  ));
});

// ---------- الشحنات ----------
partner.get('/shipments', async (c) => {
  const x = await ctx(c);
  const ships = await x.db.prepare("SELECT s.*,(SELECT COUNT(*) FROM orders o WHERE o.shipment_id=s.id) AS n,(SELECT COALESCE(SUM(oi.actual_weight_g*oi.qty),0) FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.shipment_id=s.id) AS w FROM shipments s WHERE partner_id=? ORDER BY s.id DESC").bind(x.pid).all<any>();
  const SS: Record<string, string> = { open: 'مفتوحة', shipped: 'شُحنت', arrived: 'وصلت ليبيا', customs: 'في الجمارك', released: 'خرجت من الجمارك' };
  return shell(c, x, 'shipments', 'الشحنات المجمعة', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {ships.results.length === 0 && <div class="empty">لا شحنات بعد — افتح واحدة من صفحة المخزن</div>}
      {ships.results.map(s => (
        <div class="card-box">
          <div class="inline" style="justify-content:space-between"><h3 style="margin:0">{s.code} {s.method === 'air' ? '✈️' : '🚢'} <span class="status purple">{SS[s.status]}</span></h3><small>{s.n} طلب · {(s.w / 1000).toFixed(1)} كغ · {timeAgo(s.created_at)}</small></div>
          <form method="post" action={`/partner/shipments/${s.id}/status`} class="inline" style="margin-top:8px">
            <input type="text" name="tracking_no" value={s.tracking_no ?? ''} placeholder="رقم التتبع / البوليصة" />
            <input type="number" step="0.1" name="total_weight_kg" value={s.total_weight_kg ?? ''} placeholder="الوزن الكلي كغ" style="width:120px" />
            {s.status === 'open' && <button class="btn sm dark" name="status" value="shipped">شُحنت إلى ليبيا ✈️</button>}
            {s.status === 'shipped' && <button class="btn sm dark" name="status" value="arrived">وصلت ليبيا 🇱🇾</button>}
            {s.status === 'arrived' && <button class="btn sm warn" name="status" value="customs">دخلت الجمارك</button>}
            {s.status === 'customs' && <button class="btn sm ok" name="status" value="released">خرجت من الجمارك — جاهزة للتسليم</button>}
            {s.status === 'released' && <span class="status green">اكتملت</span>}
            <button class="btn sm ghost" name="status" value={s.status}>حفظ</button>
          </form>
        </div>
      ))}
    </>
  ));
});

// ---------- التسليم في ليبيا ----------
partner.get('/delivery', async (c) => {
  const x = await ctx(c);
  const orders = await ordersWithItems(x.db, x.pid, ['ready']);
  return shell(c, x, 'delivery', `جاهز للتسليم (${orders.length})`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {orders.length === 0 && <div class="empty">لا طلبات جاهزة للتسليم</div>}
      <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>الهاتف</th><th>العنوان</th><th>الدفع المتبقي</th><th></th></tr>
        {orders.map(o => <tr><td><b>{o.code}</b></td><td>{o.ship_name}</td><td>{o.ship_phone}</td><td>{o.ship_city} — {o.ship_address}</td><td>{o.payment_method === 'cod_deposit' ? <b style="color:#d68b00">{fmt(o.total_lyd * 0.7)} عند الاستلام</b> : 'مدفوع بالكامل'}</td><td><form method="post" action={`/partner/order/${o.code}/status`}><input type="hidden" name="status" value="delivered" /><button class="btn sm ok">تم التسليم ✓</button></form></td></tr>)}
      </table></div>
    </>
  ));
});

// ---------- كل الطلبات ----------
partner.get('/all', async (c) => {
  const x = await ctx(c);
  const rows = await x.db.prepare('SELECT o.code,o.status,o.ship_city,o.updated_at,u.name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.partner_id=? ORDER BY o.id DESC LIMIT 300').bind(x.pid).all<any>();
  return shell(c, x, 'all', 'كل الطلبات', (
    <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>المدينة</th><th>الحالة</th><th>آخر تحديث</th></tr>{rows.results.map(o => <tr><td><a href={`/partner/order/${o.code}`} class="po-link">{o.code}</a></td><td>{o.name}</td><td>{o.ship_city}</td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{timeAgo(o.updated_at)}</td></tr>)}</table></div>
  ));
});

// ---------- الإجراءات ----------
const setStatus = (db: D1Database, code: string, status: string, byUserId: number, note?: string) => setOrderStatus(db, code, status, byUserId, note);

// الشريك لا يلمس إلا طلباته: كانت الإجراءات تقبل أي رقم طلب — من يعرف رقم طلب شريك آخر كان يستطيع تحريكه
async function owns(c: Context<Env>, code?: string, itemId?: number) {
  const u = c.get('user')!; if (u.role === 'admin') return true;
  const row = code ? await c.env.DB.prepare('SELECT partner_id FROM orders WHERE code=?').bind(code).first<any>()
    : await c.env.DB.prepare('SELECT o.partner_id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').bind(itemId).first<any>();
  return !!row && row.partner_id === u.partner_id;
}
partner.use('/order/:code/*', async (c, next) => (await owns(c, c.req.param('code'))) ? next() : c.text('هذا الطلب ليس مسندًا إليكم', 403));
partner.use('/item/:id/*', async (c, next) => (await owns(c, undefined, Number(c.req.param('id')))) ? next() : c.text('هذا الطلب ليس مسندًا إليكم', 403));

partner.post('/order/:code/status', async (c) => {
  const f = await c.req.parseBody(); const st = String(f.status);
  if (!ORDER_STATUS[st]) return c.text('حالة غير صالحة', 400);
  await setStatus(c.env.DB, c.req.param('code'), st, c.get('user')!.id);
  const back: Record<string, string> = { purchasing: '/partner/purchasing', purchased: '/partner/purchasing', at_warehouse: '/partner/warehouse', delivered: '/partner/delivery' };
  return c.redirect((back[st] ?? '/partner') + '?ok=1');
});

partner.post('/item/:id/purchased', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  await db.prepare("UPDATE order_items SET purchase_status='purchased',supplier_order_no=?,actual_cost_cny=? WHERE id=?").bind(String(f.supplier_order_no), parseFloat(String(f.actual_cost_cny)), Number(c.req.param('id'))).run();
  // إن كان الطلب لا يزال paid يتحول إلى purchasing تلقائيًا
  const o = await db.prepare('SELECT o.code,o.status FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').bind(Number(c.req.param('id'))).first<any>();
  if (o?.status === 'paid') await setStatus(db, o.code, 'purchasing', c.get('user')!.id);
  await db.prepare('UPDATE products SET sales=sales+1 WHERE id=(SELECT product_id FROM order_items WHERE id=?)').bind(Number(c.req.param('id'))).run();
  return c.redirect('/partner/purchasing?ok=1');
});

partner.post('/item/:id/unavailable', async (c) => {
  const db = c.env.DB; const id = Number(c.req.param('id'));
  const it = await db.prepare('SELECT oi.product_id,oi.title_ar,o.code,o.user_id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').bind(id).first<any>();
  await db.batch([
    db.prepare("UPDATE order_items SET purchase_status='unavailable' WHERE id=?").bind(id),
    db.prepare("UPDATE products SET in_stock=0,last_checked_at=datetime('now') WHERE id=?").bind(it.product_id),   // يُخفى فورًا من الموقع
  ]);
  await notify(db, it.user_id, `منتج غير متوفر في طلبك ${it.code}`, `"${it.title_ar}" نفد عند المورد. سيتواصل معك فريق هدهدي لاختيار بديل أو استرجاع قيمته.`, `/orders/${it.code}`);
  return c.redirect('/partner?ok=1');
});

partner.post('/item/:id/inspect', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id'));
  await db.prepare('UPDATE order_items SET actual_weight_g=?,proof_image_url=? WHERE id=?').bind(f.actual_weight_g ? Number(f.actual_weight_g) : null, f.proof_image_url ? String(f.proof_image_url) : null, id).run();
  // تعلّم الوزن: حدّث وزن المنتج نفسه ليتحسن التسعير مستقبلًا
  if (f.actual_weight_g) await db.prepare('UPDATE products SET weight_g=? WHERE id=(SELECT product_id FROM order_items WHERE id=?)').bind(Number(f.actual_weight_g), id).run();
  return c.redirect('/partner/warehouse?ok=1');
});

partner.post('/shipments/new', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const r = await c.env.DB.prepare("INSERT INTO shipments(partner_id,code,method) VALUES(?,'tmp',?)").bind(x.pid, String(f.method)).run();
  await c.env.DB.prepare('UPDATE shipments SET code=? WHERE id=?').bind(`SH-${new Date().getFullYear()}-${String(r.meta.last_row_id).padStart(4, '0')}`, r.meta.last_row_id).run();
  return c.redirect('/partner/warehouse?ok=1');
});

partner.post('/order/:code/consolidate', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  await db.prepare('UPDATE orders SET shipment_id=? WHERE code=?').bind(Number(f.shipment_id), c.req.param('code')).run();
  await setStatus(db, c.req.param('code'), 'consolidated', c.get('user')!.id);
  return c.redirect('/partner/warehouse?ok=1');
});

partner.post('/shipments/:id/status', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id')); const st = String(f.status);
  await db.prepare("UPDATE shipments SET status=?,tracking_no=?,total_weight_kg=?,shipped_at=CASE WHEN ?='shipped' THEN datetime('now') ELSE shipped_at END,arrived_at=CASE WHEN ?='arrived' THEN datetime('now') ELSE arrived_at END WHERE id=?")
    .bind(st, f.tracking_no ? String(f.tracking_no) : null, f.total_weight_kg ? Number(f.total_weight_kg) : null, st, st, id).run();
  // تحديث كل طلبات الشحنة دفعة واحدة
  const map: Record<string, string> = { shipped: 'shipped', arrived: 'arrived', customs: 'customs', released: 'ready' };
  if (map[st]) {
    const { results } = await db.prepare('SELECT code FROM orders WHERE shipment_id=?').bind(id).all<any>();
    for (const o of results) await setStatus(db, o.code, map[st], c.get('user')!.id, `شحنة #${id}`);
  }
  return c.redirect('/partner/shipments?ok=1');
});

// ---------- صفحة الطلب: الحالة والصور والفواتير والمستحقات ----------
const STAGE_AR = (st: string) => ORDER_STATUS[st]?.ar ?? st;
partner.get('/order/:code', async (c) => {
  const x = await ctx(c); const code = c.req.param('code');
  if (!(await owns(c, code))) return c.text('هذا الطلب ليس مسندًا إليكم', 403);
  const [o] = await ordersWithItems(x.db, (await x.db.prepare('SELECT partner_id FROM orders WHERE code=?').bind(code).first<any>())?.partner_id ?? x.pid, PARTNER_FLOW.concat(['pending_payment', 'cancelled', 'refunded']))
    .then(list => list.filter(o => o.code === code));
  if (!o) return c.notFound();
  const [ev, media, inv] = await Promise.all([
    x.db.prepare('SELECT status,note,created_at FROM order_events WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
    x.db.prepare('SELECT id,stage,url,bytes,caption,public,created_at FROM order_media WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
    x.db.prepare('SELECT id,number,stage,total_lyd,created_at FROM partner_invoices WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
  ]);
  const dues = o.partner_fees_json ? JSON.parse(o.partner_fees_json) : null;
  const err = c.req.query('err');
  return shell(c, x, 'all', `الطلب ${o.code}`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {err && <div class="flash err">{err}</div>}
      {OrderCard(o, (
        <form method="post" action={`/partner/order/${o.code}/move`} class="inline po-move" style="margin-top:10px">
          <label>تغيير الحالة</label>
          <select name="status">{PARTNER_FLOW.filter(st => st !== 'paid').map(st => <option value={st} selected={st === o.status}>{STAGE_AR(st)}</option>)}</select>
          <input type="text" name="note" placeholder="ملاحظة تظهر في سجل الطلب (اختياري)" style="min-width:240px" />
          <button class="btn sm dark">حفظ الحالة</button>
        </form>
      ))}
      <div class="card-box"><h3>🧾 مستحقاتكم عن هذا الطلب</h3>
        {dues ? (
          <table class="tbl po-dues">
            <tr><td>ثمن البضاعة (تدفعونه للمورد)</td><td>{fmt(dues.goods)}</td></tr>
            <tr><td>{RATE_AR.fee_commission_pct.ar} ({dues.rates?.fee_commission_pct ?? 0}%)</td><td>{fmt(dues.commission)}</td></tr>
            <tr><td>{RATE_AR.fee_domestic_lyd.ar}</td><td>{fmt(dues.domestic)}</td></tr>
            <tr><td>{dues.method === 'sea' ? 'الشحن البحري' : 'الشحن الجوي'} ({dues.kg} كغ)</td><td>{fmt(dues.shipping)}</td></tr>
            <tr><td>{RATE_AR.fee_delivery_lyd.ar}</td><td>{fmt(dues.delivery)}</td></tr>
            <tr><th>الإجمالي</th><th>{fmt(dues.total)}</th></tr>
          </table>
        ) : <p style="font-size:13px;color:#666">تُحسب عند تأكيد الدفع بأسعاركم في صفحة «أسعاري».</p>}
      </div>
      <div class="card-box"><h3>📷 صور المراحل ({media.results.length})</h3>
        <div class="po-gallery">{media.results.map(m => (
          <figure class="po-ph">
            <a href={m.url ?? `/partner/media/${m.id}`} target="_blank"><img src={m.url ?? `/partner/media/${m.id}`} alt="" loading="lazy" /></a>
            <figcaption><b>{STAGE_AR(m.stage)}</b>{m.caption ? ` — ${m.caption}` : ''}<br /><small>{timeAgo(m.created_at)}{m.bytes ? ` · ${Math.round(m.bytes / 1024)} ك.ب` : ''}{m.public ? ' · تراها الزبونة' : ''}</small>
              <form method="post" action={`/partner/order/${o.code}/media/${m.id}/delete`} class="inline"><button class="btn sm ghost" onclick="return confirm('حذف الصورة؟')">حذف</button></form></figcaption>
          </figure>))}</div>
        <form method="post" action={`/partner/order/${o.code}/photo`} enctype="multipart/form-data" class="po-upload" data-compress="1">
          <label>المرحلة</label><select name="stage">{PARTNER_FLOW.map(st => <option value={st} selected={st === o.status}>{STAGE_AR(st)}</option>)}</select>
          <label>الصورة</label><input type="file" name="photo" accept="image/*" capture="environment" required />
          <input type="text" name="caption" placeholder="وصف قصير (اختياري)" />
          <label class="inline" style="font-weight:400"><input type="checkbox" name="public" value="1" /> تظهر للزبونة في صفحة طلبها (لا تختر هذا لفاتورة المورد أو سعره)</label>
          <button class="btn sm ok">رفع الصورة</button>
          <small class="po-hint">تُصغَّر الصورة في جهازك قبل الرفع (≈200 ك.ب) فترفع بسرعة حتى على إنترنت ضعيف.</small>
        </form>
      </div>
      <div class="card-box"><h3>🧾 فواتير المراحل ({inv.results.length})</h3>
        {inv.results.length > 0 && <div class="tbl-wrap"><table class="tbl"><tr><th>الرقم</th><th>المرحلة</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr>
          {inv.results.map(i => <tr><td>{i.number}</td><td>{STAGE_AR(i.stage)}</td><td>{fmt(i.total_lyd)}</td><td>{timeAgo(i.created_at)}</td><td><a class="btn sm ghost" href={`/partner/invoice/${i.id}`} target="_blank">عرض وطباعة</a></td></tr>)}</table></div>}
        <form method="post" action={`/partner/order/${o.code}/invoice`} class="po-inv">
          <label>المرحلة</label><select name="stage">{PARTNER_FLOW.map(st => <option value={st} selected={st === o.status}>{STAGE_AR(st)}</option>)}</select>
          <div class="po-lines">{[0, 1, 2, 3].map(i => <div class="inline"><input type="text" name="desc" placeholder={i === 0 ? 'البند (مثال: شحن جوي 2.4 كغ)' : 'بند آخر (اختياري)'} style="flex:1" /><input type="number" step="0.01" name="amount" placeholder="المبلغ د.ل" style="width:130px" /></div>)}</div>
          <input type="text" name="note" placeholder="ملاحظة على الفاتورة (اختياري)" />
          <button class="btn sm dark">إنشاء الفاتورة</button>
        </form>
      </div>
      <div class="card-box"><h3>🕒 سجل الطلب</h3><ul class="po-ev">{ev.results.map(e => <li><b>{STAGE_AR(e.status)}</b> — {timeAgo(e.created_at)}{e.note ? <small> · {e.note}</small> : null}</li>)}</ul></div>
    </>
  ));
});

partner.post('/order/:code/move', async (c) => {
  const f = await c.req.parseBody(); const st = String(f.status); const code = c.req.param('code');
  if (!PARTNER_FLOW.includes(st) || st === 'paid') return c.redirect(`/partner/order/${code}?err=${encodeURIComponent('حالة غير صالحة')}`);
  await setOrderStatus(c.env.DB, code, st, c.get('user')!.id, f.note ? String(f.note).slice(0, 300) : undefined);
  return c.redirect(`/partner/order/${code}?ok=1`);
});

partner.post('/order/:code/photo', async (c) => {
  const code = c.req.param('code'); const db = c.env.DB;
  const o = await db.prepare('SELECT id,status FROM orders WHERE code=?').bind(code).first<any>();
  if (!o) return c.notFound();
  const f = await c.req.parseBody();
  const file = f.photo as File | undefined;
  const stage = PARTNER_FLOW.includes(String(f.stage)) ? String(f.stage) : o.status;
  const bytes = file && typeof file !== 'string' ? await file.arrayBuffer() : null;
  const r = await saveMedia(db, o.id, stage, { bytes, mime: file && typeof file !== 'string' ? file.type : undefined }, f.caption ? String(f.caption).slice(0, 200) : null, f.public === '1', c.get('user')!.id);
  return c.redirect(`/partner/order/${code}` + (r.ok ? '?ok=1' : `?err=${encodeURIComponent(r.error ?? 'تعذّر الرفع')}`));
});

partner.post('/order/:code/media/:id/delete', async (c) => {
  const code = c.req.param('code');
  await c.env.DB.prepare('DELETE FROM order_media WHERE id=? AND order_id=(SELECT id FROM orders WHERE code=?)').bind(Number(c.req.param('id')), code).run();
  return c.redirect(`/partner/order/${code}?ok=1`);
});

// الصورة تُقدَّم لصاحبها فقط: شريك الطلب أو الأدمن
partner.get('/media/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT m.data,m.mime,m.url,o.code FROM order_media m JOIN orders o ON o.id=m.order_id WHERE m.id=?').bind(Number(c.req.param('id'))).first<any>();
  if (!m || !(await owns(c, m.code))) return c.notFound();
  if (m.url) return c.redirect(m.url);
  return new Response(new Uint8Array(m.data), { headers: { 'content-type': m.mime, 'cache-control': 'private, max-age=86400' } });
});

partner.post('/order/:code/invoice', async (c) => {
  const code = c.req.param('code'); const db = c.env.DB;
  const o = await db.prepare('SELECT id,partner_id,status FROM orders WHERE code=?').bind(code).first<any>();
  if (!o) return c.notFound();
  const f = await c.req.parseBody({ all: true });
  const arr = (v: any) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);
  const desc = arr(f.desc), amount = arr(f.amount);
  const stage = PARTNER_FLOW.includes(String(f.stage)) ? String(f.stage) : o.status;
  const r = await createInvoice(db, o.id, o.partner_id, stage, desc.map((d, i) => ({ desc: d, amount: parseFloat(amount[i] ?? '') })), f.note ? String(f.note).slice(0, 500) : null, c.get('user')!.id);
  return c.redirect(`/partner/order/${code}` + (r.ok ? '?ok=1' : `?err=${encodeURIComponent(r.error)}`));
});

partner.get('/invoice/:id', async (c) => {
  const i = await c.env.DB.prepare(`SELECT i.*,o.code,o.ship_name,o.ship_city,p.name partner,p.warehouse_address,p.contact FROM partner_invoices i
     JOIN orders o ON o.id=i.order_id JOIN partners p ON p.id=i.partner_id WHERE i.id=?`).bind(Number(c.req.param('id'))).first<any>();
  if (!i || !(await owns(c, i.code))) return c.notFound();
  const lines = JSON.parse(i.lines) as { desc: string; amount: number }[];
  return c.html(
    <html lang="ar" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>فاتورة {i.number}</title><link rel="stylesheet" href="/style.css" /></head>
      <body class="po-print"><div class="po-invoice">
        <div class="inline" style="justify-content:space-between"><div><h2 style="margin:0">فاتورة {i.number}</h2><small>{new Date(i.created_at + 'Z').toLocaleDateString('ar-LY')}</small></div><img src="/hudhud-logo.svg" alt="" width="77" height="64" /></div>
        <p><b>من:</b> {i.partner}{i.contact ? ` · ${i.contact}` : ''}<br /><b>إلى:</b> هدهدي HUDHUDE · <b>الطلب:</b> {i.code} · <b>المرحلة:</b> {STAGE_AR(i.stage)}</p>
        <table class="tbl"><tr><th>البند</th><th>المبلغ</th></tr>{lines.map(l => <tr><td>{l.desc}</td><td>{fmt(l.amount)}</td></tr>)}<tr><th>الإجمالي</th><th>{fmt(i.total_lyd)}</th></tr></table>
        {i.note && <p>{i.note}</p>}
        <button class="btn no-print" onclick="print()">🖨 طباعة / حفظ PDF</button>
      </div></body></html>);
});

// ---------- أسعاري: الشريك يضع أسعار خدماته بنفسه ----------
partner.get('/rates', async (c) => {
  const x = await ctx(c); const s = await loadSettings(x.db); const m = feeMargin(s);
  const p = x.p as any;
  // مثال محسوب بأسعاره: قطعة ثمنها 50 د.ل ووزنها نصف كيلو، شحن جوي
  const ex = { goods: 50, kg: 0.5 };
  const rows = [
    ['عمولة الشراء', ex.goods * (p.fee_commission_pct ?? 0) / 100],
    ['النقل الداخلي في الصين', p.fee_domestic_lyd ?? 0],
    ['الشحن الجوي (نصف كيلو)', ex.kg * (p.fee_air_kg_lyd ?? 0)],
    ['التوصيل داخل ليبيا', p.fee_delivery_lyd ?? 0],
  ] as [string, number][];
  return shell(c, x, 'rates', 'أسعاري', (
    <>
      <Flash msg={c.req.query('ok') ? 'حُفظت أسعارك ✓' : undefined} />
      <form method="post" action={`/partner/rates${pq(x)}`} class="card-box po-rates">
        <p style="font-size:13px;color:#555;margin-top:0">ضع سعر كل خدمة كما تنفّذها بالدينار الليبي. هذه أسعارك أنت، وتُحسب منها مستحقاتك عن كل طلب لحظة دفعه. يُضاف على كل بند <b>رسم منصة هدهدي {m} د.ل</b> يدفعه الزبون ولا يُخصم منك.</p>
        {RATE_KEYS.map(k => <div class="inline"><label style="min-width:190px">{RATE_AR[k].ar}</label><input type="number" step="0.01" min="0" name={k} value={p[k] ?? 0} style="width:120px" /><small>{RATE_AR[k].unit}</small></div>)}
        <button class="btn dark">حفظ أسعاري</button>
        {p.rates_updated_at && <small style="color:#888"> آخر تعديل {timeAgo(p.rates_updated_at)}</small>}
      </form>
      <div class="card-box"><h3>مثال بأسعارك: قطعة ثمنها 50 د.ل ووزنها نصف كيلو، شحن جوي</h3>
        <table class="tbl"><tr><th>الخدمة</th><th>لك</th><th>يدفعه الزبون مقابلها</th></tr>
          {rows.map(([n, v]) => <tr><td>{n}</td><td>{fmt(Math.round(v * 100) / 100)}</td><td>{fmt(Math.round((v + m) * 100) / 100)}</td></tr>)}
          <tr><th>مجموع خدماتك</th><th>{fmt(Math.round(rows.reduce((a, r) => a + r[1], 0) * 100) / 100)}</th><th>{fmt(Math.round(rows.reduce((a, r) => a + r[1] + m, 0) * 100) / 100)}</th></tr>
        </table></div>
    </>
  ));
});
partner.post('/rates', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const v = (k: string) => Math.max(0, Math.min(k === 'fee_commission_pct' ? 100 : 100000, parseFloat(String(f[k] ?? '0').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))) || 0));
  await x.db.prepare(`UPDATE partners SET ${RATE_KEYS.map(k => `${k}=?`).join(',')},rates_updated_at=datetime('now') WHERE id=?`).bind(...RATE_KEYS.map(v), x.pid).run();
  // إن كان هذا الشريك هو من تُسعَّر به البضاعة على الرف: تُنسخ أسعاره للإعدادات وتلزم إعادة تسعير
  const s = await loadSettings(x.db);
  if (pricingPartnerId(s) === x.pid) { await syncPricingPartner(x.db); await x.db.prepare("INSERT INTO settings(key,value) VALUES('reprice_needed','1') ON CONFLICT(key) DO UPDATE SET value='1'").run(); }
  return c.redirect('/partner/rates?ok=1' + pq2(x));
});

// ---------- ربط API ----------
partner.get('/api', async (c) => {
  const x = await ctx(c); const p = x.p as any; const origin = new URL(c.req.url).origin;
  if (!p.api_secret || !p.api_token) {
    await x.db.prepare('UPDATE partners SET api_secret=COALESCE(api_secret,?),api_token=COALESCE(api_token,?) WHERE id=?').bind(newSecret(), newSecret(), x.pid).run();
    return c.redirect('/partner/api' + pq(x));
  }
  const log = await x.db.prepare('SELECT d.id,d.status,d.http_status,d.attempts,d.error,d.response,d.created_at,d.sent_at,o.code FROM partner_dispatch d JOIN orders o ON o.id=d.order_id WHERE d.partner_id=? ORDER BY d.id DESC LIMIT 20').bind(x.pid).all<any>();
  const t = c.req.query('test');
  const DS: Record<string, string> = { pending: 'بانتظار إعادة المحاولة', sending: 'يُرسل الآن', sent: 'وصل ✓', failed: 'فشل نهائيًا', test: 'تجربة' };
  return shell(c, x, 'api', 'ربط API — استلام الطلبات تلقائيًا', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {t && <div class={`flash ${t === 'ok' ? 'ok' : 'err'}`}>{t === 'ok' ? `وصل الطلب التجريبي إلى نظامكم (HTTP ${c.req.query('http')}) ✓` : `لم يصل الطلب التجريبي: ${c.req.query('why') ?? ''}`}</div>}
      <form method="post" action={`/partner/api${pq(x)}`} class="card-box">
        <p style="font-size:13px;color:#555;margin-top:0">كل طلب يُدفع ويُسند إليكم يُرسل فورًا <b>POST</b> بصيغة JSON إلى الرابط أدناه، موقّعًا بمفتاحكم السري. إن لم يرد نظامكم بـ2xx نعيد المحاولة تلقائيًا حتى 8 مرات.</p>
        <label>رابط استلام الطلبات في نظامكم</label>
        <input type="url" name="api_url" value={p.api_url ?? ''} placeholder="https://your-system.com/hudhude/orders" dir="ltr" style="width:100%" />
        <label class="inline" style="font-weight:400"><input type="checkbox" name="api_enabled" value="1" checked={!!p.api_enabled} /> إرسال الطلبات المدفوعة تلقائيًا إلى هذا الرابط</label>
        <div class="inline"><button class="btn dark">حفظ</button><button class="btn ghost" formaction={`/partner/api/test${pq(x)}`}>إرسال طلب تجريبي</button></div>
      </form>
      <div class="card-box" dir="ltr" style="text-align:left">
        <h3 dir="rtl" style="text-align:right">مفاتيحكم</h3>
        <p><b>Signing secret</b> (verify <code>X-Hudhude-Signature: sha256=HMAC_SHA256(secret, raw_body)</code>):<br /><code class="po-key">{p.api_secret}</code></p>
        <p><b>API token</b> (<code>Authorization: Bearer …</code> to update orders):<br /><code class="po-key">{p.api_token}</code></p>
        <form method="post" action={`/partner/api/rotate${pq(x)}`} dir="rtl" style="text-align:right"><button class="btn sm ghost" onclick="return confirm('المفتاحان القديمان سيتوقفان فورًا. متابعة؟')">توليد مفتاحين جديدين</button></form>
        <h3 dir="rtl" style="text-align:right">تحديث الطلب من نظامكم</h3>
        <pre class="po-doc">{`GET  ${origin}/api/partner/v1/orders?status=paid
POST ${origin}/api/partner/v1/orders/{code}/status
     {"status":"purchased","note":"optional"}
     statuses: ${PARTNER_FLOW.filter(st => st !== 'paid').join(', ')}
POST ${origin}/api/partner/v1/orders/{code}/photos
     {"stage":"at_warehouse","image_base64":"data:image/jpeg;base64,...","caption":"","public":false}
     or {"stage":"...","url":"https://..."}
POST ${origin}/api/partner/v1/orders/{code}/invoices
     {"stage":"shipped","lines":[{"desc":"Air freight 2.4kg","amount":55}],"note":""}
Header: Authorization: Bearer ${p.api_token.slice(0, 6)}…`}</pre>
        <h3 dir="rtl" style="text-align:right">شكل الطلب الذي يصلكم</h3>
        <pre class="po-doc">{`POST <your url>
X-Hudhude-Event: order.paid
X-Hudhude-Signature: sha256=<hex>
{"event":"order.paid","order":{"code":"DL-2026-000123","paid_at":"...","ship_method":"air",
 "customer":{"name":"...","phone":"...","city":"...","address":"..."},
 "items":[{"item_id":1,"title":"...","color":"...","size":"...","qty":1,"offer_id":"...","url":"https://detail.1688.com/offer/....html","supplier_price_cny":45,"weight_g":420}],
 "dues":{"goods":..,"commission":..,"domestic":..,"shipping":..,"delivery":..,"total":..}},
 "callbacks":{"status":"...","photos":"...","invoices":"..."}}`}</pre>
      </div>
      <div class="card-box"><h3>سجل الإرسال</h3>
        {log.results.length === 0 ? <p style="font-size:13px;color:#666">لم يُرسل أي طلب بعد.</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الحالة</th><th>HTTP</th><th>المحاولات</th><th>الرد / الخطأ</th><th>الوقت</th></tr>
            {log.results.map(d => <tr><td><a href={`/partner/order/${d.code}`}>{d.code}</a></td><td>{DS[d.status] ?? d.status}</td><td>{d.http_status ?? '—'}</td><td>{d.attempts}</td><td dir="ltr" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{d.error ?? d.response ?? ''}</td><td>{timeAgo(d.sent_at ?? d.created_at)}</td></tr>)}
          </table></div>}
      </div>
    </>
  ));
});
partner.post('/api', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const url = String(f.api_url ?? '').trim();
  if (url && !/^https?:\/\//.test(url)) return c.redirect('/partner/api?test=err&why=' + encodeURIComponent('الرابط يجب أن يبدأ بـ https://') + pq2(x));
  await x.db.prepare('UPDATE partners SET api_url=?,api_enabled=? WHERE id=?').bind(url || null, url && f.api_enabled === '1' ? 1 : 0, x.pid).run();
  return c.redirect('/partner/api?ok=1' + pq2(x));
});
partner.post('/api/rotate', async (c) => {
  const x = await ctx(c);
  await x.db.prepare('UPDATE partners SET api_secret=?,api_token=? WHERE id=?').bind(newSecret(), newSecret(), x.pid).run();
  return c.redirect('/partner/api?ok=1' + pq2(x));
});
partner.post('/api/test', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  // يُحفظ الرابط المكتوب أولًا حتى تُجرَّب القيمة الظاهرة في الخانة لا القديمة
  const url = String(f.api_url ?? '').trim();
  if (url) await x.db.prepare('UPDATE partners SET api_url=? WHERE id=?').bind(url, x.pid).run();
  const p = await x.db.prepare('SELECT api_url,api_secret FROM partners WHERE id=?').bind(x.pid).first<any>();
  const r = await testDispatch(p, new URL(c.req.url).origin);
  return c.redirect((r.ok ? `/partner/api?test=ok&http=${r.http}` : `/partner/api?test=err&why=${encodeURIComponent((r as any).error ?? `HTTP ${(r as any).http}: ${((r as any).body ?? '').slice(0, 120)}`)}`) + pq2(x));
});

export default partner;
