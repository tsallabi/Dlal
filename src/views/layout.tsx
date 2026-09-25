import type { FC } from 'hono/jsx';
import type { User } from '../types';

type Props = {
  title?: string;
  user: User | null;
  cartCount?: number;
  wishCount?: number;
  categories?: { slug: string; name_ar: string; icon: string | null }[];
  active?: string;
  children: any;
  q?: string;
};

export const Layout: FC<Props> = ({ title, user, cartCount = 0, wishCount = 0, categories = [], active, children, q }) => (
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title ? `${title} | هدهد HUDHUDE` : 'هدهد HUDHUDE — بوابتك إلى الصين'}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" />
      <link rel="stylesheet" href="/style.css" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <meta name="theme-color" content="#B05A20" />
    </head>
    <body>
      <header class="hdr">
        {/* شريط علوي: معلومات تطمئن الزبونة قبل أي شيء */}
        <div class="hdr-strip">
          <div class="wrap">
            <a href="/request" class="strip-req"><i>🔗</i>اطلب أي منتج برابط</a>
            <span class="sep"></span>
            <a href="/track"><i>📍</i>تتبّعي طلبك</a>
            <span class="sep"></span>
            <a href="/how"><i>🐦</i>كيف يعمل هدهد</a>
            <span class="sep"></span>
            <a href="/pages/shipping"><i>🚚</i>معلومات الشحن</a>
            <span class="sep"></span>
            <a href="/pages/returns"><i>↩️</i>الإرجاع والاسترداد</a>
            <span class="sep"></span>
            <a href="/how"><i>🏷️</i>أسعار نهائية شاملة الشحن والجمارك</a>
          </div>
        </div>
        {/* الشريط الرئيسي: الشعار + بحث + أيقونات */}
        <div class="hdr-main wrap">
          <button type="button" class="burger" data-drawer aria-label="الأقسام"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <a href="/" class="logo" aria-label="هدهد HUDHUDE"><img src="/hudhud-logo.svg" alt="" width="77" height="64" /><span class="t"><b>هدهد</b><i>HUDHUDE</i><u>بوابتك إلى الصين</u></span></a>
          <form class="search" action="/search" method="get" role="search">
            <input name="q" placeholder="ابحث عن فستان، عباية، حقيبة…" value={q ?? ''} aria-label="ابحث عن منتج" />
            <button type="submit" aria-label="بحث"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" stroke-linecap="round" /></svg></button>
          </form>
          <nav class="hdr-icons">
            <a href={user ? '/account' : '/login'} aria-label="حسابي" title={user ? user.name : 'دخول'} class="hide-phone"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke-linecap="round" /></svg></a>
            <a href="/cart" aria-label="السلة"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5h2.2l2.3 10.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.5L20 8H6.4" stroke-linecap="round" stroke-linejoin="round" /><circle cx="10" cy="20" r="1.4" fill="currentColor" stroke="none" /><circle cx="17" cy="20" r="1.4" fill="currentColor" stroke="none" /></svg>{cartCount > 0 && <b>{cartCount}</b>}</a>
            <a href="/wishlist" aria-label="المفضلة"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" stroke-linejoin="round" /></svg>{wishCount > 0 && <b>{wishCount}</b>}</a>
            <a href="/account/tickets" aria-label="خدمة الزبائن" class="only-wide"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12a8 8 0 1 1 3 6.2V21l-3-1.2A8 8 0 0 1 4 12Z" stroke-linejoin="round" /></svg></a>
            {user?.role === 'admin' && <a href="/admin" class="pill">الإدارة</a>}
            {user?.role === 'partner' && <a href="/partner" class="pill">لوحة الشحن</a>}
          </nav>
        </div>
        {/* شريط الأقسام: «كل الأقسام» يفتح القائمة الكبيرة، والباقي يمرّ أفقيًا */}
        <div class="hdr-nav">
          <div class="wrap">
            <button type="button" class="all-cats" id="allCats" aria-expanded="false">كل الأقسام <span>⌄</span></button>
            <button type="button" class="nav-arrow" data-nav="-1" aria-label="السابق">‹</button>
            <nav class="cats" id="catsRow">
              <a href="/new" class={active === 'new' ? 'on' : ''}>وصل حديثًا</a>
              {categories.map(c => <a href={`/c/${c.slug}`} class={active === c.slug ? 'on' : ''}>{c.name_ar}</a>)}
              <a href="/sale" class={active === 'sale' ? 'on' : ''}>عروض وتخفيضات</a>
            </nav>
            <button type="button" class="nav-arrow" data-nav="1" aria-label="التالي">›</button>
          </div>
          <div class="mega" id="megaMenu" hidden>
            <div class="wrap">
              <div class="mega-side">
                {categories.map((c, i) => <button type="button" data-mega={c.slug} class={i === 0 ? 'on' : ''}>{c.name_ar}<i>›</i></button>)}
              </div>
              <div class="mega-panels">
                {categories.map((c, i) => (
                  <div class={`mega-panel ${i === 0 ? 'on' : ''}`} data-panel={c.slug}>
                    <h4>{c.icon} {c.name_ar}</h4>
                    <div class="mega-grid">
                      <a href={`/c/${c.slug}`}><span class="mt all">▦</span>عرض الكل</a>
                      <a href={`/c/${c.slug}?sort=new`}><span class="mt">🆕</span>وصل حديثًا</a>
                      <a href={`/c/${c.slug}?sort=sales`}><span class="mt">🔥</span>الأكثر مبيعًا</a>
                      <a href={`/c/${c.slug}?sort=price`}><span class="mt">💰</span>الأرخص سعرًا</a>
                      <a href={`/c/${c.slug}?deal=1`}><span class="mt">%</span>عليها خصم</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main class="wrap">{children}</main>
      <footer class="ftr">
        <div class="ftr-top">
          <div class="ftr-col">
            <h5>عن هدهد</h5>
            <a href="/how">من نحن وكيف نعمل</a>
            <a href="/pages/branches">فروعنا في ليبيا</a>
            <a href="/pages/privacy">إشعار الخصوصية</a>
            <a href="/pages/terms">الشروط والأحكام</a>
          </div>
          <div class="ftr-col">
            <h5>المساعدة والدعم</h5>
            <a href="/pages/shipping">معلومات الشحن</a>
            <a href="/pages/returns">الإرجاع والاسترداد</a>
            <a href="/pages/how-to-order">كيف أطلب؟</a>
            <a href="/pages/sizes">دليل المقاسات</a>
            <a href="/track">تتبّع طلبي</a>
          </div>
          <div class="ftr-col">
            <h5>خدمة الزبائن</h5>
            <a href="/pages/contact">تواصل معنا</a>
            <a href="/pages/payment">طرق الدفع والرسوم</a>
            <a href="/account/points">نقاط المكافآت</a>
            <a href="/pages/faq">الأسئلة الشائعة</a>
          </div>
          <div class="ftr-col">
            <h5>تابعنا</h5>
            <div class="ftr-social">
              {/* الروابط تمرّ بالخادم: يقرأ الحساب الحقيقي من الإعدادات، وبلا حساب يفتح صفحة التواصل بدل صفحة فارغة */}
              <a href="/pages/go/facebook" target="_blank" rel="noopener" aria-label="فيسبوك">f</a>
              <a href="/pages/go/instagram" target="_blank" rel="noopener" aria-label="إنستغرام">◎</a>
              <a href="/pages/go/whatsapp" target="_blank" rel="noopener" aria-label="واتساب">✆</a>
              <a href="/pages/go/tiktok" target="_blank" rel="noopener" aria-label="تيك توك">♪</a>
            </div>
            <div class="ftr-news">
              <h5>وصلك كل جديد وعروضنا</h5>
              <form method="post" action="/subscribe">
                <input type="tel" name="phone" placeholder="رقم واتساب أو هاتف" inputmode="tel" aria-label="رقم الهاتف" />
                <button type="submit">اشتراك</button>
              </form>
            </div>
          </div>
          <div class="ftr-col">
            <h5>ادفع كما يناسبك</h5>
            <a href="/pages/payment">بطاقة مصرفية محلية (معاملات)</a>
            <a href="/pages/payment">سداد · إدفعلي · موبي كاش</a>
            <a href="/pages/branches">كاش في أقرب فرع</a>
          </div>
        </div>
        <div class="ftr-pay">
          <div class="wrap">
            <h5>نقبل الدفع بـ</h5>
            <div class="pay-logos">
              <span>💳 معاملات</span><span>📱 سداد</span><span>📲 إدفعلي</span><span>📳 موبي كاش</span><span>🏪 كاش في الفرع</span>
            </div>
          </div>
        </div>
        <div class="ftr-legal">
          <div class="wrap">
            <span>© {new Date().getFullYear()} هدهد HUDHUDE — جميع الحقوق محفوظة</span>
            <a href="/pages/privacy">الخصوصية</a>
            <a href="/pages/terms">الشروط</a>
            <a href="/pages/returns">الإرجاع</a>
            <span>الأسعار بالدينار الليبي شاملة الشحن والجمارك</span>
          </div>
        </div>
      </footer>
      {/* درج الأقسام (الجوال) — محتواه يُجلب من /m/menu عند أول فتح */}
      <div class="drawer" id="drawer" hidden>
        <div class="dr-back" data-drawer-close></div>
        <aside class="dr" role="dialog" aria-label="الأقسام">
          <header><b>الأقسام</b><button type="button" data-drawer-close aria-label="إغلاق">✕</button></header>
          <div class="dr-body" id="drawerBody"><p class="dr-wait">…</p></div>
        </aside>
      </div>
      <nav class="bottom-nav">
        <a href="/" class={!active ? 'on' : ''}><span>🏠</span>الرئيسية</a>
        <a href="/c/all" data-drawer><span>▦</span>الأقسام</a>
        <a href="/wishlist"><span>♡</span>المفضلة</a>
        <a href="/cart"><span>🛒</span>السلة{cartCount > 0 && <i class="dot">{cartCount}</i>}</a>
        <a href={user ? '/account' : '/login'}><span>👤</span>حسابي</a>
      </nav>
      <div class="chat-fab" id="chatFab" role="button" tabindex={0} aria-label="الدردشة المباشرة" title="تواصل معنا">
        <span class="ic">💬</span><span class="lbl">تواصل معنا</span><i class="dot" id="chatDot" hidden></i>
      </div>
      <div class="chat-panel" id="chatPanel" hidden>
        <div class="ch-h"><b>خدمة زبائن هدهد</b><span id="chatSub">نرد خلال ساعات العمل</span><button type="button" id="chatClose" aria-label="إغلاق">✕</button></div>
        <div class="ch-body" id="chatBody"><div class="ch-empty">اكتب رسالتك وسيصلك الرد هنا وفي «التذاكر والإرجاع» داخل حسابك.</div></div>
        <form class="ch-f" id="chatForm"><input id="chatInput" placeholder="اكتب رسالتك…" autocomplete="off" maxlength={1000} /><button class="btn brand sm" type="submit">إرسال</button></form>
      </div>
      <script src="/app.js"></script>
    </body>
  </html>
);

export const Flash: FC<{ msg?: string; type?: 'ok' | 'err' }> = ({ msg, type = 'ok' }) =>
  msg ? <div class={`flash ${type}`}>{msg}</div> : null;
