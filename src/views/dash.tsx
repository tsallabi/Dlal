import type { FC } from 'hono/jsx';
import type { User } from '../types';
import { permsOf, STAFF_ROLES } from '../lib/perm';
import type { Perm } from '../lib/perm';
import { Ic } from './icons';

export const AdminShell: FC<{ user: User; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, active, title, children, counts = {} }) => {
  const P = permsOf(user);
  const L = (href: string, key: string, ic: string, label: string, perm: Perm | Perm[], n?: number, color = '') => {
    const ok = (Array.isArray(perm) ? perm : [perm]).some(p => P.has(p));
    if (!ok) return null;
    return <a href={href} class={active === key ? 'on' : ''}><Ic n={ic} s={18} /><span>{label}</span> {n ? <i class="badge" style={`position:static;${color}`}>{n}</i> : null}</a>;
  };
  const items = [
    ['عام', [L('/admin', 'home', 'chart', 'نظرة عامة', 'dashboard'), L('/admin/orders', 'orders', 'box', 'الطلبات', ['orders.view', 'orders.manage'], counts.orders), L('/admin/payments', 'payments', 'card', 'المدفوعات وماي باي', ['payments.view', 'payments.manage']), L('/admin/customers', 'customers', 'users', 'الزبائن', ['customers.view', 'customers.manage']), L('/admin/reports', 'reports', 'trend', 'التقارير', 'reports.view'), L('/admin/analytics', 'analytics', 'steps', 'حركة الزوار', 'reports.view')]],
    ['خدمة الزبائن', [L('/admin/tickets', 'tickets', 'ret', 'التذاكر والإرجاع', 'tickets.manage', counts.tickets, 'background:#d68b00'), L('/admin/requests', 'requests', 'link', 'طلبات بالرابط', ['catalog.manage', 'orders.manage'], counts.requests, 'background:#B05A20'), L('/admin/reviews', 'reviews', 'star', 'التقييمات', 'reviews.manage', counts.reviews, 'background:#555'), L('/admin/coupons', 'coupons', 'ticket', 'الكوبونات', 'coupons.manage')]],
    ['الكتالوج', [L('/admin/import', 'import', 'download', 'الاستيراد من 1688', 'catalog.manage'), L('/admin/products', 'products', 'bag', 'المنتجات', 'catalog.manage'), L('/admin/categories', 'categories', 'folder', 'الأقسام والأوزان', 'catalog.manage'), L('/admin/stock', 'stock', 'refresh', 'فحص المخزون', 'catalog.manage'), L('/admin/crawler', 'crawler', 'bot', 'الزاحف (إضافة المتصفح)', 'catalog.manage'), L('/admin/source', 'source', 'antenna', 'مزوّد API لبيانات 1688', 'catalog.manage'), L('/admin/api1688', 'api1688', 'plug', 'ربط API 1688', 'catalog.manage')]],
    ['الإعدادات', [L('/admin/pricing', 'pricing', 'coin', 'التسعير وسعر الصرف', 'pricing.manage'), L('/admin/partners', 'partners', 'ship', 'شركاء الشحن', 'partners.manage'), L('/admin/staff', 'staff', 'key', 'الموظفون والصلاحيات', 'staff.manage'), L('/admin/activity', 'activity', 'doc', 'سجل النشاط', 'logs.view')]],
  ] as [string, any[]][];
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} | إدارة هدهد</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" /><link rel="stylesheet" href="/style.css" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body class="admin-body">
        <header class="hdr"><div class="hdr-top wrap"><a href="/" class="logo"><img src="/hudhud-logo.svg" alt="" width="77" height="64" /><span class="t"><b>هدهد</b><i>HUDHUDE</i><u>بوابتك إلى الصين</u></span></a><span class="pill">لوحة الإدارة</span>
          <nav class="hdr-links"><a href="/admin/crawler" class="pin"><Ic n="bot" s={16} /> الزاحف</a><a href="/" target="_blank"><Ic n="store" s={16} /> المتجر</a><a href="/partner" target="_blank"><Ic n="ship" s={16} /> لوحة الشحن</a><span class="me">{user.name} <small>· {STAFF_ROLES[user.staff_role ?? 'admin']?.ar}</small></span><a href="/logout"><Ic n="logout" s={16} /> خروج</a></nav></div></header>
        <div class="dash wrap">
          <aside class="side">
            {items.map(([h, ls]) => ls.some(Boolean) ? <><h3>{h}</h3>{ls}</> : null)}
          </aside>
          <section><h2 class="dash-title">{title}</h2>{children}</section>
        </div>
        <script src="/app.js"></script>
      </body>
    </html>
  );
};

export const PartnerShell: FC<{ user: User; partner: { name: string }; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, partner, active, title, children, counts = {} }) => (
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} | {partner.name}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" /><link rel="stylesheet" href="/style.css" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    </head>
    <body class="admin-body">
      <header class="hdr"><div class="hdr-top wrap"><a href="/partner" class="logo"><img src="/hudhud-logo.svg" alt="" width="77" height="64" /><span class="t"><b>هدهد</b><i>HUDHUDE</i><u>بوابتك إلى الصين</u></span></a><span class="pill">لوحة الشحن — {partner.name}</span>
        <nav class="hdr-links"><span class="me">{user.name}</span><a href="/logout"><Ic n="logout" s={16} /> خروج</a></nav></div></header>
      <div class="dash wrap">
        <aside class="side">
          <a href="/partner" class={active === 'home' ? 'on' : ''}><Ic n="chart" s={18} /><span>لوحتي</span></a>
          <a href="/partner/queue" class={active === 'queue' ? 'on' : ''}><Ic n="cart" s={18} /><span>بانتظار الشراء</span> {counts.paid ? <i class="badge" style="position:static">{counts.paid}</i> : null}</a>
          <a href="/partner/purchasing" class={active === 'purchasing' ? 'on' : ''}><Ic n="hourglass" s={18} /><span>قيد الشراء</span> {counts.purchasing ? <i class="badge" style="position:static;background:#555">{counts.purchasing}</i> : null}</a>
          <a href="/partner/warehouse" class={active === 'warehouse' ? 'on' : ''}><Ic n="factory" s={18} /><span>في المخزن</span> {counts.at_warehouse ? <i class="badge" style="position:static;background:#555">{counts.at_warehouse}</i> : null}</a>
          <a href="/partner/shipments" class={active === 'shipments' ? 'on' : ''}><Ic n="plane" s={18} /><span>الشحنات</span></a>
          <a href="/partner/delivery" class={active === 'delivery' ? 'on' : ''}><Ic n="truck" s={18} /><span>التوصيل داخل ليبيا</span></a>
          <a href="/partner/all" class={active === 'all' ? 'on' : ''}><Ic n="list" s={18} /><span>كل الطلبات</span></a>
          <a href="/partner/rates" class={active === 'rates' ? 'on' : ''}><Ic n="coin" s={18} /><span>أسعاري</span></a>
          <a href="/partner/api" class={active === 'api' ? 'on' : ''}><Ic n="plug" s={18} /><span>ربط API</span></a>
          <a href="/partner/team" class={active === 'team' ? 'on' : ''}><Ic n="users" s={18} /><span>موظفو الشركة</span></a>
        </aside>
        <section><h2 class="dash-title">{title}</h2>{children}</section>
      </div>
      <script src="/app.js"></script>
    </body>
  </html>
);
