import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS } from '../types';
import { AdminShell } from '../views/dash';
import { Flash } from '../views/layout';
import { getCategories, PRODUCT_SELECT, fmt, timeAgo } from '../lib/db';
import type { ProductRow } from '../lib/db';
import { loadSettings, computePrice } from '../lib/pricing';
import { requireRole } from '../lib/auth';
import { requirePerm, logActivity } from '../lib/perm';
import { setOrderStatus, markOrderPaid } from '../lib/orders';
import { translateZhAr, hasCJK } from '../lib/translate';

const admin = new Hono<Env>();
admin.use('*', requireRole('admin'));
// صلاحيات كل قسم
admin.use('/orders*', requirePerm('orders.view', 'orders.manage'));
admin.use('/customers', requirePerm('customers.view', 'customers.manage'));
admin.use('/import*', requirePerm('catalog.manage'));
admin.use('/products*', requirePerm('catalog.manage'));
admin.use('/categories*', requirePerm('catalog.manage'));
admin.use('/stock*', requirePerm('catalog.manage'));
admin.use('/pricing*', requirePerm('pricing.manage'));
admin.use('/partners*', requirePerm('partners.manage'));

const shell = async (c: Context<Env>, active: string, title: string, body: any) => {
  const db = c.env.DB;
  const k = await db.batch([
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status='pending_payment'"),
    db.prepare("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"),
    db.prepare("SELECT COUNT(*) n FROM reviews WHERE status='pending'"),
  ]);
  const n = (i: number) => (k[i].results[0] as any).n as number;
  return c.html(<AdminShell user={c.get('user')!} active={active} title={title} counts={{ orders: n(0), tickets: n(1), reviews: n(2) }}>{body}</AdminShell>);
};

// ---------- نظرة عامة ----------
admin.get('/', async (c) => {
  const db = c.env.DB;
  const k = await db.batch([
    db.prepare("SELECT COUNT(*) n FROM products WHERE status='active'"),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE created_at > datetime('now','-1 day')"),
    db.prepare("SELECT COALESCE(SUM(total_lyd),0) n FROM orders WHERE status NOT IN ('pending_payment','cancelled','refunded') AND created_at > datetime('now','-30 day')"),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status='pending_payment'"),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('paid','purchasing')"),
    db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'"),
    db.prepare("SELECT COUNT(*) n FROM products WHERE status='active' AND (last_checked_at IS NULL OR last_checked_at < datetime('now','-7 day'))"),
    db.prepare("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"),
    db.prepare("SELECT COUNT(*) n FROM reviews WHERE status='pending'"),
    db.prepare("SELECT COALESCE(SUM(amount_lyd),0) n FROM payments WHERE status='paid' AND created_at > datetime('now','-1 day')"),
  ]);
  const v = k.map(r => (r.results[0] as any).n as number);
  const recent = await db.prepare('SELECT o.code,o.status,o.total_lyd,o.created_at,u.name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 8').all<any>();
  const s = await loadSettings(db);
  return shell(c, 'home', 'نظرة عامة', (
    <>
      <div class="kpis">
        <div class="kpi"><b>{v[0]}</b><span>منتج نشط</span></div>
        <div class="kpi"><b>{v[1]}</b><span>طلب آخر 24 ساعة</span></div>
        <div class="kpi"><b>{fmt(v[2])}</b><span>مبيعات 30 يومًا</span></div>
        <div class="kpi"><b style="color:#d68b00">{v[3]}</b><span>بانتظار تأكيد الدفع</span></div>
        <div class="kpi"><b style="color:#1c47b3">{v[4]}</b><span>عند شركاء الشراء</span></div>
        <div class="kpi"><b>{v[5]}</b><span>زبونة مسجلة</span></div>
        <div class="kpi"><b style="color:#d3262b">{v[6]}</b><span>منتج لم يُفحص منذ أسبوع</span></div>
        <div class="kpi"><b>{s.fx_cny_lyd}</b><span>سعر اليوان اليوم (د.ل)</span></div>
        <div class="kpi"><b style="color:#d68b00">{v[7]}</b><span>تذاكر مفتوحة</span></div>
        <div class="kpi"><b>{v[8]}</b><span>تقييمات بانتظار المراجعة</span></div>
        <div class="kpi"><b style="color:#1a9c5b">{fmt(v[9])}</b><span>مدفوعات ماي باي اليوم</span></div>
      </div>
      <div class="quick"><a href="/admin/orders?status=pending_payment">💳 تأكيد مدفوعات يدوية</a><a href="/admin/tickets">↩️ الرد على التذاكر</a><a href="/admin/reviews">⭐ مراجعة التقييمات</a><a href="/admin/import">⬇️ استيراد منتجات</a><a href="/admin/pricing">💰 تحديث سعر الصرف</a><a href="/admin/reports">📈 التقارير</a></div>
      <div class="card-box"><h3>آخر الطلبات</h3><div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr>
        {recent.results.map(o => <tr><td><a href={`/admin/orders/${o.code}`} style="color:#b5124f;font-weight:700">{o.code}</a></td><td>{o.name}</td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{fmt(o.total_lyd)}</td><td>{timeAgo(o.created_at)}</td></tr>)}
      </table></div></div>
    </>
  ));
});

// ---------- الطلبات ----------
admin.get('/orders', async (c) => {
  const st = c.req.query('status') ?? '';
  const q = c.req.query('q') ?? '';
  let where = '1=1'; const binds: any[] = [];
  if (st) { where += ' AND o.status=?'; binds.push(st); }
  if (q) { where += ' AND (o.code LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)'; binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await c.env.DB.prepare(`SELECT o.*,u.name,u.phone,pa.name AS partner FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN partners pa ON pa.id=o.partner_id WHERE ${where} ORDER BY o.id DESC LIMIT 200`).bind(...binds).all<any>();
  const counts = await c.env.DB.prepare('SELECT status,COUNT(*) n FROM orders GROUP BY status').all<any>();
  const cm = Object.fromEntries(counts.results.map(r => [r.status, r.n]));
  return shell(c, 'orders', 'الطلبات', (
    <>
      <div class="tabs"><a href="/admin/orders" class={!st ? 'on' : ''}>الكل</a>{Object.entries(ORDER_STATUS).map(([k, v]) => <a href={`/admin/orders?status=${k}`} class={st === k ? 'on' : ''}>{v.ar}{cm[k] ? <i>{cm[k]}</i> : null}</a>)}</div>
      <form class="inline" style="margin:8px 0"><input type="text" name="q" placeholder="رقم الطلب / اسم / هاتف" value={q} /><input type="hidden" name="status" value={st} /><button class="btn sm">بحث</button></form>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>الحالة</th><th>الدفع</th><th>الشريك</th><th>الإجمالي</th><th>التاريخ</th></tr>
        {rows.results.map(o => <tr><td><a href={`/admin/orders/${o.code}`} style="color:#b5124f;font-weight:700">{o.code}</a></td><td>{o.name}<br /><small>{o.phone} · {o.ship_city}</small></td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{PAYMENT_METHODS[o.payment_method]?.ar ?? o.payment_method}{o.payment_ref && <><br /><small>{o.payment_ref}</small></>}</td><td>{o.partner ?? '—'}</td><td>{fmt(o.total_lyd)}</td><td>{timeAgo(o.created_at)}</td></tr>)}
      </table></div>
    </>
  ));
});

admin.get('/orders/:code', async (c) => {
  const db = c.env.DB;
  const o = await db.prepare('SELECT o.*,u.name,u.phone,pa.name AS partner FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN partners pa ON pa.id=o.partner_id WHERE o.code=?').bind(c.req.param('code')).first<any>();
  if (!o) return c.notFound();
  const [items, events, partners, pays] = await Promise.all([
    db.prepare('SELECT * FROM order_items WHERE order_id=?').bind(o.id).all<any>(),
    db.prepare('SELECT e.*,u.name FROM order_events e LEFT JOIN users u ON u.id=e.by_user_id WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
    db.prepare('SELECT id,name FROM partners WHERE active=1').all<any>(),
    db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id DESC').bind(o.id).all<any>(),
  ]);
  const s = await loadSettings(db);
  const fx = parseFloat(s.fx_cny_lyd);
  const actual = items.results.reduce((a, i) => a + (i.actual_cost_cny ?? 0) * fx, 0);
  return shell(c, 'orders', `الطلب ${o.code}`, (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <div class="two">
        <div>
          <div class="card-box"><h3>الحالة: <span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></h3>
            {o.status === 'pending_payment' && (
              <form method="post" action={`/admin/orders/${o.code}/confirm-payment`} class="inline">
                <input type="text" name="payment_ref" placeholder="رقم مرجع الدفع / الإيصال" required />
                <select name="partner_id">{partners.results.map(p => <option value={p.id} selected={p.id === o.partner_id}>{p.name}</option>)}</select>
                <button class="btn sm ok">تأكيد الدفع وإرسال للشراء</button>
              </form>
            )}
            <form method="post" action={`/admin/orders/${o.code}/status`} class="inline" style="margin-top:10px">
              <select name="status">{Object.entries(ORDER_STATUS).map(([k, v]) => <option value={k} selected={k === o.status}>{v.ar}</option>)}</select>
              <input type="text" name="note" placeholder="ملاحظة" />
              <button class="btn sm dark">تغيير الحالة يدويًا</button>
            </form>
          </div>
          <div class="card-box"><h3>المنتجات — يرى الأدمن الروابط والتكلفة الفعلية</h3><div class="tbl-wrap"><table class="tbl">
            <tr><th>المنتج</th><th>المواصفة</th><th>الكمية</th><th>سعر البيع</th><th>الشراء</th><th>التكلفة الفعلية</th></tr>
            {items.results.map(i => <tr><td>{i.title_ar}<br /><a class="src-link" href={i.source_url} target="_blank">{i.source_offer_id}</a></td><td>{[i.color, i.size].filter(Boolean).join(' · ')}</td><td>{i.qty}</td><td>{fmt(i.unit_price_lyd * i.qty)}</td><td><span class="status">{{ pending: 'بانتظار', purchased: 'تم', unavailable: 'نفد', substituted: 'بديل' }[i.purchase_status as string]}</span>{i.supplier_order_no && <><br /><small>{i.supplier_order_no}</small></>}</td><td>{i.actual_cost_cny ? `${i.actual_cost_cny} ¥ ≈ ${fmt(i.actual_cost_cny * fx)}` : '—'}{i.actual_weight_g ? <><br /><small>{i.actual_weight_g} غ</small></> : null}</td></tr>)}
          </table></div>
            <div class="breakdown" style="margin-top:10px;max-width:360px">
              <div><span>المبيع للزبونة</span><b>{fmt(o.subtotal_lyd)}</b></div>
              <div><span>تكلفة الشراء الفعلية</span><b>{actual ? fmt(actual) : '—'}</b></div>
              {actual > 0 && <div class="t"><span>الهامش الأولي (قبل الشحن)</span><b style={`color:${o.subtotal_lyd - actual > 0 ? '#1a9c5b' : '#d3262b'}`}>{fmt(o.subtotal_lyd - actual)} ({Math.round((o.subtotal_lyd - actual) / o.subtotal_lyd * 100)}%)</b></div>}
            </div>
          </div>
          <div class="card-box"><h3>سجل الأحداث</h3>{events.results.map(e => <div style="font-size:13px;border-bottom:1px solid #eee;padding:6px 0"><span class={`status ${ORDER_STATUS[e.status]?.color}`}>{ORDER_STATUS[e.status]?.ar ?? e.status}</span> {e.note} <small style="color:#888">— {e.name ?? 'النظام'} · {timeAgo(e.created_at)}</small></div>)}</div>
        </div>
        <div>
          <div class="card-box"><h3>الزبونة</h3><a href={`/admin/customers/${o.user_id}`} style="color:#b5124f;font-weight:700">{o.name}</a><br />{o.phone}<br />{o.ship_city} — {o.ship_address}{o.note && <><br /><i>{o.note}</i></>}</div>
          <div class="card-box"><h3>الدفع</h3>{PAYMENT_METHODS[o.payment_method]?.ar ?? o.payment_method}<br />المرجع: {o.payment_ref ?? '—'}<br />الإجمالي: <b>{fmt(o.total_lyd)}</b>{o.discount_lyd > 0 && <><br /><small>خصم {o.coupon_code}: −{fmt(o.discount_lyd)}</small></>}{o.points_used > 0 && <><br /><small>نقاط: {o.points_used} (−{fmt(o.points_lyd)})</small></>}<br /><small>سعر الصرف وقت الطلب: {o.fx_rate_used}</small>
            {pays.results.length > 0 && <div style="margin-top:8px;font-size:12px">{pays.results.map(p => <div>{p.trx_ref} · {p.gateway} · <span class={`status ${p.status === 'paid' ? 'green' : 'gray'}`}>{p.status}</span></div>)}</div>}</div>
          <div class="card-box"><h3>شريك الشحن</h3>{o.partner ?? 'لم يُعيَّن'}</div>
        </div>
      </div>
    </>
  ));
});

admin.post('/orders/:code/confirm-payment', requirePerm('orders.manage', 'payments.manage'), async (c) => {
  const db = c.env.DB; const f = await c.req.parseBody(); const u = c.get('user')!; const code = String(c.req.param('code'));
  const o = await db.prepare('SELECT id,user_id FROM orders WHERE code=?').bind(code).first<any>();
  if (!o) return c.notFound();
  await db.prepare('UPDATE orders SET partner_id=? WHERE id=?').bind(Number(f.partner_id), o.id).run();
  await db.prepare("INSERT INTO payments(order_id,provider,gateway,amount_lyd,status,trx_ref,provider_ref) SELECT id,'manual',payment_method,total_lyd,'paid',code||'-M'||strftime('%s','now'),? FROM orders WHERE id=?").bind(String(f.payment_ref), o.id).run();
  await markOrderPaid(db, o.id, String(f.payment_ref), u.id, 'تم تأكيد الدفع يدويًا وإرسال الطلب لفريق الشراء');
  await logActivity(db, u.id, 'order.confirm_payment', code, String(f.payment_ref));
  return c.redirect(`/admin/orders/${code}?ok=1`);
});
admin.post('/orders/:code/status', requirePerm('orders.manage'), async (c) => {
  const f = await c.req.parseBody(); const u = c.get('user')!; const code = String(c.req.param('code'));
  if (!ORDER_STATUS[String(f.status)]) return c.notFound();
  const o = await setOrderStatus(c.env.DB, code, String(f.status), u.id, f.note ? String(f.note) : undefined);
  if (!o) return c.notFound();
  await logActivity(c.env.DB, u.id, 'order.status', code, String(f.status));
  return c.redirect(`/admin/orders/${code}?ok=1`);
});

// ---------- الزبائن ----------
admin.get('/customers', async (c) => {
  const q = c.req.query('q') ?? '';
  const rows = await c.env.DB.prepare("SELECT u.id,u.name,u.phone,u.city,u.created_at,u.points,u.active,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS n,(SELECT COALESCE(SUM(total_lyd),0) FROM orders o WHERE o.user_id=u.id AND o.status NOT IN ('pending_payment','cancelled','refunded')) AS spent FROM users u WHERE role='customer' AND (u.name LIKE ? OR u.phone LIKE ?) ORDER BY u.id DESC LIMIT 300").bind(`%${q}%`, `%${q}%`).all<any>();
  return shell(c, 'customers', 'الزبائن', (
    <>
    <form class="inline" style="margin-bottom:10px"><input type="text" name="q" placeholder="اسم / هاتف" value={c.req.query('q') ?? ''} /><button class="btn sm">بحث</button></form>
    <div class="tbl-wrap"><table class="tbl"><tr><th>الاسم</th><th>الهاتف</th><th>المدينة</th><th>الطلبات</th><th>المشتريات</th><th>نقاط</th><th>التسجيل</th></tr>
      {rows.results.map(u => <tr><td><a href={`/admin/customers/${u.id}`} style="color:#b5124f;font-weight:700">{u.name}</a>{!u.active && <span class="status red" style="margin-inline-start:6px">معطّل</span>}</td><td>{u.phone}</td><td>{u.city ?? '—'}</td><td>{u.n}</td><td>{fmt(u.spent)}</td><td>{u.points}</td><td>{timeAgo(u.created_at)}</td></tr>)}
    </table></div>
    </>
  ));
});

// ---------- الاستيراد ----------
admin.get('/import', async (c) => {
  const cats = await getCategories(c.env.DB);
  const logs = await c.env.DB.prepare('SELECT l.*,u.name FROM import_log l LEFT JOIN users u ON u.id=l.by_user_id ORDER BY l.id DESC LIMIT 15').all<any>();
  const origin = new URL(c.req.url).origin;
  const bookmarklet = `javascript:(function(){var s=document.createElement('script');s.src='${origin}/importer.js?t='+Date.now();s.dataset.api='${origin}';s.dataset.token='${c.env.IMPORT_TOKEN}';document.body.appendChild(s);})();`;
  return shell(c, 'import', 'الاستيراد من 1688', (
    <>
      <div class="importer">
        <div>
          <div class="card-box"><h3>الطريقة 1 — زر الاستيراد في متصفحك (موصى بها)</h3>
            <ol style="font-size:14px;line-height:1.9">
              <li>اسحب هذا الزر إلى شريط المفضلة في Chrome: <a href={bookmarklet} class="btn sm brand" onclick="return false" draggable="true">⬇️ استورد إلى دلال</a></li>
              <li>افتح <a href="https://www.1688.com" target="_blank" class="src-link">1688.com</a> وسجّل الدخول بحسابك، وابحث عن أي منتج أو افتح صفحة قسم.</li>
              <li>اضغط الزر من شريط المفضلة: تظهر نافذة تعرض منتجات الصفحة، تختار القسم في دلال وتضغط "استيراد".</li>
              <li>في صفحة منتج واحد يستورد الزر المنتج بكل صوره ومقاساته وألوانه.</li>
            </ol>
            <p style="font-size:13px;color:#666">الزبون لا يرى أبدًا رابط المصدر أو السعر الأصلي. السعر يُحسب تلقائيًا بقواعد التسعير.</p>
          </div>
          <div class="card-box"><h3>الطريقة 2 — لصق بيانات JSON</h3>
            <form method="post" action="/admin/import/json">
              <label>القسم</label><select name="category_id">{cats.map(ct => <option value={ct.id}>{ct.icon} {ct.name_ar}</option>)}</select>
              <label>JSON (مصفوفة منتجات بصيغة SourceProduct)</label><textarea name="json" rows={6} class="mono" placeholder='[{"offerId":"123","url":"https://detail.1688.com/offer/123.html","title":"...","priceCny":25.5,"images":["..."],"variants":[{"color":"أحمر","size":"M"}],"minQty":1,"inStock":true}]'></textarea>
              <button class="btn sm" style="margin-top:8px">استيراد</button>
            </form>
          </div>
        </div>
        <div>
          <div class="card-box"><h3>المتصفح الداخلي</h3>
            <p style="font-size:13px;color:#666">1688 يمنع فتحه داخل إطار (X-Frame-Options). لذلك يُفتح في تبويب جديد ويعمل زر الاستيراد هناك. هذا الإطار للمواقع التي تسمح بذلك فقط.</p>
            <div class="browser-frame"><div class="browser-bar"><input type="url" id="bUrl" value="https://www.1688.com/" /><button class="btn sm" onclick="document.getElementById('bFrame').src=document.getElementById('bUrl').value">فتح</button><a class="btn sm ghost" target="_blank" id="bOpen" href="https://www.1688.com/">تبويب جديد ↗</a></div><iframe id="bFrame" src="about:blank"></iframe></div>
          </div>
          <div class="card-box"><h3>سجل الاستيراد</h3><table class="tbl"><tr><th>الوقت</th><th>بواسطة</th><th>الصفحة</th><th>جديد</th><th>محدّث</th><th>متخطى</th></tr>
            {logs.results.map(l => <tr><td>{timeAgo(l.created_at)}</td><td>{l.name ?? 'أداة'}</td><td><a class="src-link" href={l.page_url} target="_blank">{(l.page_url ?? '').slice(0, 40)}</a></td><td>{l.imported}</td><td>{l.updated}</td><td>{l.skipped}</td></tr>)}
          </table></div>
        </div>
      </div>
    </>
  ));
});

admin.post('/import/json', async (c) => {
  const f = await c.req.parseBody();
  let arr: any[];
  try { arr = JSON.parse(String(f.json)); } catch { return c.text('JSON غير صالح', 400); }
  const r = await importProducts(c.env.DB, arr, Number(f.category_id), c.get('user')!.id, 'manual-json', c.env.AI);
  return c.redirect(`/admin/products?imported=${r.imported}&updated=${r.updated}`);
});

// دالة الاستيراد المشتركة — تُستخدم من الأدمن ومن /api/import
export async function importProducts(db: D1Database, arr: any[], categoryId: number | null, byUserId: number | null, pageUrl: string, ai?: any) {
  let translations = 0;
  const s = await loadSettings(db);
  const cats = await getCategories(db);
  const cat = cats.find(x => x.id === categoryId) ?? null;
  let imported = 0, updated = 0, skipped = 0, enriched = 0; const newIds: string[] = [];
  for (const it of arr) {
    const offerId = String(it.offerId ?? it.offer_id ?? '').trim();
    const price = parseFloat(it.priceCny ?? it.price_cny ?? it.price);
    if (!offerId || !price) { skipped++; continue; }
    const weight = it.weightG ?? cat?.est_weight_g ?? 300;
    const pr = computePrice(s, price, weight, cat?.markup_percent);
    let titleAr: string = it.titleAr ?? it.title_ar ?? it.title ?? 'منتج';
    if (hasCJK(titleAr) && ai && translations < 60) { const t = await translateZhAr(ai, titleAr); translations++; if (t) titleAr = t; }
    const ex = await db.prepare("SELECT id FROM products WHERE source='1688' AND source_offer_id=?").bind(offerId).first<{ id: number }>();
    if (ex) {
      await db.prepare("UPDATE products SET source_price_cny=?,price_lyd=?,in_stock=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE id=?")
        .bind(price, pr.total_lyd, it.inStock === false ? 0 : 1, ex.id).run();
      // إثراء: منتج استُورد من صفحة قائمة (صورة واحدة، بلا مقاسات) ثم وصلت تفاصيله من صفحة المنتج
      const enrich: D1PreparedStatement[] = [];
      const cur = await db.prepare('SELECT (SELECT COUNT(*) FROM product_images WHERE product_id=?) imgs,(SELECT COUNT(*) FROM variants WHERE product_id=?) vars,title_ar,min_qty,supplier_name FROM products WHERE id=?').bind(ex.id, ex.id, ex.id).first<any>();
      if (Array.isArray(it.images) && it.images.length > 1 && (cur?.imgs ?? 0) <= 1) {
        enrich.push(db.prepare('DELETE FROM product_images WHERE product_id=?').bind(ex.id));
        it.images.slice(0, 8).forEach((u: string, i: number) => enrich.push(db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES(?,?,?)').bind(ex.id, u, i)));
      }
      if (Array.isArray(it.variants) && it.variants.length && (cur?.vars ?? 0) === 0) {
        it.variants.forEach((v: any) => enrich.push(db.prepare('INSERT INTO variants(product_id,source_sku_id,color,size,price_delta_lyd,in_stock,image_url) VALUES(?,?,?,?,?,?,?)')
          .bind(ex.id, v.skuId ?? null, v.color ?? null, v.size ?? null, v.priceCny ? Math.round((v.priceCny - price) * parseFloat(s.fx_cny_lyd) * 1.4 * 2) / 2 : 0, v.inStock === false ? 0 : 1, v.image ?? null)));
      }
      const upd: string[] = []; const binds: any[] = [];
      if (hasCJK(cur?.title_ar) && !hasCJK(titleAr)) { upd.push('title_ar=?'); binds.push(titleAr.slice(0, 200)); }
      if (it.minQty && Number(it.minQty) > 1 && (cur?.min_qty ?? 1) === 1) { upd.push('min_qty=?'); binds.push(Number(it.minQty)); }
      if (it.supplier && !cur?.supplier_name) { upd.push('supplier_name=?'); binds.push(String(it.supplier)); }
      if (it.title) { upd.push('title_src=COALESCE(title_src,?)'); binds.push(String(it.title)); }
      if (upd.length) enrich.push(db.prepare(`UPDATE products SET ${upd.join(',')} WHERE id=?`).bind(...binds, ex.id));
      if (enrich.length) { await db.batch(enrich); enriched++; }
      updated++; continue;
    }
    const slug = `${offerId}-${Math.random().toString(36).slice(2, 6)}`;
    const ins = await db.prepare(
      `INSERT INTO products(source,source_offer_id,source_url,slug,title_ar,title_src,description_ar,category_id,source_price_cny,price_lyd,compare_price_lyd,weight_g,min_qty,in_stock,status,supplier_name,last_checked_at,sales,rating)
       VALUES('1688',?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,datetime('now'),?,?)`,
    ).bind(offerId, it.url ?? `https://detail.1688.com/offer/${offerId}.html`, slug, titleAr, it.title ?? null, it.descriptionAr ?? null,
      categoryId, price, pr.total_lyd, Math.random() < 0.4 ? Math.ceil(pr.total_lyd * 1.25 / 5) * 5 : null, it.weightG ?? null,
      Math.max(1, parseInt(it.minQty ?? 1) || 1), it.inStock === false ? 0 : 1, it.supplier ?? null, parseInt(it.sales ?? 0) || 0, 4.5 + Math.random() * 0.5).run();
    const pid = ins.meta.last_row_id as number;
    const stmts: D1PreparedStatement[] = [];
    (it.images ?? []).slice(0, 6).forEach((u: string, i: number) => stmts.push(db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES(?,?,?)').bind(pid, u, i)));
    (it.variants ?? []).forEach((v: any) => stmts.push(db.prepare('INSERT INTO variants(product_id,source_sku_id,color,size,price_delta_lyd,in_stock,image_url) VALUES(?,?,?,?,?,?,?)')
      .bind(pid, v.skuId ?? null, v.color ?? null, v.size ?? null, v.priceCny ? Math.round((v.priceCny - price) * parseFloat(s.fx_cny_lyd) * 1.4 * 2) / 2 : 0, v.inStock === false ? 0 : 1, v.image ?? null)));
    if (stmts.length) await db.batch(stmts);
    imported++; newIds.push(offerId);
  }
  await db.prepare('INSERT INTO import_log(by_user_id,source,page_url,imported,updated,skipped) VALUES(?,?,?,?,?,?)').bind(byUserId, '1688', pageUrl, imported, updated, skipped).run();
  return { imported, updated, skipped, enriched, newIds };
}

// ---------- المنتجات ----------
admin.get('/products', async (c) => {
  const q = c.req.query('q') ?? ''; const st = c.req.query('status') ?? '';
  let where = '1=1'; const binds: any[] = [];
  if (q) { where += ' AND (p.title_ar LIKE ? OR p.source_offer_id LIKE ?)'; binds.push(`%${q}%`, `%${q}%`); }
  if (st) { where += ' AND p.status=?'; binds.push(st); }
  const rows = await c.env.DB.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY p.id DESC LIMIT 200`).bind(...binds).all<ProductRow>();
  const s = await loadSettings(c.env.DB);
  const untranslated = (await c.env.DB.prepare("SELECT COUNT(*) n FROM products WHERE title_ar GLOB '*[一-龥]*'").first<any>())?.n ?? 0;
  return shell(c, 'products', 'المنتجات', (
    <>
      <Flash msg={c.req.query('imported') ? `تم استيراد ${c.req.query('imported')} منتج وتحديث ${c.req.query('updated')}` : c.req.query('translated') ? `تُرجم ${c.req.query('translated')} عنوانًا` : c.req.query('ok') ? 'تم الحفظ ✓' : undefined} /><Flash type="err" msg={c.req.query('noai') ? 'الترجمة تعمل على Cloudflare فقط (ربط Workers AI غير متاح هنا)' : undefined} />
      <form class="inline" style="margin-bottom:10px"><input type="text" name="q" placeholder="بحث بالاسم أو offerId" value={q} /><select name="status"><option value="">كل الحالات</option>{['active', 'draft', 'hidden', 'unavailable'].map(x => <option value={x} selected={st === x}>{x}</option>)}</select><button class="btn sm">بحث</button><a class="btn sm ghost" href="/admin/products/new">+ منتج يدوي</a><button class="btn sm ghost" formaction="/admin/products/translate" formmethod="post">🈶 ترجمة العناوين الصينية ({untranslated})</button></form>
      <div class="tbl-wrap"><table class="tbl"><tr><th></th><th>المنتج</th><th>القسم</th><th>سعر المصدر</th><th>سعر البيع</th><th>الحالة</th><th>مبيعات</th><th>آخر فحص</th><th></th></tr>
        {rows.results.map(p => <tr><td><img src={p.image ?? '/placeholder.svg'} /></td><td><a href={`/admin/products/${p.id}`}>{p.title_ar}</a><br /><a class="src-link" href={p.source_url ?? '#'} target="_blank">{p.source_offer_id}</a></td><td>{p.cat_name ?? '—'}</td><td>{p.source_price_cny} ¥</td><td><b>{fmt(p.price_lyd)}</b><br /><small style="color:#888">هامش ≈ {Math.round((1 - (p.source_price_cny * parseFloat(s.fx_cny_lyd)) / p.price_lyd) * 100)}%</small></td><td><span class={`status ${p.status === 'active' ? 'green' : p.status === 'unavailable' ? 'red' : 'gray'}`}>{p.status}</span>{!p.in_stock && <><br /><small style="color:#d3262b">نفد</small></>}</td><td>{p.sales}</td><td><small>{p.last_checked_at ? timeAgo(p.last_checked_at) : '—'}</small></td><td><a href={`/p/${p.slug}`} target="_blank">👁</a></td></tr>)}
      </table></div>
    </>
  ));
});

admin.post('/products/translate', async (c) => {
  if (!c.env.AI) return c.redirect('/admin/products?noai=1');
  const { results } = await c.env.DB.prepare("SELECT id,title_ar FROM products WHERE title_ar GLOB '*[一-龥]*' ORDER BY sales DESC,id DESC LIMIT 40").all<any>();
  let n = 0;
  for (const p of results) { const t = await translateZhAr(c.env.AI, p.title_ar); if (t) { await c.env.DB.prepare('UPDATE products SET title_src=COALESCE(title_src,title_ar),title_ar=? WHERE id=?').bind(t, p.id).run(); n++; } }
  await logActivity(c.env.DB, c.get('user')!.id, 'products.translate', String(n));
  return c.redirect(`/admin/products?translated=${n}`);
});

admin.get('/products/new', async (c) => {
  const cats = await getCategories(c.env.DB);
  return shell(c, 'products', 'منتج يدوي', (
    <form method="post" action="/admin/products/new" class="card-box" style="max-width:640px">
      <label>الاسم بالعربية</label><input type="text" name="title_ar" required />
      <label>القسم</label><select name="category_id">{cats.map(ct => <option value={ct.id}>{ct.icon} {ct.name_ar}</option>)}</select>
      <label>سعر المصدر (¥)</label><input type="number" step="0.01" name="source_price_cny" required />
      <label>الوزن (غرام)</label><input type="number" name="weight_g" placeholder="فارغ = وزن الفئة" />
      <label>روابط الصور (سطر لكل صورة)</label><textarea name="images" rows={3}></textarea>
      <label>المقاسات (مفصولة بفاصلة)</label><input type="text" name="sizes" placeholder="S,M,L,XL" />
      <label>الألوان (مفصولة بفاصلة)</label><input type="text" name="colors" placeholder="أسود,أبيض" />
      <label>الوصف</label><textarea name="description_ar" rows={3}></textarea>
      <label>رابط المصدر (مخفي عن الزبون)</label><input type="url" name="source_url" />
      <button class="btn" style="margin-top:10px">حفظ</button>
    </form>
  ));
});
admin.post('/products/new', async (c) => {
  const f = await c.req.parseBody();
  const sizes = String(f.sizes ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const colors = String(f.colors ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const variants: any[] = [];
  if (sizes.length && colors.length) colors.forEach(cl => sizes.forEach(sz => variants.push({ color: cl, size: sz })));
  else { sizes.forEach(sz => variants.push({ size: sz })); colors.forEach(cl => variants.push({ color: cl })); }
  const r = await importProducts(c.env.DB, [{
    offerId: 'M' + Date.now(), url: f.source_url || null, title: null, titleAr: String(f.title_ar), priceCny: parseFloat(String(f.source_price_cny)),
    images: String(f.images ?? '').split('\n').map(x => x.trim()).filter(Boolean), variants, weightG: f.weight_g ? Number(f.weight_g) : undefined, descriptionAr: String(f.description_ar ?? ''),
  }], Number(f.category_id), c.get('user')!.id, 'manual');
  return c.redirect(`/admin/products?imported=${r.imported}&updated=0`);
});

admin.get('/products/:id', async (c) => {
  const db = c.env.DB;
  const p = await db.prepare(`SELECT ${PRODUCT_SELECT},p.title_src,p.source FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?`).bind(c.req.param('id')).first<any>();
  if (!p) return c.notFound();
  const [cats, imgs, vars] = await Promise.all([getCategories(db), db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY sort').bind(p.id).all<any>(), db.prepare('SELECT * FROM variants WHERE product_id=?').bind(p.id).all<any>()]);
  const s = await loadSettings(db);
  const cat = cats.find(x => x.id === p.category_id);
  const br = computePrice(s, p.source_price_cny, p.weight_g ?? cat?.est_weight_g ?? 300, cat?.markup_percent);
  return shell(c, 'products', p.title_ar, (
    <div class="two">
      <form method="post" class="card-box">
        <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
        <label>الاسم بالعربية</label><input type="text" name="title_ar" value={p.title_ar} required />
        {p.title_src && <p style="font-size:12px;color:#888;direction:ltr;text-align:left">{p.title_src}</p>}
        <label>القسم</label><select name="category_id">{cats.map(ct => <option value={ct.id} selected={ct.id === p.category_id}>{ct.icon} {ct.name_ar}</option>)}</select>
        <div class="inline"><div><label>سعر المصدر (¥)</label><input type="number" step="0.01" name="source_price_cny" value={p.source_price_cny} /></div><div><label>الوزن (غ)</label><input type="number" name="weight_g" value={p.weight_g ?? ''} placeholder={String(cat?.est_weight_g ?? 300)} /></div><div><label>الحد الأدنى</label><input type="number" name="min_qty" value={p.min_qty} /></div></div>
        <div class="inline"><div><label>سعر البيع (د.ل) — فارغ = تلقائي</label><input type="number" step="0.5" name="price_lyd" value={p.price_lyd} /></div><div><label>سعر قبل الخصم</label><input type="number" step="0.5" name="compare_price_lyd" value={p.compare_price_lyd ?? ''} /></div></div>
        <div class="inline"><div><label>الحالة</label><select name="status">{['active', 'draft', 'hidden', 'unavailable'].map(x => <option value={x} selected={x === p.status}>{x}</option>)}</select></div><div><label>متوفر</label><select name="in_stock"><option value="1" selected={!!p.in_stock}>نعم</option><option value="0" selected={!p.in_stock}>لا</option></select></div></div>
        <label>الوصف</label><textarea name="description_ar" rows={4}>{p.description_ar ?? ''}</textarea>
        <label>رابط المصدر (يراه الأدمن وشريك الشحن فقط)</label><input type="url" name="source_url" value={p.source_url ?? ''} />
        <button class="btn" style="margin-top:10px">حفظ</button> <a href={`/p/${p.slug}`} target="_blank" class="btn ghost">معاينة ↗</a>
      </form>
      <div>
        <div class="card-box"><h3>تفصيل السعر التلقائي</h3><div class="breakdown">
          <div><span>البضاعة ({p.source_price_cny} ¥ × {s.fx_cny_lyd})</span><span>{fmt(br.goods_lyd)}</span></div>
          <div><span>شحن داخل الصين</span><span>{fmt(br.domestic_ship_lyd)}</span></div>
          <div><span>شحن دولي ({br.weight_g} غ)</span><span>{fmt(br.intl_ship_lyd)}</span></div>
          <div><span>جمارك {s.customs_percent}%</span><span>{fmt(br.customs_lyd)}</span></div>
          <div><span>هامش أمان {s.safety_percent}%</span><span>{fmt(br.safety_lyd)}</span></div>
          <div><span>ربح {cat?.markup_percent ?? s.markup_percent}%</span><span>{fmt(br.markup_lyd)}</span></div>
          <div class="t"><span>السعر المقترح</span><span>{fmt(br.total_lyd)}</span></div>
        </div>
          <form method="post" action={`/admin/products/${p.id}/reprice`} style="margin-top:8px"><button class="btn sm ghost">تطبيق السعر المقترح</button></form>
        </div>
        <div class="card-box"><h3>الصور ({imgs.results.length})</h3><div class="import-preview">{imgs.results.map(i => <div class="it"><img src={i.url} /></div>)}</div></div>
        <div class="card-box"><h3>المتغيرات ({vars.results.length})</h3><table class="tbl"><tr><th>لون</th><th>مقاس</th><th>فرق سعر</th><th>متوفر</th></tr>{vars.results.map(v => <tr><td>{v.color ?? '—'}</td><td>{v.size ?? '—'}</td><td>{v.price_delta_lyd}</td><td>{v.in_stock ? '✓' : '✗'}</td></tr>)}</table></div>
      </div>
    </div>
  ));
});
admin.post('/products/:id', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id'));
  const s = await loadSettings(db); const cats = await getCategories(db); const cat = cats.find(x => x.id === Number(f.category_id));
  const price = f.price_lyd ? parseFloat(String(f.price_lyd)) : computePrice(s, parseFloat(String(f.source_price_cny)), Number(f.weight_g) || cat?.est_weight_g || 300, cat?.markup_percent).total_lyd;
  await db.prepare(`UPDATE products SET title_ar=?,category_id=?,source_price_cny=?,weight_g=?,min_qty=?,price_lyd=?,compare_price_lyd=?,status=?,in_stock=?,description_ar=?,source_url=?,updated_at=datetime('now') WHERE id=?`)
    .bind(String(f.title_ar), Number(f.category_id), parseFloat(String(f.source_price_cny)), f.weight_g ? Number(f.weight_g) : null, Number(f.min_qty) || 1, price, f.compare_price_lyd ? parseFloat(String(f.compare_price_lyd)) : null, String(f.status), Number(f.in_stock), String(f.description_ar ?? ''), f.source_url ? String(f.source_url) : null, id).run();
  return c.redirect(`/admin/products/${id}?ok=1`);
});
admin.post('/products/:id/reprice', async (c) => {
  const db = c.env.DB; const id = Number(c.req.param('id'));
  const p = await db.prepare('SELECT source_price_cny,weight_g,category_id FROM products WHERE id=?').bind(id).first<any>();
  const s = await loadSettings(db); const cats = await getCategories(db); const cat = cats.find(x => x.id === p.category_id);
  const pr = computePrice(s, p.source_price_cny, p.weight_g ?? cat?.est_weight_g ?? 300, cat?.markup_percent);
  await db.prepare('UPDATE products SET price_lyd=? WHERE id=?').bind(pr.total_lyd, id).run();
  return c.redirect(`/admin/products/${id}?ok=1`);
});

// ---------- الأقسام ----------
admin.get('/categories', async (c) => {
  const cats = await getCategories(c.env.DB);
  const counts = await c.env.DB.prepare('SELECT category_id,COUNT(*) n FROM products GROUP BY category_id').all<any>();
  const cm = Object.fromEntries(counts.results.map(r => [r.category_id, r.n]));
  return shell(c, 'categories', 'الأقسام والأوزان التقديرية', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <p style="font-size:13px;color:#666">الوزن التقديري يُستخدم لحساب الشحن حين لا يعرف المصدر وزن المنتج. يصححه شريك الشحن بالوزن الفعلي عند الوصول.</p>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الأيقونة</th><th>الاسم</th><th>slug</th><th>الوزن التقديري (غ)</th><th>ربح خاص %</th><th>منتجات</th><th></th></tr>
        {cats.map(ct => <tr><form method="post" action={`/admin/categories/${ct.id}`}><td><input type="text" name="icon" value={ct.icon ?? ''} style="width:50px" /></td><td><input type="text" name="name_ar" value={ct.name_ar} /></td><td class="mono">{ct.slug}</td><td><input type="number" name="est_weight_g" value={ct.est_weight_g} style="width:90px" /></td><td><input type="number" name="markup_percent" value={ct.markup_percent ?? ''} placeholder="افتراضي" style="width:90px" /></td><td>{cm[ct.id] ?? 0}</td><td><button class="btn sm ghost">حفظ</button></td></form></tr>)}
      </table></div>
      <form method="post" action="/admin/categories/new" class="card-box inline" style="margin-top:14px"><input type="text" name="icon" placeholder="🎀" style="width:60px" /><input type="text" name="name_ar" placeholder="اسم القسم" required /><input type="text" name="slug" placeholder="slug-en" required /><input type="number" name="est_weight_g" value="300" style="width:90px" /><button class="btn sm">+ إضافة قسم</button></form>
    </>
  ));
});
admin.post('/categories/new', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('INSERT INTO categories(slug,name_ar,icon,est_weight_g,sort) VALUES(?,?,?,?,99)').bind(String(f.slug), String(f.name_ar), String(f.icon ?? ''), Number(f.est_weight_g) || 300).run(); return c.redirect('/admin/categories?ok=1'); });
admin.post('/categories/:id', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('UPDATE categories SET name_ar=?,icon=?,est_weight_g=?,markup_percent=? WHERE id=?').bind(String(f.name_ar), String(f.icon ?? ''), Number(f.est_weight_g) || 300, f.markup_percent ? Number(f.markup_percent) : null, Number(c.req.param('id'))).run(); return c.redirect('/admin/categories?ok=1'); });

// ---------- فحص المخزون ----------
admin.get('/stock', async (c) => {
  const db = c.env.DB;
  const stale = await db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.source='1688' ORDER BY (p.sales*10+p.views) DESC, p.last_checked_at ASC LIMIT 100`).all<ProductRow>();
  const origin = new URL(c.req.url).origin;
  const bm = `javascript:(function(){var s=document.createElement('script');s.src='${origin}/importer.js?t='+Date.now();s.dataset.api='${origin}';s.dataset.token='${c.env.IMPORT_TOKEN}';s.dataset.mode='check';document.body.appendChild(s);})();`;
  return shell(c, 'stock', 'فحص المخزون والأسعار', (
    <>
      <div class="card-box"><h3>كيف يعمل الفحص</h3>
        <p style="font-size:14px">الخادم يرتب المنتجات حسب الأهمية (مبيعات ومشاهدات) وقِدم آخر فحص. افتح 1688 في المتصفح واضغط <a href={bm} class="btn sm brand" onclick="return false">🔄 فحص المخزون</a> من شريط المفضلة، فيمر السكربت على المنتجات واحدًا واحدًا كل 12 ثانية ويحدّث السعر والتوفر. إذا ظهر كابتشا، حلّه وسيُستأنف الفحص.</p>
        <p style="font-size:13px;color:#666">عند الشراء الفعلي يتم أهم فحص: موظف الشريك يضغط "نفد" أو "تم الشراء"، فيُحدَّث المنتج فورًا.</p>
      </div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الأولوية</th><th>المنتج</th><th>offerId</th><th>آخر فحص</th><th>متوفر</th></tr>
        {stale.results.map((p, i) => <tr><td>{i + 1}</td><td>{p.title_ar}</td><td class="mono">{p.source_offer_id}</td><td>{p.last_checked_at ? timeAgo(p.last_checked_at) : <b style="color:#d3262b">لم يُفحص</b>}</td><td>{p.in_stock ? '✓' : '✗'}</td></tr>)}
      </table></div>
    </>
  ));
});

// ---------- التسعير ----------
admin.get('/pricing', async (c) => {
  const s = await loadSettings(c.env.DB);
  const ex = computePrice(s, 25, 300);
  const F = (k: string, l: string, step = '0.01') => <><label>{l}</label><input type="number" step={step} name={k} value={s[k]} /></>;
  return shell(c, 'pricing', 'التسعير وسعر الصرف', (
    <div class="two">
      <form method="post" class="card-box">
        <Flash msg={c.req.query('ok') ? 'تم الحفظ. أعد تسعير الكتالوج ليسري على المنتجات القديمة.' : undefined} />
        <h3>سعر الصرف (يحدّث يوميًا)</h3>
        {F('fx_cny_lyd', '1 يوان صيني = ؟ دينار')}{F('fx_usd_lyd', '1 دولار = ؟ دينار')}
        <h3 style="margin-top:16px">قواعد التسعير</h3>
        {F('markup_percent', 'نسبة الربح الافتراضية %', '1')}{F('safety_percent', 'هامش أمان لتغير السعر %', '1')}{F('ship_usd_per_kg', 'الشحن الجوي للكيلو ($)')}{F('customs_percent', 'الجمارك %', '1')}{F('domestic_cn_ship_cny', 'شحن داخل الصين لمخزن الشريك (¥)')}
        <h3 style="margin-top:16px">التوصيل داخل ليبيا</h3>
        {F('delivery_lyd', 'رسوم التوصيل (د.ل)')}{F('free_ship_over_lyd', 'توصيل مجاني فوق (د.ل)')}
        <button class="btn" style="margin-top:12px">حفظ</button>
      </form>
      <div>
        <div class="card-box"><h3>مثال: منتج بـ 25 ¥ ووزن 300 غ</h3><div class="breakdown">
          <div><span>البضاعة</span><span>{fmt(ex.goods_lyd)}</span></div><div><span>شحن داخلي</span><span>{fmt(ex.domestic_ship_lyd)}</span></div><div><span>شحن دولي</span><span>{fmt(ex.intl_ship_lyd)}</span></div><div><span>جمارك</span><span>{fmt(ex.customs_lyd)}</span></div><div><span>أمان</span><span>{fmt(ex.safety_lyd)}</span></div><div><span>ربح</span><span>{fmt(ex.markup_lyd)}</span></div><div class="t"><span>سعر البيع</span><span>{fmt(ex.total_lyd)}</span></div>
        </div></div>
        <form method="post" action="/admin/pricing/reprice-all" class="card-box"><h3>إعادة تسعير الكتالوج كله</h3><p style="font-size:13px;color:#666">يعيد حساب سعر كل المنتجات بالقواعد الحالية (المنتجات ذات السعر اليدوي تُعاد أيضًا).</p><button class="btn warn">إعادة التسعير الآن</button></form>
      </div>
    </div>
  ));
});
admin.post('/pricing', async (c) => {
  const f = await c.req.parseBody();
  const keys = ['fx_cny_lyd', 'fx_usd_lyd', 'markup_percent', 'safety_percent', 'ship_usd_per_kg', 'customs_percent', 'domestic_cn_ship_cny', 'delivery_lyd', 'free_ship_over_lyd'];
  await c.env.DB.batch(keys.filter(k => f[k] !== undefined).map(k => c.env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, String(f[k]))));
  return c.redirect('/admin/pricing?ok=1');
});
admin.post('/pricing/reprice-all', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db); const cats = await getCategories(db);
  const { results } = await db.prepare('SELECT id,source_price_cny,weight_g,category_id FROM products').all<any>();
  const stmts = results.map(p => { const cat = cats.find(x => x.id === p.category_id); const pr = computePrice(s, p.source_price_cny, p.weight_g ?? cat?.est_weight_g ?? 300, cat?.markup_percent); return db.prepare('UPDATE products SET price_lyd=? WHERE id=?').bind(pr.total_lyd, p.id); });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return c.redirect('/admin/pricing?ok=1');
});

// ---------- الشركاء ----------
admin.get('/partners', async (c) => {
  const rows = await c.env.DB.prepare("SELECT p.*,(SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('paid','purchasing','purchased','at_warehouse')) AS active_orders,(SELECT COUNT(*) FROM users u WHERE u.partner_id=p.id) AS staff FROM partners p ORDER BY p.id").all<any>();
  return shell(c, 'partners', 'شركاء الشحن والشراء', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <p style="font-size:13px;color:#666">يمكن إضافة أكثر من شريك. الطلبات الجديدة تُوزَّع حسب نسبة التوزيع، ويمكن تغيير الشريك لأي طلب يدويًا.</p>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الشريك</th><th>عنوان المخزن</th><th>التواصل</th><th>$/كغ</th><th>نسبة التوزيع</th><th>نشط</th><th>طلبات جارية</th><th>موظفون</th><th></th></tr>
        {rows.results.map(p => <tr><form method="post" action={`/admin/partners/${p.id}`}><td><input type="text" name="name" value={p.name} /></td><td><input type="text" name="warehouse_address" value={p.warehouse_address ?? ''} /></td><td><input type="text" name="contact" value={p.contact ?? ''} /></td><td><input type="number" step="0.1" name="ship_rate_per_kg" value={p.ship_rate_per_kg} style="width:70px" /></td><td><input type="number" name="share_percent" value={p.share_percent} style="width:70px" /></td><td><select name="active"><option value="1" selected={!!p.active}>نعم</option><option value="0" selected={!p.active}>لا</option></select></td><td>{p.active_orders}</td><td>{p.staff}</td><td><button class="btn sm ghost">حفظ</button></td></form></tr>)}
      </table></div>
      <form method="post" action="/admin/partners/new" class="card-box inline" style="margin-top:14px"><input type="text" name="name" placeholder="اسم الشريك الجديد" required /><input type="text" name="warehouse_address" placeholder="عنوان المخزن في الصين" /><input type="text" name="contact" placeholder="واتساب/وي شات" /><button class="btn sm">+ إضافة شريك</button></form>
    </>
  ));
});
admin.post('/partners/new', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('INSERT INTO partners(name,warehouse_address,contact,share_percent) VALUES(?,?,?,0)').bind(String(f.name), String(f.warehouse_address ?? ''), String(f.contact ?? '')).run(); return c.redirect('/admin/partners?ok=1'); });
admin.post('/partners/:id', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('UPDATE partners SET name=?,warehouse_address=?,contact=?,ship_rate_per_kg=?,share_percent=?,active=? WHERE id=?').bind(String(f.name), String(f.warehouse_address ?? ''), String(f.contact ?? ''), Number(f.ship_rate_per_kg) || 0, Number(f.share_percent) || 0, Number(f.active), Number(c.req.param('id'))).run(); return c.redirect('/admin/partners?ok=1'); });

export default admin;
