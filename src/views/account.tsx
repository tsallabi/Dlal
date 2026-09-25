import type { FC } from 'hono/jsx';
import type { User } from '../types';
import { Layout } from './layout';
import { Ic } from './icons';

// قشرة حسابي — بأسلوب SHEIN: قائمة جانبية + محتوى
export const AccountShell: FC<{ user: User; cartCount: number; wishCount?: number; categories: any[]; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, cartCount, wishCount = 0, categories, active, title, children, counts = {} }) => {
  const L = (href: string, key: string, icon: string, label: string, n?: number) =>
    <a href={href} class={active === key ? 'on' : ''}><i><Ic n={icon} s={17} /></i>{label}{n ? <span class="cnt">{n}</span> : null}</a>;
  // مجموعات مركز الحساب: كل مجموعة تُطوى وتنفتح، والمجموعة التي تحوي الصفحة الحالية مفتوحة
  const GROUPS: [string, string[], any][] = [
    ['حسابي', ['home', 'profile', 'addresses'], <>
      {L('/account', 'home', 'user', 'نظرة عامة')}
      {L('/account/profile', 'profile', 'doc', 'بياناتي وكلمة المرور')}
      {L('/account/addresses', 'addresses', 'pin', 'دفتر العناوين')}
    </>],
    ['أرصدتي', ['coupons', 'points'], <>
      {L('/account/coupons', 'coupons', 'tag', 'كوبوناتي')}
      {L('/account/points', 'points', 'gift', 'نقاطي')}
    </>],
    ['طلباتي', ['orders'], <>
      {L('/account/orders', 'orders', 'box', 'كل الطلبات', counts.orders)}
      <a href="/request"><i><Ic n="link" s={17} /></i>طلباتي بالرابط</a>
      <a href="/account/orders?stage=pending_payment"><i><Ic n="card" s={17} /></i>بانتظار الدفع</a>
      <a href="/account/orders?stage=buying"><i><Ic n="cart" s={17} /></i>قيد الشراء</a>
      <a href="/account/orders?stage=shipping"><i><Ic n="plane" s={17} /></i>في الطريق</a>
      <a href="/account/orders?stage=ready"><i><Ic n="home" s={17} /></i>جاهز للتسليم</a>
      <a href="/account/orders?stage=delivered"><i><Ic n="check" s={17} /></i>تم التسليم</a>
    </>],
    ['مفضلتي', ['wishlist', 'reviews'], <>
      {L('/wishlist', 'wishlist', 'heart', 'قائمة المفضلة', wishCount)}
      {L('/account/reviews', 'reviews', 'star', 'تقييماتي', counts.reviews)}
    </>],
    ['خدمة الزبائن', ['tickets', 'notifications'], <>
      {L('/account/tickets', 'tickets', 'ret', 'الإرجاع والتذاكر', counts.tickets)}
      {L('/account/notifications', 'notifications', 'mail', 'الإشعارات', counts.notifications)}
      <a href="/pages/contact"><i><Ic n="chat" s={17} /></i>تواصل معنا</a>
    </>],
    ['السياسات', [], <>
      <a href="/pages/shipping"><i><Ic n="truck" s={17} /></i>معلومات الشحن</a>
      <a href="/pages/returns"><i><Ic n="ret" s={17} /></i>سياسة الإرجاع</a>
      <a href="/pages/payment"><i><Ic n="card" s={17} /></i>طرق الدفع والرسوم</a>
      <a href="/pages/privacy"><i><Ic n="lock" s={17} /></i>إشعار الخصوصية</a>
      <a href="/pages/terms"><i><Ic n="doc" s={17} /></i>الشروط والأحكام</a>
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
