import type { Context } from 'hono';
import type { Env } from '../types';

export type ProductRow = {
  id: number; slug: string; title_ar: string; price_lyd: number; compare_price_lyd: number | null;
  price_sea_lyd: number | null; in_stock: number; status: string; sales: number; rating: number; review_count: number; image: string | null; category_id: number | null;
  min_qty: number; description_ar: string | null; source_offer_id: string | null; source_url: string | null;
  source_price_cny: number; weight_g: number | null; views: number; supplier_name: string | null; last_checked_at: string | null;
  kind?: string | null;
  cat_slug?: string; cat_name?: string; colors?: number;
};

export const PRODUCT_SELECT = `
  p.id,p.slug,p.title_ar,p.price_lyd,p.compare_price_lyd,p.price_sea_lyd,p.in_stock,p.status,p.sales,p.rating,p.review_count,p.category_id,p.min_qty,
  p.description_ar,p.source_offer_id,p.source_url,p.source_price_cny,p.weight_g,p.views,p.supplier_name,p.last_checked_at,p.kind,
  (SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1) AS image,
  (SELECT COUNT(DISTINCT v.color) FROM variants v WHERE v.product_id=p.id AND v.color IS NOT NULL AND v.color<>'') AS colors,
  c.slug AS cat_slug, c.name_ar AS cat_name`;

export async function getCategories(db: D1Database) {
  const { results } = await db.prepare('SELECT id,slug,name_ar,icon,parent_id,est_weight_g,markup_percent,show_home FROM categories ORDER BY sort,id').all<any>();
  return results as { id: number; slug: string; name_ar: string; icon: string | null; parent_id: number | null; est_weight_g: number; markup_percent: number | null; show_home: number }[];
}

export async function cartCount(c: Context<Env>) {
  const u = c.get('user');
  if (!u) return 0;
  const r = await c.env.DB.prepare('SELECT COALESCE(SUM(qty),0) AS n FROM cart_items WHERE user_id=?').bind(u.id).first<{ n: number }>();
  return r?.n ?? 0;
}

export function orderCode(id: number) {
  return `DL-${new Date().getFullYear()}-${String(id).padStart(6, '0')}`;
}

// «١٢ — ١٨» ⟵ «12 — 18»: لوحة المفاتيح العربية تكتب أرقامًا عربية، والموقع يعرض 0-9 وحدها،
// و parseFloat('٣٫٥') = NaN فيفسد أي إعداد رقمي كُتب بها
export function latinDigits(v: string) {
  return v.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.').replace(/\u066C/g, ',').replace(/\u066A/g, '%');
}

// رقم واتساب حقيقي أو فارغ. البذرة وضعت 218910000000 فظهر للزبونة رقم لا يملكه أحد في الرئيسية
// وفي صفحة الطلب («واتساب التأكيد» لمن تدفع بالتحويل) — رسالة إليه تضيع (٢٤/٠٩/٢٦)
export function realWa(n?: string | null) {
  const d = latinDigits(String(n ?? '')).replace(/\D/g, '').replace(/^00/, '');
  return d.length >= 11 && d.length <= 15 && !/0{6,}/.test(d) ? d : '';
}
// رابط صفحة تواصل اجتماعي حقيقي (لا «facebook.com» الفارغ الذي كان في التذييل)
export function realSocial(u?: string | null) {
  const v = String(u ?? '').trim();
  return /^https:\/\/(www\.|m\.)?(facebook|instagram|tiktok)\.com\/[^\s/?#]{2,}/i.test(v) ? v : '';
}

export function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v) + ' د.ل';
}

export function timeAgo(iso: string) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' });
}

export async function notify(db: D1Database, userId: number, title: string, body: string, link?: string) {
  await db.prepare('INSERT INTO notifications(user_id,title,body,link) VALUES(?,?,?,?)').bind(userId, title, body, link ?? null).run();
}

// وسيط الصور: صور 1688 تمنع العرض من مواقع أخرى (حماية الروابط الساخنة)، فتُمرَّر عبر /img
// الرابط مُعمّى بـ base64url حتى لا يظهر اسم مصدر المنتج للزبونة في كود الصفحة.
const PROXY_HOSTS = /(^|\.)(alicdn\.com|1688\.com|taobao\.com|tbcdn\.cn|aliyuncs\.com)$/i;
export const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b + '==='.slice((b.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), ch => ch.charCodeAt(0)));
};
export function imgUrl(u?: string | null): string {
  if (!u) return '/placeholder.svg';
  if (u.startsWith('/')) return u;
  let h = '';
  try { h = new URL(u).hostname; } catch { return '/placeholder.svg'; }
  return PROXY_HOSTS.test(h) ? `/img/${b64url(u)}` : u;
}
