// منطقة حساب الزبونة: طلبات، تذاكر وإرجاع، تقييمات، كوبونات، نقاط، عناوين، إشعارات، الملف الشخصي
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS, TICKET_TYPES, TICKET_STATUS, CITIES, PAYMENT_METHODS } from '../types';
import { AccountShell, Stars } from '../views/account';
import { Flash } from '../views/layout';
import { getCategories, fmt, imgUrl, timeAgo, notify } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/auth';
import { loadSettings } from '../lib/pricing';
import { setOrderStatus, ticketCode, addPoints } from '../lib/orders';

const acct = new Hono<Env>();
acct.use('*', async (c, next) => { if (!c.get('user')) return c.redirect('/login?next=' + encodeURIComponent(c.req.path)); await next(); });

async function shell(c: Context<Env>, active: string, title: string, body: any) {
  const u = c.get('user')!; const db = c.env.DB;
  const [orders, tickets, notifs, reviews] = await db.batch([
    db.prepare("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status NOT IN ('delivered','cancelled','refunded')").bind(u.id),
    db.prepare("SELECT COUNT(*) n FROM tickets WHERE user_id=? AND status IN ('open','in_progress')").bind(u.id),
    db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0').bind(u.id),
    db.prepare("SELECT COUNT(*) n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND o.status='delivered' AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.order_id=o.id AND r.product_id=oi.product_id)").bind(u.id),
  ]);
  const n = (r: any) => (r.results[0] as any).n as number;
  const w = await db.prepare('SELECT COUNT(*) n FROM wishlist WHERE user_id=?').bind(u.id).first<{ n: number }>();
  return c.html(<AccountShell user={u} cartCount={c.get('cartCount')} wishCount={w?.n ?? 0} categories={await getCategories(db)} active={active} title={title} counts={{ orders: n(orders), tickets: n(tickets), notifications: n(notifs), reviews: n(reviews) }}>{body}</AccountShell>);
}

// ---------- نظرة عامة ----------
acct.get('/', async (c) => {
  const u = c.get('user')!; const db = c.env.DB;
  const [orders, notifs, cps] = await Promise.all([
    db.prepare('SELECT code,status,total_lyd,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 5').bind(u.id).all<any>(),
    db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 5').bind(u.id).all<any>(),
    db.prepare("SELECT COUNT(*) n FROM coupons c WHERE c.active=1 AND (c.ends_at IS NULL OR c.ends_at>datetime('now')) AND (SELECT COUNT(*) FROM coupon_uses cu WHERE cu.coupon_id=c.id AND cu.user_id=?) < c.per_user_limit").bind(u.id).first<any>(),
  ]);
  const s = await loadSettings(db);
  const stages = { pending_payment: 'بانتظار الدفع', buying: 'قيد الشراء', shipping: 'في الطريق', ready: 'جاهز للتسليم' };
  const cnt = await db.prepare(`SELECT SUM(status='pending_payment') a,SUM(status IN ('paid','purchasing','purchased')) b,SUM(status IN ('at_warehouse','consolidated','shipped','arrived','customs')) c,SUM(status='ready') d FROM orders WHERE user_id=?`).bind(u.id).first<any>();
  return shell(c, 'home', `مرحبًا ${u.name.split(' ')[0]} 👋`, (
    <>
      <div class="acct-stages">
        {[['pending_payment', '💳', stages.pending_payment, cnt.a], ['buying', '🛒', stages.buying, cnt.b], ['shipping', '✈️', stages.shipping, cnt.c], ['ready', '🏠', stages.ready, cnt.d]].map(([k, i, l, n]) => (
          <a href={`/account/orders?stage=${k}`}><span class="i">{i}</span><b>{n || 0}</b><small>{l}</small></a>
        ))}
      </div>
      <div class="acct-cards">
        <a href="/account/points" class="acct-card"><b>{u.points}</b><span>نقطة ≈ {fmt(u.points / 100 * parseFloat(s.points_value_per_100 || '1'))}</span></a>
        <a href="/account/coupons" class="acct-card"><b>{cps?.n ?? 0}</b><span>كوبون متاح</span></a>
        <a href="/wishlist" class="acct-card"><b>♡</b><span>المفضلة</span></a>
      </div>
      <div class="card-box"><div class="sec-h" style="margin:0 0 8px"><h3 style="margin:0">آخر الطلبات</h3><a href="/account/orders">الكل ›</a></div>
        {orders.results.length === 0 ? <p style="color:#888">لا طلبات بعد. <a href="/" style="color:var(--brand)">ابدئي التسوق</a></p> : orders.results.map(o => <OrderRow o={o} />)}
      </div>
      <div class="card-box"><div class="sec-h" style="margin:0 0 8px"><h3 style="margin:0">الإشعارات</h3><a href="/account/notifications">الكل ›</a></div>
        {notifs.results.length === 0 ? <p style="color:#888">لا إشعارات.</p> : notifs.results.map(n => <div class={`notif ${n.read ? '' : 'unread'}`}><a href={n.link ?? '#'}><b>{n.title}</b></a><span>{n.body}</span><small>{timeAgo(n.created_at)}</small></div>)}
      </div>
    </>
  ));
});

const OrderRow = ({ o }: { o: any }) => (
  <a href={`/orders/${o.code}`} class="order-row">
    <div><b>{o.code}</b><br /><small>{timeAgo(o.created_at)}</small></div>
    <span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span>
    <b>{fmt(o.total_lyd)}</b>
    <span class="chev">›</span>
  </a>
);

// ---------- الطلبات ----------
acct.get('/orders', async (c) => {
  const u = c.get('user')!;
  const stage = c.req.query('stage') ?? '';
  const map: Record<string, string> = { pending_payment: "status='pending_payment'", buying: "status IN ('paid','purchasing','purchased')", shipping: "status IN ('at_warehouse','consolidated','shipped','arrived','customs')", ready: "status='ready'", delivered: "status='delivered'", cancelled: "status IN ('cancelled','refunded')" };
  const where = map[stage] ?? '1=1';
  const { results } = await c.env.DB.prepare(`SELECT o.*,(SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) items,(SELECT url FROM order_items i JOIN product_images pi ON pi.product_id=i.product_id WHERE i.order_id=o.id ORDER BY pi.sort LIMIT 1) image FROM orders o WHERE user_id=? AND ${where} ORDER BY id DESC`).bind(u.id).all<any>();
  return shell(c, 'orders', 'طلباتي', (
    <>
      <div class="tabs">{[['', 'الكل'], ['pending_payment', 'بانتظار الدفع'], ['buying', 'قيد الشراء'], ['shipping', 'في الطريق'], ['ready', 'جاهز'], ['delivered', 'مُسلَّم'], ['cancelled', 'ملغي']].map(([k, l]) => <a href={`/account/orders?stage=${k}`} class={stage === k ? 'on' : ''}>{l}</a>)}</div>
      {results.length === 0 ? <div class="empty"><div class="big">📦</div>لا طلبات هنا</div> : results.map(o => (
        <div class="order-card">
          <div class="oc-h"><b>{o.code}</b><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></div>
          <div class="oc-b"><img src={imgUrl(o.image)} alt="" /><div><div>{o.items} منتج · {fmt(o.total_lyd)}</div><small style="color:#888">{timeAgo(o.created_at)} · {PAYMENT_METHODS[o.payment_method]?.ar}</small></div></div>
          <div class="oc-f">
            <a class="btn sm ghost" href={`/orders/${o.code}`}>التفاصيل والتتبع</a>
            {o.status === 'pending_payment' && PAYMENT_METHODS[o.payment_method]?.online && <a class="btn sm brand" href={`/pay/start/${o.code}`}>ادفعي الآن</a>}
            {o.status === 'delivered' && <a class="btn sm" href={`/account/reviews?order=${o.code}`}>قيّمي المنتجات ⭐</a>}
            {['delivered', 'ready', 'arrived', 'customs'].includes(o.status) && <a class="btn sm ghost" href={`/account/tickets/new?order=${o.code}&type=return`}>إرجاع / مشكلة</a>}
          </div>
        </div>
      ))}
    </>
  ));
});

// ---------- الإرجاع والتذاكر ----------
acct.get('/tickets', async (c) => {
  const u = c.get('user')!;
  const { results } = await c.env.DB.prepare('SELECT t.*,o.code AS order_code,(SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id=t.id) n FROM tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.user_id=? ORDER BY t.id DESC').bind(u.id).all<any>();
  return shell(c, 'tickets', 'الإرجاع والتذاكر', (
    <>
      <Flash msg={c.req.query('ok') ? 'أُنشئت التذكرة وسيرد عليك فريق الدعم ✓' : undefined} />
      <div class="inline" style="margin-bottom:12px"><a class="btn sm brand" href="/account/tickets/new">+ تذكرة جديدة</a><span style="font-size:13px;color:#666">سياسة الإرجاع: <a href="/pages/returns" style="color:var(--brand)">اقرئيها هنا</a></span></div>
      {results.length === 0 ? <div class="empty"><div class="big">↩️</div>لا تذاكر</div> : results.map(t => (
        <a href={`/account/tickets/${t.code}`} class="order-row"><div><b>{t.code}</b> · {TICKET_TYPES[t.type]}<br /><small>{t.subject} {t.order_code && `· الطلب ${t.order_code}`}</small></div><span class={`status ${TICKET_STATUS[t.status].color}`}>{TICKET_STATUS[t.status].ar}</span><small>{t.n} رسالة</small><span class="chev">›</span></a>
      ))}
    </>
  ));
});
acct.get('/tickets/new', async (c) => {
  const u = c.get('user')!;
  const orders = await c.env.DB.prepare("SELECT code FROM orders WHERE user_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 20").bind(u.id).all<any>();
  const oc = c.req.query('order') ?? '', ty = c.req.query('type') ?? 'issue';
  return shell(c, 'tickets', 'تذكرة جديدة', (
    <form method="post" action="/account/tickets/new" class="card-box" style="max-width:640px">
      <label>نوع الطلب</label><select name="type">{Object.entries(TICKET_TYPES).map(([k, v]) => <option value={k} selected={k === ty}>{v}</option>)}</select>
      <label>الطلب المرتبط (اختياري)</label><select name="order_code"><option value="">— بدون —</option>{orders.results.map(o => <option value={o.code} selected={o.code === oc}>{o.code}</option>)}</select>
      <label>الموضوع</label><input type="text" name="subject" required placeholder="مثال: المقاس مختلف عن الوصف" />
      <label>التفاصيل</label><textarea name="body" rows={5} required placeholder="اشرحي المشكلة بالتفصيل…"></textarea>
      <label>رابط صورة (اختياري)</label><input type="url" name="image_url" placeholder="https://…" />
      <p style="font-size:12px;color:#888">للإرجاع: البضاعة لا تُعاد إلى الصين، لكن نعوّض أي منتج تالف أو مختلف عن الوصف (استرجاع أو نقاط أو بديل) خلال 7 أيام من التسليم.</p>
      <button class="btn" style="margin-top:8px">إرسال</button>
    </form>
  ));
});
acct.post('/tickets/new', async (c) => {
  const u = c.get('user')!; const db = c.env.DB; const f = await c.req.parseBody();
  const type = TICKET_TYPES[String(f.type)] ? String(f.type) : 'issue';
  const o = f.order_code ? await db.prepare('SELECT id FROM orders WHERE code=? AND user_id=?').bind(String(f.order_code), u.id).first<any>() : null;
  const ins = await db.prepare("INSERT INTO tickets(code,user_id,order_id,type,subject) VALUES('tmp',?,?,?,?)").bind(u.id, o?.id ?? null, type, String(f.subject).slice(0, 120)).run();
  const id = ins.meta.last_row_id as number; const code = ticketCode(id);
  await db.batch([
    db.prepare('UPDATE tickets SET code=? WHERE id=?').bind(code, id),
    db.prepare('INSERT INTO ticket_messages(ticket_id,by_user_id,is_staff,body,image_url) VALUES(?,?,0,?,?)').bind(id, u.id, String(f.body), f.image_url ? String(f.image_url) : null),
  ]);
  // إشعار فريق الدعم
  const staff = await db.prepare("SELECT id FROM users WHERE role='admin' AND staff_role IN ('owner','admin','support','ops')").all<any>();
  for (const s of staff.results) await notify(db, s.id, `تذكرة جديدة ${code}`, `${TICKET_TYPES[type]}: ${String(f.subject).slice(0, 60)}`, `/admin/tickets/${code}`);
  return c.redirect('/account/tickets?ok=1');
});
acct.get('/tickets/:code', async (c) => {
  const u = c.get('user')!; const db = c.env.DB;
  const t = await db.prepare('SELECT t.*,o.code AS order_code FROM tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.code=? AND t.user_id=?').bind(c.req.param('code'), u.id).first<any>();
  if (!t) return c.notFound();
  const msgs = await db.prepare('SELECT m.*,u.name FROM ticket_messages m LEFT JOIN users u ON u.id=m.by_user_id WHERE ticket_id=? ORDER BY id').bind(t.id).all<any>();
  return shell(c, 'tickets', `${t.code} — ${t.subject}`, (
    <>
      <div class="inline" style="margin-bottom:10px"><span class={`status ${TICKET_STATUS[t.status].color}`}>{TICKET_STATUS[t.status].ar}</span><span class="status">{TICKET_TYPES[t.type]}</span>{t.order_code && <a href={`/orders/${t.order_code}`} class="status blue">الطلب {t.order_code}</a>}
        {t.resolution && <span class="status green">القرار: {{ refund: `استرجاع ${fmt(t.refund_lyd ?? 0)}`, replacement: 'إرسال بديل', points: `تعويض ${t.points_awarded} نقطة`, none: 'بدون تعويض' }[t.resolution as string]}</span>}</div>
      <div class="chat">{msgs.results.map(m => <div class={`msg ${m.is_staff ? 'staff' : 'me'}`}><div class="who">{m.is_staff ? `فريق هدهدي — ${m.name ?? ''}` : 'أنتِ'} · {timeAgo(m.created_at)}</div><div>{m.body}</div>{m.image_url && <a href={m.image_url} target="_blank">📷 صورة</a>}</div>)}</div>
      {t.status !== 'closed' && <form method="post" action={`/account/tickets/${t.code}/reply`} class="card-box"><label>رد</label><textarea name="body" rows={3} required></textarea><button class="btn sm" style="margin-top:8px">إرسال</button></form>}
    </>
  ));
});
acct.post('/tickets/:code/reply', async (c) => {
  const u = c.get('user')!; const db = c.env.DB; const f = await c.req.parseBody();
  const t = await db.prepare("SELECT id FROM tickets WHERE code=? AND user_id=? AND status<>'closed'").bind(c.req.param('code'), u.id).first<any>();
  if (!t) return c.notFound();
  await db.batch([
    db.prepare('INSERT INTO ticket_messages(ticket_id,by_user_id,is_staff,body) VALUES(?,?,0,?)').bind(t.id, u.id, String(f.body)),
    db.prepare("UPDATE tickets SET status=CASE WHEN status='resolved' THEN 'open' ELSE status END,updated_at=datetime('now') WHERE id=?").bind(t.id),
  ]);
  return c.redirect(`/account/tickets/${c.req.param('code')}`);
});

// ---------- التقييمات ----------
acct.get('/reviews', async (c) => {
  const u = c.get('user')!; const db = c.env.DB;
  const oc = c.req.query('order');
  const pending = await db.prepare(`SELECT oi.id,oi.product_id,oi.title_ar,oi.color,oi.size,o.code,o.id AS order_id,p.slug,(SELECT url FROM product_images i WHERE i.product_id=oi.product_id ORDER BY sort LIMIT 1) image
    FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.user_id=? AND o.status='delivered' ${oc ? 'AND o.code=?' : ''} AND NOT EXISTS(SELECT 1 FROM reviews r WHERE r.order_id=o.id AND r.product_id=oi.product_id) ORDER BY o.id DESC`).bind(...(oc ? [u.id, oc] : [u.id])).all<any>();
  const mine = await db.prepare('SELECT r.*,p.title_ar,p.slug FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=? ORDER BY r.id DESC').bind(u.id).all<any>();
  const s = await loadSettings(db);
  return shell(c, 'reviews', 'تقييماتي', (
    <>
      <Flash msg={c.req.query('ok') ? `شكرًا! أُضيف تقييمك وحصلتِ على ${c.req.query('pts')} نقطة. يظهر بعد مراجعة الفريق.` : undefined} />
      <div class="card-box"><h3>بانتظار تقييمك ({pending.results.length}) <small style="color:#888;font-weight:400">— {s.review_points} نقاط لكل تقييم، {s.review_photo_points} مع صورة</small></h3>
        {pending.results.length === 0 ? <p style="color:#888">لا منتجات بانتظار التقييم.</p> : pending.results.map(it => (
          <form method="post" action="/account/reviews" class="review-form">
            <input type="hidden" name="product_id" value={it.product_id} /><input type="hidden" name="order_id" value={it.order_id} />
            <img src={imgUrl(it.image)} alt="" /><div style="flex:1">
              <b>{it.title_ar}</b> <small style="color:#888">{[it.color, it.size].filter(Boolean).join(' · ')} · {it.code}</small>
              <div class="rate"><input type="radio" name="rating" value="5" id={`r5_${it.id}`} checked /><label for={`r5_${it.id}`}>★</label><input type="radio" name="rating" value="4" id={`r4_${it.id}`} /><label for={`r4_${it.id}`}>★</label><input type="radio" name="rating" value="3" id={`r3_${it.id}`} /><label for={`r3_${it.id}`}>★</label><input type="radio" name="rating" value="2" id={`r2_${it.id}`} /><label for={`r2_${it.id}`}>★</label><input type="radio" name="rating" value="1" id={`r1_${it.id}`} /><label for={`r1_${it.id}`}>★</label></div>
              <div class="inline"><select name="size_fit"><option value="">المقاس؟</option><option value="small">أصغر من المتوقع</option><option value="true">مطابق</option><option value="large">أكبر من المتوقع</option></select><input type="url" name="image_url" placeholder="رابط صورة (اختياري)" style="flex:1" /></div>
              <textarea name="body" rows={2} placeholder="رأيك في الجودة والخامة والمقاس…" required minlength={10}></textarea>
              <button class="btn sm">نشر التقييم</button>
            </div>
          </form>
        ))}
      </div>
      <div class="card-box"><h3>تقييماتي السابقة ({mine.results.length})</h3>
        {mine.results.map(r => <div class="review"><div class="rv-h"><a href={`/p/${r.slug}`}><b>{r.title_ar}</b></a><Stars n={r.rating} /><span class={`status ${r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'gray'}`}>{{ pending: 'قيد المراجعة', approved: 'منشور', rejected: 'مرفوض' }[r.status as string]}</span></div><p>{r.body}</p></div>)}
      </div>
    </>
  ));
});
acct.post('/reviews', async (c) => {
  const u = c.get('user')!; const db = c.env.DB; const f = await c.req.parseBody();
  const pid = Number(f.product_id), oid = Number(f.order_id), rating = Math.min(5, Math.max(1, Number(f.rating) || 5));
  const ok = await db.prepare("SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.id=? AND o.user_id=? AND o.status='delivered' AND oi.product_id=?").bind(oid, u.id, pid).first();
  if (!ok) return c.text('لا يمكنك تقييم منتج لم يُسلَّم لك', 400);
  const s = await loadSettings(db);
  const pts = f.image_url ? parseInt(s.review_photo_points || '10') : parseInt(s.review_points || '5');
  try {
    await db.prepare('INSERT INTO reviews(product_id,user_id,order_id,rating,body,size_fit,image_url) VALUES(?,?,?,?,?,?,?)').bind(pid, u.id, oid, rating, String(f.body).slice(0, 1000), f.size_fit ? String(f.size_fit) : null, f.image_url ? String(f.image_url) : null).run();
  } catch { return c.redirect('/account/reviews'); }
  await addPoints(db, u.id, pts, 'مكافأة كتابة تقييم', null, oid);
  return c.redirect(`/account/reviews?ok=1&pts=${pts}`);
});

// ---------- الكوبونات ----------
acct.get('/coupons', async (c) => {
  const u = c.get('user')!;
  const { results } = await c.env.DB.prepare("SELECT c.*,(SELECT COUNT(*) FROM coupon_uses cu WHERE cu.coupon_id=c.id AND cu.user_id=?) used_by_me FROM coupons c WHERE c.active=1 AND (c.ends_at IS NULL OR c.ends_at>datetime('now')) ORDER BY c.id DESC").bind(u.id).all<any>();
  return shell(c, 'coupons', 'كوبوناتي', (
    <div class="coupons">
      {results.length === 0 && <div class="empty">لا كوبونات حاليًا</div>}
      {results.map(cp => { const used = cp.used_by_me >= cp.per_user_limit; return (
        <div class={`coupon ${used ? 'used' : ''}`}><div class="cv">{cp.type === 'percent' ? `${cp.value}%` : cp.type === 'fixed' ? fmt(cp.value) : 'توصيل مجاني'}</div>
          <div><b class="mono" style="display:inline;font-size:14px">{cp.code}</b><br /><small>{cp.note ?? ''} {cp.min_order_lyd ? `· للطلبات فوق ${fmt(cp.min_order_lyd)}` : ''} {cp.ends_at ? `· حتى ${cp.ends_at.slice(0, 10)}` : ''}</small></div>
          <span>{used ? 'مستخدم' : 'يُطبَّق عند الدفع'}</span></div>
      ); })}
    </div>
  ));
});

// ---------- النقاط ----------
acct.get('/points', async (c) => {
  const u = c.get('user')!;
  const { results } = await c.env.DB.prepare('SELECT l.*,o.code FROM points_ledger l LEFT JOIN orders o ON o.id=l.order_id WHERE l.user_id=? ORDER BY l.id DESC LIMIT 100').bind(u.id).all<any>();
  const s = await loadSettings(c.env.DB);
  return shell(c, 'points', 'نقاطي', (
    <>
      <div class="acct-cards"><div class="acct-card"><b>{u.points}</b><span>رصيد النقاط</span></div><div class="acct-card"><b>{fmt(u.points / 100 * parseFloat(s.points_value_per_100 || '1'))}</b><span>قيمتها عند الدفع</span></div><div class="acct-card"><b>{s.points_max_percent}%</b><span>أقصى نسبة تُدفع بالنقاط</span></div></div>
      <div class="card-box"><h3>كيف تكسبين النقاط؟</h3><ul style="font-size:14px;line-height:1.9"><li>{s.points_per_lyd} نقطة لكل دينار عند تسليم الطلب.</li><li>{s.review_points} نقاط لكل تقييم، و{s.review_photo_points} إن أضفتِ صورة.</li><li>تعويضات فريق الدعم عند أي مشكلة.</li><li>كل 100 نقطة = {s.points_value_per_100} د.ل تُخصم من طلبك التالي.</li></ul></div>
      <div class="card-box"><h3>السجل</h3>{results.length === 0 ? <p style="color:#888">لا حركات بعد.</p> : <table class="tbl"><tr><th>التاريخ</th><th>السبب</th><th>الطلب</th><th>النقاط</th></tr>{results.map(l => <tr><td>{timeAgo(l.created_at)}</td><td>{l.reason}</td><td>{l.code ?? '—'}</td><td style={`font-weight:800;color:${l.delta > 0 ? '#1a9c5b' : '#d3262b'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</td></tr>)}</table>}</div>
    </>
  ));
});

// ---------- العناوين ----------
acct.get('/addresses', async (c) => {
  const u = c.get('user')!;
  const { results } = await c.env.DB.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC').bind(u.id).all<any>();
  return shell(c, 'addresses', 'عناويني', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      <div class="addr-grid">{results.map(a => (
        <div class={`addr ${a.is_default ? 'def' : ''}`}>{a.is_default ? <span class="status green">الافتراضي</span> : null}<b>{a.label || a.name}</b><div>{a.name} · {a.phone}</div><div>{a.city} — {a.address}</div>
          <form method="post" action={`/account/addresses/${a.id}`} class="inline" style="margin-top:8px">{!a.is_default && <button class="btn sm ghost" name="action" value="default">اجعليه الافتراضي</button>}<button class="btn sm ghost" name="action" value="delete" style="color:#d3262b">حذف</button></form></div>
      ))}</div>
      <form method="post" action="/account/addresses/new" class="card-box" style="max-width:560px"><h3>+ عنوان جديد</h3>
        <label>تسمية (بيت/عمل)</label><input type="text" name="label" placeholder="البيت" /><label>الاسم</label><input type="text" name="name" value={u.name} required /><label>الهاتف</label><input type="tel" name="phone" value={u.phone} required />
        <label>المدينة</label><select name="city">{CITIES.map(ct => <option>{ct}</option>)}</select><label>العنوان بالتفصيل</label><textarea name="address" rows={2} required></textarea>
        <label class="radio" style="border:0;padding:6px 0"><input type="checkbox" name="is_default" value="1" /> اجعليه العنوان الافتراضي</label><button class="btn sm">حفظ العنوان</button></form>
    </>
  ));
});
acct.post('/addresses/new', async (c) => {
  const u = c.get('user')!; const db = c.env.DB; const f = await c.req.parseBody();
  const n = await db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id=?').bind(u.id).first<any>();
  const def = f.is_default || n.n === 0 ? 1 : 0;
  if (def) await db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').bind(u.id).run();
  await db.prepare('INSERT INTO addresses(user_id,label,name,phone,city,address,is_default) VALUES(?,?,?,?,?,?,?)').bind(u.id, f.label ? String(f.label) : null, String(f.name), String(f.phone), String(f.city), String(f.address), def).run();
  const back = String(f.next ?? '/account/addresses?ok=1');
  return c.redirect(back.startsWith('/') ? back : '/account/addresses?ok=1');
});
acct.post('/addresses/:id', async (c) => {
  const u = c.get('user')!; const db = c.env.DB; const f = await c.req.parseBody(); const id = Number(c.req.param('id'));
  if (f.action === 'delete') await db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').bind(id, u.id).run();
  else await db.batch([db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').bind(u.id), db.prepare('UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?').bind(id, u.id)]);
  return c.redirect('/account/addresses?ok=1');
});

// ---------- الإشعارات ----------
acct.get('/notifications', async (c) => {
  const u = c.get('user')!; const db = c.env.DB;
  const { results } = await db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(u.id).all<any>();
  c.executionCtx.waitUntil(db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').bind(u.id).run());
  return shell(c, 'notifications', 'الإشعارات', results.length === 0 ? <div class="empty">لا إشعارات</div> : <div class="card-box">{results.map(n => <div class={`notif ${n.read ? '' : 'unread'}`}><a href={n.link ?? '#'}><b>{n.title}</b></a><span>{n.body}</span><small>{timeAgo(n.created_at)}</small></div>)}</div>);
});

// ---------- الملف الشخصي ----------
acct.get('/profile', async (c) => {
  const u = c.get('user')!;
  return shell(c, 'profile', 'بياناتي وكلمة المرور', (
    <div class="two">
      <form method="post" action="/account/profile" class="card-box"><h3>البيانات</h3><Flash msg={c.req.query('ok') === '1' ? 'تم الحفظ ✓' : undefined} />
        <label>الاسم</label><input type="text" name="name" value={u.name} required /><label>البريد (اختياري — للإيصالات)</label><input type="email" name="email" value={u.email ?? ''} /><label>الهاتف</label><input type="tel" value={u.phone} disabled /><small style="color:#888">لتغيير رقم الهاتف تواصلي مع الدعم.</small><br /><button class="btn sm" style="margin-top:10px">حفظ</button></form>
      <form method="post" action="/account/password" class="card-box"><h3>كلمة المرور</h3><Flash msg={c.req.query('ok') === '2' ? 'غُيّرت كلمة المرور ✓' : undefined} type={c.req.query('err') ? 'err' : 'ok'} /><Flash type="err" msg={c.req.query('err') ? 'كلمة المرور الحالية غير صحيحة' : undefined} />
        <label>الحالية</label><input type="password" name="current" required /><label>الجديدة</label><input type="password" name="password" minlength={6} required /><button class="btn sm" style="margin-top:10px">تغيير</button></form>
    </div>
  ));
});
acct.post('/profile', async (c) => { const u = c.get('user')!; const f = await c.req.parseBody(); await c.env.DB.prepare('UPDATE users SET name=?,email=? WHERE id=?').bind(String(f.name).trim().slice(0, 60), f.email ? String(f.email) : null, u.id).run(); return c.redirect('/account/profile?ok=1'); });
acct.post('/password', async (c) => {
  const u = c.get('user')!; const f = await c.req.parseBody();
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(u.id).first<any>();
  if (!(await verifyPassword(String(f.current), row.password_hash))) return c.redirect('/account/profile?err=1');
  await c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(String(f.password)), u.id).run();
  return c.redirect('/account/profile?ok=2');
});

// ---------- إلغاء طلب قبل الدفع ----------
acct.post('/orders/:code/cancel', async (c) => {
  const u = c.get('user')!; const f = await c.req.parseBody();
  const o = await c.env.DB.prepare("SELECT id,status FROM orders WHERE code=? AND user_id=?").bind(c.req.param('code'), u.id).first<any>();
  if (!o) return c.notFound();
  if (o.status !== 'pending_payment') return c.redirect(`/orders/${c.req.param('code')}?err=cancel`);
  await c.env.DB.prepare('UPDATE orders SET cancel_reason=? WHERE id=?').bind(f.reason ? String(f.reason) : 'إلغاء من الزبونة', o.id).run();
  await setOrderStatus(c.env.DB, c.req.param('code'), 'cancelled', u.id, 'إلغاء من الزبونة قبل الدفع');
  return c.redirect(`/orders/${c.req.param('code')}`);
});

export default acct;
