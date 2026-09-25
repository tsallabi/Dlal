import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS, CITIES } from '../types';
import { Ic } from '../views/icons';
import { PartnerShell } from '../views/dash';
import { Flash } from '../views/layout';
import { fmt, imgUrl, timeAgo, notify } from '../lib/db';
import { setOrderStatus } from '../lib/orders';
import { requireRole, normPhone, hashPassword } from '../lib/auth';
import { PARTNER_FLOW } from '../types';
import { loadSettings } from '../lib/pricing';
import { zonesFor, zoneLabel, courierTrack, courierCreate, courierHandover, courierResult, saveMedia, mediaResponse, deleteMedia, createInvoice, newSecret, testDispatch, RATE_KEYS, RATE_AR, feeMargin, syncPricingPartner, pricingPartnerId } from '../lib/partner';

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
    <td>{i.title_ar}<br /><a class="src-link" href={i.source_url ?? `https://detail.1688.com/offer/${i.source_offer_id}.html`} target="_blank"><Ic n="link" s={18} /> فتح في 1688 — {i.source_offer_id}</a></td>
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

// ---------- لوحتي: نظرة عامة على كل شيء (طلب صاحب المشروع ٢٤/٠٩/٢٦) ----------
// كم يُسمح لكل مرحلة من الأيام قبل أن يُعدّ الطلب «عالقًا» فيها
const STAGE_SLA: Record<string, number> = { purchasing: 3, purchased: 10, at_warehouse: 7, consolidated: 7, shipped: 25, arrived: 5, customs: 10, ready: 4 };
const daysSince = (t?: string | null) => t ? Math.floor((Date.now() - new Date(t.replace(' ', 'T') + (t.includes('Z') ? '' : 'Z')).getTime()) / 86400000) : 0;
const money = (v: number) => fmt(Math.round((v || 0) * 100) / 100);
partner.get('/', async (c) => {
  const x = await ctx(c); const db = x.db; const pid = x.pid;
  const stuckSql = Object.entries(STAGE_SLA).map(([st, d]) => `(status='${st}' AND updated_at < datetime('now','-${d} days'))`).join(' OR ');
  const LIVE = "status NOT IN ('pending_payment','cancelled','refunded')";
  const LATE = "status='paid' AND paid_at < datetime('now','-2 days')";
  const [late, stuck, ships, transit, dues, ledger, cod, inv, ev, month, lateN, stuckN, withCourier] = await Promise.all([
    db.prepare(`SELECT code,paid_at,ship_city FROM orders WHERE partner_id=? AND ${LATE} ORDER BY paid_at LIMIT 12`).bind(pid).all<any>(),
    db.prepare(`SELECT code,status,updated_at,ship_city FROM orders WHERE partner_id=? AND (${stuckSql}) ORDER BY updated_at LIMIT 12`).bind(pid).all<any>(),
    db.prepare('SELECT status,COUNT(*) n FROM shipments WHERE partner_id=? GROUP BY status').bind(pid).all<any>(),
    db.prepare("SELECT s.code,s.method,s.shipped_at,s.tracking_no,(SELECT COUNT(*) FROM orders o WHERE o.shipment_id=s.id) n FROM shipments s WHERE s.partner_id=? AND s.status='shipped' ORDER BY s.shipped_at").bind(pid).all<any>(),
    db.prepare(`SELECT COALESCE(SUM(json_extract(partner_fees_json,'$.total')),0) total,
        COALESCE(SUM(CASE WHEN status='delivered' THEN json_extract(partner_fees_json,'$.total') END),0) done,
        SUM(partner_fees_json IS NULL) nosnap FROM orders WHERE partner_id=? AND ${LIVE}`).bind(pid).first<any>(),
    db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='payout' THEN amount_lyd END),0) paid, COALESCE(SUM(CASE WHEN kind='collect' THEN amount_lyd END),0) got FROM partner_ledger WHERE partner_id=?").bind(pid).first<any>(),
    // الدفع عند الاستلام: الشريك يحصّل 70% من الزبونة عند التسليم (العربون 30% دُفع لنا) — تلك لنا عنده
    db.prepare("SELECT COALESCE(SUM(total_lyd*0.7),0) v, COUNT(*) n FROM orders WHERE partner_id=? AND status='delivered' AND payment_method='cod_deposit'").bind(pid).first<any>(),
    db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total_lyd),0) v FROM partner_invoices WHERE partner_id=?').bind(pid).first<any>(),
    db.prepare("SELECT e.status,e.note,e.created_at,o.code FROM order_events e JOIN orders o ON o.id=e.order_id WHERE o.partner_id=? ORDER BY e.id DESC LIMIT 12").bind(pid).all<any>(),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE partner_id=? AND status='delivered' AND updated_at >= date('now','start of month')").bind(pid).first<any>(),
    db.prepare(`SELECT COUNT(*) n FROM orders WHERE partner_id=? AND ${LATE}`).bind(pid).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) n FROM orders WHERE partner_id=? AND (${stuckSql})`).bind(pid).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE partner_id=? AND status='ready' AND courier_status='with_courier'").bind(pid).first<{ n: number }>(),
  ]);
  const nLate = lateN?.n ?? 0, nStuck = stuckN?.n ?? 0;
  const n = (st: string) => x.counts[st] ?? 0;
  const shipN = Object.fromEntries(ships.results.map((r: any) => [r.status, r.n]));
  const eta = (m: string) => m === 'sea' ? 40 : 15;   // أيام تقريبية للوصول
  const owedToYou = (dues?.total ?? 0) - (ledger?.paid ?? 0);
  const owedToUs = (cod?.v ?? 0) - (ledger?.got ?? 0);
  const pipeline = PARTNER_FLOW.filter(st => st !== 'delivered').map(st => ({ st, n: n(st) }));
  const maxP = Math.max(1, ...pipeline.map(p => p.n));
  const Tile = (p: { v: any; l: string; sub?: any; href?: string; tone?: string; ic?: string }) => (
    <a class={`pd-tile ${p.tone ?? ''}`} href={p.href ?? '#'}>{p.ic && <i class="pd-ic"><Ic n={p.ic} s={24} /></i>}<b>{p.v}</b><span>{p.l}</span>{p.sub && <small>{p.sub}</small>}</a>);
  return shell(c, x, 'home', 'لوحتي', (
    <div class="pd">
      <div class="pd-actions"><a class="primary" href="/partner/queue"><Ic n="cart" s={18} /> ابدأ الشراء</a><a class="soft" href="/partner/delivery"><Ic n="truck" s={18} /> التوصيل داخل ليبيا</a><a class="soft" href="/partner/shipments"><Ic n="box" s={18} /> الشحنات</a><a class="soft" href="/partner/rates"><Ic n="coin" s={18} /> أسعاري</a></div>
      <div class="pd-tiles">
        <Tile v={n('paid')} l="بانتظار الشراء" ic="cart" sub={nLate ? `⚠ ${nLate} متأخرة أكثر من يومين` : 'لا متأخر'} href="/partner/queue" tone={nLate ? 'warn' : ''} />
        <Tile v={nStuck} l="عالقة في مرحلتها" ic="alert" sub="تجاوزت المدة المعتادة" href="#stuck" tone={nStuck ? 'bad' : 'ok'} />
        <Tile v={n('purchasing') + n('purchased')} l="قيد الشراء" ic="hourglass" href="/partner/purchasing" />
        <Tile v={n('at_warehouse') + n('consolidated')} l="في مخزن الصين" ic="factory" sub={`${n('consolidated')} مضمومة لشحنة`} href="/partner/warehouse" />
        <Tile v={n('shipped')} l="في الطريق إلى ليبيا" ic="plane" sub={`${transit.results.length} شحنة`} href="#transit" />
        <Tile v={n('arrived') + n('customs') + n('ready')} l="وصلت ليبيا" ic="pin" sub={`${n('customs')} في الجمارك · ${n('ready') - (withCourier?.n ?? 0)} جاهزة · ${withCourier?.n ?? 0} مع ${(x.p as any).courier_name || 'أميال'}`} href="/partner/delivery" />
        <Tile v={n('delivered')} l="وصلت للزبون" ic="check" sub={`${month?.n ?? 0} هذا الشهر`} href="/partner/all" tone="ok" />
        <Tile v={(shipN.open ?? 0) + (shipN.shipped ?? 0) + (shipN.arrived ?? 0) + (shipN.customs ?? 0) + (shipN.released ?? 0)} l="الشحنات" ic="box" sub={`${shipN.open ?? 0} مفتوحة · ${shipN.shipped ?? 0} في الطريق · ${shipN.released ?? 0} مكتملة`} href="/partner/shipments" />
      </div>

      <div class="pd-grid">
        <div class="card-box pd-money"><h3><Ic n="coin" s={18} /> الحساب بيننا</h3>
          <div class="pd-wallets">
            <div class="pd-wallet"><i><Ic n="wallet" s={22} /></i><div><span>المتبقي لكم علينا</span><b>{money(owedToYou)}</b><small>من مستحقات {money(dues?.total)}</small></div></div>
            <div class="pd-wallet"><i><Ic n="doc" s={22} /></i><div><span>المتبقي لنا عليكم</span><b>{money(owedToUs)}</b><small>تحصيل عند الاستلام</small></div></div>
          </div>
          <table class="tbl">
            <tr><td>مستحقاتكم عن كل الطلبات الجارية والمسلَّمة</td><td>{money(dues?.total)}</td></tr>
            <tr><td>منها عن طلبات سُلِّمت</td><td>{money(dues?.done)}</td></tr>
            <tr><td>ما دفعته هدهد لكم</td><td>− {money(ledger?.paid)}</td></tr>
            <tr class="pd-sum"><th>المتبقي لكم علينا</th><th>{money(owedToYou)}</th></tr>
            <tr><td>حصّلتم من الزبائن عند الاستلام ({cod?.n ?? 0} طلب)</td><td>{money(cod?.v)}</td></tr>
            <tr><td>ما سلّمتموه لنا منه</td><td>− {money(ledger?.got)}</td></tr>
            <tr class="pd-sum"><th>المتبقي لنا عليكم</th><th>{money(owedToUs)}</th></tr>
            <tr class="pd-net"><th>الصافي</th><th>{owedToYou - owedToUs >= 0 ? `لكم ${money(owedToYou - owedToUs)}` : `لنا ${money(owedToUs - owedToYou)}`}</th></tr>
          </table>
          <small class="pd-note">المستحقات بأسعاركم يوم دفع كل طلب ({RATE_AR.fee_commission_pct.ar} والنقل والشحن والتوصيل + ثمن البضاعة الذي تدفعونه للمورد). فواتيركم المرفوعة: {inv?.n ?? 0} بقيمة {money(inv?.v)}.{(dues?.nosnap ?? 0) > 0 && ` ${dues.nosnap} طلبًا قديمًا بلا لقطة أسعار.`}</small>
        </div>

        <div class="card-box"><h3><Ic n="box" s={18} /> الطلبات حسب المرحلة</h3>
          {(() => { const all = pipeline.reduce((a, p) => a + p.n, 0) + n('delivered'); const pct = all ? Math.round(n('delivered') / all * 100) : 0;
            return <div class="pd-donut" style={`--p:${pct}`} title={`وصل للزبون ${n('delivered')} من ${all} (${pct}%)`}><div><span><b>{all}</b><small>إجمالي الطلبات<br />{pct}% وصلت للزبون</small></span></div></div>; })()}
          <div class="pd-bars">{pipeline.map(p => (
            <a class="pd-bar" href={`/partner/all?status=${p.st}`} title={`${STAGE_AR(p.st)}: ${p.n} طلب`}>
              <span class="pd-bl">{STAGE_AR(p.st)}</span>
              <span class="pd-bt"><i style={`width:${p.n ? Math.max(3, Math.round(p.n / maxP * 100)) : 0}%`}></i></span>
              <b>{p.n}</b>
            </a>))}</div>
        </div>
      </div>

      <div class="card-box" id="transit"><h3><Ic n="plane" s={18} /> في الطريق إلى ليبيا — ما قارب الوصول</h3>
        {transit.results.length === 0 ? <p class="pd-empty">لا شحنات في الطريق الآن.</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الشحنة</th><th>الطريقة</th><th>الطلبات</th><th>شُحنت منذ</th><th>الوصول المتوقع</th><th>التتبع</th></tr>
            {transit.results.map((t: any) => { const d = daysSince(t.shipped_at); const left = eta(t.method) - d; return (
              <tr class={left <= 3 ? 'pd-near' : ''}><td><b>{t.code}</b></td><td>{t.method === 'sea' ? '🚢 بحري' : '✈️ جوي'}</td><td>{t.n}</td><td>{d} يوم</td>
                <td>{left <= 0 ? <b class="pd-red">تجاوزت الموعد بـ{-left} يوم</b> : left <= 3 ? <b>⏳ خلال {left} أيام</b> : `بعد ~${left} يومًا`}</td><td dir="ltr">{t.tracking_no ?? '—'}</td></tr>); })}
          </table></div>}
      </div>

      <div class="card-box" id="stuck"><h3><Ic n="alert" s={18} /> طلبات متأخرة أو عالقة ({nLate + nStuck})</h3>
        {nLate + nStuck > late.results.length + stuck.results.length && <p class="pd-note" style="margin:0 0 6px">الأقدم أولًا — {late.results.length + stuck.results.length} من {nLate + nStuck}. {nLate > late.results.length && <a href="/partner/queue">كل المدفوعة بانتظار الشراء ←</a>}</p>}
        {nLate + nStuck === 0 ? <p class="pd-empty">لا شيء متأخر — ممتاز ✓</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>المرحلة</th><th>منذ</th><th>المعتاد</th><th>المدينة</th></tr>
            {late.results.map((o: any) => <tr><td><a class="po-link" href={`/partner/order/${o.code}`}>{o.code}</a></td><td>مدفوع ولم يبدأ شراؤه</td><td class="pd-red">{daysSince(o.paid_at)} يوم</td><td>يومان</td><td>{o.ship_city}</td></tr>)}
            {stuck.results.map((o: any) => <tr><td><a class="po-link" href={`/partner/order/${o.code}`}>{o.code}</a></td><td>{STAGE_AR(o.status)}</td><td class="pd-red">{daysSince(o.updated_at)} يوم</td><td>{STAGE_SLA[o.status]} أيام</td><td>{o.ship_city}</td></tr>)}
          </table></div>}
      </div>

      <div class="card-box"><h3><Ic n="clock" s={18} /> آخر الحركات</h3>
        <ul class="po-ev">{ev.results.map((e: any) => <li><a class="po-link" href={`/partner/order/${e.code}`}>{e.code}</a> — <b>{STAGE_AR(e.status)}</b> · {timeAgo(e.created_at)}{e.note ? <small> · {e.note}</small> : null}</li>)}</ul>
      </div>
    </div>
  ));
});

// ---------- بانتظار الشراء ----------
partner.get('/queue', async (c) => {
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
// ---------- التوصيل داخل ليبيا: من «جاهز للتسليم» إلى شركة التوصيل (أميال) إلى يد الزبونة ----------
partner.get('/delivery', async (c) => {
  const x = await ctx(c); const p = x.p as any; const cn = p.courier_name || 'أميال';
  const orders = await ordersWithItems(x.db, x.pid, ['ready']);
  const waiting = orders.filter(o => !o.courier_status || o.courier_status === 'failed');
  const withC = orders.filter(o => o.courier_status === 'with_courier');
  const today = await x.db.prepare("SELECT COUNT(*) n FROM orders WHERE partner_id=? AND status='delivered' AND courier_status='delivered' AND updated_at >= date('now')").bind(x.pid).first<{ n: number }>();
  const cod = (o: any) => o.payment_method === 'cod_deposit' ? <b style="color:#d68b00">{fmt(o.total_lyd * 0.7)} يُحصَّل عند الاستلام</b> : 'مدفوع بالكامل';
  const Addr = (o: any) => <>{o.ship_name} · <span dir="ltr">{o.ship_phone}</span><br /><small>{o.ship_city}{o.ship_zone ? ` — ${o.ship_zone}` : ''} — {o.ship_address}</small></>;
  const err = c.req.query('err');
  return shell(c, x, 'delivery', 'التوصيل داخل ليبيا', (
    <div class="pd">
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {err && <div class="flash err">{err}</div>}
      <div class="pd-tiles">
        <a class="pd-tile warn" href="#ready"><i class="pd-ic"><Ic n="box" s={24} /></i><b>{waiting.length}</b><span>جاهزة — لم تُسلَّم لـ{cn}</span><small>{waiting.filter(o => o.courier_status === 'failed').length} تعذّر توصيلها سابقًا</small></a>
        <a class="pd-tile" href="#courier"><i class="pd-ic"><Ic n="truck" s={24} /></i><b>{withC.length}</b><span>مع {cn} في الطريق للزبائن</span></a>
        <a class="pd-tile ok"><i class="pd-ic"><Ic n="check" s={24} /></i><b>{today?.n ?? 0}</b><span>وصلت الزبائن اليوم عبر {cn}</span></a>
      </div>

      <div class="card-box" id="ready"><h3><Ic n="box" s={18} /> جاهزة للتسليم — سلّمها لـ{cn} أو للزبون مباشرة ({waiting.length})</h3>
        {waiting.length === 0 ? <p class="pd-empty">لا طلبات تنتظر التسليم.</p> :
          <div class="tbl-wrap"><table class="tbl courier-tbl"><tr><th>الطلب</th><th>الزبون والعنوان</th><th>الدفع</th><th>التسليم</th></tr>
            {waiting.map(o => <tr><td><a class="po-link" href={`/partner/order/${o.code}`}>{o.code}</a>{o.courier_status === 'failed' && <><br /><small class="pd-red">تعذّر: {o.courier_note ?? '—'}</small></>}</td><td>{Addr(o)}</td><td>{cod(o)}</td>
              <td><form method="post" action={`/partner/order/${o.code}/courier`} class="inline" style="gap:4px">
                  <input type="text" name="ref" placeholder={cn === 'أميال' ? 'AMY-284510' : `رقم شحنة ${cn}`} style="width:140px" dir="ltr" />
                  <button class="btn sm dark">سُلِّم لـ{cn} 🚚</button>
                  {p.courier_api_enabled && p.courier_api_url ? <button class="btn sm ghost" name="via" value="api">إنشاء الشحنة عبر API</button> : null}
                </form>
                <form method="post" action={`/partner/order/${o.code}/status`} style="margin-top:4px"><input type="hidden" name="status" value="delivered" /><button class="btn sm ok">تم التسليم ✓ (سلّمناه بأنفسنا)</button></form></td></tr>)}
          </table></div>}
      </div>

      <div class="card-box" id="courier"><h3><Ic n="truck" s={18} /> مع {cn} ({withC.length})</h3>
        {withC.length === 0 ? <p class="pd-empty">لا طرود مع {cn} الآن.</p> :
          <div class="tbl-wrap"><table class="tbl courier-tbl"><tr><th>الطلب</th><th>رقم الشحنة</th><th>منذ</th><th>الزبون والعنوان</th><th>الدفع</th><th></th></tr>
            {withC.map(o => { const tr = courierTrack(p, o.courier_ref); return <tr><td><a class="po-link" href={`/partner/order/${o.code}`}>{o.code}</a></td>
              <td dir="ltr">{tr ? <a href={tr} target="_blank" rel="noopener">{o.courier_ref} ↗</a> : o.courier_ref}</td><td>{timeAgo(o.courier_at)}</td><td>{Addr(o)}</td><td>{cod(o)}</td>
              <td><form method="post" action={`/partner/order/${o.code}/courier/delivered`}><button class="btn sm ok">وصل للزبون ✓</button></form>
                <form method="post" action={`/partner/order/${o.code}/courier/failed`} class="inline" style="gap:4px;margin-top:4px"><input type="text" name="note" placeholder="سبب التعذّر (لم يرد، عنوان خطأ…)" style="width:170px" /><button class="btn sm ghost" style="color:#d3262b">تعذّر</button></form></td></tr>; })}
          </table></div>}
      </div>

      <form method="post" action={`/partner/courier${pq(x)}`} class="card-box po-rates" id="courier-settings"><h3><Ic n="gear" s={18} /> الربط مع شركة التوصيل</h3>
        <p style="font-size:13px;color:#555;margin-top:0">الطريق اليوم مع أميال (ثبت من موقعها في 25/09/26): افتح حساب تاجر في <a href="https://portal.amyal.ly/register" target="_blank" rel="noopener" dir="ltr">portal.amyal.ly</a>، سجّل الشحنة هناك باسم الزبون وهاتفه وعنوانه والمبلغ المطلوب تحصيله، ثم اكتب رقم الشحنة الذي تعطيك إياه (مثل <b dir="ltr">AMY-284510</b>) في خانة الطلب أعلاه — فيصل للزبون في إشعار وصفحة طلبه. أميال لا تنشر واجهة برمجية (API) علنية؛ إن أعطتكم رابطها ومفتاحها ضعهما هنا فيُنشئ زر «عبر API» الشحنة عندهم مباشرة.</p>
        <div class="inline"><label style="min-width:170px">اسم شركة التوصيل</label><input type="text" name="courier_name" value={cn} /></div>
        <div class="inline"><label style="min-width:170px">رابط التتبع</label><input type="url" name="courier_track_url" value={p.courier_track_url ?? ''} placeholder="https://…/track?code={code}" dir="ltr" style="min-width:320px" /><small>{'{code}'} = رقم الشحنة</small></div>
        <div class="inline"><label style="min-width:170px">رابط API لإنشاء شحنة</label><input type="url" name="courier_api_url" value={p.courier_api_url ?? ''} placeholder="https://…/api/shipments" dir="ltr" style="min-width:320px" /></div>
        <div class="inline"><label style="min-width:170px">مفتاح API</label><input type="text" name="courier_api_key" value={p.courier_api_key ?? ''} dir="ltr" style="min-width:320px" /></div>
        <label class="inline" style="font-weight:400"><input type="checkbox" name="courier_api_enabled" value="1" checked={!!p.courier_api_enabled} /> أظهر زر «إنشاء الشحنة عبر API»</label>
        <button class="btn dark">حفظ</button>
      </form>
    </div>
  ));
});
partner.post('/courier', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const url = (v: any) => { const t = String(v ?? '').trim(); return /^https?:\/\//.test(t) ? t.slice(0, 300) : null; };
  await x.db.prepare('UPDATE partners SET courier_name=?,courier_track_url=?,courier_api_url=?,courier_api_key=?,courier_api_enabled=? WHERE id=?')
    .bind(String(f.courier_name ?? '').trim().slice(0, 40) || 'أميال', url(f.courier_track_url), url(f.courier_api_url), String(f.courier_api_key ?? '').trim().slice(0, 200) || null, f.courier_api_enabled === '1' ? 1 : 0, x.pid).run();
  return c.redirect('/partner/delivery?ok=1' + pq2(x) + '#courier-settings');
});
partner.post('/order/:code/courier', async (c) => {
  const code = c.req.param('code'); const f = await c.req.parseBody(); const db = c.env.DB;
  const o = await db.prepare('SELECT o.id,p.* FROM orders o JOIN partners p ON p.id=o.partner_id WHERE o.code=?').bind(code).first<any>();
  if (!o) return c.notFound();
  const cn = o.courier_name || 'أميال';
  let ref = String(f.ref ?? '').trim().slice(0, 60);
  if (f.via === 'api') {
    const orderId = (await db.prepare('SELECT id FROM orders WHERE code=?').bind(code).first<any>())!.id;
    const r = await courierCreate(db, o, orderId);
    if (!r.ok) return c.redirect('/partner/delivery?err=' + encodeURIComponent(`لم تُنشأ الشحنة عند ${cn}: ${r.error}`));
    ref = r.ref!;
  }
  if (!ref) return c.redirect('/partner/delivery?err=' + encodeURIComponent(`اكتب رقم شحنة ${cn} قبل التسليم`));
  await courierHandover(db, code, cn, ref, c.get('user')!.id);
  return c.redirect('/partner/delivery?ok=1#courier');
});
partner.post('/order/:code/courier/delivered', async (c) => { await courierResult(c.env.DB, c.req.param('code'), 'delivered', null, c.get('user')!.id); return c.redirect('/partner/delivery?ok=1#courier'); });
partner.post('/order/:code/courier/failed', async (c) => {
  const f = await c.req.parseBody();
  await courierResult(c.env.DB, c.req.param('code'), 'failed', String(f.note ?? '').trim().slice(0, 200) || null, c.get('user')!.id);
  return c.redirect('/partner/delivery?ok=1#ready');
});

// ---------- كل الطلبات ----------
partner.get('/all', async (c) => {
  const x = await ctx(c);
  // من بطاقات «لوحتي»: ?status=shipped يعرض طلبات تلك المرحلة وحدها
  const st = c.req.query('status'); const one = st && ORDER_STATUS[st] ? st : null;
  const rows = await x.db.prepare(`SELECT o.code,o.status,o.ship_city,o.updated_at,u.name FROM orders o JOIN users u ON u.id=o.user_id WHERE o.partner_id=? ${one ? 'AND o.status=?' : ''} ORDER BY o.id DESC LIMIT 300`).bind(...(one ? [x.pid, one] : [x.pid])).all<any>();
  return shell(c, x, 'all', one ? `الطلبات: ${STAGE_AR(one)} (${rows.results.length})` : 'كل الطلبات', (
    <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبون</th><th>المدينة</th><th>الحالة</th><th>آخر تحديث</th></tr>{rows.results.map(o => <tr><td><a href={`/partner/order/${o.code}`} class="po-link">{o.code}</a></td><td>{o.name}</td><td>{o.ship_city}</td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{timeAgo(o.updated_at)}</td></tr>)}</table></div>
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
  return c.redirect((back[st] ?? '/partner/queue') + '?ok=1');
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
  await notify(db, it.user_id, `منتج غير متوفر في طلبك ${it.code}`, `"${it.title_ar}" نفد عند المورد. سيتواصل معك فريق هدهد لاختيار بديل أو استرجاع قيمته.`, `/orders/${it.code}`);
  return c.redirect('/partner/queue?ok=1');
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
      {(o.ship_zone || o.courier_ref) && <div class="card-box"><h3><Ic n="truck" s={18} /> التوصيل داخل ليبيا</h3><p style="margin:0">{o.ship_city}{o.ship_zone ? ` — ${o.ship_zone}` : ''}{o.courier_ref ? <> · مع {o.courier} — رقم الشحنة <b dir="ltr">{o.courier_ref}</b> ({o.courier_status === 'failed' ? `تعذّر: ${o.courier_note ?? ''}` : o.courier_status === 'delivered' ? 'سُلِّم' : `منذ ${timeAgo(o.courier_at)}`})</> : ''} · <a href="/partner/delivery">صفحة التوصيل ←</a></p></div>}
      <div class="card-box"><h3><Ic n="doc" s={18} /> مستحقاتكم عن هذا الطلب</h3>
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
      <div class="card-box"><h3><Ic n="camera" s={18} /> صور المراحل ({media.results.length})</h3>
        <div class="po-gallery">{media.results.map(m => (
          <figure class="po-ph">
            <a href={m.url ?? `/partner/media/${m.id}`} target="_blank"><img src={m.url ?? `/partner/media/${m.id}`} alt="" loading="lazy" /></a>
            <figcaption><b>{STAGE_AR(m.stage)}</b>{m.caption ? ` — ${m.caption}` : ''}<br /><small>{timeAgo(m.created_at)}{m.bytes ? ` · ${Math.round(m.bytes / 1024)} ك.ب` : ''}{m.public ? ' · يراها الزبون' : ''}</small>
              <form method="post" action={`/partner/order/${o.code}/media/${m.id}/delete`} class="inline"><button class="btn sm ghost" onclick="return confirm('حذف الصورة؟')">حذف</button></form></figcaption>
          </figure>))}</div>
        <form method="post" action={`/partner/order/${o.code}/photo`} enctype="multipart/form-data" class="po-upload" data-compress="1">
          <label>المرحلة</label><select name="stage">{PARTNER_FLOW.map(st => <option value={st} selected={st === o.status}>{STAGE_AR(st)}</option>)}</select>
          <label>الصورة</label><input type="file" name="photo" accept="image/*" capture="environment" required />
          <input type="text" name="caption" placeholder="وصف قصير (اختياري)" />
          <label class="inline" style="font-weight:400"><input type="checkbox" name="public" value="1" /> تظهر للزبون في صفحة طلبه (لا تختر هذا لفاتورة المورد أو سعره)</label>
          <button class="btn sm ok">رفع الصورة</button>
          <small class="po-hint">تُصغَّر الصورة في جهازك قبل الرفع (≈200 ك.ب) فترفع بسرعة حتى على إنترنت ضعيف.</small>
        </form>
      </div>
      <div class="card-box"><h3><Ic n="doc" s={18} /> فواتير المراحل ({inv.results.length})</h3>
        {inv.results.length > 0 && <div class="tbl-wrap"><table class="tbl"><tr><th>الرقم</th><th>المرحلة</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr>
          {inv.results.map(i => <tr><td>{i.number}</td><td>{STAGE_AR(i.stage)}</td><td>{fmt(i.total_lyd)}</td><td>{timeAgo(i.created_at)}</td><td><a class="btn sm ghost" href={`/partner/invoice/${i.id}`} target="_blank">عرض وطباعة</a></td></tr>)}</table></div>}
        <form method="post" action={`/partner/order/${o.code}/invoice`} class="po-inv">
          <label>المرحلة</label><select name="stage">{PARTNER_FLOW.map(st => <option value={st} selected={st === o.status}>{STAGE_AR(st)}</option>)}</select>
          <div class="po-lines">{[0, 1, 2, 3].map(i => <div class="inline"><input type="text" name="desc" placeholder={i === 0 ? 'البند (مثال: شحن جوي 2.4 كغ)' : 'بند آخر (اختياري)'} style="flex:1" /><input type="number" step="0.01" name="amount" placeholder="المبلغ د.ل" style="width:130px" /></div>)}</div>
          <input type="text" name="note" placeholder="ملاحظة على الفاتورة (اختياري)" />
          <button class="btn sm dark">إنشاء الفاتورة</button>
        </form>
      </div>
      <div class="card-box"><h3><Ic n="clock" s={18} /> سجل الطلب</h3><ul class="po-ev">{ev.results.map(e => <li><b>{STAGE_AR(e.status)}</b> — {timeAgo(e.created_at)}{e.note ? <small> · {e.note}</small> : null}</li>)}</ul></div>
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
  const r = await saveMedia(db, o.id, stage, { bytes, mime: file && typeof file !== 'string' ? file.type : undefined }, f.caption ? String(f.caption).slice(0, 200) : null, f.public === '1', c.get('user')!.id, c.env.MEDIA);
  return c.redirect(`/partner/order/${code}` + (r.ok ? '?ok=1' : `?err=${encodeURIComponent(r.error ?? 'تعذّر الرفع')}`));
});

partner.post('/order/:code/media/:id/delete', async (c) => {
  const code = c.req.param('code');
  await deleteMedia(c.env.DB, Number(c.req.param('id')), code, c.env.MEDIA);
  return c.redirect(`/partner/order/${code}?ok=1`);
});

// الصورة تُقدَّم لصاحبها فقط: شريك الطلب أو الأدمن
partner.get('/media/:id', async (c) => {
  const m = await c.env.DB.prepare('SELECT m.data,m.r2_key,m.mime,m.url,o.code FROM order_media m JOIN orders o ON o.id=m.order_id WHERE m.id=?').bind(Number(c.req.param('id'))).first<any>();
  if (!m || !(await owns(c, m.code))) return c.notFound();
  return (await mediaResponse(m, c.env.MEDIA)) ?? c.notFound();
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
        <p><b>من:</b> {i.partner}{i.contact ? ` · ${i.contact}` : ''}<br /><b>إلى:</b> هدهد HUDHUDE · <b>الطلب:</b> {i.code} · <b>المرحلة:</b> {STAGE_AR(i.stage)}</p>
        <table class="tbl"><tr><th>البند</th><th>المبلغ</th></tr>{lines.map(l => <tr><td>{l.desc}</td><td>{fmt(l.amount)}</td></tr>)}<tr><th>الإجمالي</th><th>{fmt(i.total_lyd)}</th></tr></table>
        {i.note && <p>{i.note}</p>}
        <button class="btn no-print" onclick="print()"><Ic n="print" s={18} /> طباعة / حفظ PDF</button>
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
  const zones = await zonesFor(x.db, x.pid);
  return shell(c, x, 'rates', 'أسعاري', (
    <>
      <Flash msg={c.req.query('ok') ? 'حُفظت أسعارك ✓' : undefined} />
      <form method="post" action={`/partner/rates${pq(x)}`} class="card-box po-rates">
        <p style="font-size:13px;color:#555;margin-top:0">ضع سعر كل خدمة كما تنفّذها بالدينار الليبي. هذه أسعارك أنت، وتُحسب منها مستحقاتك عن كل طلب لحظة دفعه. يُضاف على كل بند <b>رسم منصة هدهد {m} د.ل</b> يدفعه الزبون ولا يُخصم منك.</p>
        {RATE_KEYS.map(k => <div class="inline"><label style="min-width:190px">{RATE_AR[k].ar}</label><input type="number" step="0.01" min="0" name={k} value={p[k] ?? 0} style="width:120px" /><small>{RATE_AR[k].unit}</small></div>)}
        <button class="btn dark">حفظ أسعاري</button>
        {p.rates_updated_at && <small style="color:#888"> آخر تعديل {timeAgo(p.rates_updated_at)}</small>}
      </form>
      <div class="card-box" id="zones"><h3><Ic n="truck" s={18} /> التوصيل داخل ليبيا حسب المدينة والمنطقة</h3>
        <p style="font-size:13px;color:#555;margin-top:0">لكل مدينة مناطق بحسب بُعدها عن مركز المدينة بالكيلومتر. يختار الزبون منطقته عند الدفع فيُحسب سعرها (+ رسم المنصة {m} د.ل). المدينة بلا مناطق تُحسب بسعر «التوصيل داخل ليبيا» الموحّد أعلاه.</p>
        {zones.length > 0 && <div class="tbl-wrap"><table class="tbl zones-tbl"><tr><th>المدينة</th><th>المنطقة</th><th>من (كم)</th><th>إلى (كم)</th><th>سعرك</th><th>يدفعه الزبون</th><th></th></tr>
          {zones.map(z => <tr><td>{z.city}</td><td>{z.zone}</td><td>{z.km_from}</td><td>{z.km_to}</td><td>{fmt(z.price_lyd)}</td><td>{fmt(Math.round((z.price_lyd + m) * 100) / 100)}</td>
            <td><form method="post" action={`/partner/zones/${z.id}/delete${pq(x)}`}><button class="btn sm ghost" style="color:#d3262b">حذف</button></form></td></tr>)}
        </table></div>}
        <form method="post" action={`/partner/zones${pq(x)}`} class="inline zone-add" style="gap:6px;margin-top:10px;flex-wrap:wrap">
          <select name="city">{CITIES.map(ct => <option>{ct}</option>)}</select>
          <input type="text" name="zone" placeholder="اسم المنطقة (وسط المدينة، تاجوراء…)" required style="min-width:200px" />
          <input type="number" step="0.5" min="0" name="km_from" placeholder="من كم" style="width:80px" required />
          <input type="number" step="0.5" min="0" name="km_to" placeholder="إلى كم" style="width:80px" required />
          <input type="number" step="0.5" min="0" name="price" placeholder="السعر د.ل" style="width:100px" required />
          <button class="btn sm dark">+ إضافة منطقة</button>
        </form>
        <form method="post" action={`/partner/zones/quick${pq(x)}`} class="inline zone-quick" style="gap:6px;margin-top:10px;flex-wrap:wrap;background:#faf6f2;padding:8px;border-radius:8px">
          <b style="font-size:13px">قالب سريع لمدينة:</b><select name="city">{CITIES.map(ct => <option>{ct}</option>)}</select>
          <label style="font-weight:400">وسط 0–5 كم <input type="number" step="0.5" min="0" name="p1" style="width:70px" required /></label>
          <label style="font-weight:400">ضواحي 5–15 <input type="number" step="0.5" min="0" name="p2" style="width:70px" required /></label>
          <label style="font-weight:400">بعيدة 15–30 <input type="number" step="0.5" min="0" name="p3" style="width:70px" /></label>
          <label style="font-weight:400">خارج المدينة 30–60 <input type="number" step="0.5" min="0" name="p4" style="width:70px" /></label>
          <button class="btn sm ghost">إنشاء المناطق</button>
        </form>
      </div>
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

// ---------- موظفو الشركة: الشريك يضيف، وصاحب المشروع يقبل أو يرفض ----------
partner.get('/team', async (c) => {
  const x = await ctx(c);
  const { results } = await x.db.prepare("SELECT id,name,phone,active,pending_approval,last_login_at,created_at FROM users WHERE role='partner' AND partner_id=? AND phone NOT GLOB 'deleted-*' ORDER BY pending_approval DESC,id").bind(x.pid).all<any>();
  const err: Record<string, string> = { phone: 'هذا الرقم مسجّل لحساب آخر', pw: 'كلمة المرور 6 أحرف على الأقل', name: 'اكتب الاسم ورقم هاتف صحيحًا' };
  return shell(c, x, 'team', `موظفو ${x.p.name}`, (
    <>
      <Flash msg={c.req.query('ok') ? 'أُرسل الطلب ✓ — يستطيع الموظف الدخول فور موافقة إدارة هدهد' : undefined} />
      {c.req.query('err') && <div class="flash err">{err[c.req.query('err')!] ?? 'تعذّر الحفظ'}</div>}
      <div class="card-box"><div class="tbl-wrap"><table class="tbl team-tbl"><tr><th>الاسم</th><th>الهاتف (اسم الدخول)</th><th>الحالة</th><th>آخر دخول</th></tr>
        {results.map((u: any) => <tr><td>{u.name}</td><td dir="ltr">{u.phone}</td>
          <td>{u.pending_approval ? <span class="status gray">⏳ بانتظار موافقة هدهد</span> : u.active ? <span class="status green">نشط</span> : <span class="status red">معطّل</span>}</td>
          <td>{u.last_login_at ? timeAgo(u.last_login_at) : '—'}</td></tr>)}
      </table></div></div>
      <form method="post" action={`/partner/team${pq(x)}`} class="card-box po-rates"><h3>+ إضافة موظف لشركتكم</h3>
        <p style="font-size:13px;color:#555;margin-top:0">يرى الموظف طلبات شركتكم فقط ويعمل عليها. يبقى الحساب موقوفًا حتى توافق عليه إدارة هدهد.</p>
        <div class="inline"><label style="min-width:120px">الاسم</label><input type="text" name="name" required /></div>
        <div class="inline"><label style="min-width:120px">الهاتف</label><input type="tel" name="phone" placeholder="09xxxxxxxx" dir="ltr" required /></div>
        <div class="inline"><label style="min-width:120px">كلمة المرور</label><input type="text" name="password" minlength={6} required /></div>
        <button class="btn dark">إرسال للموافقة</button>
      </form>
    </>
  ));
});
partner.post('/team', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody(); const db = x.db;
  const name = String(f.name ?? '').trim().slice(0, 80); const phone = normPhone(String(f.phone ?? '')); const pw = String(f.password ?? '');
  if (!name || phone.length < 9) return c.redirect('/partner/team?err=name' + pq2(x));
  if (pw.length < 6) return c.redirect('/partner/team?err=pw' + pq2(x));
  if (await db.prepare('SELECT 1 FROM users WHERE phone=?').bind(phone).first()) return c.redirect('/partner/team?err=phone' + pq2(x));
  await db.prepare("INSERT INTO users(phone,name,password_hash,role,partner_id,active,pending_approval,added_by) VALUES(?,?,?,'partner',?,0,1,?)").bind(phone, name, await hashPassword(pw), x.pid, x.u.id).run();
  const { results: owners } = await db.prepare("SELECT id FROM users WHERE role='admin' AND staff_role='owner' AND active=1").all<{ id: number }>();
  for (const o of owners) await notify(db, o.id, `${x.p.name} يطلب إضافة موظف`, `${name} (${phone}) — بانتظار موافقتك`, '/admin/staff#pending');
  return c.redirect('/partner/team?ok=1' + pq2(x));
});

// مناطق التوصيل داخل ليبيا (مدينة × بُعد عن المركز)
const kmOf = (v: any) => Math.max(0, Math.min(500, parseFloat(String(v ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))) || 0));
partner.post('/zones', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const city = CITIES.includes(String(f.city)) ? String(f.city) : null; const zone = String(f.zone ?? '').trim().slice(0, 60);
  const a = kmOf(f.km_from), b = kmOf(f.km_to), price = kmOf(f.price);
  if (city && zone && b > a) await x.db.prepare('INSERT INTO partner_zones(partner_id,city,zone,km_from,km_to,price_lyd) VALUES(?,?,?,?,?,?)').bind(x.pid, city, zone, a, b, price).run();
  return c.redirect('/partner/rates?ok=1' + pq2(x) + '#zones');
});
partner.post('/zones/quick', async (c) => {
  const x = await ctx(c); const f = await c.req.parseBody();
  const city = CITIES.includes(String(f.city)) ? String(f.city) : null;
  if (!city) return c.redirect('/partner/rates' + pq(x));
  const bands: [string, number, number, any][] = [['وسط المدينة', 0, 5, f.p1], ['ضواحي قريبة', 5, 15, f.p2], ['ضواحي بعيدة', 15, 30, f.p3], ['خارج المدينة', 30, 60, f.p4]];
  const rows = bands.filter(b => String(b[3] ?? '').trim() !== '');
  await x.db.batch([x.db.prepare('DELETE FROM partner_zones WHERE partner_id=? AND city=?').bind(x.pid, city),
    ...rows.map(b => x.db.prepare('INSERT INTO partner_zones(partner_id,city,zone,km_from,km_to,price_lyd) VALUES(?,?,?,?,?,?)').bind(x.pid, city, b[0], b[1], b[2], kmOf(b[3])))]);
  return c.redirect('/partner/rates?ok=1' + pq2(x) + '#zones');
});
partner.post('/zones/:id/delete', async (c) => {
  const x = await ctx(c);
  await x.db.prepare('DELETE FROM partner_zones WHERE id=? AND partner_id=?').bind(Number(c.req.param('id')), x.pid).run();
  return c.redirect('/partner/rates?ok=1' + pq2(x) + '#zones');
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
POST ${origin}/api/partner/v1/orders/{code}/courier
     {"courier":"أميال","tracking":"AMY-284510"}   ← سُلِّم لشركة التوصيل
     {"result":"delivered"} or {"result":"failed","note":"..."}
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
