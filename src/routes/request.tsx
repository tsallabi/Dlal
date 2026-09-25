// صفحة «اطلبي برابط» للزبونة: تلصق رابط أي منتج، وتتابع حالته، ويصلها إشعار حين يصير على الرف.
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { Layout, Flash } from '../views/layout';
import { Ic } from '../views/icons';
import { getCategories, timeAgo } from '../lib/db';
import { parseLink, settleLinkRequests, LINK_SOURCES, LINK_STATUS } from '../lib/link-requests';

const req = new Hono<Env>();
const OPEN_MAX = 10;   // طلبات مفتوحة للزبونة الواحدة في وقت واحد

const base = async (c: Context<Env>) => {
  const u = c.get('user');
  const w = u ? await c.env.DB.prepare('SELECT COUNT(*) n FROM wishlist WHERE user_id=?').bind(u.id).first<{ n: number }>() : null;
  return { user: u, cartCount: c.get('cartCount'), wishCount: w?.n ?? 0, categories: await getCategories(c.env.DB) };
};

req.get('/', async (c) => {
  const u = c.get('user'); const db = c.env.DB;
  if (u) await settleLinkRequests(db);
  const mine = u ? (await db.prepare(`SELECT r.*,p.slug,p.title_ar,p.price_lyd FROM link_requests r LEFT JOIN products p ON p.id=r.product_id
     WHERE r.user_id=? ORDER BY r.id DESC LIMIT 50`).bind(u.id).all<any>()).results : [];
  const err = c.req.query('err'); const ok = c.req.query('ok');
  return c.html(
    <Layout {...await base(c)} title="اطلب برابط" active="/request">
      <div class="lr wrap">
        <h1><Ic n="link" s={26} /> اطلب أي منتج برابط</h1>
        <p class="lr-sub">رأيت قطعة في <b>1688</b> أو <b>تاوباو</b> أو <b>شي إن</b> أو <b>أمازون</b> وليست عندنا؟ الصق رابطها هنا، ونوفّرها لك بسعر نهائي <b>بالدينار الليبي</b> شامل الشحن والجمارك — تدفع بعد أن ترى السعر، لا قبله.</p>
        <Flash msg={ok ? 'وصلنا طلبك ✓ — نجهّزه ويصلك إشعار حين يصير جاهزًا للشراء.' : undefined} />
        <Flash type="err" msg={err || undefined} />
        {u ? (
          <form method="post" action="/request" class="lr-form">
            <label for="lr-url">رابط المنتج</label>
            <textarea id="lr-url" name="url" rows={2} dir="ltr" required placeholder="https://detail.1688.com/offer/…  أو الصق نص المشاركة كما هو"></textarea>
            <label for="lr-note">المقاس واللون والكمية (اختياري)</label>
            <input id="lr-note" type="text" name="note" maxlength={300} placeholder="مثلًا: مقاس M، اللون الأسود، قطعتان" />
            <button class="btn brand" type="submit">أرسل الطلب</button>
          </form>
        ) : (
          <p class="lr-login"><a class="btn brand" href="/login?next=%2Frequest">سجّل الدخول لإرسال رابط</a> — نحتاج رقمك لنخبرك حين يصير المنتج جاهزًا.</p>
        )}
        <ol class="lr-steps">
          <li><b>تلصق الرابط</b> من التطبيق أو الموقع كما هو.</li>
          <li><b>نجهّز المنتج</b>: روابط 1688 تصير منتجًا في المتجر خلال ساعات غالبًا، وغيرها يسعّره فريقنا.</li>
          <li><b>يصلك إشعار</b> بصفحة المنتج وسعره النهائي، فتشتريه كأي منتج — بالشحن الجوي أو البحري.</li>
        </ol>
        {u && (
          <>
            <h2>طلباتي بالرابط</h2>
            {mine.length === 0 ? <p class="lr-empty">لا طلبات بعد.</p> : (
              <div class="lr-list">
                {mine.map((r: any) => (
                  <div class={`lr-row st-${r.status}`}>
                    <div><span class={`status ${LINK_STATUS[r.status]?.[1] ?? 'gray'}`}>{LINK_STATUS[r.status]?.[0] ?? r.status}</span> <small>{LINK_SOURCES[r.source] ?? r.source} · {timeAgo(r.created_at)}</small></div>
                    {r.status === 'ready' && r.slug ? <a class="lr-go" href={`/p/${r.slug}`}>{String(r.title_ar).slice(0, 70)} — اشترِه الآن ←</a> : null}
                    {r.note && <small class="lr-note">ملاحظتك: {r.note}</small>}
                    {r.admin_note && <small class="lr-why">{r.admin_note}</small>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>,
  );
});

req.post('/', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login?next=%2Frequest');
  const db = c.env.DB; const f = await c.req.parseBody();
  const back = (msg: string) => c.redirect('/request?err=' + encodeURIComponent(msg));
  const link = parseLink(String(f.url ?? ''));
  if (!link) return back('لم نجد رابطًا في ما لصقته. انسخ رابط صفحة المنتج (يبدأ بـ https://).');
  if (/(^|\.)hudhude\.com$|workers\.dev$/.test(new URL(link.url).hostname)) return back('هذا رابط من هدهد نفسه — المنتج عندنا، افتحه واشترِه مباشرة.');
  // المنتج عندنا أصلًا: لا انتظار
  if (link.offerId) {
    const p = await db.prepare("SELECT slug,status FROM products WHERE source='1688' AND source_offer_id=?").bind(link.offerId).first<{ slug: string; status: string }>();
    if (p?.status === 'active') return c.redirect(`/p/${p.slug}?have=1`);
  }
  const open = (await db.prepare("SELECT COUNT(*) n FROM link_requests WHERE user_id=? AND status='new'").bind(u.id).first<{ n: number }>())?.n ?? 0;
  if (open >= OPEN_MAX) return back(`لديك ${open} طلبات قيد التجهيز — انتظر حتى يجهز بعضها ثم أرسل المزيد.`);
  const dup = await db.prepare("SELECT id FROM link_requests WHERE user_id=? AND status='new' AND (url=? OR (offer_id IS NOT NULL AND offer_id=?))").bind(u.id, link.url, link.offerId).first();
  if (dup) return back('أرسلت هذا الرابط من قبل وهو قيد التجهيز.');
  await db.prepare('INSERT INTO link_requests(user_id,url,source,offer_id,note) VALUES(?,?,?,?,?)')
    .bind(u.id, link.url, link.source, link.offerId, String(f.note ?? '').trim().slice(0, 300) || null).run();
  // رابط 1688: يتصدّر طابور الاكتشاف فتفتحه الإضافة في دفعتها التالية وتستورده من صفحته بلا حساب ولا كريدت
  if (link.offerId) await db.prepare(`INSERT INTO discovered_offers(offer_id,from_offer,status,tries) VALUES(?,'request','new',0)
     ON CONFLICT(offer_id) DO UPDATE SET from_offer='request',status=CASE WHEN status='imported' THEN status ELSE 'new' END,tries=0`).bind(link.offerId).run();
  await settleLinkRequests(db);
  return c.redirect('/request?ok=1');
});

export default req;
