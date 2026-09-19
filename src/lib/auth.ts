import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, User } from '../types';

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt?: string) {
  salt = salt ?? toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 50_000 },
    key, 256,
  );
  return `${salt}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt] = stored.split('$');
  const h = await hashPassword(password, salt);
  return h === stored;
}

export function newId(bytes = 24) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export async function createSession(c: Context<Env>, userId: number) {
  const id = newId();
  const expires = new Date(Date.now() + 30 * 86400_000);
  await c.env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)')
    .bind(id, userId, expires.toISOString()).run();
  setCookie(c, 'sid', id, { path: '/', httpOnly: true, sameSite: 'Lax', expires, secure: c.req.url.startsWith('https') });
}

export async function destroySession(c: Context<Env>) {
  const sid = getCookie(c, 'sid');
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
  deleteCookie(c, 'sid', { path: '/' });
}

export async function loadUser(c: Context<Env>): Promise<User | null> {
  const sid = getCookie(c, 'sid');
  if (!sid) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id,u.phone,u.name,u.email,u.role,u.staff_role,u.partner_id,u.city,u.address,u.points,u.active
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.id=? AND s.expires_at > datetime('now')`,
  ).bind(sid).first<User>();
  if (row && !row.active) return null;   // حساب معطّل
  return row ?? null;
}

export function requireRole(...roles: string[]) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
    const u = c.get('user');
    if (!u) return c.redirect('/login?next=' + encodeURIComponent(c.req.path));
    if (!roles.includes(u.role)) return c.text('غير مصرح', 403);
    await next();
  };
}
