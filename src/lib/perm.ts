// نظام الأدوار والصلاحيات للوحة الإدارة
import type { Context } from 'hono';
import type { Env, StaffRole, User } from '../types';

export const STAFF_ROLES: Record<StaffRole, { ar: string; desc: string }> = {
  owner:   { ar: 'المالك', desc: 'كل الصلاحيات بما فيها إدارة الموظفين والإعدادات الحساسة' },
  admin:   { ar: 'مدير عام', desc: 'كل الصلاحيات التشغيلية' },
  ops:     { ar: 'عمليات', desc: 'الطلبات، الشركاء، الشحنات، تذاكر الطلبات' },
  support: { ar: 'دعم الزبائن', desc: 'التذاكر، الزبائن، التقييمات، عرض الطلبات' },
  finance: { ar: 'مالية', desc: 'المدفوعات، الاسترجاع، التسعير، الكوبونات، التقارير' },
  catalog: { ar: 'الكتالوج', desc: 'المنتجات، الاستيراد، الأقسام، فحص المخزون' },
};

export type Perm =
  | 'dashboard' | 'orders.view' | 'orders.manage' | 'payments.view' | 'payments.manage' | 'customers.view' | 'customers.manage'
  | 'tickets.manage' | 'reviews.manage' | 'coupons.manage' | 'catalog.manage' | 'pricing.manage' | 'partners.manage'
  | 'staff.manage' | 'settings.manage' | 'reports.view' | 'logs.view';

export const PERM_LABELS: Record<Perm, string> = {
  dashboard: 'نظرة عامة', 'orders.view': 'عرض الطلبات', 'orders.manage': 'إدارة الطلبات', 'payments.view': 'عرض المدفوعات', 'payments.manage': 'إدارة المدفوعات والاسترجاع',
  'customers.view': 'عرض الزبائن', 'customers.manage': 'إدارة الزبائن (نقاط/تعطيل)', 'tickets.manage': 'التذاكر والإرجاع', 'reviews.manage': 'مراجعة التقييمات', 'coupons.manage': 'الكوبونات',
  'catalog.manage': 'الكتالوج والاستيراد', 'pricing.manage': 'التسعير وسعر الصرف', 'partners.manage': 'شركاء الشحن', 'staff.manage': 'الموظفون والصلاحيات', 'settings.manage': 'إعدادات البوابة والمتجر',
  'reports.view': 'التقارير', 'logs.view': 'سجل النشاط',
};

const ALL = Object.keys(PERM_LABELS) as Perm[];
export const ROLE_PERMS: Record<StaffRole, Perm[]> = {
  owner: ALL,
  admin: ALL.filter(p => p !== 'staff.manage'),
  ops: ['dashboard', 'orders.view', 'orders.manage', 'customers.view', 'partners.manage', 'tickets.manage', 'reports.view'],
  support: ['dashboard', 'orders.view', 'customers.view', 'customers.manage', 'tickets.manage', 'reviews.manage'],
  finance: ['dashboard', 'orders.view', 'payments.view', 'payments.manage', 'pricing.manage', 'coupons.manage', 'reports.view', 'logs.view'],
  catalog: ['dashboard', 'catalog.manage', 'reviews.manage'],
};

export function permsOf(u: User | null): Set<Perm> {
  if (!u || u.role !== 'admin') return new Set();
  return new Set(ROLE_PERMS[u.staff_role ?? 'admin'] ?? []);
}
export const can = (u: User | null, p: Perm) => permsOf(u).has(p);

export function requirePerm(...perms: Perm[]) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
    const u = c.get('user');
    if (!u) return c.redirect('/login?next=' + encodeURIComponent(c.req.path));
    const have = permsOf(u);
    if (!perms.some(p => have.has(p))) {
      return c.html(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div class="empty" style="padding:80px 16px"><div class="big">🔒</div><h2>غير مصرح لك بهذه الصفحة</h2><p style="color:#666">دورك الحالي: <b>${STAFF_ROLES[u.staff_role ?? 'admin']?.ar ?? u.role}</b> — يلزم صلاحية: ${perms.map(p => PERM_LABELS[p]).join(' أو ')}</p><a class="btn" href="/admin">العودة للوحة</a></div></body></html>`, 403);
    }
    await next();
  };
}

export async function logActivity(db: D1Database, userId: number | null, action: string, target?: string, detail?: string) {
  await db.prepare('INSERT INTO activity_log(user_id,action,target,detail) VALUES(?,?,?,?)').bind(userId, action, target ?? null, detail ?? null).run();
}
