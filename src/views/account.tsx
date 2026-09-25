import type { FC } from 'hono/jsx';
import type { User } from '../types';
import { Layout } from './layout';

// قشرة حسابي — بأسلوب SHEIN: قائمة جانبية + محتوى
export const AccountShell: FC<{ user: User; cartCount: number; wishCount?: number; categories: any[]; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, cartCount, wishCount = 0, categories, active, title, children, counts = {} }) => {
  const L = (href: string, key: string, icon: string, label: string, n?: number) =>
    <a href={href} class={active === key ? 'on' : ''}><i>{icon}</i>{label}{n ? <span class="cnt">{n}</span> : null}</a>;
  // مجموعات مركز الحساب: كل مجموعة تُطوى وتنفتح، والمجموعة التي تحوي الصفحة الحالية مفتوحة
  const GROUPS: [string, string[], any][] = [
    ['حسابي', ['home', 'profile', 'addresses'], <>
      {L('/account', 'home', '👤', 'نظرة عامة')}
      {L('/account/profile', 'profile', '📝', 'بياناتي وكلمة المرور')}
      {L('/account/addresses', 'addresses', '📍', 'دفتر العناوين')}
    </>],
    ['أرصدتي', ['coupons', 'points'], <>
      {L('/account/coupons', 'coupons', '🎟️', 'كوبوناتي')}
      {L('/account/points', 'points', '💎', 'نقاطي')}
    </>],
    ['طلباتي', ['orders'], <>
      {L('/account/orders', 'orders', '📦', 'كل الطلبات', counts.orders)}
      <a href="/request"><i>🔗</i>طلباتي بالرابط</a>
      <a href="/account/orders?stage=pending_payment"><i>💳</i>بانتظار الدفع</a>
      <a href="/account/orders?stage=buying"><i>🛒</i>قيد الشراء</a>
      <a href="/account/orders?stage=shipping"><i>✈️</i>في الطريق</a>
      <a href="/account/orders?stage=ready"><i>🏠</i>جاهز للتسليم</a>
      <a href="/account/orders?stage=delivered"><i>✅</i>تم التسليم</a>
    </>],
    ['مفضلتي', ['wishlist', 'reviews'], <>
      {L('/wishlist', 'wishlist', '♡', 'قائمة المفضلة', wishCount)}
      {L('/account/reviews', 'reviews', '⭐', 'تقييماتي', counts.reviews)}
    </>],
    ['خدمة الزبائن', ['tickets', 'notifications'], <>
      {L('/account/tickets', 'tickets', '↩️', 'الإرجاع والتذاكر', counts.tickets)}
      {L('/account/notifications', 'notifications', '🔔', 'الإشعارات', counts.notifications)}
      <a href="/pages/contact"><i>🎧</i>تواصل معنا</a>
    </>],
    ['السياسات', [], <>
      <a href="/pages/shipping"><i>🚚</i>معلومات الشحن</a>
      <a href="/pages/returns"><i>↩️</i>سياسة الإرجاع</a>
      <a href="/pages/payment"><i>💳</i>طرق الدفع والرسوم</a>
      <a href="/pages/privacy"><i>🔒</i>إشعار الخصوصية</a>
      <a href="/pages/terms"><i>📄</i>الشروط والأحكام</a>
    </>],
  ];
  return (
    <Layout user={user} cartCount={cartCount} wishCount={wishCount} categories={categories} title={title}>
      <nav class="crumbs"><a href="/">الرئيسية</a> / <span>{title}</span></nav>
      <div class="pc">
        <aside class="pc-side">
          <h3>مركز الحساب</h3>
          <div class="acct-me"><div class="av">{user.name.slice(0, 1)}</div><div><b>{user.name}</b><br /><small>{user.phone}</small></div></div>
          <div class="acct-pts"><span>⭐ {user.points} نقطة</span><a href="/account/points">التفاصيل ›</a></div>
          {GROUPS.map(([label, keys, links]) => (
            <details class="pc-grp" {...(keys.includes(active) || keys.length === 0 ? { open: true } : {})}>
              <summary>{label}</summary>
              <div class="pc-links">{links}</div>
            </details>
          ))}
          <a href="/logout" style="color:var(--brand);font-weight:700;font-size:13.5px;display:block;padding:14px 2px">⎋ تسجيل الخروج</a>
        </aside>
        <section class="pc-main"><h2>{title}</h2>{children}</section>
      </div>
    </Layout>
  );
};

export const Stars: FC<{ n: number; size?: number }> = ({ n, size = 14 }) => (
  <span class="stars" style={`font-size:${size}px`} aria-label={`${n} من 5`}>{'★★★★★'.slice(0, Math.round(n))}<span class="off">{'★★★★★'.slice(Math.round(n))}</span></span>
);
