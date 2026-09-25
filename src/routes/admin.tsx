import { Hono } from 'hono';
import type { Context } from 'hono';
import { Ic } from '../views/icons';
import type { Env } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS } from '../types';
import { AdminShell } from '../views/dash';
import { Flash } from '../views/layout';
import { getCategories, PRODUCT_SELECT, fmt, imgUrl, timeAgo, latinDigits, realWa, notify, likePat } from '../lib/db';
import type { ProductRow } from '../lib/db';
import { classifyModesty } from '../lib/modesty';
import { fingerprint, sameProduct } from '../lib/dedupe';
import { loadSettings, computePrice } from '../lib/pricing';
import { requireRole } from '../lib/auth';
import { attrValue, notRetail, kindOf, plausibleWeightG, MAX_WEIGHT_G, estWeightG, titleWeightG } from '../lib/source';
import { junkAttr } from '../lib/attr-en';  // الشظيّة تُحذف قبل الترجمة وإلا صارت «غير قابل للإرجاع» لونًا عربيًا
import { requirePerm, logActivity } from '../lib/perm';
import { settleLinkRequests, LINK_SOURCES, LINK_STATUS } from '../lib/link-requests';
import { validPixel, validVerify, bustMetaCache } from '../lib/meta';
import { setOrderStatus, markOrderPaid } from '../lib/orders';
import { RATE_KEYS, RATE_AR, PP_KEY, syncPricingPartner, pricingPartnerId, attemptDispatch, moveMediaToR2, partnerBalance } from '../lib/partner';
import { Translator, hasCJK, hasArabic, enTitle, goodTitle, retranslatePending, releaseHeldDrafts, BROKEN_SQL } from '../lib/translate';

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
    db.prepare("SELECT COUNT(*) n FROM link_requests WHERE status='new'"),
  ]);
  const n = (i: number) => (k[i].results[0] as any).n as number;
  return c.html(<AdminShell user={c.get('user')!} active={active} title={title} counts={{ orders: n(0), tickets: n(1), reviews: n(2), requests: n(3) }}>{body}</AdminShell>);
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
      {/* بطاقات بأيقونة وتنقل إلى صفحتها (٢٥/٠٩/٢٦) */}
      <div class="kpis">
        <a class="kpi ic " href="/admin/products"><i class="kpi-ic"><Ic n="bag" s={22} /></i><b>{v[0]}</b><span>منتج نشط</span></a>
        <a class="kpi ic " href="/admin/orders"><i class="kpi-ic"><Ic n="box" s={22} /></i><b>{v[1]}</b><span>طلب آخر 24 ساعة</span></a>
        <a class="kpi ic " href="/admin/reports"><i class="kpi-ic"><Ic n="trend" s={22} /></i><b>{fmt(v[2])}</b><span>مبيعات 30 يومًا</span></a>
        <a class="kpi ic warn" href="/admin/orders?status=pending_payment"><i class="kpi-ic"><Ic n="card" s={22} /></i><b>{v[3]}</b><span>بانتظار تأكيد الدفع</span></a>
        <a class="kpi ic blue" href="/admin/partners"><i class="kpi-ic"><Ic n="ship" s={22} /></i><b>{v[4]}</b><span>عند شركاء الشراء</span></a>
        <a class="kpi ic " href="/admin/customers"><i class="kpi-ic"><Ic n="users" s={22} /></i><b>{v[5]}</b><span>زبون مسجّل</span></a>
        <a class="kpi ic bad" href="/admin/stock"><i class="kpi-ic"><Ic n="refresh" s={22} /></i><b>{v[6]}</b><span>منتج لم يُفحص منذ أسبوع</span></a>
        <a class="kpi ic " href="/admin/pricing"><i class="kpi-ic"><Ic n="coin" s={22} /></i><b>{s.fx_cny_lyd}</b><span>سعر اليوان اليوم (د.ل)</span></a>
        <a class="kpi ic warn" href="/admin/tickets"><i class="kpi-ic"><Ic n="ret" s={22} /></i><b>{v[7]}</b><span>تذاكر مفتوحة</span></a>
        <a class="kpi ic " href="/admin/reviews"><i class="kpi-ic"><Ic n="star" s={22} /></i><b>{v[8]}</b><span>تقييمات بانتظار المراجعة</span></a>
        <a class="kpi ic ok" href="/admin/payments"><i class="kpi-ic"><Ic n="wallet" s={22} /></i><b>{fmt(v[9])}</b><span>مدفوعات ماي باي اليوم</span></a>
      </div>
      <div class="quick"><a href="/admin/orders?status=pending_payment"><Ic n="card" s={18} /> تأكيد مدفوعات يدوية</a><a href="/admin/tickets"><Ic n="ret" s={18} /> الرد على التذاكر</a><a href="/admin/reviews"><Ic n="star" s={18} /> مراجعة التقييمات</a><a href="/admin/import"><Ic n="download" s={18} /> استيراد منتجات</a><a href="/admin/pricing"><Ic n="coin" s={18} /> تحديث سعر الصرف</a><a href="/admin/reports"><Ic n="trend" s={18} /> التقارير</a></div>
      <div class="card-box"><h3>آخر الطلبات</h3><div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبون</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr>
        {recent.results.map(o => <tr><td><a href={`/admin/orders/${o.code}`} style="color:var(--brand);font-weight:700">{o.code}</a></td><td>{o.name}</td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{fmt(o.total_lyd)}</td><td>{timeAgo(o.created_at)}</td></tr>)}
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
  if (q) { where += ' AND (o.code LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)'; binds.push(likePat(q), likePat(q), likePat(q)); }
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) n FROM orders o JOIN users u ON u.id=o.user_id WHERE ${where}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const rows = await c.env.DB.prepare(`SELECT o.*,u.name,u.phone,pa.name AS partner FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN partners pa ON pa.id=o.partner_id WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`).bind(...binds, PER, (pageOf(c) - 1) * PER).all<any>();
  const counts = await c.env.DB.prepare('SELECT status,COUNT(*) n FROM orders GROUP BY status').all<any>();
  const cm = Object.fromEntries(counts.results.map(r => [r.status, r.n]));
  return shell(c, 'orders', 'الطلبات', (
    <>
      <div class="tabs"><a href="/admin/orders" class={!st ? 'on' : ''}>الكل</a>{Object.entries(ORDER_STATUS).map(([k, v]) => <a href={`/admin/orders?status=${k}`} class={st === k ? 'on' : ''}>{v.ar}{cm[k] ? <i>{cm[k]}</i> : null}</a>)}</div>
      <form class="inline" style="margin:8px 0"><input type="text" name="q" placeholder="رقم الطلب / اسم / هاتف" value={q} /><input type="hidden" name="status" value={st} /><button class="btn sm">بحث</button></form>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبون</th><th>الحالة</th><th>الدفع</th><th>الشريك</th><th>الإجمالي</th><th>التاريخ</th></tr>
        {rows.results.map(o => <tr><td><a href={`/admin/orders/${o.code}`} style="color:var(--brand);font-weight:700">{o.code}</a></td><td>{o.name}<br /><small>{o.phone} · {o.ship_city}</small></td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{PAYMENT_METHODS[o.payment_method]?.ar ?? o.payment_method}{o.payment_ref && <><br /><small>{o.payment_ref}</small></>}</td><td>{o.partner ?? '—'}</td><td>{fmt(o.total_lyd)}</td><td>{timeAgo(o.created_at)}</td></tr>)}
      </table></div><Pager c={c} total={total} />
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
            {o.partner_id && <p style="font-size:13px;margin:0 0 8px"><a href={`/partner/order/${o.code}`} target="_blank"><Ic n="camera" s={18} /> صور المراحل وفواتير الشريك ومستحقاته ←</a></p>}
            {(o.ship_zone || o.courier_ref) && <p class="courier-admin" style="font-size:13px;margin:0 0 8px">🚚 {o.ship_zone ? `المنطقة: ${o.ship_zone}` : ''}{o.courier_ref ? ` · مع ${o.courier} — رقم الشحنة ${o.courier_ref} (${o.courier_status === 'failed' ? `تعذّر: ${o.courier_note ?? ''}` : o.courier_status === 'delivered' ? 'سُلِّم' : `منذ ${timeAgo(o.courier_at)}`})` : ''}</p>}
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
              <div><span>المبيع للزبون</span><b>{fmt(o.subtotal_lyd)}</b></div>
              <div><span>تكلفة الشراء الفعلية</span><b>{actual ? fmt(actual) : '—'}</b></div>
              {actual > 0 && <div class="t"><span>الهامش الأولي (قبل الشحن)</span><b style={`color:${o.subtotal_lyd - actual > 0 ? '#1a9c5b' : '#d3262b'}`}>{fmt(o.subtotal_lyd - actual)} ({Math.round((o.subtotal_lyd - actual) / o.subtotal_lyd * 100)}%)</b></div>}
            </div>
          </div>
          <div class="card-box"><h3>سجل الأحداث</h3>{events.results.map(e => <div style="font-size:13px;border-bottom:1px solid #eee;padding:6px 0"><span class={`status ${ORDER_STATUS[e.status]?.color}`}>{ORDER_STATUS[e.status]?.ar ?? e.status}</span> {e.note} <small style="color:#888">— {e.name ?? 'النظام'} · {timeAgo(e.created_at)}</small></div>)}</div>
        </div>
        <div>
          <div class="card-box"><h3>الزبون</h3><a href={`/admin/customers/${o.user_id}`} style="color:var(--brand);font-weight:700">{o.name}</a><br />{o.phone}<br />{o.ship_city} — {o.ship_address}{o.note && <><br /><i>{o.note}</i></>}</div>
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
  await markOrderPaid(db, o.id, String(f.payment_ref), u.id, 'تم تأكيد الدفع يدويًا وإرسال الطلب لفريق الشراء', new URL(c.req.url).origin);
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
  const rows = await c.env.DB.prepare("SELECT u.id,u.name,u.phone,u.city,u.created_at,u.points,u.active,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS n,(SELECT COALESCE(SUM(total_lyd),0) FROM orders o WHERE o.user_id=u.id AND o.status NOT IN ('pending_payment','cancelled','refunded')) AS spent FROM users u WHERE role='customer' AND (u.name LIKE ? OR u.phone LIKE ?) ORDER BY u.id DESC LIMIT 300").bind(likePat(q), likePat(q)).all<any>();
  return shell(c, 'customers', 'الزبائن', (
    <>
    <form class="inline" style="margin-bottom:10px"><input type="text" name="q" placeholder="اسم / هاتف" value={c.req.query('q') ?? ''} /><button class="btn sm">بحث</button></form>
    <div class="tbl-wrap"><table class="tbl"><tr><th>الاسم</th><th>الهاتف</th><th>المدينة</th><th>الطلبات</th><th>المشتريات</th><th>نقاط</th><th>التسجيل</th></tr>
      {rows.results.map(u => <tr><td><a href={`/admin/customers/${u.id}`} style="color:var(--brand);font-weight:700">{u.name}</a>{!u.active && <span class="status red" style="margin-inline-start:6px">معطّل</span>}</td><td>{u.phone}</td><td>{u.city ?? '—'}</td><td>{u.n}</td><td>{fmt(u.spent)}</td><td>{u.points}</td><td>{timeAgo(u.created_at)}</td></tr>)}
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
              <li>اسحب هذا الزر إلى شريط المفضلة في Chrome: <a href={bookmarklet} class="btn sm brand" onclick="return false" draggable="true"><Ic n="download" s={18} /> استورد إلى هدهد</a></li>
              <li>افتح <a href="https://www.1688.com" target="_blank" class="src-link">1688.com</a> وسجّل الدخول بحسابك، وابحث عن أي منتج أو افتح صفحة قسم.</li>
              <li>اضغط الزر من شريط المفضلة: تظهر نافذة تعرض منتجات الصفحة، تختار القسم في هدهد وتضغط "استيراد".</li>
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
  const tr = new Translator(db, ai);
  // ترجمة قيم المتغيرات (ألوان/مقاسات): قاموس فوري ثم الذاكرة ثم الذكاء الاصطناعي
  const trVariants = async (vs: any[]) => { for (const v of vs ?? []) { if (junkAttr(v.color)) v.color = null; if (junkAttr(v.size)) v.size = null; if (v.color) v.color = (await tr.t(String(v.color), 'attr', v.colorEn)) ?? v.color; if (v.size) v.size = (await tr.t(String(v.size), 'attr', v.sizeEn)) ?? v.size; } return vs ?? []; };
  const s = await loadSettings(db);
  // الحد الفاصل بين التجزئة والجملة: فوقه لا تصل البضاعة للرف. قابل للضبط من /admin/pricing
  const maxRetail = Math.max(2, parseInt(s.retail_max_moq ?? '') || 10);
  const cats = await getCategories(db);
  const cat = cats.find(x => x.id === categoryId) ?? null;
  // عناوين القسم الحالية: نقارن بها كل منتج جديد لئلا نُدخل نفس القطعة من مورد آخر
  const peers = categoryId
    ? (await db.prepare("SELECT id,source_offer_id,source_price_cny,COALESCE(title_src,title_ar) t FROM products WHERE category_id=? AND status='active'").bind(categoryId).all<any>()).results
    : [];
  let imported = 0, updated = 0, skipped = 0, enriched = 0, dupes = 0; const newIds: string[] = [];
  // ما أُضيف فعلًا لمنتجات موجودة: يغذّي شريط تقدّم الإضافة. `enriched` كان يُعدّ مع كل مرور
  // ولو لم يُضف شيئًا (100 من 100 دائمًا) فلا يقول لصاحب المشروع شيئًا.
  const gain = { img: 0, vars: 0, wt: 0 };
  const seen = new Set<string>();   // نتائج البحث قد تكرر المنتج نفسه في الدفعة الواحدة
  for (const it of arr) {
    const offerId = String(it.offerId ?? it.offer_id ?? '').trim();
    const price = parseFloat(it.priceCny ?? it.price_cny ?? it.price);
    if (!offerId || !price) { skipped++; continue; }
    if (seen.has(offerId)) { skipped++; continue; }
    seen.add(offerId);
    let titleAr: string = it.titleAr ?? it.title_ar ?? it.title ?? 'منتج';
    if (hasCJK(titleAr) || enTitle(titleAr)) titleAr = (await tr.t(titleAr, 'title', it.titleEn)) ?? titleAr;
    const supplierAr = it.supplier ? ((await tr.t(String(it.supplier))) ?? it.supplier) : null;
    if (Array.isArray(it.variants)) it.variants = await trVariants(it.variants);
    // حشمة: ملابس النوم والداخلية تُنقل إلى قسمها مهما كانت كلمة البحث، ولا تظهر على الرئيسية
    const mod = classifyModesty(titleAr, it.title, it.titleEn);
    // نفس القطعة تُباع من عشرات الموردين: نحتفظ بالأرخص ولا نملأ المتجر بالمكرر
    const srcTitle = it.title || titleAr;
    const fp = fingerprint(srcTitle);
    const twin = peers.find((x: any) => String(x.source_offer_id) !== offerId && sameProduct(x.t, srcTitle)) ?? null;
    const lingerieId = cats.find(x => x.slug === 'lingerie')?.id ?? null;
    const targetCat = mod.intimate && lingerieId ? lingerieId : categoryId;
    const homeOk = mod.homeOk && targetCat !== lingerieId ? 1 : 0;
    const ex = await db.prepare("SELECT id,category_id,weight_g,volume_cm3,min_qty FROM products WHERE source='1688' AND source_offer_id=?").bind(offerId).first<{ id: number; category_id: number | null; weight_g: number | null; volume_cm3: number | null; min_qty: number | null }>();
    // منتج موجود: يُسعَّر بقسمه هو ووزنه المحفوظ، لا بقسم المهمة التي فحصته
    // (إعادة الفحص من مهمة بلا قسم كانت تُنقص السعر لأنها تفترض وزنًا افتراضيًا)
    const useCat = ex ? (cats.find(x => x.id === ex.category_id) ?? cat) : (cats.find(x => x.id === targetCat) ?? cat);
    const estW = useCat?.est_weight_g ?? 300;
    // وزن مستحيل (ربطة عنق 40 كغ) لا يُسعَّر به ولا يُحفظ: يُصحَّح غرامات أو يُترك لوزن القسم
    const wIn = it.weightG ? plausibleWeightG(Number(it.weightG), estW, price) : undefined;
    const exW = ex?.weight_g ? plausibleWeightG(ex.weight_g, estW, price) : undefined;
    // بلا وزن من الصفحة: من العنوان («دمبل 5 كجم»)، وإلا تقدير لا يتجاوز 150 غ لكل يوان
    const tW = !wIn && !exW ? titleWeightG([it.title, titleAr], useCat?.slug, estW, price) : undefined;
    const weight = wIn ?? exW ?? tW ?? estWeightG(estW, price);
    const volume = it.volumeCm3 ?? ex?.volume_cm3 ?? null;
    // الشحن الداخلي يُقسَّم على اللوط: الحد الأدنى جزء من التسعير لا معلومة عرض فقط
    const moq = Math.max(1, Number(it.minQty ?? 0) || ex?.min_qty || 1);
    const pr = computePrice(s, price, weight, useCat?.markup_percent, volume, 'air', moq);
    const prSea = computePrice(s, price, weight, useCat?.markup_percent, volume, 'sea', moq);
    if (ex) {
      await db.prepare("UPDATE products SET source_price_cny=?,price_lyd=?,price_sea_lyd=?,in_stock=?,last_checked_at=datetime('now'),updated_at=datetime('now') WHERE id=?")
        .bind(price, pr.total_lyd, prSea.total_lyd, it.inStock === false ? 0 : 1, ex.id).run();
      // إثراء: منتج استُورد من صفحة قائمة (صورة واحدة، بلا مقاسات) ثم وصلت تفاصيله من صفحة المنتج
      const enrich: D1PreparedStatement[] = [];
      const cur = await db.prepare('SELECT (SELECT COUNT(*) FROM product_images WHERE product_id=?) imgs,(SELECT COUNT(*) FROM variants WHERE product_id=?) vars,title_ar,min_qty,supplier_name FROM products WHERE id=?').bind(ex.id, ex.id, ex.id).first<any>();
      let got = false;
      if (Array.isArray(it.images) && it.images.length > 1 && (cur?.imgs ?? 0) <= 1) {
        gain.img++; got = true;
        enrich.push(db.prepare('DELETE FROM product_images WHERE product_id=?').bind(ex.id));
        it.images.slice(0, 8).forEach((u: string, i: number) => enrich.push(db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES(?,?,?)').bind(ex.id, u, i)));
      }
      const newVars = Array.isArray(it.variants) && (cur?.vars ?? 0) === 0 ? it.variants.map(asVariant).filter(Boolean) : [];
      if (newVars.length) {
        // متغيّر بلا لون ولا مقاس بعد تنظيف رؤوس الأعمدة لا معنى له: لا يُدرج أصلًا
        gain.vars++; got = true;
        newVars.forEach((v: any) => enrich.push(db.prepare('INSERT INTO variants(product_id,source_sku_id,color,size,price_delta_lyd,in_stock,image_url) VALUES(?,?,?,?,?,?,?)')
          .bind(ex.id, v.skuId ?? null, v.color, v.size, v.priceCny ? Math.round((v.priceCny - price) * parseFloat(s.fx_cny_lyd) * 1.4 * 2) / 2 : 0, v.inStock === false ? 0 : 1, v.image ?? null)));
      }
      // كل مرور على منتج موجود محاولة إثراء تُعدّ، نجحت أو لم تنجح: بها يتقدّم الطابور ولا يدور
      const upd: string[] = ['enrich_tries=enrich_tries+1', 'wopt_at=NULL']; const binds: any[] = [];
      if ((hasCJK(cur?.title_ar) || !goodTitle(cur?.title_ar)) && !hasCJK(titleAr) && titleAr !== cur?.title_ar && (goodTitle(titleAr) || hasCJK(cur?.title_ar))) { got = true; upd.push('title_ar=?'); binds.push(titleAr.slice(0, 200)); if (hasArabic(titleAr)) upd.push("status=CASE WHEN status='draft' THEN 'active' ELSE status END"); }
      // الإثراء يكتشف الحد الأدنى الحقيقي بعد أن يكون المنتج على الرف. رفعُه وحده لا يكفي:
      // منتج نشط صار حدّه الأدنى قطعتين يُجبر الزبونة، فيجب أن يُخفى في الجملة نفسها.
      // (سُرِّب منتج واحد بهذا الطريق بعد ترحيل 0023 — العطل يعود من باب الإثراء لا الاستيراد.)
      if (it.minQty && Number(it.minQty) > 1 && (cur?.min_qty ?? 1) === 1) {
        upd.push('min_qty=?'); binds.push(Number(it.minQty));
        if (notRetail(it.title, Number(it.minQty), maxRetail)) upd.push("status=CASE WHEN status='active' THEN 'hidden' ELSE status END");
      }
      if (wIn && (!ex.weight_g || exW !== ex.weight_g)) { upd.push('weight_g=?'); binds.push(wIn); gain.wt++; got = true; }
      else if (ex.weight_g && exW !== ex.weight_g) { upd.push('weight_g=?'); binds.push(exW ?? tW ?? null); }   // المحفوظ مستحيل ولم يأتِ بديل
      else if (!ex.weight_g && tW) { upd.push('weight_g=?'); binds.push(tW); gain.wt++; got = true; }
      if (it.volumeCm3 && Number(it.volumeCm3) > 0 && !ex.volume_cm3) { upd.push('volume_cm3=?'); binds.push(Math.round(Number(it.volumeCm3))); }
      if (supplierAr && (!cur?.supplier_name || hasCJK(cur.supplier_name))) { upd.push('supplier_name=?'); binds.push(supplierAr); }
      if (it.title) { upd.push('title_src=COALESCE(title_src,?)'); binds.push(String(it.title)); }
      if (fp) { upd.push('fingerprint=?'); binds.push(fp); }
      const kd = kindOf(it.title); if (kd) { upd.push('kind=COALESCE(kind,?)'); binds.push(kd); }
      if (upd.length) enrich.push(db.prepare(`UPDATE products SET ${upd.join(',')} WHERE id=?`).bind(...binds, ex.id));
      if (enrich.length) await db.batch(enrich);
      if (got) enriched++;
      if (mod.intimate && lingerieId && ex.category_id !== lingerieId) await db.prepare('UPDATE products SET category_id=?,home_ok=0 WHERE id=?').bind(lingerieId, ex.id).run();
      else if (!homeOk) await db.prepare('UPDATE products SET home_ok=0 WHERE id=?').bind(ex.id).run();
      updated++; continue;
    }
    if (!ex && twin) {
      if (twin.source_price_cny <= price) { skipped++; dupes++; continue; }                     // عندنا الأرخص بالفعل
      await db.prepare("UPDATE products SET status='hidden' WHERE id=?").bind(twin.id).run();   // الجديد أرخص: نُخفي القديم
      twin.source_price_cny = price; dupes++;
    }
    // فوق 50 كغ (مظلة مستودع 250 كغ بـ22,120 د.ل من الجلب المجاني) ليس بضاعة تجزئة تُشحن جوًّا: يدخل مخفيًا
    // كالجملة — قرار صاحب المشروع ٢٥/٠٩/٢٦ «أخفِ المظلات»
    const slug = `${offerId}-${Math.random().toString(36).slice(2, 6)}`;
    const ins = await db.prepare(
      // last_checked_at يبقى NULL: المنتج وصل من نتيجة بحث ولم يُفحص تفصيليًا قط، وادّعاء أنه فُحص
      // كان يخفيه عن دورة الإثراء ويجعل «آخر فحص» في اللوحة رقمًا كاذبًا
      `INSERT OR IGNORE INTO products(source,source_offer_id,source_url,slug,title_ar,title_src,description_ar,category_id,source_price_cny,price_lyd,compare_price_lyd,price_sea_lyd,weight_g,volume_cm3,min_qty,in_stock,status,supplier_name,last_checked_at,sales,rating,home_ok,fingerprint,kind)
       VALUES('1688',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?)`,
    ).bind(offerId, it.url ?? `https://detail.1688.com/offer/${offerId}.html`, slug, titleAr, it.title ?? null, it.descriptionAr ?? null,
      targetCat, price, pr.total_lyd, Math.random() < 0.4 ? Math.ceil(pr.total_lyd * 1.25 / 5) * 5 : null, prSea.total_lyd, wIn ?? tW ?? null, it.volumeCm3 ?? null,
      moq, it.inStock === false ? 0 : 1, notRetail(it.title, moq, maxRetail) || (wIn ?? 0) > MAX_WEIGHT_G ? 'hidden' : hasCJK(titleAr) || !hasArabic(titleAr) ? 'draft' : 'active', supplierAr, parseInt(it.sales ?? 0) || 0, 0, homeOk, fp || null, kindOf(it.title)).run();
    const pid = ins.meta.last_row_id as number;
    if (!pid || !ins.meta.changes) { skipped++; continue; }   // تجاهل صفّ لم يُدرج (تعارض مع استيراد متزامن)
    const stmts: D1PreparedStatement[] = [];
    (it.images ?? []).slice(0, 6).forEach((u: string, i: number) => stmts.push(db.prepare('INSERT INTO product_images(product_id,url,sort) VALUES(?,?,?)').bind(pid, u, i)));
    (it.variants ?? []).map(asVariant).filter(Boolean).forEach((v: any) => stmts.push(db.prepare('INSERT INTO variants(product_id,source_sku_id,color,size,price_delta_lyd,in_stock,image_url) VALUES(?,?,?,?,?,?,?)')
      .bind(pid, v.skuId ?? null, v.color, v.size, v.priceCny ? Math.round((v.priceCny - price) * parseFloat(s.fx_cny_lyd) * 1.4 * 2) / 2 : 0, v.inStock === false ? 0 : 1, v.image ?? null)));
    if (stmts.length) await db.batch(stmts);
    peers.push({ id: pid, source_offer_id: offerId, source_price_cny: price, t: srcTitle });
    imported++; newIds.push(offerId);
  }
  await db.prepare('INSERT INTO import_log(by_user_id,source,page_url,imported,updated,skipped) VALUES(?,?,?,?,?,?)').bind(byUserId, '1688', pageUrl, imported, updated, skipped).run();
  return { imported, updated, skipped, enriched, dupes, newIds, gain };
}

// إعلان مصنع تغليف/طباعة/OEM — نفس الكلمات في src/lib/source.ts وفي ترحيل 0020
const PACK = `(p.title_src LIKE '%\u5305\u88c5%' OR p.title_src LIKE '%\u5370\u5237%' OR p.title_src LIKE '%\u7eb8\u76d2%' OR p.title_src LIKE '%\u793c\u54c1\u76d2%' OR p.title_src LIKE '%\u5305\u88c5\u888b%' OR p.title_src LIKE '%\u5305\u88c5\u76d2%' OR p.title_src LIKE '%OEM%' OR p.title_src LIKE '%\u8d34\u724c%' OR p.title_src LIKE '%\u4ee3\u5de5%')`;

// قيمة المتغيّر بعد تنظيف رؤوس الأعمدة؛ null إن لم يبقَ لون ولا مقاس فلا يُدرج المتغيّر
function asVariant(v: any) {
  const color = attrValue(v?.color), size = attrValue(v?.size);
  return color || size ? { ...v, color, size } : null;
}

// ترقيم صفحات اللوحة. القوائم كانت تقف عند 200 صفّ بلا رقم صفحة واحد: ما بعدها
// موجود في القاعدة ولا يصل إليه أحد — نفس عطل ترقيم المتجر بوجه آخر.
// الرابط يضع `page` ولا يحذفه (الخطأ الذي أخفى 90% من بضاعة المتجر).
const PER = 100;
const pageOf = (c: Context<Env>) => Math.max(1, parseInt(new URL(c.req.url).searchParams.get('page') ?? '1'));
const Pager = ({ c, total }: { c: Context<Env>; total: number }) => {
  const pages = Math.ceil(total / PER); const cur = pageOf(c);
  if (pages <= 1) return null;
  const href = (n: number) => { const u = new URL(c.req.url); u.searchParams.set('page', String(n)); return u.pathname + u.search; };
  return (
    <div class="pager" style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <span style="font-size:13px;color:#666">الصفحة {cur} من {pages} · {total} صفًّا</span>
      {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 20).map(n => <a href={href(n)} class={`btn sm ${n === cur ? '' : 'ghost'}`}>{n}</a>)}
    </div>
  );
};

// ---------- المنتجات ----------
admin.get('/products', async (c) => {
  const q = c.req.query('q') ?? ''; const st = c.req.query('status') ?? '';
  let where = '1=1'; const binds: any[] = [];
  if (q) { where += ' AND (p.title_ar LIKE ? OR p.source_offer_id LIKE ?)'; binds.push(likePat(q), likePat(q)); }
  if (st) { where += ' AND p.status=?'; binds.push(st); }
  // ?stuck=1 — ما تعذّر إثراؤه بعد ثلاث محاولات من الإضافة المجانية: هؤلاء من يستحق الكريدت
  // ?moq=N — قطع الجملة: حدّها الأدنى N فأكثر. الزبونة لا تستطيع شراء أقل منه،
  // فقطعة أقلّ طلبها 8000 ليست بيعًا بالتجزئة مهما بدت في الرف.
  const moq = parseInt(c.req.query('moq') ?? '') || 0;
  if (moq > 1) { where += ' AND p.min_qty >= ?'; binds.push(moq); }
  // ?pack=1 — إعلانات مصانع التغليف والطباعة وOEM: تبيع العلبة الفارغة لا ما في الصورة
  if (c.req.query('pack')) where += ` AND ${PACK}`;
  // ?broken=1 — ترجمات سليمة نحويًا لكنها ليست ترجمة العنوان (تكرار ملتصق، اسم منتج ضائع،
  // كلمة لا أصل لها في الصيني). تدخل طابور الترجمة تلقائيًا، وهذا الفلتر لمراجعتها بالعين.
  if (c.req.query('broken')) where += ` AND ${BROKEN_SQL}`;
  if (c.req.query('stuck')) where += ` AND p.source='1688' AND p.enrich_tries >= 3 AND p.status IN ('active','draft')
     AND ((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1
       OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0 OR p.weight_g IS NULL)`;
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) n FROM products p WHERE ${where}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const rows = await c.env.DB.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(...binds, PER, (pageOf(c) - 1) * PER).all<ProductRow>();
  const s = await loadSettings(c.env.DB);
  const untranslated = (await c.env.DB.prepare("SELECT COUNT(*) n FROM products WHERE title_ar GLOB '*[一-龥]*'").first<any>())?.n ?? 0;
  const maxRetail = Math.max(2, parseInt(s.retail_max_moq ?? '') || 10);
  const brokenN = (await c.env.DB.prepare(`SELECT COUNT(*) n FROM products WHERE status IN ('active','draft') AND ${BROKEN_SQL}`).first<{ n: number }>())?.n ?? 0;
  const lots = await c.env.DB.prepare(`SELECT
     SUM(p.status='active' AND p.min_qty >= ?) lotsOn, SUM(p.status='hidden' AND p.min_qty >= ?) lotsOff,
     SUM(p.status='active' AND ${PACK}) packOn, SUM(p.status='hidden' AND ${PACK}) packOff
     FROM products p`).bind(maxRetail, maxRetail).first<any>();
  return shell(c, 'products', 'المنتجات', (
    <>
      <Flash msg={c.req.query('lots') ? `${c.req.query('act') === 'hide' ? 'أُخفيت' : 'أُعيدت للمتجر'} ${c.req.query('lots')} قطعة جملة` : c.req.query('stuck') ? `منتجات تعذّر إثراؤها بعد ثلاث محاولات من الإضافة: صفحتها على 1688 لا تعطي الصور أو المقاسات أو الوزن. أثرها بالكريدت حين يتوفر — وحتى ذلك تُسعَّر بوزن القسم التقديري.` : c.req.query('imported') ? `تم استيراد ${c.req.query('imported')} منتج وتحديث ${c.req.query('updated')}` : c.req.query('translated') ? `تُرجم ${c.req.query('translated')} عنوانًا` : c.req.query('ok') ? 'تم الحفظ ✓' : undefined} /><Flash type="err" msg={c.req.query('noai') ? 'الترجمة تعمل على Cloudflare فقط (ربط Workers AI غير متاح هنا)' : undefined} />
      <form class="inline" style="margin-bottom:10px"><input type="text" name="q" placeholder="بحث بالاسم أو offerId" value={q} /><select name="status"><option value="">كل الحالات</option>{['active', 'draft', 'hidden', 'unavailable'].map(x => <option value={x} selected={st === x}>{x}</option>)}</select><button class="btn sm">بحث</button><a class="btn sm ghost" href="/admin/products/new">+ منتج يدوي</a><button class="btn sm ghost" formaction="/admin/products/translate" formmethod="post">🈶 ترجمة العناوين الصينية ({untranslated})</button></form>
      {/* ترجمة سليمة نحويًا لكنها ليست ترجمة العنوان — تدخل طابور الترجمة وحدها، وهذا للمراجعة بالعين */}
      {brokenN > 0 && <p style="font-size:13px;margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#fdecec;border:1px solid #f0b4b4;color:#8c2121">
        <b>{brokenN}</b> عنوانًا ترجمتُه مكسورة (تكرار ملتصق، أو اسم المنتج ضائع، أو كلمة لا أصل لها في العنوان الصيني).
        تُعاد ترجمتها تلقائيًا كل ساعة — <a href="/admin/products?broken=1">راجعها بعينك</a>.
      </p>}
      {/* بضاعة ليست للتجزئة: لوط جملة، أو إعلان مصنع تغليف يبيع العلبة الفارغة لا ما في الصورة */}
      <form method="post" action="/admin/products/wholesale" class="card-box" style="margin-bottom:10px;padding:10px">
        <b style="font-size:14px">بضاعة ليست للتجزئة</b>
        <p style="font-size:12px;color:#666;margin:4px 0">
          <b>لوط جملة</b> (أقل طلب {maxRetail} فأكثر): {lots?.lotsOn ?? 0} على الرف · {lots?.lotsOff ?? 0} مخفية — <a href={`/admin/products?moq=${maxRetail}`}>اعرضها</a>
          <br /><b>إعلانات تغليف وطباعة وOEM</b>: {lots?.packOn ?? 0} على الرف · {lots?.packOff ?? 0} مخفية — <a href="/admin/products?pack=1">اعرضها</a>.
          هذه تبيع العلبة الفارغة لا ما يظهر في الصورة، ولهذا أقلّ طلبها بالمئات.
        </p>
        <div class="inline"><label style="margin:0">أقل طلب ≥</label><input type="number" name="min" value={maxRetail} min="2" style="width:80px" />
          <label style="margin:0"><input type="checkbox" name="pack" value="1" checked /> ومعها إعلانات التغليف</label>
          <button class="btn sm" name="act" value="hide">أخفِها من المتجر</button>
          <button class="btn sm ghost" name="act" value="show">أعِدها للمتجر</button></div>
      </form>
      <div class="tbl-wrap"><table class="tbl"><tr><th></th><th>المنتج</th><th>القسم</th><th>سعر المصدر</th><th>سعر البيع</th><th>الحالة</th><th>مبيعات</th><th>آخر فحص</th><th></th></tr>
        {rows.results.map(p => <tr><td><img src={imgUrl(p.image)} /></td><td><a href={`/admin/products/${p.id}`}>{p.title_ar}</a><br /><a class="src-link" href={p.source_url ?? '#'} target="_blank">{p.source_offer_id}</a></td><td>{p.cat_name ?? '—'}</td><td>{p.source_price_cny} ¥</td><td><b>{fmt(p.price_lyd)}</b><br /><small style="color:#888">هامش ≈ {Math.round((1 - (p.source_price_cny * parseFloat(s.fx_cny_lyd)) / p.price_lyd) * 100)}%</small></td><td><span class={`status ${p.status === 'active' ? 'green' : p.status === 'unavailable' ? 'red' : 'gray'}`}>{p.status}</span>{!p.in_stock && <><br /><small style="color:#d3262b">نفد</small></>}</td><td>{p.sales}</td><td><small>{p.last_checked_at ? timeAgo(p.last_checked_at) : '—'}</small></td><td><a href={`/p/${p.slug}`} target="_blank"><Ic n="eye" s={18} /> </a></td></tr>)}
      </table></div><Pager c={c} total={total} />
    </>
  ));
});

// إخفاء/إظهار قطع الجملة دفعةً واحدة. عكسيّ تمامًا: لا يلمس إلا الحالتين active/hidden
// ولا يمسّ unavailable ولا draft، فلا يُفسد ما حجزه النظام ولا ما أنزله المورّد.
admin.post('/products/wholesale', async (c) => {
  const f = await c.req.parseBody();
  const min = Math.max(2, Number(f.min) || 50);
  const hide = String(f.act) === 'hide';
  const withPack = !!f.pack;
  const cond = `(p.min_qty >= ?${withPack ? ` OR ${PACK}` : ''})`;
  const r = await c.env.DB.prepare(hide
    ? `UPDATE products SET status='hidden',updated_at=datetime('now') WHERE id IN (SELECT p.id FROM products p WHERE p.status='active' AND ${cond})`
    : `UPDATE products SET status='active',updated_at=datetime('now') WHERE id IN (SELECT p.id FROM products p WHERE p.status='hidden' AND ${cond})`).bind(min).run();
  await logActivity(c.env.DB, c.get('user')!.id, 'products.wholesale', 'products', `${hide ? 'hide' : 'show'} min_qty>=${min}${withPack ? '+pack' : ''}`);
  return c.redirect(`/admin/products?moq=${min}&lots=${r.meta?.changes ?? 0}&act=${hide ? 'hide' : 'show'}`);
});
admin.post('/products/translate', async (c) => {
  if (!c.env.AI) { const rel = await releaseHeldDrafts(c.env.DB); return c.redirect(`/admin/products?noai=1&translated=${rel}`); }
  const r = await retranslatePending(c.env.DB, c.env.AI, 40);
  await logActivity(c.env.DB, c.get('user')!.id, 'products.translate', String(r.products + r.variants));
  return c.redirect(`/admin/products?translated=${r.products + r.variants}`);
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
  const br = computePrice(s, p.source_price_cny, p.weight_g ?? estWeightG(cat?.est_weight_g, p.source_price_cny), cat?.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
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
        <div class="card-box"><h3>المتغيرات ({vars.results.length})</h3><table class="tbl"><tr><th>لون</th><th>مقاس</th><th>الوزن</th><th>فرق سعر</th><th>فرق الوزن جوي/بحري</th><th>متوفر</th></tr>{vars.results.map(v => <tr><td>{v.color ?? '—'}</td><td>{v.size ?? '—'}{v.auto_w ? <small style="color:#8a7a6c"> (من العنوان)</small> : null}</td><td>{v.weight_g ? `${v.weight_g} غ` : '—'}</td><td>{v.price_delta_lyd}</td><td>{v.w_delta_lyd || v.w_delta_sea_lyd ? `+${v.w_delta_lyd} / +${v.w_delta_sea_lyd}` : '—'}</td><td>{v.in_stock ? '✓' : '✗'}</td></tr>)}</table></div>
      </div>
    </div>
  ));
});
admin.post('/products/:id', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id'));
  const s = await loadSettings(db); const cats = await getCategories(db); const cat = cats.find(x => x.id === Number(f.category_id));
  const price = f.price_lyd ? parseFloat(String(f.price_lyd)) : computePrice(s, parseFloat(String(f.source_price_cny)), Number(f.weight_g) || estWeightG(cat?.est_weight_g, parseFloat(String(f.source_price_cny))), cat?.markup_percent, null, 'air', Number(f.min_qty) || 1).total_lyd;
  await db.prepare(`UPDATE products SET title_ar=?,category_id=?,source_price_cny=?,weight_g=?,min_qty=?,price_lyd=?,compare_price_lyd=?,status=?,in_stock=?,description_ar=?,source_url=?,updated_at=datetime('now') WHERE id=?`)
    .bind(String(f.title_ar), Number(f.category_id), parseFloat(String(f.source_price_cny)), f.weight_g ? Number(f.weight_g) : null, Number(f.min_qty) || 1, price, f.compare_price_lyd ? parseFloat(String(f.compare_price_lyd)) : null, String(f.status), Number(f.in_stock), String(f.description_ar ?? ''), f.source_url ? String(f.source_url) : null, id).run();
  return c.redirect(`/admin/products/${id}?ok=1`);
});
admin.post('/products/:id/reprice', async (c) => {
  const db = c.env.DB; const id = Number(c.req.param('id'));
  const p = await db.prepare('SELECT source_price_cny,weight_g,category_id FROM products WHERE id=?').bind(id).first<any>();
  const s = await loadSettings(db); const cats = await getCategories(db); const cat = cats.find(x => x.id === p.category_id);
  const pr = computePrice(s, p.source_price_cny, p.weight_g ?? estWeightG(cat?.est_weight_g, p.source_price_cny), cat?.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
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
      <p style="font-size:13px;color:#666">«في الرئيسية» يتحكم بظهور منتجات القسم على الصفحة الأولى. أزِل العلامة عن الأقسام الخاصة (ملابس النوم والداخلية) فتبقى في قائمة الأقسام يدخلها الزبون بنفسه ولا تظهر صورها لكل زائر.</p>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الأيقونة</th><th>الاسم</th><th>slug</th><th>الوزن التقديري (غ)</th><th>ربح خاص %</th><th>في الرئيسية</th><th>منتجات</th><th></th></tr>
        {cats.map(ct => <tr><form method="post" action={`/admin/categories/${ct.id}`}><td><input type="text" name="icon" value={ct.icon ?? ''} style="width:50px" /></td><td><input type="text" name="name_ar" value={ct.name_ar} /></td><td class="mono">{ct.slug}</td><td><input type="number" name="est_weight_g" value={ct.est_weight_g} style="width:90px" /></td><td><input type="number" name="markup_percent" value={ct.markup_percent ?? ''} placeholder="افتراضي" style="width:90px" /></td><td style="text-align:center"><input type="checkbox" name="show_home" value="1" checked={ct.show_home !== 0} /></td><td>{cm[ct.id] ?? 0}</td><td><button class="btn sm ghost">حفظ</button></td></form></tr>)}
      </table></div>
      <form method="post" action="/admin/categories/new" class="card-box inline" style="margin-top:14px"><input type="text" name="icon" placeholder="🎀" style="width:60px" /><input type="text" name="name_ar" placeholder="اسم القسم" required /><input type="text" name="slug" placeholder="slug-en" required /><input type="number" name="est_weight_g" value="300" style="width:90px" /><button class="btn sm">+ إضافة قسم</button></form>
    </>
  ));
});
admin.post('/categories/new', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('INSERT INTO categories(slug,name_ar,icon,est_weight_g,sort) VALUES(?,?,?,?,99)').bind(String(f.slug), String(f.name_ar), String(f.icon ?? ''), Number(f.est_weight_g) || 300).run(); return c.redirect('/admin/categories?ok=1'); });
admin.post('/categories/:id', async (c) => {
  const f = await c.req.parseBody(); const id = Number(c.req.param('id')); const showHome = f.show_home ? 1 : 0;
  await c.env.DB.prepare('UPDATE categories SET name_ar=?,icon=?,est_weight_g=?,markup_percent=?,show_home=? WHERE id=?')
    .bind(String(f.name_ar), String(f.icon ?? ''), Number(f.est_weight_g) || 300, f.markup_percent ? Number(f.markup_percent) : null, showHome, id).run();
  // قسم أُخرج من الرئيسية ⟵ منتجاته تختفي منها أيضًا، وإعادته تُظهر إلا ما مُنع بعنوانه
  if (!showHome) await c.env.DB.prepare('UPDATE products SET home_ok=0 WHERE category_id=?').bind(id).run();
  return c.redirect('/admin/categories?ok=1');
});

// ---------- فحص المخزون ----------
admin.get('/stock', async (c) => {
  const db = c.env.DB;
  const stale = await db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.source='1688' ORDER BY (p.sales*10+p.views) DESC, p.last_checked_at ASC LIMIT 100`).all<ProductRow>();
  const origin = new URL(c.req.url).origin;
  const bm = `javascript:(function(){var s=document.createElement('script');s.src='${origin}/importer.js?t='+Date.now();s.dataset.api='${origin}';s.dataset.token='${c.env.IMPORT_TOKEN}';s.dataset.mode='check';document.body.appendChild(s);})();`;
  return shell(c, 'stock', 'فحص المخزون والأسعار', (
    <>
      <div class="card-box"><h3>كيف يعمل الفحص</h3>
        <p style="font-size:14px">الخادم يرتب المنتجات حسب الأهمية (مبيعات ومشاهدات) وقِدم آخر فحص. افتح 1688 في المتصفح واضغط <a href={bm} class="btn sm brand" onclick="return false"><Ic n="refresh" s={18} /> فحص المخزون</a> من شريط المفضلة، فيمر السكربت على المنتجات واحدًا واحدًا كل 12 ثانية ويحدّث السعر والتوفر. إذا ظهر كابتشا، حلّه وسيُستأنف الفحص.</p>
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
  const exVol = parseFloat(s.default_volume_cm3 || '3000');
  const ex = computePrice(s, 25, 300, null, exVol);
  const exBig = computePrice(s, 25, 300, null, 30000);   // صندوق كبير خفيف: يُظهر أثر الحجم
  const exSea = computePrice(s, 25, 300, null, exVol, 'sea');   // نفس القطعة بالبحري
  const F = (k: string, l: string, step = '0.01') => <><label>{l}</label><input type="number" step={step} name={k} value={s[k]} /></>;
  const S = (k: string, l: string, opts: [string, string][]) => <><label>{l}</label><select name={k}>{opts.map(([v, t]) => <option value={v} selected={(s[k] || opts[0][0]) === v}>{t}</option>)}</select></>;
  return shell(c, 'pricing', 'التسعير وسعر الصرف', (
    <div class="two">
      <form method="post" class="card-box">
        <Flash msg={c.req.query('ok') ? 'تم الحفظ. أعد تسعير الكتالوج ليسري على المنتجات القديمة.' : undefined} />
        <h3>سعر الصرف (يحدّث يوميًا)</h3>
        {F('fx_cny_lyd', '1 يوان صيني = ؟ دينار')}{F('fx_usd_lyd', '1 دولار = ؟ دينار')}
        <h3 style="margin-top:16px">قواعد التسعير</h3>
        {F('markup_percent', 'نسبة الربح الافتراضية %', '1')}{F('safety_percent', 'هامش أمان لتغير السعر %', '1')}{F('ship_usd_per_kg', 'الشحن الجوي للكيلو ($)')}{F('customs_percent', 'الجمارك %', '1')}{F('domestic_cn_ship_cny', 'شحن داخل الصين لمخزن الشريك (¥)')}{F('retail_max_moq', 'أقل طلب يُقبل للتجزئة (فوقه يدخل مخفيًا)', '1')}
        <h3 style="margin-top:16px">الشحن من الصين — ما تدفعه لشركة الشحن</h3>
        <p style="font-size:13px;color:#666">شركات الشحن تحاسب بالوزن الحقيقي أو بالحجم، أيهما أكبر. ضع هنا سعر شاهين للمتر المكعب وسعر الكيلو، والنظام يوزّع التكلفة على كل قطعة حسب حجمها ووزنها، ويجمع لك المستحق لهم في صفحة التقارير.</p>
        {S('ship_mode', 'طريقة حساب الشحن', [['max', 'الأعلى بين الوزن والحجم (الأدق)'], ['kg', 'بالوزن فقط'], ['cbm', 'بالحجم فقط']])}
        {F('ship_usd_per_cbm', 'سعر المتر المكعب من شركة الشحن ($)')}
        {F('volumetric_divisor', 'مُقسِّم الوزن الحجمي (6000 جوي، 5000 أسرع)', '100')}
        {F('default_volume_cm3', 'حجم افتراضي للقطعة إذا لم يذكره المورد (سم³)', '100')}
        <h3 style="margin-top:16px">الشحن البحري — أرخص وأبطأ</h3>
        <p style="font-size:13px;color:#666">الزبون يختار بين الجوي والبحري في السلة، وسعر كل منتج يتغيّر تلقائيًا. اضبط «مخفي» لإخفاء الخيار.</p>
        {S('sea_enabled', 'إظهار خيار الشحن البحري', [['1', 'مفعّل'], ['0', 'مخفي']])}
        {F('ship_usd_per_kg_sea', 'سعر الكيلو بحرًا ($)')}
        {F('ship_usd_per_cbm_sea', 'سعر المتر المكعب بحرًا ($)')}
        <label>مدة الوصول جوًّا</label><input type="text" name="air_days" value={s.air_days ?? '12 — 18 يومًا'} />
        <label>مدة الوصول بحرًا</label><input type="text" name="sea_days" value={s.sea_days ?? '30 — 45 يومًا'} />
        <h3 style="margin-top:16px">التوصيل داخل ليبيا</h3>
        {F('delivery_lyd', 'رسوم التوصيل (د.ل)')}{F('free_ship_over_lyd', 'توصيل مجاني فوق (د.ل)')}
        <label>أجرة التوصيل لكل مدينة (اختياري)</label>
        <textarea name="delivery_city_rates" rows={5} dir="rtl" style="width:100%;font-family:inherit">{s.delivery_city_rates ?? ''}</textarea>
        <p style="font-size:12px;color:#666;margin:4px 0 0">سطر لكل مدينة بالصيغة <span class="mono">المدينة = المبلغ</span>. المدينة غير المذكورة تأخذ الرسوم العامة أعلاه. التوصيل إلى سبها أو الكفرة يكلّف أضعاف طرابلس، فاضبط الفرق هنا.<br />مثال:<br /><span class="mono" dir="rtl">طرابلس = 15</span><br /><span class="mono" dir="rtl">سبها = 45</span></p>
        <h3 style="margin-top:16px" id="contact">بيانات التواصل الظاهرة للزبون</h3>
        <p style="font-size:13px;color:#666">تظهر في الرئيسية وصفحة خدمة الزبائن وصفحة الطلب وأيقونات التذييل. ما يبقى فارغًا لا يظهر للزبون (الأيقونة تفتح صفحة خدمة الزبائن بدله).</p>
        {(() => { const wa = realWa(s.whatsapp_number); return !wa && <p class="wa-missing" style="font-size:12.5px;margin:0 0 6px;padding:6px 10px;border-radius:8px;background:#fdecec;border:1px solid #f0b4b4;color:#8c2121">لا رقم واتساب حقيقي مضبوط{s.whatsapp_number ? ` (المحفوظ «${s.whatsapp_number}» رقم تجريبي)` : ''} — زبون الدفع بالتحويل يُوجَّه للدردشة بدله.</p>; })()}
        <label>رقم واتساب (بالمفتاح الدولي، مثل 218912345678)</label><input type="text" name="whatsapp_number" dir="ltr" inputmode="tel" value={realWa(s.whatsapp_number)} placeholder="2189XXXXXXXX" />
        <label>صفحة فيسبوك</label><input type="url" name="facebook_url" dir="ltr" value={s.facebook_url ?? ''} placeholder="https://facebook.com/..." />
        <label>إنستغرام</label><input type="url" name="instagram_url" dir="ltr" value={s.instagram_url ?? ''} placeholder="https://instagram.com/..." />
        <label>تيك توك</label><input type="url" name="tiktok_url" dir="ltr" value={s.tiktok_url ?? ''} placeholder="https://tiktok.com/@..." />
        <h3 style="margin-top:16px" id="meta">إعلانات فيسبوك وإنستغرام (ميتا)</h3>
        <p style="font-size:13px;color:#666">البكسل يعدّ من شاهد المنتج وأضافه للسلة وبدأ الدفع واشترى، فتعرف ميتا لمن تعرض الإعلان وتقيس ما يربحه كل دينار. يُحقن في صفحات المتجر وحدها ولا يظهر في اللوحة.</p>
        <label>معرّف بكسل ميتا (Pixel ID — أرقام من مدير الأحداث)</label><input type="text" name="meta_pixel_id" dir="ltr" inputmode="numeric" value={validPixel(s.meta_pixel_id)} placeholder="123456789012345" />
        <label>رمز إثبات ملكية النطاق (من إعدادات الأعمال ← النطاقات — الصق الوسم كاملًا أو الرمز وحده)</label><input type="text" name="meta_domain_verify" dir="ltr" value={validVerify(s.meta_domain_verify)} placeholder="abc123xyz…" />
        <p class="feed-url" style="font-size:12.5px;margin:6px 0 0">كتالوج المنتجات لمدير التجارة (مصدر بيانات مجدول يوميًا): <span class="mono" dir="ltr">{new URL(c.req.url).origin}/feeds/meta.csv</span></p>
        <button class="btn" style="margin-top:12px">حفظ</button>
      </form>
      <div>
        <div class="card-box"><h3>مثال: منتج بـ 25 ¥ ووزن 300 غ</h3><div class="breakdown">
          <div><span>البضاعة</span><span>{fmt(ex.goods_lyd)}</span></div><div><span>شحن داخلي</span><span>{fmt(ex.domestic_ship_lyd)}</span></div><div><span>شحن دولي</span><span>{fmt(ex.intl_ship_lyd)}</span></div><div><span>جمارك</span><span>{fmt(ex.customs_lyd)}</span></div><div><span>أمان</span><span>{fmt(ex.safety_lyd)}</span></div><div><span>ربح</span><span>{fmt(ex.markup_lyd)}</span></div><div class="t"><span>سعر البيع</span><span>{fmt(ex.total_lyd)}</span></div>
          <div><span>تكلفتنا الحقيقية</span><span>{fmt(ex.cost_lyd)}</span></div>
          <div><span>ربحنا من القطعة</span><span><b style="color:#0b6b66">{fmt(ex.profit_lyd)}</b></span></div>
          <div><span>الوزن المحاسبي</span><span>{ex.chargeable_kg} كغ (بالـ{ex.ship_basis})</span></div>
        </div></div>
        <div class="card-box"><h3>نفس المنتج بالشحن البحري</h3>
          <p style="font-size:13px;color:#666">الفرق الذي يراه الزبون بين الطريقتين على القطعة الواحدة.</p>
          <div class="breakdown">
            <div><span>شحن دولي (بحري)</span><span>{fmt(exSea.intl_ship_lyd)}</span></div>
            <div><span>مقابل الجوي</span><span>{fmt(ex.intl_ship_lyd)}</span></div>
            <div class="t"><span>سعر البيع بحرًا</span><span>{fmt(exSea.total_lyd)}</span></div>
            <div><span>توفير الزبون</span><span><b style="color:#0b8a4b">{fmt(ex.total_lyd - exSea.total_lyd)}</b></span></div>
            <div><span>ربحنا من القطعة بحرًا</span><span><b style="color:#0b6b66">{fmt(exSea.profit_lyd)}</b></span></div>
          </div>
        </div>
        <div class="card-box"><h3>نفس المنتج في صندوق كبير (30,000 سم³)</h3>
          <p style="font-size:13px;color:#666">يوضح لماذا يجب إدخال سعر المتر المكعب: البضاعة نفسها والوزن نفسه، لكن الحجم يرفع أجرة الشحن.</p>
          <div class="breakdown">
            <div><span>شحن دولي</span><span>{fmt(exBig.intl_ship_lyd)}</span></div>
            <div><span>الوزن المحاسبي</span><span>{exBig.chargeable_kg} كغ (بالـ{exBig.ship_basis})</span></div>
            <div class="t"><span>سعر البيع</span><span>{fmt(exBig.total_lyd)}</span></div>
            <div><span>ربحنا من القطعة</span><span><b style="color:#0b6b66">{fmt(exBig.profit_lyd)}</b></span></div>
          </div>
        </div>
        <form method="post" action="/admin/pricing/backfill-costs" class="card-box"><h3>حساب تكلفة الطلبات القديمة</h3><p style="font-size:13px;color:#666">الطلبات التي تمت قبل تفعيل حساب الأرباح ليس لها تكلفة محفوظة فتظهر بربح 100%. هذا الزر يحسبها من بيانات منتجاتها.</p><button class="btn ghost">احسب التكلفة الناقصة</button></form>
        <form method="post" action="/admin/pricing/reprice-all" class="card-box"><h3>إعادة تسعير الكتالوج كله</h3><p style="font-size:13px;color:#666">يعيد حساب سعر كل المنتجات بالقواعد الحالية (المنتجات ذات السعر اليدوي تُعاد أيضًا).</p><button class="btn warn">إعادة التسعير الآن</button></form>
      </div>
    </div>
  ));
});
admin.post('/pricing', async (c) => {
  const f = await c.req.parseBody();
  const keys = ['fx_cny_lyd', 'fx_usd_lyd', 'markup_percent', 'safety_percent', 'ship_usd_per_kg', 'customs_percent', 'domestic_cn_ship_cny', 'delivery_lyd', 'free_ship_over_lyd', 'ship_mode', 'ship_usd_per_cbm', 'volumetric_divisor', 'default_volume_cm3', 'sea_enabled', 'ship_usd_per_kg_sea', 'ship_usd_per_cbm_sea', 'air_days', 'sea_days', 'delivery_city_rates', 'retail_max_moq', 'whatsapp_number', 'facebook_url', 'instagram_url', 'tiktok_url', 'meta_pixel_id', 'meta_domain_verify'];
  await c.env.DB.batch(keys.filter(k => f[k] !== undefined).map(k => c.env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, k === 'meta_pixel_id' ? validPixel(latinDigits(String(f[k]))) : k === 'meta_domain_verify' ? validVerify(String(f[k])) : latinDigits(String(f[k])))));
  bustMetaCache();
  return c.redirect('/admin/pricing?ok=1');
});
// الطلبات التي سبقت تفعيل لقطة التكلفة تظهر بربح 100% لأن تكلفتها فارغة — نحسبها من بيانات المنتج
admin.post('/pricing/backfill-costs', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db); const cats = await getCategories(db);
  const { results } = await db.prepare(
    `SELECT oi.id,oi.product_id,p.source_price_cny,p.weight_g,p.volume_cm3,p.category_id,p.min_qty
     FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.unit_cost_lyd IS NULL`,
  ).all<any>();
  const stmts = results.map(r => {
    const cat = cats.find(x => x.id === r.category_id);
    const br = computePrice(s, r.source_price_cny ?? 0, r.weight_g ?? estWeightG(cat?.est_weight_g, r.source_price_cny ?? 0), cat?.markup_percent, r.volume_cm3, 'air', r.min_qty ?? 1);
    return db.prepare('UPDATE order_items SET unit_cost_lyd=?,unit_ship_lyd=?,unit_goods_lyd=? WHERE id=?')
      .bind(br.cost_lyd, br.intl_ship_lyd + br.domestic_ship_lyd, br.goods_lyd, r.id);
  });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return c.redirect(`/admin/reports?filled=${results.length}`);
});
// إعادة تسعير الرف كله بالإعدادات الحالية — تُستدعى من زر التسعير ومن تفعيل «شريك التسعير»
async function repriceAll(db: D1Database) {
  const s = await loadSettings(db); const cats = await getCategories(db);
  const { results } = await db.prepare('SELECT id,source_price_cny,weight_g,volume_cm3,category_id,min_qty FROM products').all<any>();
  const stmts = results.map(p => {
    const cat = cats.find(x => x.id === p.category_id);
    const w = p.weight_g ?? estWeightG(cat?.est_weight_g, p.source_price_cny);
    const air = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
    const sea = computePrice(s, p.source_price_cny, w, cat?.markup_percent, p.volume_cm3, 'sea', p.min_qty ?? 1);
    return db.prepare('UPDATE products SET price_lyd=?,price_sea_lyd=? WHERE id=?').bind(air.total_lyd, sea.total_lyd, p.id);
  });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  await db.prepare("DELETE FROM settings WHERE key='reprice_needed'").run();
  return results.length;
}
admin.post('/pricing/reprice-all', async (c) => {
  await repriceAll(c.env.DB);
  return c.redirect('/admin/pricing?ok=1');
});

// ---------- الشركاء ----------
// عيّنة المعاينة: منتجات نشطة بأسعار متفاوتة، تُسعَّر مرتين (الحالي وبأسعار الشريك) قبل أي تغيير على الرف
async function previewSample(db: D1Database) {
  const n = (await db.prepare("SELECT COUNT(*) n FROM products WHERE status='active'").first<{ n: number }>())?.n ?? 0;
  const sel = `SELECT p.id,p.slug,p.title_ar,p.source_price_cny,p.weight_g,p.volume_cm3,p.min_qty,p.price_lyd,c.est_weight_g,c.markup_percent FROM products p LEFT JOIN categories c ON c.id=p.category_id
     WHERE p.status='active' ORDER BY p.price_lyd LIMIT 1 OFFSET ?`;
  // عشر نقاط موزّعة على سلّم الأسعار من الأرخص إلى الأغلى
  const res = await db.batch([0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 0.97].map(q => db.prepare(sel).bind(Math.floor(n * q))));
  return res.map(r => (r.results as any[])[0]).filter(Boolean);
}
admin.get('/partners', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db); const pp = pricingPartnerId(s);
  const rows = await db.prepare(`SELECT p.*,(SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('paid','purchasing','purchased','at_warehouse')) AS active_orders,(SELECT COUNT(*) FROM users u WHERE u.partner_id=p.id) AS staff,
      (SELECT status FROM partner_dispatch d WHERE d.partner_id=p.id ORDER BY d.id DESC LIMIT 1) AS last_dispatch FROM partners p ORDER BY p.id`).all<any>();
  const log = await db.prepare('SELECT d.id,d.status,d.http_status,d.attempts,d.error,d.created_at,d.sent_at,o.code,p.name FROM partner_dispatch d JOIN orders o ON o.id=d.order_id JOIN partners p ON p.id=d.partner_id ORDER BY d.id DESC LIMIT 30').all<any>();
  const dom = (await db.prepare(`SELECT p.id,p.name,p.courier_name,p.courier_track_url,p.courier_api_url,
      (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status='ready' AND (o.courier_status IS NULL OR o.courier_status='failed')) waiting,
      (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status='ready' AND o.courier_status='with_courier') withc,
      (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status='ready' AND o.courier_status='failed') failed,
      (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.courier_status='delivered' AND o.updated_at >= datetime('now','-7 days')) done7,
      (SELECT COUNT(*) FROM partner_zones z WHERE z.partner_id=p.id) zones, (SELECT COUNT(DISTINCT city) FROM partner_zones z WHERE z.partner_id=p.id) cities
     FROM partners p ORDER BY p.id`).all<any>()).results;
  const withC = (await db.prepare("SELECT code,courier,courier_ref,courier_at,courier_status,courier_note,ship_city,ship_zone FROM orders WHERE status='ready' AND courier_status IN ('with_courier','failed') ORDER BY courier_at LIMIT 100").all<any>()).results;
  const zonesAll = (await db.prepare('SELECT z.*,p.name pname FROM partner_zones z JOIN partners p ON p.id=z.partner_id ORDER BY p.id,z.city,z.km_from LIMIT 300').all<any>()).results;
  const bal = await Promise.all(rows.results.map(async (p: any) => ({ p, b: await partnerBalance(db, p.id), log: (await db.prepare('SELECT kind,amount_lyd,note,created_at FROM partner_ledger WHERE partner_id=? ORDER BY id DESC LIMIT 5').bind(p.id).all<any>()).results })));
  const med = await db.prepare("SELECT SUM(r2_key IS NOT NULL) r2,SUM(data IS NOT NULL) d1,SUM(url IS NOT NULL) ext,COALESCE(SUM(bytes),0) b FROM order_media").first<any>();
  // المعاينة: ?preview=ID يحسب الأسعار كما لو اختير هذا الشريك، دون حفظ شيء
  const pv = Number(c.req.query('preview') ?? 0) || 0;
  const pvp = pv ? rows.results.find(p => p.id === pv) : null;
  let sample: any[] = [];
  if (pvp) {
    const s2: Record<string, string> = { ...s, pricing_partner_id: String(pvp.id) };
    for (const k of RATE_KEYS) s2[PP_KEY[k]] = String(pvp[k] ?? 0);
    sample = (await previewSample(db)).map(p => {
      const w = p.weight_g ?? estWeightG(p.est_weight_g, p.source_price_cny);
      const now = computePrice(s, p.source_price_cny, w, p.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
      const nw = computePrice(s2, p.source_price_cny, w, p.markup_percent, p.volume_cm3, 'air', p.min_qty ?? 1);
      return { ...p, w, now, nw };
    });
  }
  const DS: Record<string, string> = { pending: 'بانتظار إعادة المحاولة', sending: 'يُرسل', sent: 'وصل ✓', failed: 'فشل نهائيًا', test: 'تجربة' };
  return shell(c, 'partners', 'شركاء الشحن والشراء', (
    <>
      <Flash msg={c.req.query('ok') ? (c.req.query('repriced') ? `تم ✓ — أُعيد تسعير ${c.req.query('repriced')} منتجًا` : 'تم الحفظ ✓') : undefined} /><Flash type="err" msg={c.req.query('err') || undefined} />
      {s.reprice_needed === '1' && <div class="flash err">شريك التسعير غيّر أسعاره — أسعار الرف ما زالت القديمة. <form method="post" action="/admin/partners/reprice" class="inline" style="display:inline"><button class="btn sm warn">أعد تسعير الرف الآن</button></form></div>}
      <p style="font-size:13px;color:#666">يمكن إضافة أكثر من شريك. الطلبات الجديدة تُوزَّع حسب نسبة التوزيع، ويمكن تغيير الشريك لأي طلب يدويًا. كل طلب يُدفع يُرسل فورًا إلى API الشريك إن فعّله من لوحته («🔌 ربط API»).</p>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الشريك</th><th>عنوان المخزن</th><th>التواصل</th><th>$/كغ</th><th>نسبة التوزيع</th><th>نشط</th><th>طلبات جارية</th><th>موظفون</th><th></th></tr>
        {rows.results.map(p => <tr><form method="post" action={`/admin/partners/${p.id}`}><td><input type="text" name="name" value={p.name} /></td><td><input type="text" name="warehouse_address" value={p.warehouse_address ?? ''} /></td><td><input type="text" name="contact" value={p.contact ?? ''} /></td><td><input type="number" step="0.1" name="ship_rate_per_kg" value={p.ship_rate_per_kg} style="width:70px" /></td><td><input type="number" name="share_percent" value={p.share_percent} style="width:70px" /></td><td><select name="active"><option value="1" selected={!!p.active}>نعم</option><option value="0" selected={!p.active}>لا</option></select></td><td>{p.active_orders}</td><td>{p.staff}</td><td><button class="btn sm ghost">حفظ</button></td></form></tr>)}
      </table></div>
      <form method="post" action="/admin/partners/new" class="card-box inline" style="margin-top:14px"><input type="text" name="name" placeholder="اسم الشريك الجديد" required /><input type="text" name="warehouse_address" placeholder="عنوان المخزن في الصين" /><input type="text" name="contact" placeholder="واتساب/وي شات" /><button class="btn sm">+ إضافة شريك</button></form>

      <div class="card-box pp-rates"><h3>أسعار الشركاء وربطهم</h3>
        <p style="font-size:13px;color:#666;margin-top:0">كل شريك يضع أسعاره بنفسه من لوحته («💰 أسعاري»). ما يدفعه الزبون = البضاعة + <b>{s.partner_goods_margin_pct ?? '35'}%</b> ربحنا عليها (لا يراه الشريك) + كل بند بسعر الشريك + <b>{s.partner_fee_margin_lyd ?? '1'} د.ل</b> على كل بند + الجمارك.</p>
        <div class="tbl-wrap"><table class="tbl"><tr><th>الشريك</th>{RATE_KEYS.map(k => <th>{RATE_AR[k].ar}<br /><small>{RATE_AR[k].unit}</small></th>)}<th>API</th><th></th></tr>
          {rows.results.map(p => <tr class={p.id === pp ? 'pp-on' : ''}><td><b>{p.name}</b>{p.id === pp && <><br /><span class="status green">شريك التسعير</span></>}<br /><small>{p.rates_updated_at ? `عدّلها ${timeAgo(p.rates_updated_at)}` : 'لم يضع أسعاره بعد'}</small></td>
            {RATE_KEYS.map(k => <td>{p[k] ?? 0}</td>)}
            <td>{p.api_enabled && p.api_url ? <span class="status green">مفعّل</span> : p.api_url ? <span class="status gray">موقوف</span> : <span class="status gray">لا رابط</span>}{p.last_dispatch && <><br /><small>آخر إرسال: {DS[p.last_dispatch] ?? p.last_dispatch}</small></>}</td>
            <td><a class="btn sm ghost" href={`/admin/partners?preview=${p.id}#preview`}>معاينة الأسعار</a> <a class="btn sm ghost" href={`/partner?partner=${p.id}`} target="_blank">لوحته</a></td></tr>)}
        </table></div>
        <form method="post" action="/admin/partners/margins" class="inline" style="margin-top:10px">
          <label>ربحنا على البضاعة %</label><input type="number" step="0.1" min="0" name="partner_goods_margin_pct" value={s.partner_goods_margin_pct ?? '35'} style="width:80px" />
          <label>رسم المنصة على كل بند (د.ل)</label><input type="number" step="0.1" min="0" name="partner_fee_margin_lyd" value={s.partner_fee_margin_lyd ?? '1'} style="width:80px" />
          <button class="btn sm dark">حفظ</button>
        </form>
        <p style="font-size:13px;margin-bottom:0">تسعير الرف الآن: {pp ? <b>بأسعار «{rows.results.find(p => p.id === pp)?.name ?? pp}»</b> : <b>التسعير العام (صفحة التسعير)</b>}.
          {pp > 0 && <form method="post" action="/admin/partners/pricing" class="inline" style="display:inline"><input type="hidden" name="partner_id" value="0" /><button class="btn sm ghost" onclick="return confirm('العودة إلى التسعير العام وإعادة تسعير الرف كله؟')">العودة للتسعير العام</button></form>}</p>
      </div>

      {pvp && <div class="card-box" id="preview"><h3>معاينة: الرف بأسعار «{pvp.name}» (الشحن الجوي)</h3>
        {!(pvp.fee_air_kg_lyd > 0) && <div class="flash err">هذا الشريك لم يضع سعر الشحن الجوي للكيلو بعد — لا يمكن التسعير به حتى يضعه.</div>}
        <div class="tbl-wrap"><table class="tbl pp-preview"><tr><th>المنتج</th><th>الوزن</th><th>البضاعة</th><th>ربحنا {s.partner_goods_margin_pct ?? '35'}%</th><th>خدمات الشريك + رسومنا</th><th>الجمارك</th><th>السعر الآن</th><th>بأسعار الشريك</th><th>الفرق</th></tr>
          {sample.map(p => { const d = p.nw.total_lyd - p.now.total_lyd; return <tr>
            <td><a href={`/p/${p.slug}`} target="_blank">{String(p.title_ar).slice(0, 40)}</a></td><td>{p.w} غ</td><td>{fmt(p.nw.goods_lyd)}</td><td>{fmt(p.nw.markup_lyd)}</td>
            <td>{fmt(Math.round((p.nw.safety_lyd + p.nw.domestic_ship_lyd + p.nw.intl_ship_lyd) * 100) / 100)}</td><td>{fmt(p.nw.customs_lyd)}</td>
            <td>{fmt(p.now.total_lyd)}</td><td><b>{fmt(p.nw.total_lyd)}</b></td><td style={`color:${d > 0 ? '#8c2121' : '#1a7f37'}`}>{d > 0 ? '+' : ''}{fmt(d)}</td></tr>; })}
        </table></div>
        {pvp.id !== pp && pvp.fee_air_kg_lyd > 0 && <form method="post" action="/admin/partners/pricing" style="margin-top:10px"><input type="hidden" name="partner_id" value={pvp.id} />
          <button class="btn dark" onclick="return confirm('تسعير الرف كله بأسعار هذا الشريك الآن؟')">اعتمد أسعار «{pvp.name}» للرف وأعد التسعير</button></form>}
      </div>}

      <div class="card-box" id="domestic"><h3><Ic n="truck" s={18} /> التوصيل داخل ليبيا</h3>
        <div class="tbl-wrap"><table class="tbl"><tr><th>الشريك</th><th>شركة التوصيل</th><th>جاهزة لم تُسلَّم</th><th>معها الآن</th><th>تعذّر توصيلها</th><th>سُلِّمت عبرها (7 أيام)</th><th>مناطق التسعير</th></tr>
          {dom.map((d: any) => <tr><td>{d.name}</td><td>{d.courier_name}{d.courier_track_url ? ' · تتبّع ✓' : ''}{d.courier_api_url ? ' · API ✓' : ''}</td><td>{d.waiting}</td><td>{d.withc}</td><td class={d.failed ? 'pd-red' : ''}>{d.failed}</td><td>{d.done7}</td><td>{d.zones ? `${d.zones} منطقة في ${d.cities} مدينة` : '—'}</td></tr>)}
        </table></div>
        {withC.length > 0 && <details style="margin-top:8px"><summary>الطرود مع شركات التوصيل الآن ({withC.length})</summary>
          <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الشركة</th><th>رقم الشحنة</th><th>منذ</th><th>المدينة والمنطقة</th><th>الحالة</th></tr>
            {withC.map((o: any) => <tr><td><a href={`/admin/orders/${o.code}`}>{o.code}</a></td><td>{o.courier}</td><td dir="ltr">{o.courier_ref}</td><td>{timeAgo(o.courier_at)}</td><td>{o.ship_city}{o.ship_zone ? ` — ${o.ship_zone}` : ''}</td><td class={o.courier_status === 'failed' ? 'pd-red' : ''}>{o.courier_status === 'failed' ? `تعذّر: ${o.courier_note ?? ''}` : 'في الطريق'}</td></tr>)}
          </table></div></details>}
        {zonesAll.length > 0 && <details style="margin-top:8px"><summary>أسعار مناطق التوصيل كما وضعها الشركاء ({zonesAll.length})</summary>
          <div class="tbl-wrap"><table class="tbl"><tr><th>الشريك</th><th>المدينة</th><th>المنطقة</th><th>كم</th><th>سعره</th><th>على الزبون</th></tr>
            {zonesAll.map((z: any) => <tr><td>{z.pname}</td><td>{z.city}</td><td>{z.zone}</td><td>{z.km_from}–{z.km_to}</td><td>{fmt(z.price_lyd)}</td><td>{fmt(Math.round((z.price_lyd + parseFloat(s.partner_fee_margin_lyd ?? '1')) * 100) / 100)}</td></tr>)}
          </table></div></details>}
      </div>

      <div class="card-box" id="ledger"><h3><Ic n="coin" s={18} /> الحساب مع كل شريك</h3>
        <p style="font-size:13px;color:#666;margin-top:0">المستحقات من لقطة أسعار الشريك يوم دفع كل طلب. سجّل هنا ما تدفعه للشريك وما يسلّمه لك من تحصيل «الدفع عند الاستلام» — يظهر الرصيد نفسه في «لوحتي» عنده.</p>
        {bal.map(({ p, b, log }) => <div class="ledger-row">
          <b>{p.name}</b>
          <div class="ledger-nums"><span>مستحقاته <b>{fmt(b.dues)}</b></span><span>دفعنا له <b>{fmt(b.paid)}</b></span><span class="lg-to">له علينا <b>{fmt(b.toPartner)}</b></span><span>حصّل عند الاستلام <b>{fmt(b.cod)}</b></span><span>سلّمنا <b>{fmt(b.got)}</b></span><span class="lg-us">لنا عليه <b>{fmt(b.toUs)}</b></span><span class="lg-net">الصافي: <b>{b.net >= 0 ? `له ${fmt(b.net)}` : `لنا ${fmt(-b.net)}`}</b></span></div>
          <form method="post" action={`/admin/partners/${p.id}/ledger`} class="inline" style="gap:6px"><select name="kind"><option value="payout">دفعنا له</option><option value="collect">سلّمنا تحصيلًا</option></select><input type="number" step="0.01" min="0.01" name="amount" placeholder="المبلغ د.ل" style="width:120px" required /><input type="text" name="note" placeholder="ملاحظة (رقم الحوالة…)" /><button class="btn sm dark">تسجيل</button></form>
          {log.length > 0 && <small class="lg-log">{log.map((l: any) => `${l.kind === 'payout' ? 'دفعنا' : 'سلّمنا'} ${fmt(l.amount_lyd)}${l.note ? ` (${l.note})` : ''} · ${timeAgo(l.created_at)}`).join(' — ')}</small>}
        </div>)}
      </div>

      <div class="card-box media-store"><h3>صور مراحل الطلبات</h3>
        <p style="font-size:13px;margin:0">في R2 (<code>hudhude-media</code>): <b class="m-r2">{med?.r2 ?? 0}</b> · في قاعدة البيانات: <b class="m-d1">{med?.d1 ?? 0}</b> · روابط خارجية: {med?.ext ?? 0} · الحجم {Math.round((med?.b ?? 0) / 1024)} ك.ب
          {!c.env.MEDIA && <b style="color:#8c2121"> — R2 غير مربوط بالموقع: الصور تُحفظ في القاعدة.</b>}</p>
        {(med?.d1 ?? 0) > 0 && c.env.MEDIA && <form method="post" action="/admin/partners/media-to-r2" style="margin-top:8px"><button class="btn sm ghost">انقل {med.d1} صورة من القاعدة إلى R2 الآن</button> <small>(الكرون ينقلها أيضًا 20 كل ساعة)</small></form>}
      </div>

      <div class="card-box"><h3>سجل إرسال الطلبات إلى الشركاء</h3>
        {log.results.length === 0 ? <p style="font-size:13px;color:#666">لم يُرسل أي طلب بعد — يبدأ حين يفعّل شريك ربط API من لوحته.</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الشريك</th><th>الحالة</th><th>HTTP</th><th>المحاولات</th><th>الخطأ</th><th>الوقت</th><th></th></tr>
            {log.results.map(d => <tr><td><a href={`/admin/orders/${d.code}`}>{d.code}</a></td><td>{d.name}</td><td>{DS[d.status] ?? d.status}</td><td>{d.http_status ?? '—'}</td><td>{d.attempts}</td><td dir="ltr" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{d.error ?? ''}</td><td>{timeAgo(d.sent_at ?? d.created_at)}</td>
              <td>{(d.status === 'pending' || d.status === 'failed') && <form method="post" action={`/admin/partners/dispatch/${d.id}/retry`}><button class="btn sm ghost">أعد الإرسال</button></form>}</td></tr>)}
          </table></div>}
      </div>
    </>
  ));
});
admin.post('/partners/new', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('INSERT INTO partners(name,warehouse_address,contact,share_percent) VALUES(?,?,?,0)').bind(String(f.name), String(f.warehouse_address ?? ''), String(f.contact ?? '')).run(); return c.redirect('/admin/partners?ok=1'); });
const setKey = (db: D1Database, k: string, v: string) => db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").bind(k, v);
admin.post('/partners/margins', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const n = (v: any, max: number) => String(Math.max(0, Math.min(max, parseFloat(latinDigits(String(v ?? ''))) || 0)));
  await db.batch([setKey(db, 'partner_goods_margin_pct', n(f.partner_goods_margin_pct, 500)), setKey(db, 'partner_fee_margin_lyd', n(f.partner_fee_margin_lyd, 1000))]);
  await logActivity(db, c.get('user')!.id, 'partners.margins', String(f.partner_goods_margin_pct), String(f.partner_fee_margin_lyd));
  // الهوامش تدخل السعر المخزَّن: إن كان شريك تسعير مختارًا يُعاد تسعير الرف فورًا
  if (pricingPartnerId(await loadSettings(db))) return c.redirect(`/admin/partners?ok=1&repriced=${await repriceAll(db)}`);
  return c.redirect('/admin/partners?ok=1');
});
// اختيار شريك التسعير (0 = التسعير العام): تُنسخ أسعاره للإعدادات ثم يُعاد تسعير الرف كله
admin.post('/partners/pricing', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(f.partner_id) || 0;
  if (id) {
    const p = await db.prepare('SELECT fee_air_kg_lyd FROM partners WHERE id=?').bind(id).first<any>();
    if (!p || !(p.fee_air_kg_lyd > 0)) return c.redirect('/admin/partners?err=' + encodeURIComponent('هذا الشريك لم يضع سعر الشحن الجوي بعد'));
  }
  await setKey(db, 'pricing_partner_id', String(id)).run();
  if (id) await syncPricingPartner(db);
  await logActivity(db, c.get('user')!.id, 'partners.pricing', String(id), '');
  return c.redirect(`/admin/partners?ok=1&repriced=${await repriceAll(db)}`);
});
admin.post('/partners/:id/ledger', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id'));
  const amt = Math.round((parseFloat(latinDigits(String(f.amount ?? ''))) || 0) * 100) / 100;
  const kind = f.kind === 'collect' ? 'collect' : 'payout';
  if (amt <= 0) return c.redirect('/admin/partners?err=' + encodeURIComponent('اكتب مبلغًا أكبر من صفر') + '#ledger');
  await db.prepare('INSERT INTO partner_ledger(partner_id,kind,amount_lyd,note,by_user_id) VALUES(?,?,?,?,?)').bind(id, kind, amt, f.note ? String(f.note).slice(0, 200) : null, c.get('user')!.id).run();
  await logActivity(db, c.get('user')!.id, 'partner.ledger', String(id), `${kind} ${amt}`);
  return c.redirect('/admin/partners?ok=1#ledger');
});
admin.post('/partners/media-to-r2', async (c) => {
  let n = 0, k = 0;
  do { k = await moveMediaToR2(c.env.DB, c.env.MEDIA, 20); n += k; } while (k === 20 && n < 400);
  return c.redirect(`/admin/partners?ok=1&moved=${n}`);
});
admin.post('/partners/reprice', async (c) => { const db = c.env.DB; await syncPricingPartner(db); return c.redirect(`/admin/partners?ok=1&repriced=${await repriceAll(db)}`); });
admin.post('/partners/dispatch/:id/retry', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE partner_dispatch SET status='pending',next_at=NULL WHERE id=? AND status IN ('pending','failed')").bind(id).run();
  const r = await attemptDispatch(c.env.DB, id, new URL(c.req.url).origin);
  return c.redirect(r.ok ? '/admin/partners?ok=1' : '/admin/partners?err=' + encodeURIComponent(`لم يصل: ${r.error ?? 'HTTP ' + r.http}`));
});
admin.post('/partners/:id', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare('UPDATE partners SET name=?,warehouse_address=?,contact=?,ship_rate_per_kg=?,share_percent=?,active=? WHERE id=?').bind(String(f.name), String(f.warehouse_address ?? ''), String(f.contact ?? ''), Number(f.ship_rate_per_kg) || 0, Number(f.share_percent) || 0, Number(f.active), Number(c.req.param('id'))).run(); return c.redirect('/admin/partners?ok=1'); });

// ---------- طلبات «اطلبي برابط» ----------
// روابط 1688 تجهز وحدها (الإضافة تستوردها ثم settleLinkRequests تُعلم الزبونة). الباقي هنا: الفريق يسعّره
// ويضيفه منتجًا (يدويًا أو بزر الاستيراد) ثم يربطه بالطلب، أو يعتذر بسبب تقرؤه الزبونة.
admin.get('/requests', requirePerm('catalog.manage', 'orders.manage'), async (c) => {
  const db = c.env.DB; await settleLinkRequests(db);
  const st = ['new', 'ready', 'rejected'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : 'new';
  const rows = await db.prepare(`SELECT r.*,u.name,u.phone,p.slug,p.title_ar,p.status pstatus,d.tries dtries,d.status dstatus FROM link_requests r JOIN users u ON u.id=r.user_id
     LEFT JOIN products p ON p.id=r.product_id LEFT JOIN discovered_offers d ON d.offer_id=r.offer_id
     WHERE r.status=? ORDER BY r.id ${st === 'new' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`).bind(st, PER, (pageOf(c) - 1) * PER).all<any>();
  const cnt = Object.fromEntries((await db.prepare('SELECT status,COUNT(*) n FROM link_requests GROUP BY status').all<any>()).results.map((r: any) => [r.status, r.n]));
  const s = await loadSettings(db);
  return shell(c, 'requests', 'طلبات بالرابط', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم ✓ — وصل الزبون إشعار' : undefined} /><Flash type="err" msg={c.req.query('err') || undefined} />
      <p style="font-size:13px;color:#555;margin:0 0 10px">روابط <b>1688</b> تجهز وحدها: تتصدّر طابور الاكتشاف فتستوردها الإضافة في دفعتها التالية، ولحظة وصول المنتج يصير الطلب «جاهزًا» ويصل الزبون إشعار بصفحته.
        {(parseInt(s.discover_per_batch ?? '') || 0) === 0 && <b style="color:#8c2121"> الاستيراد من طابور الاكتشاف موقوف (0 في كل دفعة) — فعّله من <a href="/admin/crawler#discover">بطاقة الاكتشاف</a> وإلا بقيت روابط 1688 تنتظر.</b>}
        {' '}غيرها (تاوباو، شي إن، أمازون…): أضف المنتج بسعره ثم اربطه هنا برقمه أو رابطه في المتجر.</p>
      <div class="tabs" style="display:flex;gap:6px;margin-bottom:10px">{(['new', 'ready', 'rejected'] as const).map(k =>
        <a class={`btn sm ${st === k ? 'brand' : 'ghost'}`} href={`/admin/requests?status=${k}`}>{LINK_STATUS[k][0]} ({cnt[k] ?? 0})</a>)}</div>
      {rows.results.length === 0 ? <p style="color:#888">لا طلبات هنا.</p> : (
        <div class="tbl-wrap"><table class="tbl lr-admin"><tr><th>#</th><th>الزبون</th><th>الرابط</th><th>ملاحظته</th><th>الحالة</th><th></th></tr>
          {rows.results.map((r: any) => <tr>
            <td>{r.id}<br /><small>{timeAgo(r.created_at)}</small></td>
            <td>{r.name}<br /><small dir="ltr">{r.phone}</small></td>
            <td><span class="status gray" style="font-size:10px">{LINK_SOURCES[r.source] ?? r.source}</span><br /><a class="src-link" href={r.url} target="_blank" rel="noopener noreferrer" dir="ltr">{String(r.url).slice(0, 60)}</a>
              {r.offer_id && r.status === 'new' && <><br /><small class="lr-q">{r.dstatus === 'failed' ? '⚠️ تعذّرت قراءة صفحته مرتين — استورده بزر الاستيراد' : `في طابور الإضافة (محاولات ${r.dtries ?? 0})`}</small></>}</td>
            <td><small>{r.note ?? '—'}</small></td>
            <td>{r.slug ? <a href={`/p/${r.slug}`} target="_blank">{String(r.title_ar ?? '').slice(0, 40)}</a> : '—'}{r.admin_note && <><br /><small>{r.admin_note}</small></>}</td>
            <td>{r.status === 'new' && <>
              <form method="post" action={`/admin/requests/${r.id}/link`} class="inline" style="gap:4px"><input type="text" name="ref" placeholder="رقم المنتج أو رابطه في المتجر" style="width:190px" dir="ltr" required /><button class="btn sm ok">ربط وإشعار</button></form>
              <form method="post" action={`/admin/requests/${r.id}/reject`} class="inline" style="gap:4px;margin-top:4px"><input type="text" name="why" placeholder="سبب الاعتذار للزبون" style="width:190px" required /><button class="btn sm ghost" style="color:#d3262b">اعتذار</button></form>
            </>}</td>
          </tr>)}
        </table></div>
      )}
      <Pager c={c} total={cnt[st] ?? 0} />
    </>
  ));
});
// ربط الطلب بمنتج على الرف: رقمه، أو رابطه (/p/slug)، أو رقم عرض 1688
admin.post('/requests/:id/link', requirePerm('catalog.manage', 'orders.manage'), async (c) => {
  const db = c.env.DB; const f = await c.req.parseBody(); const id = Number(c.req.param('id'));
  const ref = String(f.ref ?? '').trim();
  const slug = (ref.match(/\/p\/([^/?#\s]+)/) || [])[1];
  const p = slug ? await db.prepare('SELECT id,slug,status,title_ar FROM products WHERE slug=?').bind(slug).first<any>()
    : /^\d{9,15}$/.test(ref) ? await db.prepare("SELECT id,slug,status,title_ar FROM products WHERE source_offer_id=?").bind(ref).first<any>()
    : /^\d+$/.test(ref) ? await db.prepare('SELECT id,slug,status,title_ar FROM products WHERE id=?').bind(Number(ref)).first<any>() : null;
  if (!p) return c.redirect('/admin/requests?err=' + encodeURIComponent(`لم أجد منتجًا بـ«${ref.slice(0, 60)}»`));
  if (p.status !== 'active') return c.redirect('/admin/requests?err=' + encodeURIComponent(`المنتج ${p.id} ليس على الرف (${p.status}) — أظهره أولًا ثم اربطه`));
  const r = await db.prepare("SELECT user_id FROM link_requests WHERE id=? AND status='new'").bind(id).first<{ user_id: number }>();
  if (!r) return c.redirect('/admin/requests');
  await db.prepare("UPDATE link_requests SET status='ready',product_id=?,updated_at=datetime('now') WHERE id=?").bind(p.id, id).run();
  await notify(db, r.user_id, 'منتجك صار في هدهد ✓', `${String(p.title_ar).slice(0, 80)} — بسعر نهائي بالدينار شامل الشحن والجمارك.`, `/p/${p.slug}`);
  await logActivity(db, c.get('user')!.id, 'request.link', String(id), String(p.id));
  return c.redirect('/admin/requests?ok=1');
});
admin.post('/requests/:id/reject', requirePerm('catalog.manage', 'orders.manage'), async (c) => {
  const db = c.env.DB; const f = await c.req.parseBody(); const id = Number(c.req.param('id'));
  const why = String(f.why ?? '').trim().slice(0, 300);
  const r = await db.prepare("SELECT user_id FROM link_requests WHERE id=? AND status='new'").bind(id).first<{ user_id: number }>();
  if (!r || !why) return c.redirect('/admin/requests');
  await db.prepare("UPDATE link_requests SET status='rejected',admin_note=?,updated_at=datetime('now') WHERE id=?").bind(why, id).run();
  await notify(db, r.user_id, 'تعذّر توفير المنتج الذي طلبته', why, '/request');
  await logActivity(db, c.get('user')!.id, 'request.reject', String(id), why);
  return c.redirect('/admin/requests?status=rejected&ok=1');
});

export default admin;
