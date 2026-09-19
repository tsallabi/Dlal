import type { FC } from 'hono/jsx';
import type { User } from '../types';

export const AdminShell: FC<{ user: User; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, active, title, children, counts = {} }) => (
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} | إدارة دلال</title>
      <link rel="stylesheet" href="/style.css" /><link rel="icon" href="/favicon.svg" />
    </head>
    <body style="padding-bottom:0;background:#fafafa">
      <header class="hdr"><div class="hdr-top wrap"><a href="/" class="logo">دلال</a><span class="pill">لوحة الإدارة</span>
        <nav class="hdr-links"><a href="/" target="_blank">المتجر ↗</a><span>{user.name}</span><a href="/logout">خروج</a></nav></div></header>
      <div class="dash wrap">
        <aside class="side">
          <h3>عام</h3>
          <a href="/admin" class={active === 'home' ? 'on' : ''}>📊 نظرة عامة</a>
          <a href="/admin/orders" class={active === 'orders' ? 'on' : ''}>📦 الطلبات {counts.orders ? <i class="badge" style="position:static">{counts.orders}</i> : null}</a>
          <a href="/admin/customers" class={active === 'customers' ? 'on' : ''}>👥 الزبائن</a>
          <h3>الكتالوج</h3>
          <a href="/admin/import" class={active === 'import' ? 'on' : ''}>⬇️ الاستيراد من 1688</a>
          <a href="/admin/products" class={active === 'products' ? 'on' : ''}>🛍️ المنتجات</a>
          <a href="/admin/categories" class={active === 'categories' ? 'on' : ''}>🗂️ الأقسام والأوزان</a>
          <a href="/admin/stock" class={active === 'stock' ? 'on' : ''}>🔄 فحص المخزون</a>
          <a href="/admin/api1688" class={active === 'api1688' ? 'on' : ''}>🔌 ربط API 1688</a>
          <h3>الإعدادات</h3>
          <a href="/admin/pricing" class={active === 'pricing' ? 'on' : ''}>💰 التسعير وسعر الصرف</a>
          <a href="/admin/partners" class={active === 'partners' ? 'on' : ''}>🚢 شركاء الشحن</a>
          <a href="/admin/staff" class={active === 'staff' ? 'on' : ''}>🔑 الموظفون</a>
        </aside>
        <section><h2 style="margin:4px 0 14px">{title}</h2>{children}</section>
      </div>
      <script src="/app.js"></script>
    </body>
  </html>
);

export const PartnerShell: FC<{ user: User; partner: { name: string }; active: string; title: string; children: any; counts?: Record<string, number> }> = ({ user, partner, active, title, children, counts = {} }) => (
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} | {partner.name}</title>
      <link rel="stylesheet" href="/style.css" /><link rel="icon" href="/favicon.svg" />
    </head>
    <body style="padding-bottom:0;background:#fafafa">
      <header class="hdr"><div class="hdr-top wrap"><a href="/partner" class="logo">دلال</a><span class="pill" style="background:#0b6b66">لوحة الشحن — {partner.name}</span>
        <nav class="hdr-links"><span>{user.name}</span><a href="/logout">خروج</a></nav></div></header>
      <div class="dash wrap">
        <aside class="side">
          <a href="/partner" class={active === 'queue' ? 'on' : ''}>🛒 بانتظار الشراء {counts.paid ? <i class="badge" style="position:static">{counts.paid}</i> : null}</a>
          <a href="/partner/purchasing" class={active === 'purchasing' ? 'on' : ''}>⏳ قيد الشراء {counts.purchasing ? <i class="badge" style="position:static;background:#555">{counts.purchasing}</i> : null}</a>
          <a href="/partner/warehouse" class={active === 'warehouse' ? 'on' : ''}>🏭 في المخزن {counts.at_warehouse ? <i class="badge" style="position:static;background:#555">{counts.at_warehouse}</i> : null}</a>
          <a href="/partner/shipments" class={active === 'shipments' ? 'on' : ''}>✈️ الشحنات</a>
          <a href="/partner/delivery" class={active === 'delivery' ? 'on' : ''}>🏠 التسليم في ليبيا</a>
          <a href="/partner/all" class={active === 'all' ? 'on' : ''}>📋 كل الطلبات</a>
        </aside>
        <section><h2 style="margin:4px 0 14px">{title}</h2>{children}</section>
      </div>
      <script src="/app.js"></script>
    </body>
  </html>
);
