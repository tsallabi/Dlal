import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS, CITIES } from '../types';
import { Layout, Flash } from '../views/layout';
import { Grid } from '../views/product-card';
import { getCategories, PRODUCT_SELECT, fmt, orderCode, timeAgo, notify } from '../lib/db';
import type { ProductRow } from '../lib/db';
import { loadSettings } from '../lib/pricing';

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

// ---------- الرئيسية ----------
store.get('/', async (c) => {
  const db = c.env.DB;
  const [trend, newest, sale, f] = await Promise.all([
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' ORDER BY p.sales DESC, p.views DESC LIMIT 10`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' ORDER BY p.id DESC LIMIT 15`).all<ProductRow>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.compare_price_lyd > p.price_lyd ORDER BY (p.compare_price_lyd-p.price_lyd)/p.compare_price_lyd DESC LIMIT 10`).all<ProductRow>(),
    favs(c),
  ]);
  const b = await base(c);
  return c.html(
    <Layout {...b}>
      <section class="hero">
        <div>
          <h1>دلال يجيبلك من الصين لباب البيت 🛍️</h1>
          <p>آلاف المنتجات بأسعار بالدينار الليبي — شاملة الشحن والجمارك، بدون مفاجآت.</p>
        </div>
        <a class="cta" href="/c/dresses">تسوقي الآن</a>
      </section>
      <div class="flash-sale">
        ⚡ <b>فلاش سيل</b> ينتهي خلال <span class="timer" data-countdown="6h">06:00:00</span>
        <a href="/sale" style="margin-inline-start:auto;color:#ffcf3f">عرض الكل ›</a>
      </div>
      <div class="sec-h"><h2>عروض اليوم</h2><a href="/sale">المزيد ›</a></div>
      <Grid items={sale.results} favs={f} />
      <div class="sec-h"><h2>الأكثر رواجًا</h2><a href="/trending">المزيد ›</a></div>
      <Grid items={trend.results} favs={f} />
      <div class="sec-h"><h2>وصل حديثًا</h2><a href="/new">المزيد ›</a></div>
      <Grid items={newest.results} favs={f} />
    </Layout>,
  );
});

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
  const order = { popular: 'p.sales DESC,p.views DESC', new: 'p.id DESC', price_asc: 'p.price_lyd ASC', price_desc: 'p.price_lyd DESC' }[sort] ?? 'p.sales DESC';
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
        {[['popular', 'الأكثر رواجًا'], ['new', 'الأحدث'], ['price_asc', 'السعر ↑'], ['price_desc', 'السعر ↓']].map(([k, l]) =>
          <a href={link('sort', k)} class={sort === k ? 'on' : ''}>{l}</a>)}
      </div>
      <form class="inline" method="get" style="margin:6px 0 14px;font-size:13px">
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
  const p = await db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.status IN ('active','unavailable')`).bind(c.req.param('slug')).first<ProductRow>();
  if (!p) return c.notFound();
  const [imgs, vars, related, f] = await Promise.all([
    db.prepare('SELECT url FROM product_images WHERE product_id=? ORDER BY sort').bind(p.id).all<{ url: string }>(),
    db.prepare('SELECT id,color,size,price_delta_lyd,in_stock,image_url FROM variants WHERE product_id=?').bind(p.id).all<any>(),
    db.prepare(`SELECT ${PRODUCT_SELECT} FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' AND p.category_id=? AND p.id<>? ORDER BY p.sales DESC LIMIT 10`).bind(p.category_id, p.id).all<ProductRow>(),
    favs(c),
  ]);
  c.executionCtx.waitUntil(db.prepare('UPDATE products SET views=views+1 WHERE id=?').bind(p.id).run());
  const colors = [...new Set(vars.results.map(v => v.color).filter(Boolean))] as string[];
  const sizes = [...new Set(vars.results.map(v => v.size).filter(Boolean))] as string[];
  const images = imgs.results.length ? imgs.results.map(i => i.url) : ['/placeholder.svg'];
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
  const isClothing = ['dresses', 'abayas', 'tops', 'kids'].includes(p.cat_slug ?? '');
  const b = await base(c);
  return c.html(
    <Layout {...b} title={p.title_ar} active={p.cat_slug}>
      <div class="pd" data-product={p.id}>
        <div class="gallery">
          <div class="main"><img id="mainImg" src={images[0]} alt={p.title_ar} /></div>
          <div class="thumbs">{images.map((u, i) => <img src={u} class={i === 0 ? 'on' : ''} data-thumb loading="lazy" />)}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#888"><a href={`/c/${p.cat_slug}`}>{p.cat_name}</a></div>
          <h1>{p.title_ar}</h1>
          <div class="meta" style="font-size:13px;color:#666">★ {p.rating.toFixed(1)} · {p.sales}+ بيعت · {p.views} مشاهدة</div>
          <div class="price" style="margin-top:8px">{fmt(p.price_lyd)}{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}{off > 0 && <span class="tag" style="position:static;margin-inline-start:8px;font-size:13px;background:#b5124f;color:#fff;padding:2px 8px;border-radius:4px">-{off}%</span>}</div>
          <div class="price-note">السعر شامل الشحن من الصين والجمارك. التوصيل داخل ليبيا {fmt(15)} (مجاني فوق {fmt(500)}).</div>
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
                <div class="chips" data-opt="size">{sizes.map(s => <span class="chip" data-val={s}>{s}</span>)}</div></div>
            )}
            <script type="application/json" id="variantsJson" dangerouslySetInnerHTML={{ __html: JSON.stringify(vars.results).replace(/</g, '\\u003c') }}></script>
            <div class="opts"><h4>الكمية</h4>
              <div class="qty"><button type="button" data-q="-1">−</button><input type="number" name="qty" value={p.min_qty} min={p.min_qty} /><button type="button" data-q="1">+</button></div>
              {p.min_qty > 1 && <span style="font-size:12px;color:#888;margin-inline-start:8px">الحد الأدنى {p.min_qty} قطع</span>}
            </div>
            <div class="inline" style="margin:16px 0">
              <button class="btn" type="submit" disabled={!p.in_stock} style="flex:1">أضيفي إلى السلة</button>
              <button class="btn ghost" type="button" data-fav={p.id}>{f.has(p.id) ? '♥ في المفضلة' : '♡ المفضلة'}</button>
            </div>
          </form>
          <div class="trust">
            <div>🚚 <b>الوصول خلال 15–25 يومًا</b><br />شحن جوي مجمّع من الصين</div>
            <div>💳 <b>ادفعي بالدينار</b><br />سداد · معاملات · موبي كاش · عربون</div>
            <div>🔍 <b>فحص قبل الشحن</b><br />صور للبضاعة من مخزننا في الصين</div>
            <div>↩️ <b>ضمان الوصول</b><br />استرجاع كامل إن لم تصل</div>
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
            <div style="font-size:14px">نشتري المنتج من المورد بعد تأكيد طلبك، ثم يُجمع مع طلبات أخرى في مخزننا بالصين ويُشحن جوًّا إلى ليبيا. لا يمكن إرجاع البضاعة إلى الصين، لكن نعوّض أي منتج تالف أو مختلف عن الوصف بصور الفحص.</div>
          </details>
        </div>
      </div>
      <div class="sec-h"><h2>قد يعجبك أيضًا</h2></div>
      <Grid items={related.results} favs={f} />
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

async function cartRows(db: D1Database, uid: number) {
  const { results } = await db.prepare(
    `SELECT ci.id,ci.qty,ci.variant_id,p.id AS product_id,p.slug,p.title_ar,p.price_lyd,p.in_stock,p.status,p.source_offer_id,p.source_url,
            v.color,v.size,COALESCE(v.price_delta_lyd,0) AS delta,
            COALESCE(v.image_url,(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1)) AS image
     FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN variants v ON v.id=ci.variant_id WHERE ci.user_id=?`,
  ).bind(uid).all<any>();
  return results.map(r => ({ ...r, unit: r.price_lyd + r.delta, line: (r.price_lyd + r.delta) * r.qty }));
}

store.get('/cart', async (c) => {
  const u = c.get('user');
  const b = await base(c);
  if (!u) return c.html(<Layout {...b} title="السلة"><div class="empty"><div class="big">🛒</div><a class="btn" href="/login?next=/cart">سجّلي الدخول لعرض السلة</a></div></Layout>);
  const rows = await cartRows(c.env.DB, u.id);
  const s = await loadSettings(c.env.DB);
  const subtotal = rows.reduce((a, r) => a + r.line, 0);
  const delivery = subtotal >= parseFloat(s.free_ship_over_lyd) ? 0 : parseFloat(s.delivery_lyd);
  const unavailable = rows.some(r => !r.in_stock || r.status !== 'active');
  return c.html(
    <Layout {...b} title="السلة">
      <Flash msg={c.req.query('added') ? 'أُضيف المنتج إلى السلة ✓' : undefined} />
      <div class="sec-h"><h2>سلة التسوق ({rows.length})</h2></div>
      {rows.length === 0 ? <div class="empty"><div class="big">🛒</div>سلتك فارغة<br /><br /><a class="btn" href="/">ابدئي التسوق</a></div> : (
        <div class="two">
          <div>
            {rows.map(r => (
              <div class="cart-row">
                <a href={`/p/${r.slug}`}><img src={r.image ?? '/placeholder.svg'} alt="" /></a>
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
          <div class="summary">
            <div class="row"><span>المجموع</span><span>{fmt(subtotal)}</span></div>
            <div class="row"><span>التوصيل داخل ليبيا</span><span>{delivery ? fmt(delivery) : 'مجاني'}</span></div>
            <div class="row tot"><span>الإجمالي</span><span>{fmt(subtotal + delivery)}</span></div>
            <a class={`btn ${unavailable ? 'disabled' : ''}`} href={unavailable ? '#' : '/checkout'} style="display:block;text-align:center;margin-top:12px" aria-disabled={unavailable}>إتمام الطلب</a>
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
  const s = await loadSettings(c.env.DB);
  const subtotal = rows.reduce((a, r) => a + r.line, 0);
  const delivery = subtotal >= parseFloat(s.free_ship_over_lyd) ? 0 : parseFloat(s.delivery_lyd);
  const b = await base(c);
  return c.html(
    <Layout {...b} title="إتمام الطلب">
      <div class="sec-h"><h2>إتمام الطلب</h2></div>
      <form method="post" action="/checkout" class="two">
        <div>
          <div class="card-box"><h3>عنوان التوصيل</h3>
            <label>الاسم الكامل</label><input type="text" name="name" value={u.name} required />
            <label>رقم الهاتف</label><input type="tel" name="phone" value={u.phone} required />
            <label>المدينة</label><select name="city" required>{CITIES.map(ct => <option selected={ct === u.city}>{ct}</option>)}</select>
            <label>العنوان بالتفصيل</label><textarea name="address" rows={2} required>{u.address ?? ''}</textarea>
            <label>ملاحظات (اختياري)</label><input type="text" name="note" />
          </div>
          <div class="card-box"><h3>طريقة الدفع</h3>
            {Object.entries(PAYMENT_METHODS).map(([k, v], i) => <label class="radio"><input type="radio" name="payment_method" value={k} checked={i === 0} required /> {v}</label>)}
            <p style="font-size:12px;color:#888">بعد تأكيد الطلب ستظهر لك تعليمات الدفع ورقم المرجع.</p>
          </div>
        </div>
        <div class="summary">
          <h3 style="margin:0 0 10px">ملخص الطلب</h3>
          {rows.map(r => <div class="row" style="font-size:13px"><span>{r.title_ar.slice(0, 30)}… × {r.qty}</span><span>{fmt(r.line)}</span></div>)}
          <div class="row" style="margin-top:8px"><span>التوصيل</span><span>{delivery ? fmt(delivery) : 'مجاني'}</span></div>
          <div class="row tot"><span>الإجمالي</span><span>{fmt(subtotal + delivery)}</span></div>
          <button class="btn" type="submit" style="width:100%;margin-top:12px">تأكيد الطلب</button>
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
  const s = await loadSettings(db);
  const subtotal = rows.reduce((a, r) => a + r.line, 0);
  const delivery = subtotal >= parseFloat(s.free_ship_over_lyd) ? 0 : parseFloat(s.delivery_lyd);
  // توزيع الطلب على شريك شحن نشط حسب نسبة التوزيع (أبسط صورة: الأعلى نسبة ثم الأقل حملًا)
  const partner = await db.prepare(
    `SELECT p.id FROM partners p WHERE p.active=1 ORDER BY p.share_percent DESC,
     (SELECT COUNT(*) FROM orders o WHERE o.partner_id=p.id AND o.status IN ('paid','purchasing')) ASC LIMIT 1`,
  ).first<{ id: number }>();
  const ins = await db.prepare(
    `INSERT INTO orders(code,user_id,partner_id,status,payment_method,subtotal_lyd,shipping_lyd,total_lyd,fx_rate_used,ship_name,ship_phone,ship_city,ship_address,note)
     VALUES('tmp',?,?,'pending_payment',?,?,?,?,?,?,?,?,?,?)`,
  ).bind(u.id, partner?.id ?? null, String(f.payment_method), subtotal, delivery, subtotal + delivery, parseFloat(s.fx_cny_lyd),
    String(f.name), String(f.phone), String(f.city), String(f.address), f.note ? String(f.note) : null).run();
  const oid = ins.meta.last_row_id as number;
  const code = orderCode(oid);
  const stmts = [
    db.prepare('UPDATE orders SET code=? WHERE id=?').bind(code, oid),
    ...rows.map(r => db.prepare(
      `INSERT INTO order_items(order_id,product_id,variant_id,title_ar,color,size,qty,unit_price_lyd,source_offer_id,source_url) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).bind(oid, r.product_id, r.variant_id, r.title_ar, r.color, r.size, r.qty, r.unit, r.source_offer_id, r.source_url)),
    db.prepare("INSERT INTO order_events(order_id,status,note,by_user_id) VALUES(?,'pending_payment','تم إنشاء الطلب',?)").bind(oid, u.id),
    db.prepare('DELETE FROM cart_items WHERE user_id=?').bind(u.id),
    db.prepare('UPDATE users SET city=?,address=? WHERE id=?').bind(String(f.city), String(f.address), u.id),
  ];
  await db.batch(stmts);
  await notify(db, u.id, `طلبك ${code} بانتظار الدفع`, 'أكملي الدفع ليبدأ فريقنا بالشراء.', `/orders/${code}`);
  return c.redirect(`/orders/${code}?new=1`);
});

// ---------- الطلبات ----------
store.get('/account', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login?next=/account');
  const { results } = await c.env.DB.prepare('SELECT id,code,status,total_lyd,created_at FROM orders WHERE user_id=? ORDER BY id DESC').bind(u.id).all<any>();
  const notifs = await c.env.DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(u.id).all<any>();
  const b = await base(c);
  return c.html(
    <Layout {...b} title="حسابي">
      <div class="sec-h"><h2>مرحبًا {u.name} 👋</h2><a href="/logout">تسجيل الخروج</a></div>
      <div class="two">
        <div class="card-box"><h3>طلباتي</h3>
          {results.length === 0 ? <p style="color:#888">لا توجد طلبات بعد.</p> : (
            <div class="tbl-wrap"><table class="tbl"><tr><th>رقم الطلب</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr>
              {results.map(o => <tr><td><a href={`/orders/${o.code}`} style="color:#b5124f;font-weight:700">{o.code}</a></td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{fmt(o.total_lyd)}</td><td>{timeAgo(o.created_at)}</td></tr>)}
            </table></div>
          )}
        </div>
        <div class="card-box"><h3>الإشعارات</h3>
          {notifs.results.length === 0 ? <p style="color:#888">لا إشعارات.</p> : notifs.results.map(n => (
            <div style="border-bottom:1px solid #eee;padding:8px 0;font-size:14px"><a href={n.link ?? '#'}><b>{n.title}</b></a><br /><span style="color:#666">{n.body}</span><div style="font-size:11px;color:#999">{timeAgo(n.created_at)}</div></div>
          ))}
        </div>
      </div>
    </Layout>,
  );
});

store.get('/orders/:code', async (c) => {
  const u = c.get('user'); if (!u) return c.redirect('/login');
  const db = c.env.DB;
  const o = await db.prepare('SELECT * FROM orders WHERE code=? AND (user_id=? OR ?=1)').bind(c.req.param('code'), u.id, u.role === 'admin' ? 1 : 0).first<any>();
  if (!o) return c.notFound();
  const [items, events] = await Promise.all([
    db.prepare(`SELECT oi.*,p.slug,(SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1) AS image FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE order_id=?`).bind(o.id).all<any>(),
    db.prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY id').bind(o.id).all<any>(),
  ]);
  const steps = ['paid', 'purchased', 'at_warehouse', 'shipped', 'arrived', 'ready', 'delivered'];
  const cur = ORDER_STATUS[o.status]?.step ?? 0;
  const done = new Map(events.results.map(e => [e.status, e.created_at]));
  const b = await base(c);
  return c.html(
    <Layout {...b} title={`الطلب ${o.code}`}>
      <Flash msg={c.req.query('new') ? '🎉 تم استلام طلبك! أكملي الدفع بالطريقة المختارة ليبدأ الشراء.' : undefined} />
      <div class="sec-h"><h2>الطلب {o.code}</h2><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></div>
      <div class="two">
        <div>
          {o.status === 'pending_payment' && (
            <div class="card-box" style="border-color:#b5124f"><h3>تعليمات الدفع — {PAYMENT_METHODS[o.payment_method]}</h3>
              <p style="font-size:14px">المبلغ: <b>{fmt(o.total_lyd)}</b> · المرجع: <b class="mono" style="display:inline;padding:2px 6px">{o.code}</b></p>
              <p style="font-size:13px;color:#666">{o.payment_method === 'cod_deposit' ? 'ادفعي عربون 30% الآن والباقي عند الاستلام. سيتواصل معك فريقنا لتأكيد العربون.' : 'حوّلي المبلغ واكتبي رقم الطلب في الملاحظة، ثم أرسلي صورة الإيصال. يُفعَّل الطلب خلال ساعات العمل.'}</p>
              <p style="font-size:13px">واتساب التأكيد: <a href="https://wa.me/218910000000" style="color:#b5124f;direction:ltr">+218 91 000 0000</a></p>
            </div>
          )}
          <div class="card-box"><h3>تتبع الطلب</h3>
            <div class="track">
              {steps.map(st => { const s = ORDER_STATUS[st]; const isDone = cur >= s.step; const isNow = o.status === st || (st === 'paid' && ['purchasing'].includes(o.status)) || (st === 'at_warehouse' && o.status === 'consolidated') || (st === 'arrived' && o.status === 'customs'); return (
                <div class={`st ${isDone ? 'done' : ''} ${isNow ? 'now' : ''}`}><div class="dotl"></div><div><div class="lbl">{s.ar}</div>{done.get(st) && <div class="when">{timeAgo(done.get(st))}</div>}</div></div>); })}
            </div>
          </div>
          <div class="card-box"><h3>المنتجات</h3>
            {items.results.map(it => (
              <div class="cart-row"><img src={it.image ?? '/placeholder.svg'} alt="" /><div><div class="t"><a href={`/p/${it.slug}`}>{it.title_ar}</a></div><div class="v">{[it.color, it.size].filter(Boolean).join(' · ')} × {it.qty}</div>
                {it.purchase_status === 'unavailable' && <div style="color:#d3262b;font-size:12px">⚠️ نفد عند المورد — سنتواصل معك لبديل أو استرجاع</div>}
                {it.proof_image_url && <a href={it.proof_image_url} target="_blank" style="font-size:12px;color:#1c47b3">📷 صورة الفحص من المخزن</a>}
              </div><div style="font-weight:800">{fmt(it.unit_price_lyd * it.qty)}</div></div>
            ))}
          </div>
        </div>
        <div>
          <div class="summary"><div class="row"><span>المنتجات</span><span>{fmt(o.subtotal_lyd)}</span></div><div class="row"><span>التوصيل</span><span>{o.shipping_lyd ? fmt(o.shipping_lyd) : 'مجاني'}</span></div><div class="row tot"><span>الإجمالي</span><span>{fmt(o.total_lyd)}</span></div></div>
          <div class="card-box" style="margin-top:14px"><h3>التوصيل إلى</h3><div style="font-size:14px">{o.ship_name}<br />{o.ship_phone}<br />{o.ship_city} — {o.ship_address}</div></div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- صفحات ثابتة ----------
const PAGES: Record<string, [string, string]> = {
  how: ['كيف نعمل؟', '1) تختارين المنتج وتدفعين بالدينار.\n2) فريقنا في الصين يشتريه من المورد خلال 48 ساعة.\n3) يصل إلى مخزننا في الصين، نفحصه ونصوّره لك.\n4) يُشحن جوًّا مع طلبات أخرى إلى ليبيا.\n5) يُخلّص جمركيًا ويُوصَّل إلى بابك.\nالمدة الإجمالية 15–25 يومًا.'],
  shipping: ['الشحن والتوصيل', 'السعر المعروض شامل الشحن الدولي والجمارك. التوصيل داخل المدن الرئيسية 15 د.ل ومجاني للطلبات فوق 500 د.ل. المدة 15–25 يومًا من تأكيد الدفع.'],
  returns: ['سياسة الإرجاع', 'لا يمكن إرجاع البضاعة إلى الصين. لذلك نفحص كل قطعة ونصوّرها قبل الشحن. أي منتج تالف أو مختلف جوهريًا عن الوصف نعوّضه كاملًا أو نستبدله. المقاسات مسؤولية الزبونة، راجعي دليل المقاسات.'],
  contact: ['تواصل معنا', 'واتساب: +218 91 000 0000\nبريد: hello@dlal.ly\nساعات العمل: السبت–الخميس 10ص–8م'],
};
store.get('/pages/:key', async (c) => {
  const pg = PAGES[c.req.param('key')]; if (!pg) return c.notFound();
  const b = await base(c);
  return c.html(<Layout {...b} title={pg[0]}><div class="form" style="max-width:700px"><h1>{pg[0]}</h1><p style="white-space:pre-line;font-size:15px">{pg[1]}</p></div></Layout>);
});

export default store;
