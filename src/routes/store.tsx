import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS, CITIES } from '../types';
import { Layout, Flash } from '../views/layout';
import { Grid } from '../views/product-card';
import { Stars } from '../views/account';
import { getCategories, PRODUCT_SELECT, fmt, imgUrl, orderCode, timeAgo, notify } from '../lib/db';
import type { ProductRow } from '../lib/db';
import { loadSettings } from '../lib/pricing';
import { checkCoupon } from '../lib/coupons';
import { loadMyPay } from '../lib/mypay';

const store = new Hono<Env>();

async function favs(c: Context<Env>): Promise<Set<number>> {
  const u = c.get('user');
  if (!u) return new Set();
  const { results } = await c.env.DB.prepare('SELECT product_id FROM wishlist WHERE user_id=?').bind(u.id).all();
  return new Set(results.map((r: any) => r.product_id));
}

const base = async (c: Context<Env>) => ({
  user: c.get('user'), cartCount: c.get('cartCount'), categories: await getCategories(c.env.DB),
});

// ---------- الرئيسية (تخطيط 1688 بهوية دلال: قائمة أقسام جانبية + بانر + بطاقة الحساب + طوابق أقسام) ----------
store.get('/', async (c) => {
  const db = c.env.DB; const u = c.get('user');
  const b = await base(c);
  const floorCats = b.categories.slice(0, 8);
  const [trend, newest, sale, f, floors, stats] = await Promise.all([
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' ORDER BY p.sales DESC, p.views DESC LIMIT 10`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' ORDER BY p.id DESC LIMIT 10`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.compare_price_lyd > p.price_lyd ORDER BY (p.compare_price_lyd-p.price_lyd)/p.compare_price_lyd DESC LIMIT 10`).all<ProductRow>(),
    favs(c),
    floorCats.length ? db.prepare(`SELECT * FROM (SELECT ${PRODUCT_SELECT}, ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.sales DESC, p.views DESC) rn FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.category_id IN (${floorCats.map(() => '?').join(',')})) WHERE rn<=5`).bind(...floorCats.map(x => x.id)).all<ProductRow & { rn: number }>() : Promise.resolve({ results: [] as any[] }),
    db.prepare("SELECT (SELECT COUNT(*) FROM products WHERE status='active') p,(SELECT COUNT(*) FROM orders WHERE status='delivered') d,(SELECT COUNT(*) FROM users WHERE role='customer') u").first<any>(),
  ]);
  const recent = await recentlyViewed(c);
  const s = await loadSettings(db);
  const myOrders = u ? await db.prepare("SELECT COUNT(*) n FROM orders WHERE user_id=? AND status NOT IN ('delivered','cancelled','refunded')").bind(u.id).first<any>() : null;
  const slides = [
    { cls: 'sl-a', k: 'دلال يجيبلك من الصين لباب البيت', t: 'آلاف المنتجات بأسعار نهائية بالدينار الليبي، شاملة الشحن والجمارك.', a: '/c/dresses', l: 'تسوقي الآن' },
    { cls: 'sl-b', k: 'ادفعي ببطاقتك أو سداد أو إدفعلي', t: 'دفع فوري وآمن عبر ماي باي، أو تحويل، أو عربون 30% والباقي عند الاستلام.', a: '/pages/faq', l: 'طرق الدفع' },
    { cls: 'sl-c', k: 'نقاط مع كل طلب + كوبون ترحيبي WELCOME10', t: 'نقطة لكل دينار عند التسليم، وكل 100 نقطة = دينار تُخصم من طلبك التالي.', a: u ? '/account/points' : '/register', l: u ? 'نقاطي' : 'أنشئي حسابًا' },
  ];
  return c.html(
    <Layout {...b}>
      <section class="home-top">
        <aside class="cat-menu">
          <h4>كل الأقسام</h4>
          {b.categories.map(cat => <a href={`/c/${cat.slug}`}>{cat.name_ar}<i>›</i></a>)}
          <a href="/sale" class="hot">عروض وتخفيضات<i>›</i></a>
        </aside>
        <div class="carousel" data-carousel>
          <div class="slides">{slides.map(sl => <div class={`slide ${sl.cls}`}><span class="eyebrow">توصيل لكل ليبيا · أسعار نهائية</span><h1>{sl.k}</h1><p>{sl.t}</p><a class="cta" href={sl.a}>{sl.l}</a></div>)}</div>
          <div class="dots">{slides.map((_, i) => <button type="button" data-dot={i} class={i === 0 ? 'on' : ''} aria-label={`شريحة ${i + 1}`}></button>)}</div>
        </div>
        <div class="user-card">
          {u ? <>
            <div class="uc-h"><div class="av">{u.name.slice(0, 1)}</div><div><b>أهلًا {u.name.split(' ')[0]}</b><br /><small>⭐ {u.points} نقطة</small></div></div>
            <div class="uc-grid"><a href="/account/orders">📦<span>طلباتي</span>{myOrders?.n ? <i>{myOrders.n}</i> : null}</a><a href="/account/coupons">🎟️<span>كوبوناتي</span></a><a href="/wishlist">♡<span>المفضلة</span></a><a href="/account/tickets">↩️<span>الدعم</span></a></div>
          </> : <>
            <div class="uc-h"><div class="av">👋</div><div><b>أهلًا بك في دلال</b><br /><small>سجّلي واكسبي نقاطًا مع كل طلب</small></div></div>
            <div class="uc-promo"><b>سجّلي الآن</b><span>واكسبي نقاطًا تُخصم من طلبك القادم</span></div><a class="btn brand" href="/register" style="display:block;text-align:center">إنشاء حساب</a><a class="btn ghost" href="/login" style="display:block;text-align:center;margin-top:6px">تسجيل الدخول</a>
          </>}
          <ul class="uc-list"><li>🚚 الوصول خلال 15–25 يومًا</li><li>🔍 فحص وتصوير قبل الشحن</li><li>↩️ تعويض كامل لأي تالف</li></ul>
          <div class="uc-stats"><span><b>{stats?.p ?? 0}</b> منتج</span><span><b>{stats?.d ?? 0}</b> طلب مُسلَّم</span><span><b>{stats?.u ?? 0}</b> زبونة</span></div>
        </div>
      </section>
      <div class="cat-tiles mobile-only">{b.categories.slice(0, 12).map(cat => <a href={`/c/${cat.slug}`}><span>{cat.icon}</span>{cat.name_ar}</a>)}</div>
      <div class="flash-sale">
        ⚡ <b>فلاش سيل</b> ينتهي خلال <span class="timer" data-countdown="6h">06:00:00</span>
        <a href="/sale" style="margin-inline-start:auto;color:#ffcf3f">عرض الكل ›</a>
      </div>
      <div class="sec-h"><h2>عروض اليوم</h2><a href="/sale">المزيد ›</a></div>
      <Grid items={sale.results} favs={f} />
      <div class="sec-h"><h2>الأكثر رواجًا</h2><a href="/trending">المزيد ›</a></div>
      <Grid items={trend.results} favs={f} />
      {floorCats.map((cat, i) => { const items = floors.results.filter((r: any) => r.category_id === cat.id); return items.length ? (
        <section class={`floor f${i % 4}`}>
          <div class="floor-h"><span class="ic">{cat.icon}</span><h2>{cat.name_ar}</h2><nav><a href={`/c/${cat.slug}?sort=popular`}>الأكثر مبيعًا</a><a href={`/c/${cat.slug}?sort=new`}>الأحدث</a><a href={`/c/${cat.slug}?sort=price_asc`}>الأرخص</a></nav><a class="more" href={`/c/${cat.slug}`}>عرض الكل ›</a></div>
          <Grid items={items} favs={f} />
        </section>) : null; })}
      <div class="sec-h"><h2>وصل حديثًا</h2><a href="/new">المزيد ›</a></div>
      <Grid items={newest.results} favs={f} />
      {recent.length > 0 && <><div class="sec-h"><h2>شاهدتِ مؤخرًا</h2></div><Grid items={recent} favs={f} /></>}
      <section class="why">
        <div><b>🏭 مباشرة من مصانع الصين</b><span>نشتري من 1688 بأسعار الجملة ونبيع بالقطعة.</span></div>
        <div><b>💳 ادفعي بالدينار</b><span>ماي باي: بطاقة، سداد، إدفعلي، موبي كاش.</span></div>
        <div><b>📦 تتبّع كل مرحلة</b><span>من الشراء إلى الجمارك إلى بابك، بإشعارات.</span></div>
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
async function listPage(c: Context<Env>, opts: { title: string; where: string; binds: any[]; active?: string; q?: string; catId?: number }) {
  const db = c.env.DB;
  const url = new URL(c.req.url);
  const sort = url.searchParams.get('sort') ?? 'popular';
  const min = parseFloat(url.searchParams.get('min') ?? '') || null;
  const max = parseFloat(url.searchParams.get('max') ?? '') || null;
  const size = url.searchParams.get('size');
  const color = url.searchParams.get('color');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const per = 30;
  let where = opts.where;
  const binds = [...opts.binds];
  if (min) { where += ' AND p.price_lyd>=?'; binds.push(min); }
  if (max) { where += ' AND p.price_lyd<=?'; binds.push(max); }
  if (size) { where += ' AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.size=?)'; binds.push(size); }
  if (color) { where += ' AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.color=?)'; binds.push(color); }
  const order = { popular: 'p.sales DESC,p.views DESC', new: 'p.id DESC', price_asc: 'p.price_lyd ASC', price_desc: 'p.price_lyd DESC', rating: 'p.rating DESC,p.review_count DESC' }[sort] ?? 'p.sales DESC';
  const [rows, cnt, sizes, colors, f] = await Promise.all([
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per).all<ProductRow>(),
    db.prepare(`SELECT COUNT(*) n FROM products p WHERE ${where}`).bind(...binds).first<{ n: number }>(),
    db.prepare(`SELECT DISTINCT v.size FROM variants v JOIN products p ON p.id=v.product_id WHERE ${opts.where} AND v.size IS NOT NULL ORDER BY v.size`).bind(...opts.binds).all<{ size: string }>(),
    db.prepare(`SELECT DISTINCT v.color FROM variants v JOIN products p ON p.id=v.product_id WHERE ${opts.where} AND v.color IS NOT NULL ORDER BY v.color LIMIT 20`).bind(...opts.binds).all<{ color: string }>(),
    favs(c),
  ]);
  const total = cnt?.n ?? 0;
  const pages = Math.ceil(total / per);
  const link = (k: string, v: string | null) => { const u = new URL(c.req.url); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); u.searchParams.delete('page'); return u.pathname + u.search; };
  const b = await base(c);
  return c.html(
    <Layout {...b} title={opts.title} active={opts.active} q={opts.q}>
      <div class="sec-h"><h2>{opts.title} <small style="color:#888;font-weight:400">({total})</small></h2></div>
      <div class="tabs">
        {[['popular', 'الأكثر رواجًا'], ['new', 'الأحدث'], ['rating', 'الأعلى تقييمًا'], ['price_asc', 'السعر ↑'], ['price_desc', 'السعر ↓']].map(([k, l]) =>
          <a href={link('sort', k)} class={sort === k ? 'on' : ''}>{l}</a>)}
      </div>
      <form class="inline filters" method="get">
        {[...url.searchParams].filter(([k]) => !['min', 'max', 'page'].includes(k)).map(([k, v]) => <input type="hidden" name={k} value={v} />)}
        السعر: <input type="number" name="min" placeholder="من" value={min ?? ''} style="width:80px" /> — <input type="number" name="max" placeholder="إلى" value={max ?? ''} style="width:80px" />
        <button class="btn sm ghost" type="submit">تطبيق</button>
        {sizes.results.length > 0 && <select name="size" onchange="this.form.submit()"><option value="">المقاس</option>{sizes.results.map(s => <option value={s.size} selected={size === s.size}>{s.size}</option>)}</select>}
        {colors.results.length > 0 && <select name="color" onchange="this.form.submit()"><option value="">اللون</option>{colors.results.map(s => <option value={s.color} selected={color === s.color}>{s.color}</option>)}</select>}
        {(min || max || size || color) && <a href={link('min', null).split('?')[0]} style="color:#b5124f">مسح الفلاتر ✕</a>}
      </form>
      <Grid items={rows.results} favs={f} />
      {pages > 1 && (
        <div class="tabs" style="justify-content:center;margin-top:20px">
          {Array.from({ length: pages }, (_, i) => i + 1).map(n => <a href={link('page', String(n))} class={n === page ? 'on' : ''}>{n}</a>)}
        </div>
      )}
    </Layout>,
  );
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
store.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.redirect('/');
  return listPage(c, { title: `نتائج البحث: ${q}`, where: "p.status='active' AND (p.title_ar LIKE ? OR p.description_ar LIKE ?)", binds: [`%${q}%`, `%${q}%`], q });
});
store.get('/sale', (c) => listPage(c, { title: 'عروض وتخفيضات', where: "p.status='active' AND p.compare_price_lyd > p.price_lyd", binds: [] }));
store.get('/trending', (c) => listPage(c, { title: 'الأكثر رواجًا', where: "p.status='active' AND p.sales>0", binds: [] }));
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
  const colors = [...new Set(vars.results.map(v => v.color).filter(Boolean))] as string[];
  const sizes = [...new Set(vars.results.map(v => v.size).filter(Boolean))] as string[];
  const images = imgs.results.length ? imgs.results.map(i => i.url) : ['/placeholder.svg'];
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
  const isClothing = ['dresses', 'abayas', 'tops', 'kids'].includes(p.cat_slug ?? '');
  const fitTotal = fit.results.reduce((a, r) => a + r.n, 0);
  const fitPct = (k: string) => fitTotal ? Math.round((fit.results.find(r => r.size_fit === k)?.n ?? 0) / fitTotal * 100) : 0;
  const s = await loadSettings(db);
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
          <div class="meta" style="font-size:13px;color:#666"><a href="#reviews"><Stars n={p.rating} /> {p.rating.toFixed(1)} ({p.review_count} تقييم)</a> · {p.sales}+ بيعت · {p.views} مشاهدة</div>
          <div class="price" style="margin-top:8px">{fmt(p.price_lyd)}{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}{off > 0 && <span class="tag" style="position:static;margin-inline-start:8px;font-size:13px;background:#b5124f;color:#fff;padding:2px 8px;border-radius:4px">-{off}%</span>}</div>
          <div class="price-note">السعر شامل الشحن من الصين والجمارك. التوصيل داخل ليبيا {fmt(parseFloat(s.delivery_lyd))} (مجاني فوق {fmt(parseFloat(s.free_ship_over_lyd))}). تكسبين <b>{Math.floor(p.price_lyd * parseFloat(s.points_per_lyd || '1'))} نقطة</b> عند التسليم.</div>
          {!p.in_stock && <Flash type="err" msg="هذا المنتج غير متوفر حاليًا عند المورد. أضيفيه للمفضلة وسنخبرك عند توفره." />}
          <form method="post" action="/cart/add" id="addForm">
            <input type="hidden" name="product_id" value={p.id} />
            <input type="hidden" name="variant_id" id="variantId" value="" />
            {colors.length > 0 && (
              <div class="opts"><h4>اللون: <span id="colorLbl"></span></h4>
                <div class="chips" data-opt="color">{colors.map(cl => <span class="chip" data-val={cl}>{cl}</span>)}</div></div>
            )}
            {sizes.length > 0 && (
              <div class="opts"><h4>المقاس: <span id="sizeLbl"></span> <a href="#sizeGuide" style="font-weight:400;font-size:12px;color:#b5124f;margin-inline-start:8px">دليل المقاسات</a></h4>
                <div class="chips" data-opt="size">{sizes.map(sz => <span class="chip" data-val={sz}>{sz}</span>)}</div>
                {fitTotal > 0 && <div class="fit"><span>رأي الزبونات في المقاس:</span> <b>{fitPct('true')}%</b> مطابق · <b>{fitPct('small')}%</b> أصغر · <b>{fitPct('large')}%</b> أكبر</div>}
              </div>
            )}
            <script type="application/json" id="variantsJson" dangerouslySetInnerHTML={{ __html: JSON.stringify(vars.results).replace(/</g, '\\u003c') }}></script>
            <div class="opts"><h4>الكمية</h4>
              <div class="qty"><button type="button" data-q="-1">−</button><input type="number" name="qty" value={p.min_qty} min={p.min_qty} /><button type="button" data-q="1">+</button></div>
              {p.min_qty > 1 && <span style="font-size:12px;color:#888;margin-inline-start:8px">الحد الأدنى {p.min_qty} قطع</span>}
            </div>
            <div class="inline" style="margin:16px 0">
              <button class="btn brand" type="submit" disabled={!p.in_stock} style="flex:1">أضيفي إلى السلة</button>
              <button class="btn ghost" type="button" data-fav={p.id}>{f.has(p.id) ? '♥ في المفضلة' : '♡ المفضلة'}</button>
            </div>
          </form>
          <div class="trust">
            <div>🚚 <b>الوصول خلال 15–25 يومًا</b><br />شحن جوي مجمّع من الصين</div>
            <div>💳 <b>ادفعي بالدينار</b><br />بطاقة مصرفية · سداد · إدفعلي · موبي كاش</div>
            <div>🔍 <b>فحص قبل الشحن</b><br />صور للبضاعة من مخزننا في الصين</div>
            <div>↩️ <b>ضمان الوصول</b><br />تعويض كامل لأي تالف أو مختلف</div>
          </div>
          <details open><summary>الوصف</summary><div style="font-size:14px;white-space:pre-line">{p.description_ar ?? 'لا يوجد وصف.'}</div></details>
          {isClothing && (
            <details id="sizeGuide"><summary>دليل المقاسات (آسيوي ← ليبي)</summary>
              <div class="size-guide"><table>
                <tr><th>المقاس</th><th>الصدر (سم)</th><th>الخصر (سم)</th><th>يناسب</th></tr>
                <tr><td>S</td><td>84–88</td><td>66–70</td><td>36–38</td></tr>
                <tr><td>M</td><td>88–92</td><td>70–74</td><td>38–40</td></tr>
                <tr><td>L</td><td>92–96</td><td>74–78</td><td>40–42</td></tr>
                <tr><td>XL</td><td>96–102</td><td>78–84</td><td>42–44</td></tr>
                <tr><td>2XL</td><td>102–108</td><td>84–90</td><td>44–46</td></tr>
              </table><p style="color:#b5124f">⚠️ المقاسات الصينية أصغر بمقاس واحد عادةً. ننصح بطلب مقاس أكبر.</p></div>
            </details>
          )}
          <details><summary>الشحن والإرجاع</summary>
            <div style="font-size:14px">نشتري المنتج من المورد بعد تأكيد طلبك، ثم يُجمع مع طلبات أخرى في مخزننا بالصين ويُشحن جوًّا إلى ليبيا. لا يمكن إرجاع البضاعة إلى الصين، لكن نعوّض أي منتج تالف أو مختلف عن الوصف بصور الفحص. <a href="/pages/returns" style="color:#b5124f">سياسة الإرجاع الكاملة</a></div>
          </details>
        </div>
      </div>
      <section id="reviews" class="card-box" style="margin-top:20px">
        <div class="sec-h" style="margin:0 0 10px"><h2>التقييمات ({p.review_count})</h2><span><Stars n={p.rating} size={18} /> <b>{p.rating.toFixed(1)}</b> / 5</span></div>
        {reviews.results.length === 0 ? <p style="color:#888">لا تقييمات منشورة بعد. كوني أول من يقيّم بعد استلام طلبك.</p> : reviews.results.map(r => (
          <div class="review"><div class="rv-h"><b>{r.name.split(' ')[0]} {r.name.split(' ')[1]?.slice(0, 1) ?? ''}.</b><Stars n={r.rating} /><small style="color:#888">{timeAgo(r.created_at)}</small>{r.size_fit && <span class="status">{{ small: 'المقاس أصغر', true: 'المقاس مطابق', large: 'المقاس أكبر' }[r.size_fit as string]}</span>}</div><p>{r.body}</p>{r.image_url && <a href={r.image_url} target="_blank"><img src={r.image_url} class="rv-img" alt="" /></a>}</div>
        ))}
      </section>
      <div class="sec-h"><h2>قد يعجبك أيضًا</h2></div>
      <Grid items={related.results} favs={f} />
      {recent.length > 0 && <><div class="sec-h"><h2>شاهدتِ مؤخرًا</h2></div><Grid items={recent} favs={f} /></>}
    </Layout>,
  );
});

// ---------- المفضلة ----------
store.get('/wishlist', async (c) => {
  const u = c.get('user');
  const b = await base(c);
  if (!u) return c.html(<Layout {...b} title="المفضلة"><div class="empty"><div class="big">♡</div><a class="btn" href="/login?next=/wishlist">سجّلي الدخول لعرض المفضلة</a></div></Layout>);
  const { results } = await c.env.DB.prepare(`SELECT ${PRODUCT_SELECT} FROM wishlist w JOIN products p ON p.id=w.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE w.user_id=?`).bind(u.id).all<ProductRow>();
  return c.html(<Layout {...b} title="المفضلة"><div class="sec-h"><h2>المفضلة</h2></div><Grid items={results} favs={new Set(results.map(r => r.id))} /></Layout>);
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
  if (!u) { let back = '/'; try { back = new URL(c.req.header('referer') ?? '/', c.req.url).pathname; } catch {} return c.redirect(`/login?next=${encodeURIComponent(back)}`); }
  const p = await c.env.DB.prepare('SELECT in_stock,min_qty FROM products WHERE id=? AND status=?').bind(pid, 'active').first<any>();
  if (!p || !p.in_stock) return c.redirect((c.req.header('referer') ?? '/') + '?err=unavailable');
  await c.env.DB.prepare(
    `INSERT INTO cart_items(user_id,product_id,variant_id,qty) VALUES(?,?,?,?)
     ON CONFLICT(user_id,product_id,variant_id) DO UPDATE SET qty=qty+excluded.qty`,
  ).bind(u.id, pid, vid, Math.max(qty, p.min_qty)).run();
  return c.redirect('/cart?added=1');
});
store.post('/cart/update', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const f = await c.req.parseBody();
  const id = Number(f.id), qty = Number(f.qty);
  if (f.action === 'remove' || qty <= 0) await c.env.DB.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').bind(id, u.id).run();
  else await c.env.DB.prepare('UPDATE cart_items SET qty=? WHERE id=? AND user_id=?').bind(qty, id, u.id).run();
  return c.redirect('/cart');
});
store.post('/cart/coupon', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const f = await c.req.parseBody();
  const back = String(f.back ?? '/cart');
  if (f.action === 'remove' || !f.code) { deleteCookie(c, 'coupon', { path: '/' }); return c.redirect(back); }
  const rows = await cartRows(c.env.DB, u.id);
  const r = await checkCoupon(c.env.DB, String(f.code), u.id, rows.reduce((a, x) => a + x.line, 0));
  if (!r.ok) { deleteCookie(c, 'coupon', { path: '/' }); return c.redirect(`${back}?cerr=${encodeURIComponent(r.error)}`); }
  setCookie(c, 'coupon', r.coupon.code, { path: '/', maxAge: 86400, sameSite: 'Lax' });
  return c.redirect(`${back}?cok=1`);
});

async function cartRows(db: D1Database, uid: number) {
  const { results } = await db.prepare(
    `SELECT ci.id,ci.qty,ci.variant_id,p.id AS product_id,p.slug,p.title_ar,p.price_lyd,p.in_stock,p.status,p.source_offer_id,p.source_url,
            v.color,v.size,COALESCE(v.price_delta_lyd,0) AS delta,
            COALESCE(v.image_url,(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1)) AS image
     FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN variants v ON v.id=ci.variant_id WHERE ci.user_id=?`,
  ).bind(uid).all<any>();
  return results.map(r => ({ ...r, unit: r.price_lyd + r.delta, line: (r.price_lyd + r.delta) * r.qty }));
}

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
  const delivery = freeShip || subtotal >= parseFloat(s.free_ship_over_lyd) ? 0 : parseFloat(s.delivery_lyd);
  const total = Math.round((afterCoupon - pointsLyd + delivery) * 100) / 100;
  return { s, subtotal, discount, freeShip, coupon, couponErr, pointsUsed, pointsLyd, maxPts, ptsValue, delivery, total };
}

const Summary = ({ t, u, rows, showItems, usePointsToggle }: any) => (
  <div class="summary">
    <h3 style="margin:0 0 10px">ملخص الطلب</h3>
    {showItems && rows.map((r: any) => <div class="row" style="font-size:13px"><span>{r.title_ar.slice(0, 30)}… × {r.qty}</span><span>{fmt(r.line)}</span></div>)}
    <div class="row"><span>المجموع</span><span>{fmt(t.subtotal)}</span></div>
    {t.discount > 0 && <div class="row" style="color:#1a9c5b"><span>خصم الكوبون {t.coupon?.code}</span><span>−{fmt(t.discount)}</span></div>}
    {usePointsToggle && u.points > 0 && <label class="row" style="cursor:pointer"><span><input type="checkbox" name="use_points" value="1" checked={t.pointsUsed > 0} onchange="location.href='/checkout?use_points='+(this.checked?1:0)" /> استخدام نقاطي ({u.points} نقطة)</span><span style="color:#1a9c5b">{t.pointsUsed > 0 ? `−${fmt(t.pointsLyd)}` : `حتى ${fmt(t.maxPts * t.ptsValue)}`}</span></label>}
    {!usePointsToggle && t.pointsUsed > 0 && <div class="row" style="color:#1a9c5b"><span>نقاط ({t.pointsUsed})</span><span>−{fmt(t.pointsLyd)}</span></div>}
    <div class="row"><span>التوصيل داخل ليبيا</span><span>{t.delivery ? fmt(t.delivery) : 'مجاني'}</span></div>
    <div class="row tot"><span>الإجمالي</span><span>{fmt(t.total)}</span></div>
  </div>
);

const CouponBox = ({ c, t, back }: { c: Context<Env>; t: any; back: string }) => (
  <form method="post" action="/cart/coupon" class="coupon-box">
    <input type="hidden" name="back" value={back} />
    {t.coupon ? <><span>🎟️ الكوبون <b>{t.coupon.code}</b> مُطبَّق</span><button class="btn sm ghost" name="action" value="remove">إزالة</button></>
      : <><input type="text" name="code" placeholder="كود الكوبون" value={c.req.query('cerr') ? '' : ''} /><button class="btn sm">تطبيق</button><a href="/account/coupons" style="font-size:12px;color:#b5124f">كوبوناتي</a></>}
    {c.req.query('cerr') && <div class="flash err" style="margin:6px 0 0;padding:6px 10px">{c.req.query('cerr')}</div>}
    {t.couponErr && <div class="flash err" style="margin:6px 0 0;padding:6px 10px">{t.couponErr}</div>}
  </form>
);

store.get('/cart', async (c) => {
  const u = c.get('user');
  const b = await base(c);
  if (!u) return c.html(<Layout {...b} title="السلة"><div class="empty"><div class="big">🛒</div><a class="btn" href="/login?next=/cart">سجّلي الدخول لعرض السلة</a></div></Layout>);
  const rows = await cartRows(c.env.DB, u.id);
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
                    <div class="qty"><button type="button" data-q="-1">−</button><input type="number" name="qty" value={r.qty} min="1" onchange="this.form.submit()" /><button type="button" data-q="1">+</button></div>
                    <button class="btn sm ghost" name="action" value="remove">حذف</button>
                  </form>
                </div>
                <div style="font-weight:800">{fmt(r.line)}</div>
              </div>
            ))}
          </div>
          <div>
            <CouponBox c={c} t={t} back="/cart" />
            <Summary t={t} u={u} rows={rows} />
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
  const rows = await cartRows(c.env.DB, u.id);
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
              <label>المدينة</label><select name="city">{CITIES.map(ct => <option selected={ct === u.city}>{ct}</option>)}</select>
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
          <Summary t={t} u={u} rows={rows} showItems usePointsToggle />
          <button class="btn brand" type="submit" style="width:100%;margin-top:12px;font-size:16px">تأكيد الطلب {t.total > 0 ? `· ${fmt(t.total)}` : ''}</button>
          <p style="font-size:12px;color:#888;margin:10px 0 0">بتأكيد الطلب توافقين على <a href="/pages/terms" style="color:#b5124f">الشروط</a> و<a href="/pages/returns" style="color:#b5124f">سياسة الإرجاع</a>.</p>
        </div>
      </form>
    </Layout>,
  );
});

store.post('/checkout', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const db = c.env.DB;
  const f = await c.req.parseBody();
  const rows = await cartRows(db, u.id);
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
  // توزيع الطلب على شريك شحن نشط حسب نسبة التوزيع
  const partner = await db.prepare(
    `SELECT p.id FROM partners p WHERE p.active=1 ORDER BY p.share_percent DESC,
     (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('paid','purchasing')) ASC LIMIT 1`,
  ).first<{ id: number }>();
  const ins = await db.prepare(
    `INSERT INTO orders(code,user_id,partner_id,status,payment_method,subtotal_lyd,shipping_lyd,total_lyd,fx_rate_used,ship_name,ship_phone,ship_city,ship_address,note,coupon_code,discount_lyd,points_used,points_lyd)
     VALUES('tmp',?,?,'pending_payment',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(u.id, partner?.id ?? null, method, t.subtotal, t.delivery, t.total, parseFloat(t.s.fx_cny_lyd),
    ship.name, ship.phone, ship.city, ship.address, f.note ? String(f.note) : null, t.coupon?.code ?? null, t.discount, t.pointsUsed, t.pointsLyd).run();
  const oid = ins.meta.last_row_id as number;
  const code = orderCode(oid);
  const stmts = [
    db.prepare('UPDATE orders SET code=? WHERE id=?').bind(code, oid),
    ...rows.map(r => db.prepare(
      `INSERT INTO order_items(order_id,product_id,variant_id,title_ar,color,size,qty,unit_price_lyd,source_offer_id,source_url) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).bind(oid, r.product_id, r.variant_id, r.title_ar, r.color, r.size, r.qty, r.unit, r.source_offer_id, r.source_url)),
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
                  <p style="font-size:13px">واتساب التأكيد: <a href={`https://wa.me/${s.whatsapp_number}?text=${encodeURIComponent(`طلب ${o.code} — المبلغ ${o.total_lyd} د.ل`)}`} style="color:#b5124f;direction:ltr">+{s.whatsapp_number}</a></p>
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
          <div class="summary"><div class="row"><span>المنتجات</span><span>{fmt(o.subtotal_lyd)}</span></div>{o.discount_lyd > 0 && <div class="row" style="color:#1a9c5b"><span>خصم {o.coupon_code}</span><span>−{fmt(o.discount_lyd)}</span></div>}{o.points_used > 0 && <div class="row" style="color:#1a9c5b"><span>نقاط ({o.points_used})</span><span>−{fmt(o.points_lyd)}</span></div>}<div class="row"><span>التوصيل</span><span>{o.shipping_lyd ? fmt(o.shipping_lyd) : 'مجاني'}</span></div><div class="row tot"><span>الإجمالي</span><span>{fmt(o.total_lyd)}</span></div>{o.points_earned > 0 && <div class="row" style="color:#b5124f"><span>نقاط مكتسبة</span><span>+{o.points_earned} ⭐</span></div>}</div>
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
  contact: ['تواصل معنا', 'واتساب: +218 91 000 0000\nبريد: hello@dlal.ly\nساعات العمل: السبت–الخميس 10ص–8م\nأو افتحي تذكرة من حسابك ويرد فريق الدعم خلال 24 ساعة.'],
  faq: ['الأسئلة الشائعة', 'هل السعر نهائي؟ نعم، شامل الشحن والجمارك، تدفعين التوصيل المحلي فقط.\n\nكيف أدفع؟ بطاقة مصرفية محلية عبر معاملات، سداد، إدفعلي، موبي كاش (فوري عبر ماي باي)، أو تحويل مصرفي، أو عربون 30%.\n\nمتى يصل طلبي؟ 15–25 يومًا من تأكيد الدفع.\n\nماذا لو نفد المنتج؟ يُخبرك فريقنا فورًا وتختارين بديلًا أو استرجاعًا كاملًا.\n\nكيف أكسب النقاط؟ نقطة لكل دينار عند التسليم، ونقاط إضافية للتقييمات. كل 100 نقطة = دينار.\n\nهل أستطيع الإلغاء؟ نعم قبل الدفع مباشرة، وبعده عبر تذكرة قبل بدء الشراء.'],
  terms: ['الشروط والأحكام', 'بإتمام الطلب توافقين على: أن دلال وسيط شراء يشتري المنتج نيابة عنك من المورد؛ أن الصور والمواصفات من المورد وقد تختلف الألوان قليلًا؛ أن مدة التوصيل تقديرية؛ أن الطلب يبدأ شراؤه بعد تأكيد الدفع؛ وأن سياسة الإرجاع والتعويض المنشورة هي المرجع لأي خلاف.'],
  privacy: ['الخصوصية', 'نستخدم رقم هاتفك وعنوانك لتنفيذ الطلب والتواصل بشأنه فقط. بيانات الدفع تُعالج لدى بوابة ماي باي ولا نخزّن أرقام البطاقات. لا نبيع بياناتك لأي طرف.'],
};
store.get('/pages/:key', async (c) => {
  const pg = PAGES[c.req.param('key')]; if (!pg) return c.notFound();
  const b = await base(c);
  return c.html(<Layout {...b} title={pg[0]}><div class="form" style="max-width:720px"><h1>{pg[0]}</h1><p style="white-space:pre-line;font-size:15px;line-height:1.9">{pg[1]}</p></div></Layout>);
});

export default store;
