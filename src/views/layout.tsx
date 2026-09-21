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
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" />
      <link rel="stylesheet" href="/style.css" />
      <link rel="icon" href="/favicon.svg" />
      <meta name="theme-color" content="#b5124f" />
    </head>
    <body>
      <header class="hdr">
        <div class="hdr-strip">
          <div class="wrap">
            <span>🚚 توصيل لكل ليبيا · <b>أسعار نهائية</b> شاملة الشحن والجمارك</span>
            <nav>
              <a href="/pages/how">كيف نعمل؟</a>
              <a href="/account/orders">تتبّع طلبي</a>
              <a href="/pages/returns">الإرجاع</a>
              <a href="/pages/contact">تواصلي معنا</a>
            </nav>
          </div>
        </div>
        <div class="hdr-top wrap">
          <a href="/" class="logo">دلال<small>من الصين إلى بابك</small></a>
          <form class="search" action="/search" method="get" role="search">
            <input name="q" placeholder="ابحثي عن فستان، عباية، حقيبة…" value={q ?? ''} aria-label="ابحثي عن منتج" />
            <button type="submit">بحث</button>
          </form>
          <nav class="hdr-links">
            <a href="/wishlist"><i>♡</i><span>المفضلة</span></a>
            <a href="/cart" class="cart-link"><i>🛒</i><span>السلة</span>{cartCount > 0 && <span class="badge">{cartCount}</span>}</a>
            <a href={user ? '/account' : '/login'}><i>👤</i><span>{user ? user.name.split(' ')[0] : 'دخول'}</span></a>
            {user?.role === 'admin' && <a href="/admin" class="pill">الإدارة</a>}
            {user?.role === 'partner' && <a href="/partner" class="pill">لوحة الشحن</a>}
          </nav>
        </div>
        <div class="cats wrap">
          <a href="/" class={!active ? 'on' : ''}>الكل</a>
          {categories.map(c => <a href={`/c/${c.slug}`} class={active === c.slug ? 'on' : ''}>{c.name_ar}</a>)}
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
      <div class="chat-fab" id="chatFab" role="button" tabindex={0} aria-label="الدردشة المباشرة" title="تواصلي معنا">
        <span class="ic">💬</span><span class="lbl">تواصلي معنا</span><i class="dot" id="chatDot" hidden></i>
      </div>
      <div class="chat-panel" id="chatPanel" hidden>
        <div class="ch-h"><b>خدمة زبائن دلال</b><span id="chatSub">نرد خلال ساعات العمل</span><button type="button" id="chatClose" aria-label="إغلاق">✕</button></div>
        <div class="ch-body" id="chatBody"><div class="ch-empty">اكتبي رسالتك وسيصلك الرد هنا وفي «التذاكر والإرجاع» داخل حسابك.</div></div>
        <form class="ch-f" id="chatForm"><input id="chatInput" placeholder="اكتبي رسالتك…" autocomplete="off" maxlength={1000} /><button class="btn brand sm" type="submit">إرسال</button></form>
      </div>
      <script src="/app.js"></script>
    </body>
  </html>
);

export const Flash: FC<{ msg?: string; type?: 'ok' | 'err' }> = ({ msg, type = 'ok' }) =>
  msg ? <div class={`flash ${type}`}>{msg}</div> : null;
