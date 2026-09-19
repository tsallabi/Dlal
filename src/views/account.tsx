import type { FC } from 'hono/jsx';
import type { User } from '../types';
import { Layout } from './layout';

// قشرة حسابي — بأسلوب SHEIN: قائمة جانبية + محتوى
export const AccountShell: FC<{ user: User; cartCount: number; categories: any[]; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, cartCount, categories, active, title, children, counts = {} }) => {
  const L = (href: string, key: string, icon: string, label: string, n?: number) => <a href={href} class={active === key ? 'on' : ''}><span>{icon}</span>{label}{n ? <i class="cnt">{n}</i> : null}</a>;
  return (
    <Layout user={user} cartCount={cartCount} categories={categories} title={title}>
      <div class="acct">
        <aside class="acct-side">
          <div class="acct-me"><div class="av">{user.name.slice(0, 1)}</div><div><b>{user.name}</b><br /><small>{user.phone}</small></div></div>
          <div class="acct-pts"><span>⭐ {user.points} نقطة</span><a href="/account/points">التفاصيل ›</a></div>
          {L('/account', 'home', '🏠', 'نظرة عامة')}
          {L('/account/orders', 'orders', '📦', 'طلباتي', counts.orders)}
          {L('/account/tickets', 'tickets', '↩️', 'الإرجاع والتذاكر', counts.tickets)}
          {L('/account/reviews', 'reviews', '⭐', 'تقييماتي', counts.reviews)}
          {L('/account/coupons', 'coupons', '🎟️', 'كوبوناتي')}
          {L('/account/points', 'points', '💎', 'نقاطي')}
          {L('/account/addresses', 'addresses', '📍', 'عناويني')}
          {L('/wishlist', 'wishlist', '♡', 'المفضلة')}
          {L('/account/notifications', 'notifications', '🔔', 'الإشعارات', counts.notifications)}
          {L('/account/profile', 'profile', '👤', 'بياناتي وكلمة المرور')}
          <a href="/logout" style="color:#b5124f"><span>⎋</span>تسجيل الخروج</a>
        </aside>
        <section class="acct-main"><h2 class="acct-title">{title}</h2>{children}</section>
      </div>
    </Layout>
  );
};

export const Stars: FC<{ n: number; size?: number }> = ({ n, size = 14 }) => (
  <span class="stars" style={`font-size:${size}px`} aria-label={`${n} من 5`}>{'★★★★★'.slice(0, Math.round(n))}<span class="off">{'★★★★★'.slice(Math.round(n))}</span></span>
);
