import type { Context } from 'hono';
import type { Env } from '../types';

export type ProductRow = {
  id: number; slug: string; title_ar: string; price_lyd: number; compare_price_lyd: number | null;
  in_stock: number; status: string; sales: number; rating: number; image: string | null; category_id: number | null;
  min_qty: number; description_ar: string | null; source_offer_id: string | null; source_url: string | null;
  source_price_cny: number; weight_g: number | null; views: number; supplier_name: string | null; last_checked_at: string | null;
  cat_slug?: string; cat_name?: string;
};

export const PRODUCT_SELECT = `
  p.id,p.slug,p.title_ar,p.price_lyd,p.compare_price_lyd,p.in_stock,p.status,p.sales,p.rating,p.category_id,p.min_qty,
  p.description_ar,p.source_offer_id,p.source_url,p.source_price_cny,p.weight_g,p.views,p.supplier_name,p.last_checked_at,
  (SELECT url FROM product_images i WHERE i.product_id=p.id ORDER BY sort LIMIT 1) AS image,
  c.slug AS cat_slug, c.name_ar AS cat_name`;

export async function getCategories(db: D1Database) {
  const { results } = await db.prepare('SELECT id,slug,name_ar,icon,parent_id,est_weight_g,markup_percent FROM categories ORDER BY sort,id').all<any>();
  return results as { id: number; slug: string; name_ar: string; icon: string | null; parent_id: number | null; est_weight_g: number; markup_percent: number | null }[];
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

export function fmt(v: number) {
  return new Intl.NumberFormat('ar-LY', { maximumFractionDigits: v % 1 ? 2 : 0 }).format(v) + ' د.ل';
}

export function timeAgo(iso: string) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' });
}

export async function notify(db: D1Database, userId: number, title: string, body: string, link?: string) {
  await db.prepare('INSERT INTO notifications(user_id,title,body,link) VALUES(?,?,?,?)').bind(userId, title, body, link ?? null).run();
}
