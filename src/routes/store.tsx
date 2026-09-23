import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS, CITIES } from '../types';
import { Layout, Flash } from '../views/layout';
import { Grid, ProductCard } from '../views/product-card';
import { Stars } from '../views/account';
import { getCategories, PRODUCT_SELECT, fmt, imgUrl, orderCode, timeAgo, notify } from '../lib/db';
import type { ProductRow } from '../lib/db';
import { KIND_NOTE, type ListingKind } from '../lib/source';
import { loadSettings, computePrice, shipRates, seaOn } from '../lib/pricing';
import type { ShipMode, Settings } from '../lib/pricing';
import { checkCoupon } from '../lib/coupons';
import { loadMyPay } from '../lib/mypay';

const store = new Hono<Env>();

async function favs(c: Context<Env>): Promise<Set<number>> {
  const u = c.get('user');
  if (!u) return new Set();
  const { results } = await c.env.DB.prepare('SELECT product_id FROM wishlist WHERE user_id=?').bind(u.id).all();
  return new Set(results.map((r: any) => r.product_id));
}

const base = async (c: Context<Env>) => {
  const u = c.get('user');
  const w = u ? await c.env.DB.prepare('SELECT COUNT(*) n FROM wishlist WHERE user_id=?').bind(u.id).first<{ n: number }>() : null;
  const st = await loadSettings(c.env.DB);
  const mode = shipMode(c);
  // سياق الشحن يمرّ مع كل صفحة: البطاقة تعرض سعر الطريقة المختارة ومدّتها من الإعدادات لا من نص ثابت
  const ship = { mode, air: st.air_days || '١٢ — ١٨ يومًا', sea: st.sea_days || '٣٠ — ٤٥ يومًا', seaOn: seaOn(st) };
  return { user: u, cartCount: c.get('cartCount'), wishCount: w?.n ?? 0, categories: await getCategories(c.env.DB), ship };
};

// ---------- الرئيسية: بانر ترويجي + بلاطات أقسام دائرية + بطاقتا عروض + شبكة منتجات ----------
store.get('/', async (c) => {
  const db = c.env.DB; const u = c.get('user');
  const b = await base(c);
  // حشمة: الرئيسية من الأقسام العامة فقط؛ الملابس الداخلية والنوم تبقى في قائمة الأقسام تدخلها الزبونة بنفسها
  const publicCats = b.categories.filter(x => x.show_home !== 0);
  const PUB = "p.status='active' AND p.home_ok=1 AND p.in_stock=1";
  const [banner, cheap, trend, feed, tiles, f, stats] = await Promise.all([
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${PUB} AND p.compare_price_lyd > p.price_lyd ORDER BY (p.compare_price_lyd-p.price_lyd)/p.compare_price_lyd DESC LIMIT 4`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${PUB} ORDER BY p.price_lyd ASC LIMIT 3`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${PUB} ORDER BY p.sales DESC, p.views DESC LIMIT 3`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${PUB} ORDER BY (p.sales*8 + p.views) DESC, p.id DESC LIMIT 40`).all<ProductRow>(),
    // صورة حقيقية لكل قسم من أكثر منتجاته مبيعًا — أقرب لشكل البلاطات الدائرية
    db.prepare(`SELECT c.id,c.slug,c.name_ar,c.icon,
        (SELECT i.url FROM products p2 JOIN product_images i ON i.product_id=p2.id
         WHERE p2.category_id=c.id AND p2.status='active' AND p2.home_ok=1 ORDER BY p2.sales DESC, i.sort LIMIT 1) AS img
      FROM categories c WHERE c.show_home=1 ORDER BY c.sort,c.id`).all<any>(),
    favs(c),
    db.prepare("SELECT (SELECT COUNT(*) FROM products WHERE status='active') p,(SELECT COUNT(*) FROM orders WHERE status='delivered') d,(SELECT COUNT(*) FROM users WHERE role='customer') u").first<any>(),
  ]);
  const recent = await recentlyViewed(c);
  const s = await loadSettings(db);
  const seaSaving = banner.results.find(p => p.price_sea_lyd && p.price_sea_lyd < p.price_lyd);
  // طوابق الأقسام: ستة أقسام يظهر لكل منها ثمانية منتجات في شريط أفقي، فالكتالوج الكبير يُتصفَّح لا يُبحث فيه فقط
  const floorCats = tiles.results.filter((x: any) => x.img).slice(0, 6);
  const floors = await Promise.all(floorCats.map(async (ct: any) => ({
    cat: ct,
    items: (await db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id
        WHERE ${PUB} AND p.category_id=? ORDER BY (p.sales*8+p.views) DESC, p.id DESC LIMIT 8`).bind(ct.id).all<ProductRow>()).results,
  })));
  return c.html(
    <Layout {...b}>
      {/* بانر ترويجي عريض: عنوان + منتجات بأسعارها */}
      <section class="promo-hero">
        <div class="ph-side">
          <span class="ph-tag">عروض</span>
          <h1>أسعار نهائية<br />بالدينار الليبي</h1>
          <p>شاملة الشحن والجمارك — لا مفاجآت عند الاستلام</p>
          <a class="ph-cta" href="/sale">تسوقي العروض ›</a>
        </div>
        <div class="ph-items">
          {banner.results.map(p => (
            <a href={`/p/${p.slug}`} class="ph-item">
              <img src={imgUrl(p.image)} alt={p.title_ar} loading="lazy" referrerpolicy="no-referrer" />
              <span class="ph-price">{fmt(p.price_lyd)}</span>
            </a>
          ))}
        </div>
      </section>

      {/* بلاطات الأقسام الدائرية */}
      <section class="tiles-wrap">
        <button type="button" class="tiles-arrow" data-tiles="-1" aria-label="السابق">‹</button>
        <div class="tiles" id="catTiles">
          {tiles.results.map((t: any) => (
            <a href={`/c/${t.slug}`} class="tile">
              <span class="tp">{t.img ? <img src={imgUrl(t.img)} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <i>{t.icon}</i>}</span>
              <span class="tl">{t.name_ar}</span>
            </a>
          ))}
          <a href="/sale" class="tile"><span class="tp sale"><i>%</i></span><span class="tl">عروض وتخفيضات</span></a>
          <a href="/new" class="tile"><span class="tp"><i>🆕</i></span><span class="tl">وصل حديثًا</span></a>
        </div>
        <button type="button" class="tiles-arrow" data-tiles="1" aria-label="التالي">›</button>
      </section>

      {/* شريط الفلاش */}
      <div class="flash-sale">
        ⚡ <b>عروض اليوم</b> تنتهي خلال <span class="timer" data-countdown="6h">06:00:00</span>
        <a href="/sale" style="margin-inline-start:auto;color:#ffcf3f">عرض الكل ›</a>
      </div>

      {/* بطاقتا عروض جنبًا إلى جنب */}
      <div class="duo">
        <a class="duo-card" href="/c/all?sort=price_asc">
          <div class="dc-h"><b style="color:#0b8a4b">أرخص الأسعار</b><span>›</span></div>
          <div class="dc-items">{cheap.results.map(p => (
            <div class="dc-item"><img src={imgUrl(p.image)} alt={p.title_ar} loading="lazy" referrerpolicy="no-referrer" /><b>{fmt(p.price_lyd)}</b></div>
          ))}</div>
        </a>
        <a class="duo-card" href="/trending">
          <div class="dc-h"><b style="color:#7a3fc4">الأكثر رواجًا</b><span>›</span></div>
          <div class="dc-items">{trend.results.map(p => (
            <div class="dc-item"><img src={imgUrl(p.image)} alt={p.title_ar} loading="lazy" referrerpolicy="no-referrer" /><b>{fmt(p.price_lyd)}</b></div>
          ))}</div>
        </a>
      </div>

      {/* شريط الثقة */}
      <section class="trust">
        <div><b>🚚 الشحن مشمول</b><span>جوي {s.air_days || '١٢ — ١٨ يومًا'}{seaOn(s) ? ` · بحري ${s.sea_days || '٣٠ — ٤٥ يومًا'} وأرخص` : ''}</span></div>
        <div><b>🔍 فحص قبل الشحن</b><span>نفتح كل طرد ونصوّره لك</span></div>
        <div><b>↩️ تعويض كامل</b><span>لأي تالف أو مختلف عن الوصف</span></div>
        <div><b>💳 ادفعي بالدينار</b><span>بطاقة · سداد · إدفعلي · كاش في الفرع</span></div>
      </section>

      {/* الشبكة الرئيسية */}
      <div class="feed-h"><h2>اختيارات لك</h2></div>
      <Grid ship={b.ship} items={feed.results} favs={f} />
      <a class="more-btn" href="/trending">عرض المزيد</a>

      {/* طوابق الأقسام */}
      {floors.filter(fl => fl.items.length >= 4).map(fl => (
        <section class="floor">
          <div class="feed-h"><h2>{fl.cat.icon} {fl.cat.name_ar}</h2><a class="all" href={`/c/${fl.cat.slug}`}>عرض القسم ›</a></div>
          <div class="floor-row">{fl.items.map(p => <ProductCard p={p} fav={f.has(p.id)} ship={b.ship} />)}</div>
        </section>
      ))}

      {recent.length > 0 && <><div class="feed-h"><h2>شاهدتِ مؤخرًا</h2></div><Grid ship={b.ship} items={recent} favs={f} /></>}

      <section class="why">
        <div><b>🏭 مباشرة من مصانع الصين</b><span>نشتري بأسعار الجملة ونبيع بالقطعة.</span></div>
        <div><b>🔢 {stats?.p ?? 0} منتج</b><span>يزداد كل يوم بمنتجات جديدة.</span></div>
        <div><b>📦 {stats?.d ?? 0} طلب مُسلَّم</b><span>إلى كل المدن الليبية.</span></div>
        <div><b>🤝 واتساب {s.whatsapp_number ? '+' + s.whatsapp_number : ''}</b><span>فريق دعم يرد خلال ساعات العمل.</span></div>
      </section>
    </Layout>,
  );
});

// المشاهدات الأخيرة: كوكي للزائرة + جدول للمسجلة
async function recentlyViewed(c: Context<Env>, exclude?: number): Promise<ProductRow[]> {
  const ids = (getCookie(c, 'rv') ?? '').split(',').map(Number).filter(n => n && n !== exclude).slice(0, 10);
  if (!ids.length) return [];
  const { results } = await c.env.DB.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<ProductRow>();
  return ids.map(id => results.find(r => r.id === id)).filter(Boolean) as ProductRow[];
}

// ---------- قسم / بحث / قوائم ----------
// صور الأقسام الدائرية (صف الأقسام في صفحة القسم على الجوال، ودرج ☰). صورة كل قسم من أكثر
// منتجاته مبيعًا — استعلام ثقيل نسبيًا فيُحفظ في ذاكرة العامل عشر دقائق.
let tilesCache: { at: number; rows: any[] } | null = null;
export async function catTiles(db: D1Database): Promise<{ id: number; slug: string; name_ar: string; icon: string; img: string | null }[]> {
  if (tilesCache && Date.now() - tilesCache.at < 600000) return tilesCache.rows;
  const { results } = await db.prepare(`SELECT c.id,c.slug,c.name_ar,c.icon,
      (SELECT i.url FROM products p2 JOIN product_images i ON i.product_id=p2.id
       WHERE p2.category_id=c.id AND p2.status='active' AND p2.home_ok=1 ORDER BY p2.sales DESC, i.sort LIMIT 1) AS img
    FROM categories c WHERE c.show_home=1 ORDER BY c.sort,c.id`).all<any>();
  tilesCache = { at: Date.now(), rows: results };
  return results;
}

// ترتيب المقاسات كما تتوقّعه الزبونة: XS قبل S قبل M… ثم الأرقام تصاعديًا، ثم الباقي بشيوعه
const SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL', '7XL'];
function sizeKey(v: string): [number, number] {
  const u = v.trim().toUpperCase();
  const i = SIZE_ORDER.indexOf(u === 'XXL' ? '2XL' : u === 'XXXL' ? '3XL' : u);
  if (i >= 0) return [0, i];
  const n = parseFloat(u);
  if (/^\d+(\.\d+)?$/.test(u)) return [1, n];
  return [2, 0];
}

async function listPage(c: Context<Env>, opts: { title: string; where: string; binds: any[]; active?: string; q?: string; catId?: number }) {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  // اختيار القسم من لوحة التصفية في الجوال يصل معامل cat: القسم مسار لا معامل، فنحوّل إليه
  // مع إبقاء باقي الفلاتر (بلا جافاسكربت يعمل كذلك)
  const catParam = url.searchParams.get('cat');
  if (catParam !== null) {
    const u = new URL(c.req.url); u.searchParams.delete('cat'); u.searchParams.delete('page');
    [...u.searchParams.keys()].forEach(k => { if (u.searchParams.get(k) === '') u.searchParams.delete(k); });
    if (catParam && /^[a-z0-9-]+$/i.test(catParam)) u.pathname = catParam === 'all' ? '/c/all' : `/c/${catParam}`;
    if (u.pathname.startsWith('/c/')) u.searchParams.delete('q');
    return c.redirect(u.pathname + u.search);
  }
  const sort = url.searchParams.get('sort') ?? 'popular';
  const min = parseFloat(url.searchParams.get('min') ?? '') || null;
  const max = parseFloat(url.searchParams.get('max') ?? '') || null;
  const size = url.searchParams.get('size');
  const color = url.searchParams.get('color');
  const deal = url.searchParams.get('deal') === '1';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const per = 30;
  // السعر المعروض يتبع طريقة الشحن، فالفرز والفلترة يتبعانه أيضًا — وإلا رتّبنا بسعر لا تراه الزبونة
  const PRICE = shipMode(c) === 'sea' ? 'COALESCE(p.price_sea_lyd,p.price_lyd)' : 'p.price_lyd';
  let where = opts.where;
  const binds = [...opts.binds];
  if (min) { where += ` AND ${PRICE}>=?`; binds.push(min); }
  if (max) { where += ` AND ${PRICE}<=?`; binds.push(max); }
  if (size) { where += ' AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.size=?)'; binds.push(size); }
  if (color) { where += ' AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.color=?)'; binds.push(color); }
  if (deal) where += ` AND p.compare_price_lyd > ${PRICE}`;
  const order = { popular: 'p.sales DESC,p.views DESC', sold: 'p.sales DESC,p.id DESC', new: 'p.id DESC', price_asc: `${PRICE} ASC`, price_desc: `${PRICE} DESC`, rating: 'p.review_count DESC,p.rating DESC,p.sales DESC' }[sort] ?? 'p.sales DESC';
  const [rows, cnt, sizes, colors, f] = await Promise.all([
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per).all<ProductRow>(),
    db.prepare(`SELECT COUNT(*) n FROM products p WHERE ${where}`).bind(...binds).first<{ n: number }>(),
    // قيمة مقاس أو لون لم تُترجم بعد لا تُعرض للزبونة (القاعدة الأولى) — المترجَمة تكفي للتصفية.
    // مرتّبة بعدد المنتجات التي تحملها: كانت أبجدية بلا حدّ فظهر في «حجاب وشالات» ٣٠٠ مقاس
    // أغلبها لمنتج واحد («35cm*2*10»، «180*90») والزبونة تبحث عن M وL.
    db.prepare(`SELECT v.size, COUNT(DISTINCT v.product_id) n FROM variants v JOIN products p ON p.id=v.product_id WHERE ${opts.where} AND v.size IS NOT NULL AND v.size<>'' AND v.size NOT GLOB '*[一-龥]*' AND length(v.size)<=12 GROUP BY v.size ORDER BY n DESC LIMIT 80`).bind(...opts.binds).all<{ size: string; n: number }>(),
    db.prepare(`SELECT v.color, COUNT(DISTINCT v.product_id) n FROM variants v JOIN products p ON p.id=v.product_id WHERE ${opts.where} AND v.color IS NOT NULL AND v.color<>'' AND v.color NOT GLOB '*[一-龥]*' AND length(v.color)<=24 GROUP BY v.color ORDER BY n DESC LIMIT 30`).bind(...opts.binds).all<{ color: string; n: number }>(),
    favs(c),
  ]);
  // مقاس يحمله منتج واحد ضجيج حين تكثر المقاسات؛ في قسم صغير نُبقي الكل
  const sizeList = (sizes.results.length > 30 ? sizes.results.filter(x => x.n >= 2) : sizes.results).slice(0, 48)
    .sort((a, b) => { const ka = sizeKey(a.size), kb = sizeKey(b.size); return ka[0] - kb[0] || (ka[0] === 2 ? b.n - a.n : ka[1] - kb[1]); });
  if (size && !sizeList.some(x => x.size === size)) sizeList.unshift({ size, n: 0 });
  const colorList = (colors.results.length > 16 ? colors.results.filter(x => x.n >= 2) : colors.results).slice(0, 24);
  if (color && !colorList.some(x => x.color === color)) colorList.unshift({ color, n: 0 });
  const tiles = await catTiles(db);
  const total = cnt?.n ?? 0;
  const pages = Math.ceil(total / per);
  // رابط فلتر: تغيير الفلتر يُعيد إلى الصفحة الأولى عمدًا — وإلا وقعت الزبونة في صفحة ٩ فارغة
  const link = (k: string, v: string | null) => { const u = new URL(c.req.url); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); u.searchParams.delete('page'); return u.pathname + u.search; };
  // رابط ترقيم: يجب ألا يحذف `page`. كانت أرقام الصفحات تستعمل `link` نفسها فتضع الرقم
  // ثم تحذفه في السطر التالي، فكل نقرة على ٣ أو ٦ أو ٩ تعيد إلى الأولى في كل الأقسام.
  const pageLink = (n: number) => { const u = new URL(c.req.url); u.searchParams.set('page', String(n)); return u.pathname + u.search; };
  const clearAll = () => { const u = new URL(c.req.url); ['min', 'max', 'size', 'color', 'deal', 'page'].forEach(k => u.searchParams.delete(k)); return u.pathname + u.search; };
  const bb = await base(c);
  const active = bb.categories.find(x => x.slug === opts.active);
  const hasFilter = !!(min || max || size || color || deal);
  const nActive = [size, color, deal, min || max].filter(Boolean).length;
  // ما يُحمل كما هو في نموذج لوحة الجوال (الفرز والبحث) — الفلاتر نفسها تأتي من حقول اللوحة
  const keep = [...url.searchParams].filter(([k]) => !['min', 'max', 'size', 'color', 'deal', 'cat', 'page'].includes(k));
  const REC: [string, string][] = [['popular', 'موصى به'], ['new', 'الأحدث'], ['rating', 'الأعلى تقييمًا']];
  const recOn = REC.find(([k]) => k === sort);
  const priceLink = link('sort', sort === 'price_asc' ? 'price_desc' : 'price_asc');
  const PRESETS: [number, number][] = [[0, 50], [50, 150], [150, 300], [300, 0]];
  const SORTS: [string, string][] = [['popular', 'الأكثر رواجًا'], ['new', 'الأحدث'], ['rating', 'الأعلى تقييمًا'], ['price_asc', 'السعر: من الأقل'], ['price_desc', 'السعر: من الأعلى']];
  return c.html(
    <Layout {...bb} title={opts.title} active={opts.active} q={opts.q}>
      <nav class="crumbs"><a href="/">الرئيسية</a> / <span>{opts.title}</span></nav>
      <div class="shop">
        {/* الفلاتر الجانبية */}
        <aside class="filters">
          <h3>تصفية</h3>
          {hasFilter && <a href={clearAll()} style="font-size:12.5px;color:var(--brand);font-weight:700">مسح كل الفلاتر ✕</a>}
          <details class="fgroup" open>
            <summary>القسم</summary>
            <div class="fbody">
              <a href="/c/all" class={!opts.active ? 'on' : ''}>كل الأقسام</a>
              {bb.categories.map(cat => <a href={`/c/${cat.slug}`} class={opts.active === cat.slug ? 'on' : ''}>{cat.icon} {cat.name_ar}</a>)}
            </div>
          </details>
          {sizeList.length > 0 && (
            <details class="fgroup" open>
              <summary>المقاس</summary>
              <div class="fbody"><div class="fsizes">
                {sizeList.map(x => <a href={link('size', size === x.size ? null : x.size)} class={size === x.size ? 'on' : ''}>{x.size}</a>)}
              </div></div>
            </details>
          )}
          {colorList.length > 0 && (
            <details class="fgroup" open>
              <summary>اللون</summary>
              <div class="fbody"><div class="fcolors">
                {colorList.map(x => (
                  <a href={link('color', color === x.color ? null : x.color)} class={color === x.color ? 'on' : ''}>
                    <span class="sw" style={`background:${cssColor(x.color)}`}></span>{x.color}
                  </a>
                ))}
              </div></div>
            </details>
          )}
          <details class="fgroup" open>
            <summary>السعر (د.ل)</summary>
            <div class="fbody">
              <form class="fprice" method="get">
                {[...url.searchParams].filter(([k]) => !['min', 'max', 'page'].includes(k)).map(([k, v]) => <input type="hidden" name={k} value={v} />)}
                <input type="number" name="min" placeholder="من" value={min ?? ''} inputmode="numeric" />
                <span>—</span>
                <input type="number" name="max" placeholder="إلى" value={max ?? ''} inputmode="numeric" />
                <button type="submit">تطبيق</button>
              </form>
              <div class="fbody" style="padding-top:4px">
                {[[0, 50], [50, 150], [150, 300], [300, 0]].map(([lo, hi]) => {
                  const u = new URL(c.req.url);
                  u.searchParams.delete('page');
                  if (lo) u.searchParams.set('min', String(lo)); else u.searchParams.delete('min');
                  if (hi) u.searchParams.set('max', String(hi)); else u.searchParams.delete('max');
                  const on = (min ?? 0) === lo && (max ?? 0) === hi;
                  return <a href={u.pathname + u.search} class={on ? 'on' : ''}>{hi ? (lo ? `${lo} — ${hi}` : `أقل من ${hi}`) : `أكثر من ${lo}`}</a>;
                })}
              </div>
            </div>
          </details>
          <details class="fgroup" open>
            <summary>العروض</summary>
            <div class="fbody">
              <a href="/sale">عليها خصم</a>
              <a href={link('sort', 'new')}>وصل حديثًا</a>
              <a href={link('sort', 'rating')}>الأعلى تقييمًا</a>
            </div>
          </details>
        </aside>

        {/* النتائج */}
        <section>
          {/* ===== الجوال كما في شي إن: صف أقسام دائري، ثم شريط فرز ثابت وشرائح تصفية سريعة، ثم البضاعة فورًا.
              الفلاتر كاملةً في لوحة تُفتح بالنقر — كانت تُعرض كلها فوق البضاعة فتدفعها شاشات إلى الأسفل ===== */}
          <nav class="m-cats" aria-label="الأقسام">
            {tiles.map(t => (
              <a href={`/c/${t.slug}`} class={opts.active === t.slug ? 'on' : ''}>
                <span class="tp">{t.img ? <img src={imgUrl(t.img)} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <i>{t.icon}</i>}</span>
                <span class="tl">{t.name_ar}</span>
              </a>
            ))}
          </nav>
          <div class="m-bar" id="mBar">
            <div class="m-sort">
              <details class={`ms-rec ${recOn ? 'on' : ''}`}>
                <summary>{recOn ? recOn[1] : 'موصى به'} <i>▾</i></summary>
                <div class="ms-menu">{REC.map(([k, l]) => <a href={link('sort', k)} class={sort === k ? 'on' : ''}>{l}{sort === k && <b>✓</b>}</a>)}</div>
              </details>
              <a href={link('sort', 'sold')} class={sort === 'sold' ? 'on' : ''}>الأكثر مبيعًا</a>
              <a href={priceLink} class={`ms-price ${sort.startsWith('price') ? 'on' : ''}`}>السعر <i>{sort === 'price_asc' ? '↑' : sort === 'price_desc' ? '↓' : '⇅'}</i></a>
              <button type="button" class={`ms-filter ${nActive ? 'on' : ''}`} data-sheet="">تصفية{nActive > 0 && <b>{nActive}</b>} <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" stroke-linejoin="round" /></svg></button>
            </div>
            <div class="m-chips">
              {size && <a href={link('size', null)} class="on">المقاس: {size} ✕</a>}
              {color && <a href={link('color', null)} class="on">اللون: {color} ✕</a>}
              {(min || max) && <a href={link('min', null).replace(/([?&])max=[^&]*/, '$1')} class="on">السعر: {min ?? 0}—{max ?? '∞'} ✕</a>}
              <a href={link('deal', deal ? null : '1')} class={deal ? 'on' : ''}>عليها خصم{deal ? ' ✕' : ''}</a>
              <button type="button" data-sheet="cat">القسم <i>▾</i></button>
              {colorList.length > 0 && <button type="button" data-sheet="color">اللون <i>▾</i></button>}
              {sizeList.length > 0 && <button type="button" data-sheet="size">المقاس <i>▾</i></button>}
              <button type="button" data-sheet="price">السعر <i>▾</i></button>
            </div>
          </div>
          <div class="m-count">{total.toLocaleString('ar-LY')} منتج{pages > 1 ? ` · الصفحة ${page} من ${pages}` : ''}</div>
          <h2 class="desk-title" style="margin:0 0 12px;font-size:21px">{opts.title} <small style="color:var(--mut);font-weight:400;font-size:14px">({total} منتج)</small></h2>
          <div class="sortbar desk">
            <span class="lbl">ترتيب حسب</span>
            {SORTS.map(([k, l]) => <a href={link('sort', k)} class={`chip ${sort === k ? 'on' : ''}`}>{l}</a>)}
            <span class="count">الصفحة {page} من {Math.max(1, pages)}</span>
          </div>
          {hasFilter && (
            <div class="sortbar desk" style="padding-top:0">
              {size && <a href={link('size', null)} class="chip on">المقاس: {size} ✕</a>}
              {color && <a href={link('color', null)} class="chip on">اللون: {color} ✕</a>}
              {(min || max) && <a href={link('min', null).replace(/([?&])max=[^&]*/, '$1')} class="chip on">السعر: {min ?? 0}—{max ?? '∞'} ✕</a>}
            </div>
          )}
          <Grid ship={bb.ship} items={rows.results} favs={f} />
          {pages > 1 && page < pages && <a class="more-btn" href={pageLink(page + 1)}>عرض المزيد</a>}
          {pages > 1 && (
            <div class="sortbar" style="justify-content:center;padding-top:18px">
              {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 12).map(n => <a href={pageLink(n)} class={`chip ${n === page ? 'on' : ''}`}>{n}</a>)}
            </div>
          )}
        </section>
      </div>
      {/* ===== لوحة التصفية (الجوال): المجموعات في عمود، وخياراتها بجانبها، و«مسح» و«عرض النتائج» أسفلها.
          نموذج GET عادي: يعمل بلا جافاسكربت، والقسم يصل معامل cat فيحوّله الخادم إلى مساره ===== */}
      <div class="fsheet" id="fsheet" hidden>
        <div class="fs-back" data-close></div>
        <form class="fs" method="get" action={url.pathname} role="dialog" aria-label="تصفية">
          {keep.map(([k, v]) => <input type="hidden" name={k} value={v} />)}
          <header><b>تصفية</b><button type="button" data-close aria-label="إغلاق">✕</button></header>
          <div class="fs-body">
            <nav class="fs-tabs">
              <button type="button" data-tab="cat" class="on">القسم</button>
              {colorList.length > 0 && <button type="button" data-tab="color">اللون{color && <i></i>}</button>}
              {sizeList.length > 0 && <button type="button" data-tab="size">المقاس{size && <i></i>}</button>}
              <button type="button" data-tab="price">السعر{(min || max) && <i></i>}</button>
              <button type="button" data-tab="deal">العروض{deal && <i></i>}</button>
            </nav>
            <div class="fs-panes">
              <section data-pane="cat"><h4>القسم</h4>
                <div class="fs-pills">
                  {/* القيمة الفارغة = «ابقَ هنا» (صفحة البحث أو القسم الحالي) */}
                  <label><input type="radio" name="cat" value={opts.active ? 'all' : ''} checked={!opts.active} /><span>{opts.active || !opts.q ? 'كل الأقسام' : 'كل النتائج'}</span></label>
                  {bb.categories.map(cat => <label><input type="radio" name="cat" value={opts.active === cat.slug ? '' : cat.slug} checked={opts.active === cat.slug} /><span>{cat.name_ar}</span></label>)}
                </div>
              </section>
              {colorList.length > 0 && (
                <section data-pane="color"><h4>اللون</h4>
                  <div class="fs-colors">
                    <label><input type="radio" name="color" value="" checked={!color} /><span><i class="sw all"></i>الكل</span></label>
                    {colorList.map(x => <label><input type="radio" name="color" value={x.color} checked={color === x.color} /><span><i class="sw" style={`background:${cssColor(x.color)}`}></i>{x.color}</span></label>)}
                  </div>
                </section>
              )}
              {sizeList.length > 0 && (
                <section data-pane="size"><h4>المقاس</h4>
                  <div class="fs-pills">
                    <label><input type="radio" name="size" value="" checked={!size} /><span>الكل</span></label>
                    {sizeList.map(x => <label><input type="radio" name="size" value={x.size} checked={size === x.size} /><span>{x.size}</span></label>)}
                  </div>
                </section>
              )}
              <section data-pane="price"><h4>السعر (د.ل)</h4>
                <div class="fs-range">
                  <input type="number" name="min" placeholder="من" value={min ?? ''} inputmode="numeric" min="0" />
                  <span>—</span>
                  <input type="number" name="max" placeholder="إلى" value={max ?? ''} inputmode="numeric" min="0" />
                </div>
                <div class="fs-pills">
                  {PRESETS.map(([lo, hi]) => (
                    <button type="button" data-min={lo || ''} data-max={hi || ''} class={(min ?? 0) === lo && (max ?? 0) === hi ? 'on' : ''}>{hi ? (lo ? `${lo} — ${hi}` : `أقل من ${hi}`) : `أكثر من ${lo}`}</button>
                  ))}
                </div>
              </section>
              <section data-pane="deal"><h4>العروض</h4>
                <div class="fs-pills"><label><input type="checkbox" name="deal" value="1" checked={deal} /><span>عليها خصم</span></label></div>
              </section>
            </div>
          </div>
          <footer><a class="fs-clear" href={clearAll()}>مسح</a><button type="submit" class="fs-done">عرض النتائج</button></footer>
        </form>
      </div>
    </Layout>,
  );
}

// لون تقريبي للنقطة في فلتر الألوان
function cssColor(name: string): string {
  const M: [RegExp, string][] = [
    [/أسود|اسود/, '#111'], [/أبيض|ابيض/, '#fff'], [/رمادي|رمادى/, '#9a9a9a'], [/فضي|فضى/, '#c8ccd0'],
    [/ذهبي|ذهبى/, '#d4af37'], [/بيج|بيچ/, '#e8d9c0'], [/بني|بنى/, '#7a4b2a'], [/كحلي|كحلى|نيلي/, '#1f2d54'],
    [/أزرق|ازرق/, '#2563c9'], [/سماوي|تركواز|فيروزي/, '#40b6c6'], [/أخضر|اخضر/, '#2f9e5e'], [/زيتي/, '#6b7a3a'],
    [/أحمر|احمر/, '#d3262b'], [/عنابي|خمري|نبيتي/, '#7b1b33'], [/وردي|وردى|زهري/, '#ee7fa5'], [/فوشيا/, '#d4247f'],
    [/بنفسجي|موف|ليلكي/, '#8a5cc7'], [/أصفر|اصفر/, '#f2c53d'], [/برتقالي|برتقالى/, '#ef7f2e'], [/كريمي|عاجي/, '#f5efe0'],
    [/شفاف/, 'linear-gradient(135deg,#eee,#fff)'], [/متعدد|ملون/, 'linear-gradient(135deg,#ef7f2e,#2563c9,#2f9e5e)'],
  ];
  for (const [r, v] of M) if (r.test(name)) return v;
  return '#d8d8d8';
}

store.get('/c/all', async (c) => {
  const b = await base(c);
  return c.html(
    <Layout {...b} title="الأقسام">
      <div class="sec-h"><h2>كل الأقسام</h2></div>
      <div class="grid">
        {b.categories.map(cat => (
          <a href={`/c/${cat.slug}`} class="card"><div class="ph" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:44px">{cat.icon}</div><div class="t" style="text-align:center;font-weight:700">{cat.name_ar}</div></a>
        ))}
      </div>
    </Layout>,
  );
});

store.get('/c/:slug', async (c) => {
  const cat = await c.env.DB.prepare('SELECT id,name_ar,slug FROM categories WHERE slug=?').bind(c.req.param('slug')).first<any>();
  if (!cat) return c.notFound();
  return listPage(c, { title: cat.name_ar, where: "p.status='active' AND p.category_id=?", binds: [cat.id], active: cat.slug, catId: cat.id });
});
// البحث بعدة كلمات: «فستان أحمر» يجب أن يجد «فستان سهرة أحمر» — كل كلمة تُطلب على حدة لا العبارة كما كُتبت.
// «ال» التعريف تُتجاهَل بادئةً («الفستان» تجد «فستان») وكذلك التاء المربوطة/الهاء والألف بأشكالها.
const searchTerms = (q: string) => q.split(/[\s,،]+/).map(w => w.replace(/^(ال)(?=.{3,})/, '')).filter(w => w.length >= 2).slice(0, 5);
store.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.redirect('/');
  const terms = searchTerms(q);
  const where = terms.length
    ? "p.status='active' AND " + terms.map(() => '(p.title_ar LIKE ? OR p.description_ar LIKE ?)').join(' AND ')
    : "p.status='active' AND (p.title_ar LIKE ? OR p.description_ar LIKE ?)";
  const binds = terms.length ? terms.flatMap(w => [`%${w}%`, `%${w}%`]) : [`%${q}%`, `%${q}%`];
  return listPage(c, { title: `نتائج البحث: ${q}`, where, binds, q });
});
store.get('/sale', (c) => listPage(c, { title: 'عروض وتخفيضات', where: "p.status='active' AND p.home_ok=1 AND p.compare_price_lyd > p.price_lyd", binds: [] }));
store.get('/trending', (c) => listPage(c, { title: 'الأكثر رواجًا', where: "p.status='active' AND p.sales>0", binds: [] }));
// درج الأقسام ☰ على الجوال (كقائمة شي إن الجانبية): يُجلب عند أول فتح فقط
store.get('/m/menu', async (c) => {
  const tiles = await catTiles(c.env.DB);
  const Row = ({ href, img, icon, name }: any) => (
    <a href={href} class="dr-row"><span class="tp">{img ? <img src={imgUrl(img)} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <i>{icon}</i>}</span><b>{name}</b><em>›</em></a>
  );
  c.header('Cache-Control', 'public, max-age=600');
  return c.html(
    <div class="dr-list">
      <Row href="/new" icon="🆕" name="وصل حديثًا" />
      <Row href="/trending" icon="🔥" name="الأكثر رواجًا" />
      <Row href="/sale" icon="%" name="عروض وتخفيضات" />
      {tiles.map(t => <Row href={`/c/${t.slug}`} img={t.img} icon={t.icon} name={t.name_ar} />)}
      <Row href="/c/all" icon="▦" name="كل المنتجات" />
    </div>,
  );
});

store.get('/new', (c) => listPage(c, { title: 'وصل حديثًا', where: "p.status='active'", binds: [] }));

// ---------- صفحة المنتج ----------
store.get('/p/:slug', async (c) => {
  const db = c.env.DB;
  const p = await db.prepare(`SELECT ${PRODUCT_SELECT},p.review_count FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.status IN ('active','unavailable')`).bind(c.req.param('slug')).first<ProductRow & { review_count: number }>();
  if (!p) return c.notFound();
  const [imgs, vars, related, f, reviews, fit] = await Promise.all([
    db.prepare('SELECT url FROM product_images WHERE product_id=? ORDER BY sort').bind(p.id).all<{ url: string }>(),
    db.prepare('SELECT id,color,size,price_delta_lyd,in_stock,image_url FROM variants WHERE product_id=?').bind(p.id).all<any>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.category_id=? AND p.id<>? ORDER BY p.sales DESC LIMIT 10`).bind(p.category_id, p.id).all<ProductRow>(),
    favs(c),
    db.prepare("SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? AND r.status='approved' ORDER BY r.id DESC LIMIT 20").bind(p.id).all<any>(),
    db.prepare("SELECT size_fit,COUNT(*) n FROM reviews WHERE product_id=? AND status='approved' AND size_fit IS NOT NULL GROUP BY size_fit").bind(p.id).all<any>(),
  ]);
  c.executionCtx.waitUntil(db.prepare('UPDATE products SET views=views+1 WHERE id=?').bind(p.id).run());
  // المشاهدات الأخيرة
  const rv = [p.id, ...(getCookie(c, 'rv') ?? '').split(',').map(Number).filter(n => n && n !== p.id)].slice(0, 12);
  setCookie(c, 'rv', rv.join(','), { path: '/', maxAge: 30 * 86400, sameSite: 'Lax' });
  const recent = await recentlyViewed(c, p.id);
  // نفس القاعدة على صفحة المنتج: لا تُعرض قيمة لم تُترجم بعد
  const noCJK = (v: any) => v && !/[一-鿿]/.test(String(v));
  const colors = [...new Set(vars.results.map(v => v.color).filter(noCJK))] as string[];
  const sizes = [...new Set(vars.results.map(v => v.size).filter(noCJK))] as string[];
  const images = imgs.results.length ? imgs.results.map(i => i.url) : ['/placeholder.svg'];
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
  const isClothing = ['dresses', 'abayas', 'tops', 'kids'].includes(p.cat_slug ?? '');
  const fitTotal = fit.results.reduce((a, r) => a + r.n, 0);
  const fitPct = (k: string) => fitTotal ? Math.round((fit.results.find(r => r.size_fit === k)?.n ?? 0) / fitTotal * 100) : 0;
  const s = await loadSettings(db);
  const mode = shipMode(c);
  const rates = shipRates(s, mode);
  // السعر المعروض يتبع طريقة الشحن المختارة، تمامًا كما في السلة والبطاقة
  const shown = mode === 'sea' && p.price_sea_lyd ? p.price_sea_lyd : p.price_lyd;
  // ماذا تستلم الزبونة بالضبط: حامل عرض فارغ، زهرة صناعية، بدلة ساونا… العنوان وحده لا يكفي
  const kn = p.kind && KIND_NOTE[p.kind as ListingKind] ? KIND_NOTE[p.kind as ListingKind] : null;
  const seaSave = p.price_sea_lyd && p.price_sea_lyd < p.price_lyd ? p.price_lyd - p.price_sea_lyd : 0;
  const b = await base(c);
  return c.html(
    <Layout {...b} title={p.title_ar} active={p.cat_slug}>
      <div class="crumbs"><a href="/">الرئيسية</a> › <a href={`/c/${p.cat_slug}`}>{p.cat_name}</a> › <span>{p.title_ar.slice(0, 40)}</span></div>
      <div class="pd" data-product={p.id}>
        <div class="gallery">
          <div class="main"><img id="mainImg" src={imgUrl(images[0])} alt={p.title_ar} referrerpolicy="no-referrer" />{off > 0 && <span class="tag">-{off}%</span>}</div>
          <div class="thumbs">{images.map((u, i) => <img src={imgUrl(u)} data-full={imgUrl(u)} class={i === 0 ? 'on' : ''} data-thumb loading="lazy" referrerpolicy="no-referrer" />)}</div>
        </div>
        <div>
          <h1>{p.title_ar}</h1>
          <div class="meta" style="font-size:13px;color:#666">{p.review_count > 0
            ? <><a href="#reviews"><Stars n={p.rating} /> {p.rating.toFixed(1)} ({p.review_count} تقييم)</a> · </>
            : <>لا تقييمات بعد — كوني أول من يقيّمه · </>}{p.sales}+ بيعت · {p.views} مشاهدة</div>
          <div class="price" style="margin-top:8px">{fmt(shown)}{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}{off > 0 && <span class="tag" style="position:static;margin-inline-start:8px;font-size:13px;background:var(--brand);color:#fff;padding:2px 8px;border-radius:4px">-{off}%</span>}</div>
          <div class="price-note">السعر شامل الشحن من الصين والجمارك. التوصيل داخل ليبيا {fmt(parseFloat(s.delivery_lyd))} (مجاني فوق {fmt(parseFloat(s.free_ship_over_lyd))}). تكسبين <b>{Math.floor(shown * parseFloat(s.points_per_lyd || '1'))} نقطة</b> عند التسليم.</div>
          {seaOn(s) && p.price_sea_lyd ? (
            <form method="post" action="/cart/ship" class="pship">
              <input type="hidden" name="back" value={`/p/${p.slug}`} />
              <label class={mode === 'air' ? 'on' : ''}>
                <input type="radio" name="mode" value="air" checked={mode === 'air'} onchange="this.form.submit()" />
                <span class="t">✈️ جوي {fmt(p.price_lyd)}</span><span class="d">{s.air_days || '١٢ — ١٨ يومًا'}</span>
              </label>
              <label class={mode === 'sea' ? 'on' : ''}>
                <input type="radio" name="mode" value="sea" checked={mode === 'sea'} onchange="this.form.submit()" />
                <span class="t">🚢 بحري {fmt(p.price_sea_lyd)}{seaSave > 0 && <b> وفّري {fmt(seaSave)}</b>}</span><span class="d">{s.sea_days || '٣٠ — ٤٥ يومًا'}</span>
              </label>
              <noscript><button class="btn sm" type="submit">تطبيق</button></noscript>
            </form>
          ) : null}
          {!p.in_stock && <Flash type="err" msg="هذا المنتج غير متوفر حاليًا عند المورد. أضيفيه للمفضلة وسنخبرك عند توفره." />}
          <form method="post" action="/cart/add" id="addForm">
            <input type="hidden" name="product_id" value={p.id} />
            <input type="hidden" name="variant_id" id="variantId" value="" />
            {colors.length > 0 && (
              <div class="opts"><h4>اللون: <span id="colorLbl"></span></h4>
                <div class="chips" data-opt="color">{colors.map(cl => <span class="chip" data-val={cl}>{cl}</span>)}</div></div>
            )}
            {sizes.length > 0 && (
              <div class="opts"><h4>المقاس: <span id="sizeLbl"></span> <a href="#sizeGuide" style="font-weight:400;font-size:12px;color:var(--brand);margin-inline-start:8px">دليل المقاسات</a></h4>
                <div class="chips" data-opt="size">{sizes.map(sz => <span class="chip" data-val={sz}>{sz}</span>)}</div>
                {fitTotal > 0 && <div class="fit"><span>رأي الزبونات في المقاس:</span> <b>{fitPct('true')}%</b> مطابق · <b>{fitPct('small')}%</b> أصغر · <b>{fitPct('large')}%</b> أكبر</div>}
              </div>
            )}
            {/* صورة المتغيّر تمرّ بالوسيط قبل أن تُكتب في الصفحة: الرابط الخام يكشف مورّد 1688 ورقم حسابه
                لمن يفتح مصدر الصفحة، والقاعدة أن الزبونة لا ترى رابط المصدر أبدًا */}
            <script type="application/json" id="variantsJson" dangerouslySetInnerHTML={{ __html: JSON.stringify(vars.results.filter(v => noCJK(v.color ?? '—') && noCJK(v.size ?? '—')).map(v => ({ ...v, image_url: v.image_url ? imgUrl(v.image_url) : null }))).replace(/</g, '\\u003c') }}></script>
            <div class="opts"><h4>الكمية</h4>
              <div class="qty"><button type="button" data-q="-1">−</button><input type="number" name="qty" value={p.min_qty} min={p.min_qty} /><button type="button" data-q="1">+</button></div>
              {p.min_qty > 1 && <span style="font-size:12px;color:#888;margin-inline-start:8px">الحد الأدنى {p.min_qty} قطع</span>}
              {/* الحد الأدنى مأخوذ من عرض الجملة عند المورّد: الزبونة ترى سعر القطعة بخط كبير
                  وتظن أنها تدفعه، فتكتشف الإجمالي في السلة. نقوله لها هنا صراحةً. */}
              {p.min_qty > 1 && <div class="moq-note">تُباع بالكمية: أقل طلب <b>{p.min_qty} قطعة</b> — أي <b>{fmt(shown * p.min_qty)}</b> إجمالًا.</div>}
              {kn && <div class="kind-note"><b>{kn.tag}</b> — {kn.note}</div>}
            </div>
            <div class="inline" style="margin:16px 0">
              <button class="btn brand" type="submit" disabled={!p.in_stock} style="flex:1">أضيفي إلى السلة</button>
              <button class="btn ghost" type="button" data-fav={p.id}>{f.has(p.id) ? '♥ في المفضلة' : '♡ المفضلة'}</button>
            </div>
          </form>
          <div class="trust">
            <div>🚚 <b>الوصول خلال {rates.days}</b><br />شحن {rates.ar} مجمّع من الصين</div>
            <div>💳 <b>ادفعي بالدينار</b><br />بطاقة مصرفية · سداد · إدفعلي · موبي كاش</div>
            <div>🔍 <b>فحص قبل الشحن</b><br />صور للبضاعة من مخزننا في الصين</div>
            <div>↩️ <b>ضمان الوصول</b><br />تعويض كامل لأي تالف أو مختلف</div>
          </div>
          <details open><summary>الوصف</summary><div style="font-size:14px;white-space:pre-line">{p.description_ar || autoDesc(p, s, rates, colors, sizes)}</div></details>
          {isClothing && (
            <details id="sizeGuide"><summary>دليل المقاسات (آسيوي ← ليبي)</summary>
              <div class="size-guide"><table>
                <tr><th>المقاس</th><th>الصدر (سم)</th><th>الخصر (سم)</th><th>يناسب</th></tr>
                <tr><td>S</td><td>84–88</td><td>66–70</td><td>36–38</td></tr>
                <tr><td>M</td><td>88–92</td><td>70–74</td><td>38–40</td></tr>
                <tr><td>L</td><td>92–96</td><td>74–78</td><td>40–42</td></tr>
                <tr><td>XL</td><td>96–102</td><td>78–84</td><td>42–44</td></tr>
                <tr><td>2XL</td><td>102–108</td><td>84–90</td><td>44–46</td></tr>
              </table><p style="color:var(--brand)">⚠️ المقاسات الصينية أصغر بمقاس واحد عادةً. ننصح بطلب مقاس أكبر.</p></div>
            </details>
          )}
          <details><summary>الشحن والإرجاع</summary>
            <div style="font-size:14px">نشتري المنتج من المورد بعد تأكيد طلبك، ثم يُجمع مع طلبات أخرى في مخزننا بالصين ويُشحن جوًّا إلى ليبيا. لا يمكن إرجاع البضاعة إلى الصين، لكن نعوّض أي منتج تالف أو مختلف عن الوصف بصور الفحص. <a href="/pages/returns" style="color:var(--brand)">سياسة الإرجاع الكاملة</a></div>
          </details>
        </div>
      </div>
      <section id="reviews" class="card-box" style="margin-top:20px">
        <div class="sec-h" style="margin:0 0 10px"><h2>التقييمات ({p.review_count})</h2>{p.review_count > 0 && <span><Stars n={p.rating} size={18} /> <b>{p.rating.toFixed(1)}</b> / 5</span>}</div>
        {reviews.results.length === 0 ? <p style="color:#888">لا تقييمات منشورة بعد. كوني أول من يقيّم بعد استلام طلبك.</p> : reviews.results.map(r => (
          <div class="review"><div class="rv-h"><b>{r.name.split(' ')[0]} {r.name.split(' ')[1]?.slice(0, 1) ?? ''}.</b><Stars n={r.rating} /><small style="color:#888">{timeAgo(r.created_at)}</small>{r.size_fit && <span class="status">{{ small: 'المقاس أصغر', true: 'المقاس مطابق', large: 'المقاس أكبر' }[r.size_fit as string]}</span>}</div><p>{r.body}</p>{r.image_url && <a href={r.image_url} target="_blank"><img src={r.image_url} class="rv-img" alt="" /></a>}</div>
        ))}
      </section>
      <div class="sec-h"><h2>قد يعجبك أيضًا</h2></div>
      <Grid ship={b.ship} items={related.results} favs={f} />
      {recent.length > 0 && <><div class="sec-h"><h2>شاهدتِ مؤخرًا</h2></div><Grid ship={b.ship} items={recent} favs={f} /></>}
    </Layout>,
  );
});

// ---------- المفضلة ----------
store.get('/wishlist', async (c) => {
  const u = c.get('user');
  const b = await base(c);
  if (!u) return c.html(<Layout {...b} title="المفضلة"><div class="empty"><div class="big">♡</div><a class="btn" href="/login?next=/wishlist">سجّلي الدخول لعرض المفضلة</a></div></Layout>);
  const { results } = await c.env.DB.prepare(`SELECT ${PRODUCT_SELECT} FROM wishlist w JOIN products p ON p.id=w.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE w.user_id=?`).bind(u.id).all<ProductRow>();
  return c.html(<Layout {...b} title="المفضلة"><div class="sec-h"><h2>المفضلة</h2></div><Grid ship={b.ship} items={results} favs={new Set(results.map(r => r.id))} /></Layout>);
});
store.post('/wishlist/toggle', async (c) => {
  const u = c.get('user');
  if (!u) return c.json({ ok: false, login: true }, 401);
  const { product_id } = await c.req.json<{ product_id: number }>();
  const ex = await c.env.DB.prepare('SELECT 1 FROM wishlist WHERE user_id=? AND product_id=?').bind(u.id, product_id).first();
  if (ex) await c.env.DB.prepare('DELETE FROM wishlist WHERE user_id=? AND product_id=?').bind(u.id, product_id).run();
  else await c.env.DB.prepare('INSERT INTO wishlist(user_id,product_id) VALUES(?,?)').bind(u.id, product_id).run();
  return c.json({ ok: true, fav: !ex });
});

// ---------- السلة ----------
store.post('/cart/add', async (c) => {
  const u = c.get('user');
  const f = await c.req.parseBody();
  const pid = Number(f.product_id), vid = f.variant_id ? Number(f.variant_id) : null, qty = Math.max(1, Number(f.qty) || 1);
  // quick=1: زر «+» على بطاقة المنتج — يرد JSON ولا يغادر الصفحة
  const quick = f.quick === '1';
  if (!u) {
    if (quick) return c.json({ needLogin: true }, 401);
    let back = '/'; try { back = new URL(c.req.header('referer') ?? '/', c.req.url).pathname; } catch {}
    return c.redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  const p = await c.env.DB.prepare('SELECT slug,in_stock,min_qty,(SELECT COUNT(*) FROM variants v WHERE v.product_id=products.id) vars FROM products WHERE id=? AND status=?').bind(pid, 'active').first<any>();
  if (!p || !p.in_stock) {
    if (quick) return c.json({ error: 'غير متوفر' }, 400);
    return c.redirect((c.req.header('referer') ?? '/') + '?err=unavailable');
  }
  // منتج له ألوان/مقاسات: لا نضيفه بضغطة واحدة بل نفتح صفحته لتختار
  if (quick && p.vars > 0 && !vid) return c.json({ needVariant: true, slug: p.slug });
  await c.env.DB.prepare(
    `INSERT INTO cart_items(user_id,product_id,variant_id,qty) VALUES(?,?,?,?)
     ON CONFLICT(user_id,product_id,variant_id) DO UPDATE SET qty=qty+excluded.qty`,
  ).bind(u.id, pid, vid, Math.max(qty, p.min_qty)).run();
  if (quick) {
    const n = await c.env.DB.prepare('SELECT COALESCE(SUM(qty),0) n FROM cart_items WHERE user_id=?').bind(u.id).first<{ n: number }>();
    return c.json({ ok: true, count: n?.n ?? 0 });
  }
  return c.redirect('/cart?added=1');
});
// حفظ طريقة الشحن المختارة (كوكي) — تبقى بين السلة والدفع
store.post('/cart/ship', async (c) => {
  const f = await c.req.parseBody();
  const mode = String(f.mode) === 'sea' ? 'sea' : 'air';
  setCookie(c, 'ship', mode, { path: '/', maxAge: 60 * 60 * 24 * 30 });
  return c.redirect(String(f.back ?? '/cart'));
});
store.post('/cart/update', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const f = await c.req.parseBody();
  const id = Number(f.id), qty = Number(f.qty);
  if (f.action === 'remove' || qty <= 0) await c.env.DB.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').bind(id, u.id).run();
  else {
    // الحد الأدنى للمورّد يُفرض هنا أيضًا: كان يُفرض عند الإضافة فقط، فتستطيع الزبونة
    // إنزال الكمية إلى ١ داخل السلة لقطعة أقلّها ١٠٠ — فنشتري ١٠٠ ونبيع واحدة.
    const mq = await c.env.DB.prepare('SELECT p.min_qty FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.id=? AND ci.user_id=?').bind(id, u.id).first<{ min_qty: number }>();
    await c.env.DB.prepare('UPDATE cart_items SET qty=? WHERE id=? AND user_id=?').bind(Math.max(qty, mq?.min_qty ?? 1), id, u.id).run();
  }
  return c.redirect('/cart');
});
store.post('/cart/coupon', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const f = await c.req.parseBody();
  const back = String(f.back ?? '/cart');
  if (f.action === 'remove' || !f.code) { deleteCookie(c, 'coupon', { path: '/' }); return c.redirect(back); }
  const rows = await cartRows(c.env.DB, u.id, shipMode(c));
  const r = await checkCoupon(c.env.DB, String(f.code), u.id, rows.reduce((a, x) => a + x.line, 0));
  if (!r.ok) { deleteCookie(c, 'coupon', { path: '/' }); return c.redirect(`${back}?cerr=${encodeURIComponent(r.error)}`); }
  setCookie(c, 'coupon', r.coupon.code, { path: '/', maxAge: 86400, sameSite: 'Lax' });
  return c.redirect(`${back}?cok=1`);
});

async function cartRows(db: D1Database, uid: number, mode: ShipMode = 'air') {
  const { results } = await db.prepare(
    `SELECT ci.id,ci.qty,ci.variant_id,p.id AS product_id,p.slug,p.title_ar,p.price_lyd,p.price_sea_lyd,p.in_stock,p.status,p.source_offer_id,p.source_url,p.min_qty,
            p.source_price_cny,p.weight_g,p.volume_cm3,p.category_id,c.est_weight_g,c.markup_percent,
            v.color,v.size,COALESCE(v.price_delta_lyd,0) AS delta,
            COALESCE(v.image_url,(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1)) AS image
     FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN variants v ON v.id=ci.variant_id WHERE ci.user_id=?`,
  ).bind(uid).all<any>();
  // السعر البحري أرخص؛ إن لم يُحسب بعد لمنتج قديم نستخدم الجوي حتى لا يُباع بأقل من تكلفته
  return results.map(r => {
    const base = mode === 'sea' && r.price_sea_lyd ? r.price_sea_lyd : r.price_lyd;
    return { ...r, unit: base + r.delta, line: (base + r.delta) * r.qty, air_unit: r.price_lyd + r.delta, sea_unit: (r.price_sea_lyd ?? r.price_lyd) + r.delta };
  });
}

// طريقة الشحن المختارة محفوظة في كوكي حتى تبقى بين السلة والدفع
function shipMode(c: Context<Env>): ShipMode {
  return getCookie(c, 'ship') === 'sea' ? 'sea' : 'air';
}

// أجرة التوصيل داخل ليبيا حسب المدينة: سطر «المدينة = المبلغ» في الإعدادات، وما لم يُذكر يأخذ الأجرة العامة.
// التوصيل إلى سبها أو الكفرة يكلّف أضعاف طرابلس، فأجرة واحدة للبلد كلها تعني خسارة في البعيد وغلاءً في القريب.
export function cityRates(s: Settings): Record<string, number> {
  const out: Record<string, number> = {};
  (s.delivery_city_rates ?? '').split('\n').forEach(line => {
    const [city, amount] = line.split('=').map(x => x.trim());
    const v = parseFloat(amount ?? '');
    if (city && !Number.isNaN(v) && v >= 0) out[city] = v;
  });
  return out;
}
export const deliveryFor = (s: Settings, city?: string | null) => {
  const r = cityRates(s);
  return city && r[city] !== undefined ? r[city] : parseFloat(s.delivery_lyd);
};

// حساب ملخص السلة: خصم كوبون + نقاط + توصيل
async function cartTotals(c: Context<Env>, rows: any[], usePoints: boolean) {
  const db = c.env.DB; const u = c.get('user')!;
  const s = await loadSettings(db);
  const subtotal = rows.reduce((a, r) => a + r.line, 0);
  let discount = 0, freeShip = false, couponErr: string | null = null, coupon: any = null;
  const code = getCookie(c, 'coupon');
  if (code) {
    const r = await checkCoupon(db, code, u.id, subtotal);
    if (r.ok) { discount = r.discount; freeShip = r.freeShip; coupon = r.coupon; } else { couponErr = r.error; }
  }
  const afterCoupon = Math.max(0, subtotal - discount);
  const ptsValue = parseFloat(s.points_value_per_100 || '1') / 100;   // قيمة النقطة الواحدة بالدينار
  const maxPts = Math.floor(afterCoupon * parseInt(s.points_max_percent || '50') / 100 / ptsValue);
  const pointsUsed = usePoints ? Math.min(u.points, maxPts) : 0;
  const pointsLyd = Math.round(pointsUsed * ptsValue * 100) / 100;
  // المدينة تأتي من نموذج الدفع إن كانت الزبونة تملأه الآن، وإلا من ملفها
  const city = (c.req.query('city') ?? u.city) || null;
  const cityFee = deliveryFor(s, city);
  const delivery = freeShip || subtotal >= parseFloat(s.free_ship_over_lyd) ? 0 : cityFee;
  const total = Math.round((afterCoupon - pointsLyd + delivery) * 100) / 100;
  // فرق السعر بين الطريقتين ليظهر للزبونة كم توفّر بالبحري
  const mode = shipMode(c);
  const airSum = rows.reduce((a, r) => a + (r.air_unit ?? r.unit) * r.qty, 0);
  const seaSum = rows.reduce((a, r) => a + (r.sea_unit ?? r.unit) * r.qty, 0);
  const seaSaving = Math.round((airSum - seaSum) * 100) / 100;
  const shipDays = mode === 'sea' ? (s.sea_days || '٣٠ — ٤٥ يومًا') : (s.air_days || '١٢ — ١٨ يومًا');
  return { s, subtotal, discount, freeShip, coupon, couponErr, pointsUsed, pointsLyd, maxPts, ptsValue, delivery, cityFee, city, total, mode, airSum, seaSum, seaSaving, shipDays };
}

// وصف عربي حقيقي للمنتجات التي وصلت من صفحة بحث بلا وصف — أفضل من سطر «لا يوجد وصف»
function autoDesc(p: any, s: any, rates: { days: string; ar: string }, colors: string[], sizes: string[]) {
  const L: string[] = [`${p.title_ar} — من قسم ${p.cat_name ?? 'متجرنا'}.`];
  const kn = p.kind ? KIND_NOTE[p.kind as ListingKind] : null;
  if (kn) L.push(kn.note);
  if (colors.length) L.push(`الألوان المتاحة: ${colors.slice(0, 8).join('، ')}.`);
  if (sizes.length) L.push(`المقاسات: ${sizes.slice(0, 10).join('، ')} (مقاسات آسيوية — راجعي دليل المقاسات أدناه).`);
  if (p.min_qty > 1) L.push(`الحد الأدنى للطلب ${p.min_qty} قطع.`);
  L.push(`السعر شامل الشحن ${rates.ar} من الصين والجمارك، ويصل خلال ${rates.days}.`);
  L.push(`نفحص القطعة ونصوّرها في مخزننا بالصين قبل شحنها، ونعوّضك كاملًا عن أي تالف أو مختلف عن الصورة.`);
  L.push(`التوصيل داخل ليبيا ${fmt(parseFloat(s.delivery_lyd))} ومجاني فوق ${fmt(parseFloat(s.free_ship_over_lyd))}.`);
  return L.join('\n');
}

// اختيار طريقة الشحن من الصين: جوي سريع أو بحري أرخص
const ShipPicker = ({ t, back }: any) => {
  if (!seaOn(t.s)) return null;
  const air = t.s.air_days || '١٢ — ١٨ يومًا';
  const sea = t.s.sea_days || '٣٠ — ٤٥ يومًا';
  return (
    <form method="post" action="/cart/ship" class="card-box" style="margin-bottom:14px">
      <input type="hidden" name="back" value={back} />
      <h3 style="margin:0 0 4px;font-size:16px">طريقة الشحن من الصين</h3>
      <p style="font-size:12.5px;color:#767676;margin:0 0 12px">السعر المعروض لكل منتج يشمل الشحن — اختاري الطريقة ويتغيّر السعر تلقائيًا.</p>
      <div class="shipsel">
        <label class={t.mode === 'air' ? 'on' : ''}>
          <input type="radio" name="mode" value="air" checked={t.mode === 'air'} onchange="this.form.submit()" />
          <div>
            <div class="t">✈️ شحن جوي <span class="fast">الأسرع</span></div>
            <div class="d">يصل خلال <b>{air}</b> · إجمالي السلة {fmt(t.airSum)}</div>
          </div>
        </label>
        <label class={t.mode === 'sea' ? 'on' : ''}>
          <input type="radio" name="mode" value="sea" checked={t.mode === 'sea'} onchange="this.form.submit()" />
          <div>
            <div class="t">🚢 شحن بحري {t.seaSaving > 0 && <span class="save">وفّري {fmt(t.seaSaving)}</span>}</div>
            <div class="d">يصل خلال <b>{sea}</b> · إجمالي السلة {fmt(t.seaSum)}</div>
          </div>
        </label>
      </div>
      <noscript><button class="btn sm" type="submit">تطبيق</button></noscript>
    </form>
  );
};

const Summary = ({ t, u, rows, showItems, usePointsToggle }: any) => (
  <div class="summary">
    <h3 style="margin:0 0 10px">ملخص الطلب</h3>
    {showItems && rows.map((r: any) => <div class="row" style="font-size:13px"><span>{r.title_ar.slice(0, 30)}… × {r.qty}</span><span>{fmt(r.line)}</span></div>)}
    <div class="row"><span>المجموع</span><span>{fmt(t.subtotal)}</span></div>
    <div class="row"><span>الشحن من الصين ({t.mode === 'sea' ? 'بحري' : 'جوي'})</span><span style="color:#1a9c5b">مشمول في السعر</span></div>
    <div class="row" style="font-size:12.5px;color:#767676"><span>مدة الوصول المتوقعة</span><span>{t.shipDays}</span></div>
    {t.discount > 0 && <div class="row" style="color:#1a9c5b"><span>خصم الكوبون {t.coupon?.code}</span><span>−{fmt(t.discount)}</span></div>}
    {usePointsToggle && u.points > 0 && <label class="row" style="cursor:pointer"><span><input type="checkbox" name="use_points" value="1" checked={t.pointsUsed > 0} onchange="location.href='/checkout?use_points='+(this.checked?1:0)" /> استخدام نقاطي ({u.points} نقطة)</span><span style="color:#1a9c5b">{t.pointsUsed > 0 ? `−${fmt(t.pointsLyd)}` : `حتى ${fmt(t.maxPts * t.ptsValue)}`}</span></label>}
    {!usePointsToggle && t.pointsUsed > 0 && <div class="row" style="color:#1a9c5b"><span>نقاط ({t.pointsUsed})</span><span>−{fmt(t.pointsLyd)}</span></div>}
    <div class="row"><span>التوصيل{t.city ? ` إلى ${t.city}` : ' داخل ليبيا'}</span><span>{t.delivery ? fmt(t.delivery) : 'مجاني'}</span></div>
    <div class="row tot"><span>الإجمالي</span><span>{fmt(t.total)}</span></div>
  </div>
);

const CouponBox = ({ c, t, back }: { c: Context<Env>; t: any; back: string }) => (
  <form method="post" action="/cart/coupon" class="coupon-box">
    <input type="hidden" name="back" value={back} />
    {t.coupon ? <><span>🎟️ الكوبون <b>{t.coupon.code}</b> مُطبَّق</span><button class="btn sm ghost" name="action" value="remove">إزالة</button></>
      : <><input type="text" name="code" placeholder="كود الكوبون" value={c.req.query('cerr') ? '' : ''} /><button class="btn sm">تطبيق</button><a href="/account/coupons" style="font-size:12px;color:var(--brand)">كوبوناتي</a></>}
    {c.req.query('cerr') && <div class="flash err" style="margin:6px 0 0;padding:6px 10px">{c.req.query('cerr')}</div>}
    {t.couponErr && <div class="flash err" style="margin:6px 0 0;padding:6px 10px">{t.couponErr}</div>}
  </form>
);

store.get('/cart', async (c) => {
  const u = c.get('user');
  const b = await base(c);
  if (!u) return c.html(<Layout {...b} title="السلة"><div class="empty"><div class="big">🛒</div><a class="btn" href="/login?next=/cart">سجّلي الدخول لعرض السلة</a></div></Layout>);
  const rows = await cartRows(c.env.DB, u.id, shipMode(c));
  const t = await cartTotals(c, rows, false);
  const unavailable = rows.some(r => !r.in_stock || r.status !== 'active');
  return c.html(
    <Layout {...b} title="السلة">
      <Flash msg={c.req.query('added') ? 'أُضيف المنتج إلى السلة ✓' : c.req.query('cok') ? 'طُبّق الكوبون ✓' : undefined} />
      <div class="sec-h"><h2>سلة التسوق ({rows.length})</h2></div>
      {rows.length === 0 ? <div class="empty"><div class="big">🛒</div>سلتك فارغة<br /><br /><a class="btn" href="/">ابدئي التسوق</a></div> : (
        <div class="two">
          <div>
            {rows.map(r => (
              <div class="cart-row">
                <a href={`/p/${r.slug}`}><img src={imgUrl(r.image)} alt="" loading="lazy" referrerpolicy="no-referrer" /></a>
                <div>
                  <div class="t"><a href={`/p/${r.slug}`}>{r.title_ar}</a></div>
                  <div class="v">{[r.color, r.size].filter(Boolean).join(' · ')}</div>
                  {(!r.in_stock || r.status !== 'active') && <div style="color:#d3262b;font-size:12px">غير متوفر حاليًا — احذفيه للمتابعة</div>}
                  <form method="post" action="/cart/update" class="inline" style="margin-top:6px">
                    <input type="hidden" name="id" value={r.id} />
                    <div class="qty"><button type="button" data-q="-1">−</button><input type="number" name="qty" value={r.qty} min={r.min_qty ?? 1} onchange="this.form.submit()" /><button type="button" data-q="1">+</button></div>
                    <button class="btn sm ghost" name="action" value="remove">حذف</button>
                  </form>
                </div>
                <div style="font-weight:800">{fmt(r.line)}</div>
              </div>
            ))}
          </div>
          <div>
            <CouponBox c={c} t={t} back="/cart" />
            <div><ShipPicker t={t} back="/cart" /><Summary t={t} u={u} rows={rows} /></div>
            <a class={`btn brand ${unavailable ? 'disabled' : ''}`} href={unavailable ? '#' : '/checkout'} style="display:block;text-align:center;margin-top:12px" aria-disabled={unavailable}>إتمام الطلب</a>
            <p style="font-size:12px;color:#888;margin:10px 0 0">الأسعار شاملة الشحن الدولي والجمارك. لن تُطالبي بأي مبلغ إضافي عند الاستلام.</p>
          </div>
        </div>
      )}
    </Layout>,
  );
});

// ---------- الدفع ----------
store.get('/checkout', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login?next=/checkout');
  const rows = await cartRows(c.env.DB, u.id, shipMode(c));
  if (!rows.length) return c.redirect('/cart');
  const t = await cartTotals(c, rows, c.req.query('use_points') === '1');
  const addrs = await c.env.DB.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id DESC').bind(u.id).all<any>();
  const mp = loadMyPay(t.s, c.env);
  const b = await base(c);
  const pm = c.req.query('pm') ?? Object.keys(PAYMENT_METHODS).find(k => !PAYMENT_METHODS[k].hidden)!;
  const branches = (t.s.branches ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  return c.html(
    <Layout {...b} title="إتمام الطلب">
      <div class="sec-h"><h2>إتمام الطلب</h2><a href="/cart">← العودة للسلة</a></div>
      <form method="post" action="/checkout" class="two" id="checkoutForm">
        <div>
          <div class="card-box"><h3>📍 عنوان التوصيل</h3>
            {addrs.results.length > 0 && <div class="addr-pick">{addrs.results.map((a, i) => <label class="radio"><input type="radio" name="address_id" value={a.id} checked={i === 0} /> <span><b>{a.label || a.name}</b> — {a.name} · {a.phone}<br /><small>{a.city} — {a.address}</small></span></label>)}
              <label class="radio"><input type="radio" name="address_id" value="" /> <span>عنوان جديد</span></label></div>}
            <div id="newAddr" class={addrs.results.length ? 'collapsed' : ''}>
              <label>الاسم الكامل</label><input type="text" name="name" value={u.name} />
              <label>رقم الهاتف</label><input type="tel" name="phone" value={u.phone} />
              <label>المدينة</label>
              {/* بلا new URL: صفحة الدفع تُحمّل سكربتًا يظلّل الاسم في بعض المتصفحات فيفشل المُنشئ */}
              <select name="city" onchange="location.href=location.pathname+'?city='+encodeURIComponent(this.value)+(/use_points=1/.test(location.search)?'&use_points=1':'')">
                {CITIES.map(ct => <option selected={ct === (t.city ?? u.city)}>{ct}</option>)}
              </select>
              <p style="font-size:12px;color:#666;margin:4px 0 0">أجرة التوصيل إلى <b>{t.city ?? u.city ?? CITIES[0]}</b>: <b>{t.delivery === 0 ? 'مجانًا' : fmt(t.cityFee)}</b>{t.delivery === 0 && t.cityFee > 0 ? ` (مجانية لأن طلبك تجاوز ${fmt(parseFloat(t.s.free_ship_over_lyd))})` : ''}</p>
              <label>العنوان بالتفصيل</label><textarea name="address" rows={2}>{u.address ?? ''}</textarea>
              <label class="radio" style="border:0;padding:4px 0"><input type="checkbox" name="save_address" value="1" checked /> احفظي هذا العنوان في دفتر عناويني</label>
            </div>
            <label>ملاحظات (اختياري)</label><input type="text" name="note" />
          </div>
          <div class="card-box"><h3>💳 طريقة الدفع</h3>
            <div class="pm-list">
              {Object.entries(PAYMENT_METHODS).filter(([, v]) => !v.hidden && (!v.online || mp.gateways.includes(v.gateway!))).map(([k, v]) => (
                <label class={`radio pm ${v.online ? 'online' : ''}`}><input type="radio" name="payment_method" value={k} checked={k === pm} required /> <span class="pm-i">{v.icon}</span><span><b>{v.ar}</b>{v.online && <i class="pm-tag">فوري عبر MyPay</i>}<br /><small>{v.desc}</small></span></label>
              ))}
            </div>
            <div class="branches">
              <b>فروعنا للدفع نقدًا</b>
              <ul>{branches.map(b => <li>{b}</li>)}</ul>
              <small>أرقام الهواتف تُضاف قريبًا. بعد الدفع في الفرع يُفعَّل طلبك فورًا.</small>
            </div>
            {mp.mode === 'mock' && <p style="font-size:12px;color:#d68b00">⚠️ بوابة الدفع في وضع المحاكاة (اختبار) — لا يُخصم أي مبلغ حقيقي.</p>}
          </div>
        </div>
        <div>
          <CouponBox c={c} t={t} back="/checkout" />
          <div><ShipPicker t={t} back="/checkout" /><Summary t={t} u={u} rows={rows} showItems usePointsToggle /></div>
          <button class="btn brand" type="submit" style="width:100%;margin-top:12px;font-size:16px">تأكيد الطلب {t.total > 0 ? `· ${fmt(t.total)}` : ''}</button>
          <p style="font-size:12px;color:#888;margin:10px 0 0">بتأكيد الطلب توافقين على <a href="/pages/terms" style="color:var(--brand)">الشروط</a> و<a href="/pages/returns" style="color:var(--brand)">سياسة الإرجاع</a>.</p>
        </div>
      </form>
    </Layout>,
  );
});

store.post('/checkout', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const db = c.env.DB;
  const f = await c.req.parseBody();
  const rows = await cartRows(db, u.id, shipMode(c));
  if (!rows.length) return c.redirect('/cart');
  if (rows.some(r => !r.in_stock || r.status !== 'active')) return c.redirect('/cart');
  const t = await cartTotals(c, rows, f.use_points === '1');
  const method = PAYMENT_METHODS[String(f.payment_method)] ? String(f.payment_method) : 'transfer';
  // العنوان
  let ship: { name: string; phone: string; city: string; address: string };
  if (f.address_id) {
    const a = await db.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').bind(Number(f.address_id), u.id).first<any>();
    if (!a) return c.redirect('/checkout');
    ship = { name: a.name, phone: a.phone, city: a.city, address: a.address };
  } else {
    ship = { name: String(f.name ?? '').trim(), phone: String(f.phone ?? '').trim(), city: String(f.city ?? ''), address: String(f.address ?? '').trim() };
    if (!ship.name || !ship.phone || !ship.address) return c.redirect('/checkout?err=addr');
    if (f.save_address) {
      const n = await db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id=?').bind(u.id).first<any>();
      await db.prepare('INSERT INTO addresses(user_id,name,phone,city,address,is_default) VALUES(?,?,?,?,?,?)').bind(u.id, ship.name, ship.phone, ship.city, ship.address, n.n === 0 ? 1 : 0).run();
    }
  }
  // أجرة التوصيل تُحسم بمدينة العنوان المختار فعلًا، لا بالمدينة التي كانت معروضة في النموذج
  const delivery = t.freeShip || t.subtotal >= parseFloat(t.s.free_ship_over_lyd) ? 0 : deliveryFor(t.s, ship.city);
  const total = Math.round((Math.max(0, t.subtotal - t.discount) - t.pointsLyd + delivery) * 100) / 100;

  // توزيع الطلب على شريك شحن نشط حسب نسبة التوزيع
  const partner = await db.prepare(
    `SELECT p.id FROM partners p WHERE p.active=1 ORDER BY p.share_percent DESC,
     (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('paid','purchasing')) ASC LIMIT 1`,
  ).first<{ id: number }>();
  const ins = await db.prepare(
    `INSERT INTO orders(code,user_id,partner_id,status,payment_method,subtotal_lyd,shipping_lyd,total_lyd,fx_rate_used,ship_name,ship_phone,ship_city,ship_address,note,coupon_code,discount_lyd,points_used,points_lyd,ship_method)
     VALUES('tmp',?,?,'pending_payment',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(u.id, partner?.id ?? null, method, t.subtotal, delivery, total, parseFloat(t.s.fx_cny_lyd),
    ship.name, ship.phone, ship.city, ship.address, f.note ? String(f.note) : null, t.coupon?.code ?? null, t.discount, t.pointsUsed, t.pointsLyd, t.mode).run();
  const oid = ins.meta.last_row_id as number;
  const code = orderCode(oid);
  const stmts = [
    db.prepare('UPDATE orders SET code=? WHERE id=?').bind(code, oid),
    // لقطة التكلفة لحظة البيع: تبقى ثابتة في التقارير مهما تغيّرت إعدادات التسعير لاحقًا
    ...rows.map(r => {
      const br = computePrice(t.s, r.source_price_cny ?? 0, r.weight_g ?? r.est_weight_g ?? 300, r.markup_percent, r.volume_cm3, t.mode, r.min_qty ?? 1);
      return db.prepare(
        `INSERT INTO order_items(order_id,product_id,variant_id,title_ar,color,size,qty,unit_price_lyd,source_offer_id,source_url,unit_cost_lyd,unit_ship_lyd,unit_goods_lyd,ship_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(oid, r.product_id, r.variant_id, r.title_ar, r.color, r.size, r.qty, r.unit, r.source_offer_id, r.source_url,
        br.cost_lyd, br.intl_ship_lyd + br.domestic_ship_lyd, br.goods_lyd, t.mode);
    }),
    db.prepare("INSERT INTO order_events(order_id,status,note,by_user_id) VALUES(?,'pending_payment','تم إنشاء الطلب',?)").bind(oid, u.id),
    db.prepare('DELETE FROM cart_items WHERE user_id=?').bind(u.id),
    db.prepare('UPDATE users SET city=?,address=? WHERE id=?').bind(ship.city, ship.address, u.id),
  ];
  if (t.coupon) {
    stmts.push(db.prepare('INSERT INTO coupon_uses(coupon_id,user_id,order_id,discount_lyd) VALUES(?,?,?,?)').bind(t.coupon.id, u.id, oid, t.discount));
    stmts.push(db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=?').bind(t.coupon.id));
  }
  if (t.pointsUsed > 0) {
    stmts.push(db.prepare('UPDATE users SET points=points-? WHERE id=?').bind(t.pointsUsed, u.id));
    stmts.push(db.prepare("INSERT INTO points_ledger(user_id,delta,reason,order_id) VALUES(?,?,'استخدام نقاط في طلب',?)").bind(u.id, -t.pointsUsed, oid));
  }
  await db.batch(stmts);
  deleteCookie(c, 'coupon', { path: '/' });
  await notify(db, u.id, `طلبك ${code} بانتظار الدفع`, 'أكملي الدفع ليبدأ فريقنا بالشراء.', `/orders/${code}`);
  if (PAYMENT_METHODS[method].online) return c.redirect(`/pay/start/${code}`);
  return c.redirect(`/orders/${code}?new=1`);
});

// ---------- الطلب (يوجّه /account إلى المنطقة الجديدة) ----------
store.get('/orders/:code', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login?next=' + encodeURIComponent(c.req.path));
  const db = c.env.DB;
  const o = await db.prepare('SELECT * FROM orders WHERE code=? AND (user_id=? OR ?=1)').bind(c.req.param('code'), u.id, u.role === 'admin' ? 1 : 0).first<any>();
  if (!o) return c.notFound();
  const [items, events, pays] = await Promise.all([
    db.prepare(`SELECT oi.*,p.slug,(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1) AS image FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE order_id=?`).bind(o.id).all<any>(),
    db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
    db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id DESC').bind(o.id).all<any>(),
  ]);
  const s = await loadSettings(db);
  const steps = ['paid', 'purchased', 'at_warehouse', 'shipped', 'arrived', 'ready', 'delivered'];
  const cur = ORDER_STATUS[o.status]?.step ?? 0;
  const done = new Map(events.results.map(e => [e.status, e.created_at]));
  const pm = PAYMENT_METHODS[o.payment_method];
  const b = await base(c);
  const paid = pays.results.find(p => p.status === 'paid');
  return c.html(
    <Layout {...b} title={`الطلب ${o.code}`}>
      <Flash msg={c.req.query('new') ? '🎉 تم استلام طلبك! أكملي الدفع بالطريقة المختارة ليبدأ الشراء.' : c.req.query('paid') ? '✅ تم الدفع بنجاح! بدأ فريقنا في الصين شراء منتجاتك.' : undefined} />
      <Flash type="err" msg={c.req.query('pay') === 'cancelled' ? 'أُلغيت عملية الدفع. يمكنك المحاولة مرة أخرى.' : c.req.query('pay') === 'failed' ? 'فشلت عملية الدفع. تحققي من الرصيد وحاولي مجددًا أو اختاري طريقة أخرى.' : c.req.query('err') === 'cancel' ? 'لا يمكن إلغاء الطلب بعد الدفع — افتحي تذكرة إلغاء.' : undefined} />
      <div class="crumbs"><a href="/account">حسابي</a> › <a href="/account/orders">طلباتي</a> › {o.code}</div>
      <div class="sec-h"><h2>الطلب {o.code}</h2><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></div>
      <p style="margin:-6px 0 14px;font-size:13.5px;color:var(--ink-2)">
        {o.ship_method === 'sea' ? '🚢 شحن بحري' : '✈️ شحن جوي'} · مدة الوصول المتوقعة <b>{o.ship_method === 'sea' ? (s.sea_days || '٣٠ — ٤٥ يومًا') : (s.air_days || '١٢ — ١٨ يومًا')}</b>
      </p>
      <div class="two">
        <div>
          {o.status === 'pending_payment' && (
            <div class="card-box pay-box"><h3>{pm?.icon} الدفع — {pm?.ar}</h3>
              <p style="font-size:14px">المبلغ: <b>{fmt(o.total_lyd)}</b> · المرجع: <b class="mono" style="display:inline;padding:2px 6px">{o.code}</b></p>
              {pm?.online ? (
                <>
                  <a class="btn brand" href={`/pay/start/${o.code}`} style="width:100%;text-align:center;display:block">ادفعي الآن عبر MyPay {pm.icon}</a>
                  <details style="margin-top:8px"><summary style="font-size:13px;font-weight:400;color:#666">اختيار وسيلة أخرى</summary>
                    <div class="inline">{Object.entries(PAYMENT_METHODS).filter(([k, v]) => v.online && k !== o.payment_method).map(([k, v]) => <a class="btn sm ghost" href={`/pay/start/${o.code}?method=${k}`}>{v.icon} {v.ar}</a>)}</div></details>
                  {pays.results.length > 0 && <p style="font-size:12px;color:#888;margin-top:8px">آخر محاولة: {pays.results[0].trx_ref} — {{ created: 'أُنشئت', pending: 'بانتظار البوابة', paid: 'مدفوعة', failed: 'فشلت', cancelled: 'أُلغيت', refunded: 'مسترجعة' }[pays.results[0].status as string]}</p>}
                </>
              ) : (
                <>
                  <p style="font-size:13px;color:#666">{pm?.desc}</p>
                  <p style="font-size:13px">واتساب التأكيد: <a href={`https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent(`طلب ${o.code} — المبلغ ${o.total_lyd} د.ل`)}`} style="color:var(--brand);direction:ltr">+{s.whatsapp_number}</a></p>
                </>
              )}
              <form method="post" action={`/account/orders/${o.code}/cancel`} style="margin-top:10px" onsubmit="return confirm('إلغاء الطلب؟')"><button class="btn sm ghost" style="color:#d3262b">إلغاء الطلب</button></form>
            </div>
          )}
          {paid && <div class="card-box" style="border-color:#1a9c5b"><h3>✅ مدفوع عبر {pm?.ar}</h3><p style="font-size:13px;color:#666">المرجع: {paid.provider_ref ?? paid.trx_ref} · {timeAgo(paid.updated_at)}</p></div>}
          <div class="card-box"><h3>تتبع الطلب</h3>
            <div class="track">
              {steps.map(st => { const sd = ORDER_STATUS[st]; const isDone = cur >= sd.step; const isNow = o.status === st || (st === 'paid' && ['purchasing'].includes(o.status)) || (st === 'at_warehouse' && o.status === 'consolidated') || (st === 'arrived' && o.status === 'customs'); return (
                <div class={`st ${isDone ? 'done' : ''} ${isNow ? 'now' : ''}`}><div class="dotl"></div><div><div class="lbl">{sd.ar}</div>{done.get(st) && <div class="when">{timeAgo(done.get(st))}</div>}</div></div>); })}
            </div>
          </div>
          <div class="card-box"><h3>المنتجات</h3>
            {items.results.map(it => (
              <div class="cart-row"><img src={imgUrl(it.image)} alt="" loading="lazy" referrerpolicy="no-referrer" /><div><div class="t"><a href={`/p/${it.slug}`}>{it.title_ar}</a></div><div class="v">{[it.color, it.size].filter(Boolean).join(' · ')} × {it.qty}</div>
                {it.purchase_status === 'unavailable' && <div style="color:#d3262b;font-size:12px">⚠️ نفد عند المورد — سنتواصل معك لبديل أو استرجاع</div>}
                {it.proof_image_url && <a href={it.proof_image_url} target="_blank" style="font-size:12px;color:#1c47b3">📷 صورة الفحص من المخزن</a>}
              </div><div style="font-weight:800">{fmt(it.unit_price_lyd * it.qty)}</div></div>
            ))}
            {o.status === 'delivered' && <div class="inline" style="margin-top:10px"><a class="btn sm brand" href={`/account/reviews?order=${o.code}`}>⭐ قيّمي المنتجات واكسبي نقاطًا</a><a class="btn sm ghost" href={`/account/tickets/new?order=${o.code}&type=return`}>↩️ إرجاع / مشكلة</a></div>}
          </div>
        </div>
        <div>
          <div class="summary"><div class="row"><span>المنتجات</span><span>{fmt(o.subtotal_lyd)}</span></div>{o.discount_lyd > 0 && <div class="row" style="color:#1a9c5b"><span>خصم {o.coupon_code}</span><span>−{fmt(o.discount_lyd)}</span></div>}{o.points_used > 0 && <div class="row" style="color:#1a9c5b"><span>نقاط ({o.points_used})</span><span>−{fmt(o.points_lyd)}</span></div>}<div class="row"><span>التوصيل</span><span>{o.shipping_lyd ? fmt(o.shipping_lyd) : 'مجاني'}</span></div><div class="row tot"><span>الإجمالي</span><span>{fmt(o.total_lyd)}</span></div>{o.points_earned > 0 && <div class="row" style="color:var(--brand)"><span>نقاط مكتسبة</span><span>+{o.points_earned} ⭐</span></div>}</div>
          <div class="card-box" style="margin-top:14px"><h3>التوصيل إلى</h3><div style="font-size:14px">{o.ship_name}<br />{o.ship_phone}<br />{o.ship_city} — {o.ship_address}</div></div>
          <div class="card-box"><h3>تحتاجين مساعدة؟</h3><button type="button" class="btn sm brand" data-chat-order={o.code} style="margin-bottom:8px">💬 راسلينا عن هذا الطلب</button> <a class="btn sm ghost" href={`/account/tickets/new?order=${o.code}&type=question`}>افتحي تذكرة</a> <a class="btn sm ghost" href={`https://wa.me/${s.whatsapp_number}`}>واتساب</a></div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- صفحات ثابتة ----------
const PAGES: Record<string, [string, string]> = {
  how: ['كيف نعمل؟', '1) تختارين المنتج وتدفعين بالدينار (بطاقة، سداد، إدفعلي، موبي كاش أو تحويل).\n2) فريقنا في الصين يشتريه من المورد خلال 48 ساعة.\n3) يصل إلى مخزننا في الصين، نفحصه ونصوّره لك.\n4) يُشحن جوًّا مع طلبات أخرى إلى ليبيا.\n5) يُخلّص جمركيًا ويُوصَّل إلى بابك.\nالمدة الإجمالية 15–25 يومًا. تتابعين كل مرحلة من صفحة الطلب وتصلك إشعارات.'],
  shipping: ['الشحن والتوصيل', 'السعر المعروض شامل الشحن الدولي والجمارك. التوصيل داخل المدن الرئيسية 15 د.ل ومجاني للطلبات فوق 500 د.ل. المدة 15–25 يومًا من تأكيد الدفع. المندوب يتصل بك قبل التسليم.'],
  returns: ['سياسة الإرجاع والتعويض', 'لا يمكن إرجاع البضاعة إلى الصين. لذلك نفحص كل قطعة ونصوّرها قبل الشحن.\n\n• منتج تالف أو مختلف جوهريًا عن الوصف: تعويض كامل (استرجاع للمحفظة أو نقاط أو بديل) — افتحي تذكرة خلال 7 أيام من التسليم مع صورة.\n• منتج نفد عند المورد: تُعاد قيمته كاملة تلقائيًا.\n• المقاسات مسؤولية الزبونة — راجعي دليل المقاسات ورأي الزبونات في المقاس على صفحة المنتج.\n• إلغاء الطلب مجاني قبل الدفع، وبعد الدفع وقبل الشراء عبر تذكرة إلغاء.'],
  contact: ['تواصل معنا', 'واتساب: +218 91 000 0000\nبريد: hello@hudhude.com\nساعات العمل: السبت–الخميس 10ص–8م\nأو افتحي تذكرة من حسابك ويرد فريق الدعم خلال 24 ساعة.'],
  faq: ['الأسئلة الشائعة', 'هل السعر نهائي؟ نعم، شامل الشحن والجمارك، تدفعين التوصيل المحلي فقط.\n\nكيف أدفع؟ بطاقة مصرفية محلية عبر معاملات، سداد، إدفعلي، موبي كاش (فوري عبر ماي باي)، أو تحويل مصرفي، أو عربون 30%.\n\nمتى يصل طلبي؟ 15–25 يومًا من تأكيد الدفع.\n\nماذا لو نفد المنتج؟ يُخبرك فريقنا فورًا وتختارين بديلًا أو استرجاعًا كاملًا.\n\nكيف أكسب النقاط؟ نقطة لكل دينار عند التسليم، ونقاط إضافية للتقييمات. كل 100 نقطة = دينار.\n\nهل أستطيع الإلغاء؟ نعم قبل الدفع مباشرة، وبعده عبر تذكرة قبل بدء الشراء.'],
  terms: ['الشروط والأحكام', 'بإتمام الطلب توافقين على: أن هدهدي وكيل شراء يشتري المنتج نيابة عنك من المورد؛ أن الصور والمواصفات من المورد وقد تختلف الألوان قليلًا؛ أن مدة التوصيل تقديرية؛ أن الطلب يبدأ شراؤه بعد تأكيد الدفع؛ وأن سياسة الإرجاع والتعويض المنشورة هي المرجع لأي خلاف.'],
  privacy: ['الخصوصية', 'نستخدم رقم هاتفك وعنوانك لتنفيذ الطلب والتواصل بشأنه فقط. بيانات الدفع تُعالج لدى بوابة ماي باي ولا نخزّن أرقام البطاقات. لا نبيع بياناتك لأي طرف.'],
};
store.get('/pages/:key', async (c) => {
  const pg = PAGES[c.req.param('key')]; if (!pg) return c.notFound();
  const b = await base(c);
  return c.html(<Layout {...b} title={pg[0]}><div class="form" style="max-width:720px"><h1>{pg[0]}</h1><p style="white-space:pre-line;font-size:15px;line-height:1.9">{pg[1]}</p></div></Layout>);
});

export default store;
