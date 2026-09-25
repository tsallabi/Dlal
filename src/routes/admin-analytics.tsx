// «حركة الزوار»: من زار، من أين، ماذا شاهد، أين تعثّر، ومن ترك سلته أو طلبه بلا دفع — لنتابعه بتذكير أو إعلان.
import { Hono } from 'hono';
import type { Env } from '../types';
import { shell } from './admin-ops';
import { Flash } from '../views/layout';
import { fmt, timeAgo, notify } from '../lib/db';
import { requireRole } from '../lib/auth';
import { requirePerm, logActivity } from '../lib/perm';
import { cityAr, countryAr } from '../lib/track';

const an = new Hono<Env>();
an.use('*', requireRole('admin'));
an.use('/analytics*', requirePerm('reports.view'));

const PERIODS: Record<string, [string, string]> = { day: ['-1 day', 'آخر 24 ساعة'], week: ['-7 days', 'آخر 7 أيام'], month: ['-30 days', 'آخر 30 يومًا'] };
const KIND_AR: Record<string, string> = { view: 'صفحة', product: 'منتج', category: 'قسم', search: 'بحث', cart_view: 'السلة', cart: 'أضاف للسلة', checkout: 'صفحة الدفع', purchase: 'دفع ✓', error: 'مشكلة' };
// رقم ليبي 09… ⟵ 2189… لرابط واتساب مع رسالة جاهزة
const wa = (phone: string, text: string) => { const d = String(phone).replace(/\D/g, '').replace(/^0/, '218'); return `https://wa.me/${d}?text=${encodeURIComponent(text)}`; };

const Bars = ({ rows, unit = '' }: { rows: { l: string; n: number; href?: string; sub?: string }[]; unit?: string }) => {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.length === 0 ? <p class="pd-note">لا بيانات في هذه الفترة بعد.</p> : (
    <div class="pd-bars">{rows.map(r => (
      <a class="pd-bar an-bar" href={r.href ?? '#'} title={`${r.l}: ${r.n}${unit}`}>
        <span class="pd-bl">{r.l}{r.sub && <small> {r.sub}</small>}</span>
        <span class="pd-bt"><i style={`width:${r.n ? Math.max(3, Math.round(r.n / max * 100)) : 0}%`}></i></span><b>{r.n}</b>
      </a>))}</div>);
};

an.get('/analytics', async (c) => {
  const db = c.env.DB;
  const per = PERIODS[c.req.query('p') ?? ''] ? c.req.query('p')! : 'week';
  const [since, perAr] = PERIODS[per];
  const T = `created_at >= datetime('now','${since}')`;
  const q = (sql: string) => db.prepare(sql);
  const [tot, funnel, orders, countries, cities, cats, prods, searches, zero, errs, recent, abandoned, unpaid, unpaidN] = await db.batch([
    q(`SELECT COUNT(DISTINCT vid) v, COUNT(*) pv, COUNT(DISTINCT user_id) u, COUNT(DISTINCT CASE WHEN device='m' THEN vid END) m FROM visits WHERE ${T}`),
    q(`SELECT COUNT(DISTINCT CASE WHEN kind='product' THEN vid END) prod, COUNT(DISTINCT CASE WHEN kind='cart' THEN vid END) cart, COUNT(DISTINCT CASE WHEN kind='checkout' THEN vid END) chk FROM visits WHERE ${T}`),
    q(`SELECT COUNT(DISTINCT user_id) made, COUNT(DISTINCT CASE WHEN paid_at IS NOT NULL THEN user_id END) paid, COUNT(*) n, COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN total_lyd END),0) v FROM orders WHERE ${T}`),
    q(`SELECT country k, COUNT(DISTINCT vid) n FROM visits WHERE ${T} GROUP BY country ORDER BY n DESC LIMIT 8`),
    q(`SELECT city k, country, COUNT(DISTINCT vid) n FROM visits WHERE ${T} GROUP BY city, country ORDER BY n DESC LIMIT 10`),
    q(`SELECT v.ref k, c.name_ar t, COUNT(DISTINCT v.vid) n FROM visits v LEFT JOIN categories c ON c.slug=v.ref WHERE v.kind='category' AND v.${T} GROUP BY v.ref ORDER BY n DESC LIMIT 10`),
    q(`SELECT v.ref k, p.title_ar t, COUNT(DISTINCT v.vid) n, SUM(v.kind='cart') carts FROM visits v LEFT JOIN products p ON p.slug=v.ref WHERE v.kind IN ('product','cart') AND v.${T} GROUP BY v.ref ORDER BY n DESC LIMIT 10`),
    q(`SELECT lower(ref) k, COUNT(*) n, MIN(n) res FROM visits WHERE kind='search' AND ref<>'' AND ${T} GROUP BY lower(ref) ORDER BY n DESC LIMIT 12`),
    q(`SELECT lower(ref) k, COUNT(*) n FROM visits WHERE kind='search' AND n=0 AND ref<>'' AND ${T} GROUP BY lower(ref) ORDER BY n DESC LIMIT 12`),
    q(`SELECT ref k, COUNT(*) n, COUNT(DISTINCT vid) who, MAX(created_at) last, MAX(path) path FROM visits WHERE kind='error' AND ${T} GROUP BY ref, CASE WHEN ref LIKE 'صفحة%' THEN path ELSE '' END ORDER BY n DESC LIMIT 15`),
    q(`SELECT a.*, u.name FROM (SELECT v.vid, MAX(v.user_id) uid, MAX(v.city) city, MAX(v.country) country, MAX(v.device) device, COUNT(*) pages,
        MAX(v.created_at) last, SUM(v.kind='cart') carts, SUM(v.kind='checkout') chk, SUM(v.kind='purchase') paid, SUM(v.kind='error') errs
       FROM visits v WHERE v.${T} GROUP BY v.vid ORDER BY last DESC LIMIT 40) a LEFT JOIN users u ON u.id=a.uid ORDER BY a.last DESC`),
    // سلال متروكة: زبونة في سلتها بضاعة ولم تطلب بعد آخر مرة أضافت فيها
    q(`SELECT u.id,u.name,u.phone,u.city,COUNT(ci.id) items,COALESCE(SUM(ci.qty*p.price_lyd),0) val,
         (SELECT MAX(created_at) FROM visits WHERE user_id=u.id AND kind='cart') last_add,
         (SELECT MAX(created_at) FROM notifications WHERE user_id=u.id AND title LIKE 'سلتك%') reminded
       FROM cart_items ci JOIN users u ON u.id=ci.user_id JOIN products p ON p.id=ci.product_id
       WHERE u.role='customer' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.created_at > COALESCE((SELECT MAX(created_at) FROM visits WHERE user_id=u.id AND kind='cart'),'2000-01-01'))
       GROUP BY u.id ORDER BY last_add DESC NULLS LAST, u.id DESC LIMIT 50`),
    // بدأت الدفع ولم تُكمله: طلب بانتظار الدفع منذ نصف ساعة فأكثر
    q(`SELECT o.code,o.total_lyd,o.created_at,o.payment_method,u.id uid,u.name,u.phone,o.ship_city,
         (SELECT MAX(created_at) FROM notifications WHERE user_id=u.id AND body LIKE '%' || o.code || '%') reminded
       FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status='pending_payment' AND o.created_at < datetime('now','-30 minutes') ORDER BY o.id DESC LIMIT 30`),
    q("SELECT COUNT(*) n FROM orders WHERE status='pending_payment' AND created_at < datetime('now','-30 minutes')"),
  ]);
  const r0 = (x: any) => (x.results[0] ?? {}) as any;
  const t = r0(tot), f = r0(funnel), o = r0(orders);
  const pct = (a: number, b: number) => (b ? `${Math.round(a / b * 100)}%` : '—');
  const steps = [
    { l: 'زاروا الموقع', n: t.v ?? 0 }, { l: 'شاهدوا منتجًا', n: f.prod ?? 0 }, { l: 'أضافوا للسلة', n: f.cart ?? 0 },
    { l: 'فتحوا صفحة الدفع', n: f.chk ?? 0 }, { l: 'أنشؤوا طلبًا', n: o.made ?? 0 }, { l: 'دفعوا', n: o.paid ?? 0 },
  ];
  const tabs = Object.entries(PERIODS).map(([k, [, ar]]) => <a class={`btn sm ${k === per ? 'brand' : 'ghost'}`} href={`/admin/analytics?p=${k}`}>{ar}</a>);
  const ab = abandoned.results as any[], up = unpaid.results as any[]; const upN = r0(unpaidN).n ?? up.length;
  return shell(c, 'analytics', 'حركة الزوار', (
    <div class="pd an">
      <Flash msg={c.req.query('ok') ? 'أُرسل التذكير ✓' : undefined} />
      <div class="inline" style="gap:6px">{tabs}<small style="color:#888;margin-inline-start:8px">الروبوتات وحسابات الموظفين والشركاء لا تُحسب.</small></div>
      <div class="pd-tiles">
        <a class="pd-tile"><i class="pd-ic">👣</i><b>{t.v ?? 0}</b><span>زائر</span><small>{t.pv ?? 0} صفحة · {pct(t.m ?? 0, t.v ?? 0)} من الجوال</small></a>
        <a class="pd-tile"><i class="pd-ic">👤</i><b>{t.u ?? 0}</b><span>زبونة مسجّلة زارت</span></a>
        <a class="pd-tile" href="#abandoned"><i class="pd-ic">🛒</i><b>{ab.length}</b><span>سلة متروكة</span><small>بضاعة في السلة بلا طلب</small></a>
        <a class="pd-tile warn" href="#unpaid"><i class="pd-ic">💳</i><b>{upN}</b><span>بدأت الدفع ولم تُكمله</span><small>طلب بانتظار الدفع</small></a>
        <a class="pd-tile ok"><i class="pd-ic">✅</i><b>{o.paid ?? 0}</b><span>اشترت ودفعت</span><small>{fmt(o.v ?? 0)} في {perAr}</small></a>
        <a class={`pd-tile ${(errs.results.length) ? 'bad' : ''}`} href="#errors"><i class="pd-ic">⚠️</i><b>{(errs.results as any[]).reduce((a, e) => a + e.n, 0)}</b><span>مشكلة واجهت الزوار</span><small>صفحات مفقودة وأخطاء</small></a>
      </div>

      <div class="pd-grid">
        <div class="card-box"><h3>🛒 مسار الشراء — {perAr}</h3>
          <div class="pd-bars">{steps.map((s, i) => (
            <div class="pd-bar an-fun" title={`${s.l}: ${s.n}`}><span class="pd-bl">{s.l}</span><span class="pd-bt"><i style={`width:${s.n ? Math.min(100, Math.max(3, Math.round(s.n / Math.max(1, steps[0].n) * 100))) : 0}%`}></i></span><b>{s.n}</b>
              {i > 0 && <small class="an-conv">{pct(s.n, steps[i - 1].n)} من السابقة</small>}</div>))}</div>
          <p class="pd-note">كل خطوة تُعدّ زوّارًا مختلفين لا زيارات. «أنشؤوا طلبًا» و«دفعوا» من الطلبات نفسها.</p>
        </div>
        <div class="card-box"><h3>🌍 من أين يزوروننا</h3>
          <Bars rows={(countries.results as any[]).map(r => ({ l: countryAr(r.k), n: r.n }))} />
          <h4 style="margin:12px 0 6px">المدن</h4>
          <Bars rows={(cities.results as any[]).map(r => ({ l: cityAr(r.k), sub: r.country && r.country !== 'LY' ? `(${countryAr(r.country)})` : '', n: r.n }))} />
        </div>
      </div>

      <div class="pd-grid">
        <div class="card-box"><h3>❤ اهتماماتهم: الأقسام</h3><Bars rows={(cats.results as any[]).map(r => ({ l: r.t ?? r.k, n: r.n, href: `/c/${r.k}` }))} /></div>
        <div class="card-box"><h3>👀 أكثر المنتجات مشاهدة</h3><Bars rows={(prods.results as any[]).map(r => ({ l: String(r.t ?? r.k).slice(0, 48), sub: r.carts ? `· 🛒${r.carts}` : '', n: r.n, href: `/p/${r.k}` }))} /></div>
      </div>

      <div class="pd-grid">
        <div class="card-box"><h3>🔎 ماذا يبحثون عنه</h3><Bars rows={(searches.results as any[]).map(r => ({ l: r.k, sub: r.res === 0 ? '· بلا نتائج' : '', n: r.n, href: `/search?q=${encodeURIComponent(r.k)}` }))} /></div>
        <div class="card-box"><h3>🚫 بحثوا ولم يجدوا — بضاعة مطلوبة لا نملكها</h3><Bars rows={(zero.results as any[]).map(r => ({ l: r.k, n: r.n, href: `/search?q=${encodeURIComponent(r.k)}` }))} /></div>
      </div>

      <div class="card-box" id="errors"><h3>⚠ مشاكل واجهت الزوار</h3>
        {errs.results.length === 0 ? <p class="pd-empty">لا مشاكل مسجّلة في هذه الفترة ✓</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>المشكلة</th><th>الصفحة</th><th>مرات</th><th>زوار</th><th>آخرها</th></tr>
            {(errs.results as any[]).map(e => <tr><td>{e.k}</td><td dir="ltr"><a href={e.path}>{e.path}</a></td><td>{e.n}</td><td>{e.who}</td><td>{timeAgo(e.last)}</td></tr>)}</table></div>}
      </div>

      <div class="card-box" id="abandoned"><h3>🛒 سلال متروكة ({ab.length}) — ذكّرهم</h3>
        <p class="pd-note" style="margin-top:0">زبونات في سلتهن بضاعة ولم يطلبن بعد آخر إضافة. «إشعار» يظهر لها في الموقع، و«واتساب» يفتح محادثة برسالة جاهزة. ولإعلانات ميتا: البكسل يسجّل AddToCart وPurchase — أنشئ جمهورًا مخصّصًا «أضافوا للسلة ولم يشتروا خلال 7 أيام».</p>
        {ab.length === 0 ? <p class="pd-empty">لا سلال متروكة.</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الزبونة</th><th>المدينة</th><th>في السلة</th><th>القيمة</th><th>آخر إضافة</th><th>تذكير</th></tr>
            {ab.map(r => <tr><td><a href={`/admin/customers/${r.id}`}>{r.name}</a><br /><small dir="ltr">{r.phone}</small></td><td>{r.city ?? '—'}</td><td>{r.items} منتج</td><td>{fmt(r.val)}</td><td>{r.last_add ? timeAgo(r.last_add) : '—'}</td>
              <td class="inline" style="gap:4px"><form method="post" action={`/admin/analytics/remind/${r.id}`}><button class="btn sm ghost">إشعار</button></form>
                <a class="btn sm ok" target="_blank" rel="noopener" href={wa(r.phone, `مرحبًا ${r.name} 👋 في سلتك على هدهد ${r.items} منتج بانتظارك بقيمة ${fmt(r.val)}. أكملي طلبك الآن ليصلك بسرعة: https://hudhude.com/cart`)}>واتساب</a>
                {r.reminded && <small>ذُكّرت {timeAgo(r.reminded)}</small>}</td></tr>)}</table></div>}
      </div>

      <div class="card-box" id="unpaid"><h3>💳 بدأت الدفع ولم تُكمله ({upN}){upN > up.length ? ` — الأحدث ${up.length}` : ''}</h3>
        {up.length === 0 ? <p class="pd-empty">لا طلبات معلّقة.</p> :
          <div class="tbl-wrap"><table class="tbl"><tr><th>الطلب</th><th>الزبونة</th><th>المبلغ</th><th>الطريقة</th><th>منذ</th><th>تذكير</th></tr>
            {up.map(r => <tr><td><a href={`/admin/orders/${r.code}`}>{r.code}</a></td><td>{r.name}<br /><small dir="ltr">{r.phone}</small></td><td>{fmt(r.total_lyd)}</td><td>{r.payment_method}</td><td>{timeAgo(r.created_at)}</td>
              <td class="inline" style="gap:4px"><form method="post" action={`/admin/analytics/remind/${r.uid}?order=${r.code}`}><button class="btn sm ghost">إشعار</button></form>
                <a class="btn sm ok" target="_blank" rel="noopener" href={wa(r.phone, `مرحبًا ${r.name} 👋 طلبك ${r.code} على هدهد بقيمة ${fmt(r.total_lyd)} ينتظر الدفع. ادفعي الآن ليبدأ شراؤه من الصين فورًا: https://hudhude.com/orders/${r.code}`)}>واتساب</a>
                {r.reminded && <small>ذُكّرت {timeAgo(r.reminded)}</small>}</td></tr>)}</table></div>}
      </div>

      <div class="card-box"><h3>👣 آخر الزوار</h3>
        <div class="tbl-wrap"><table class="tbl"><tr><th>الزائر</th><th>من</th><th>الجهاز</th><th>صفحات</th><th>أبعد خطوة</th><th>آخر نشاط</th></tr>
          {(recent.results as any[]).map(v => <tr><td><a href={`/admin/analytics/v/${v.vid}`}>{v.name ?? 'زائر'}</a></td><td>{cityAr(v.city)} · {countryAr(v.country)}</td><td>{v.device === 'm' ? '📱' : '💻'}</td><td>{v.pages}</td>
            <td>{v.paid ? <span class="status green">دفع</span> : v.chk ? <span class="status gray">صفحة الدفع</span> : v.carts ? <span class="status gray">أضاف للسلة</span> : 'تصفّح'}{v.errs ? <small class="pd-red"> · {v.errs} مشكلة</small> : null}</td><td>{timeAgo(v.last)}</td></tr>)}
        </table></div>
      </div>
    </div>
  ));
});

// مسار زائر واحد: كل صفحة فتحها بالترتيب
an.get('/analytics/v/:vid', async (c) => {
  const vid = c.req.param('vid');
  const { results } = await c.env.DB.prepare('SELECT v.*,u.name,u.phone FROM visits v LEFT JOIN users u ON u.id=v.user_id WHERE v.vid=? ORDER BY v.id DESC LIMIT 300').bind(vid).all<any>();
  const who = results.find(r => r.name);
  return shell(c, 'analytics', `مسار زائر${who ? ': ' + who.name : ''}`, (
    <div class="card-box">
      <p><a href="/admin/analytics">← حركة الزوار</a>{who && <> · <a href={`/admin/customers/${who.user_id}`}>ملف الزبونة</a> · <span dir="ltr">{who.phone}</span></>} · {results[0] ? `${cityAr(results[0].city)} · ${countryAr(results[0].country)} · ${results[0].device === 'm' ? 'جوال' : 'حاسوب'}` : ''}</p>
      <div class="tbl-wrap"><table class="tbl"><tr><th>الوقت</th><th>الحدث</th><th>الصفحة</th><th>تفاصيل</th></tr>
        {results.map(r => <tr class={r.kind === 'error' ? 'pd-near' : ''}><td>{timeAgo(r.created_at)}</td><td>{KIND_AR[r.kind] ?? r.kind}</td><td dir="ltr"><a href={r.path}>{r.path}</a></td><td>{r.ref ?? ''}{r.kind === 'search' && r.n !== null ? ` · ${r.n} نتيجة` : ''}</td></tr>)}
      </table></div>
    </div>
  ));
});

// تذكير داخل الموقع (جرس الإشعارات): للسلة المتروكة أو لطلب ينتظر الدفع
an.post('/analytics/remind/:uid', async (c) => {
  const db = c.env.DB; const uid = Number(c.req.param('uid')); const order = c.req.query('order');
  if (order && /^DL-[\d-]+$/.test(order)) await notify(db, uid, 'طلبك ينتظر الدفع ⏳', `طلبك ${order} جاهز — ادفعي الآن ليبدأ شراؤه من الصين فورًا ويصلك بسرعة.`, `/orders/${order}`);
  else await notify(db, uid, 'سلتك تنتظرك 🛒', 'في سلتك بضاعة بانتظارك. أكملي طلبك الآن ليصلك بسرعة — الكميات عند المورد تنفد.', '/cart');
  await logActivity(db, c.get('user')!.id, 'analytics.remind', String(uid), order ?? 'cart');
  return c.redirect('/admin/analytics?ok=1' + (order ? '#unpaid' : '#abandoned'));
});

export default an;
