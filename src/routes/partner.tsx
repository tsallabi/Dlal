import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS } from '../types';
import { PartnerShell } from '../views/dash';
import { Flash } from '../views/layout';
import { fmt, imgUrl, timeAgo, notify } from '../lib/db';
import { setOrderStatus } from '../lib/orders';
import { requireRole } from '../lib/auth';

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
const shell = (c: Context<Env>, x: any, active: string, title: string, body: any) => c.html(<PartnerShell user={x.u} partner={x.p} active={active} title={title} counts={x.counts}>{body}</PartnerShell>);

async function ordersWithItems(db: D1Database, pid: number, statuses: string[]) {
  const q = statuses.map(() => '?').join(',');
  const orders = await db.prepare(`SELECT o.*,u.name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.partner_id=? AND o.status IN (${q}) ORDER BY o.updated_at ASC`).bind(pid, ...statuses).all<any>();
  if (!orders.results.length) return [];
  const ids = orders.results.map(o => o.id);
  const items = await db.prepare(`SELECT oi.*,(SELECT url FROM product_images i WHERE i.product_id=oi.product_id ORDER BY sort LIMIT 1) AS image FROM order_items oi WHERE order_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>();
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
    <div class="inline" style="justify-content:space-between"><h3 style="margin:0">{o.code} <span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></h3><small style="color:#888">{o.name} · {o.ship_city} · {timeAgo(o.updated_at)}</small></div>
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
          <div class="inline" style="justify-content:space-between"><h3 style="margin:0">{o.code}</h3><small style="color:#888">{o.name} · {o.ship_city}</small></div>
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
    <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>المدينة</th><th>الحالة</th><th>آخر تحديث</th></tr>{rows.results.map(o => <tr><td>{o.code}</td><td>{o.name}</td><td>{o.ship_city}</td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{timeAgo(o.updated_at)}</td></tr>)}</table></div>
  ));
});

// ---------- الإجراءات ----------
const setStatus = (db: D1Database, code: string, status: string, byUserId: number, note?: string) => setOrderStatus(db, code, status, byUserId, note);

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
  await notify(db, it.user_id, `منتج غير متوفر في طلبك ${it.code}`, `"${it.title_ar}" نفد عند المورد. سيتواصل معك فريق دلال لاختيار بديل أو استرجاع قيمته.`, `/orders/${it.code}`);
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

export default partner;
