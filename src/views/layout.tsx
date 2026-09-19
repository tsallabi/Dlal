import type { FC } from 'hono/jsx';
import type { User } from '../types';

type Props = {
  title?: string;
  user: User | null;
  cartCount?: number;
  categories?: { slug: string; name_ar: string; icon: string | null }[];
  active?: string;
  children: any;
  q?: string;
};

export const Layout: FC<Props> = ({ title, user, cartCount = 0, categories = [], active, children, q }) => (
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title ? `${title} | دلال` : 'دلال — تسوق من الصين إلى ليبيا'}</title>
      <link rel="stylesheet" href="/style.css" />
      <link rel="icon" href="/favicon.svg" />
    </head>
    <body>
      <header class="hdr">
        <div class="hdr-top wrap">
          <a href="/" class="logo">دلال</a>
          <form class="search" action="/search" method="get">
            <input name="q" placeholder="ابحث عن منتج…" value={q ?? ''} />
            <button type="submit" aria-label="بحث">🔍</button>
          </form>
          <nav class="hdr-links">
            <a href="/wishlist" title="المفضلة">♡</a>
            <a href="/cart" class="cart-link" title="السلة">🛒{cartCount > 0 && <span class="badge">{cartCount}</span>}</a>
            {user ? <a href="/account">{user.name.split(' ')[0]}</a> : <a href="/login">دخول</a>}
            {user?.role === 'admin' && <a href="/admin" class="pill">الإدارة</a>}
            {user?.role === 'partner' && <a href="/partner" class="pill">لوحة الشحن</a>}
          </nav>
        </div>
        <div class="cats wrap">
          <a href="/" class={!active ? 'on' : ''}>الكل</a>
          {categories.map(c => <a href={`/c/${c.slug}`} class={active === c.slug ? 'on' : ''}>{c.icon} {c.name_ar}</a>)}
        </div>
      </header>
      <main class="wrap">{children}</main>
      <footer class="ftr wrap">
        <div>
          <b>دلال</b> — نشتري لك من الصين ونوصّل إلى بابك في ليبيا. الأسعار بالدينار الليبي شاملة الشحن والجمارك.
        </div>
        <div class="ftr-links">
          <a href="/pages/how">كيف نعمل؟</a><a href="/pages/shipping">الشحن والتوصيل</a><a href="/pages/returns">سياسة الإرجاع</a><a href="/pages/contact">تواصل معنا</a>
        </div>
      </footer>
      <nav class="bottom-nav">
        <a href="/" class={!active ? 'on' : ''}><span>🏠</span>الرئيسية</a>
        <a href="/c/all"><span>▦</span>الأقسام</a>
        <a href="/wishlist"><span>♡</span>المفضلة</a>
        <a href="/cart"><span>🛒</span>السلة{cartCount > 0 && <i class="dot">{cartCount}</i>}</a>
        <a href={user ? '/account' : '/login'}><span>👤</span>حسابي</a>
      </nav>
      <script src="/app.js"></script>
    </body>
  </html>
);

export const Flash: FC<{ msg?: string; type?: 'ok' | 'err' }> = ({ msg, type = 'ok' }) =>
  msg ? <div class={`flash ${type}`}>{msg}</div> : null;
