import { Hono } from 'hono';
import type { Env } from '../types';
import { Layout, Flash } from '../views/layout';
import { getCategories } from '../lib/db';
import { hashPassword, verifyPassword, createSession, destroySession, normPhone, endImpersonation } from '../lib/auth';

const auth = new Hono<Env>();


auth.get('/login', async (c) => {
  const b = { user: c.get('user'), cartCount: 0, categories: await getCategories(c.env.DB) };
  return c.html(
    <Layout {...b} title="تسجيل الدخول">
      <form class="form" method="post">
        <h1>تسجيل الدخول</h1>
        <Flash type="err" msg={c.req.query('err') === 'disabled' ? 'هذا الحساب معطّل. تواصلي مع الدعم.' : c.req.query('err') ? 'رقم الهاتف أو كلمة المرور غير صحيحة' : undefined} />
        <input type="hidden" name="next" value={c.req.query('next') ?? '/'} />
        <label>رقم الهاتف</label><input type="tel" name="phone" placeholder="09xxxxxxxx" required autofocus />
        <label>كلمة المرور</label><input type="password" name="password" required />
        <button class="btn" type="submit" style="width:100%;margin-top:16px">دخول</button>
        <p style="text-align:center;margin-top:14px;font-size:14px">جديدة هنا؟ <a href={`/register?next=${encodeURIComponent(c.req.query('next') ?? '/')}`} style="color:var(--brand);font-weight:700">أنشئي حسابًا</a></p>
      </form>
    </Layout>,
  );
});

auth.post('/login', async (c) => {
  const f = await c.req.parseBody();
  const phone = normPhone(String(f.phone ?? ''));
  // والرقم كما كُتب أيضًا: حسابات أُنشئت قبل توحيد الصيغة محفوظة بـ218… (ترحيل 0034 يوحّدها)
  const raw = String(f.phone ?? '').replace(/\D/g, '');
  const u = await c.env.DB.prepare('SELECT id,password_hash,active FROM users WHERE phone IN (?,?) ORDER BY phone=? DESC LIMIT 1').bind(phone, raw, phone).first<{ id: number; password_hash: string; active: number }>();
  if (!u || !u.active || !(await verifyPassword(String(f.password), u.password_hash))) return c.redirect(`/login?err=${u && !u.active ? 'disabled' : 1}&next=${encodeURIComponent(String(f.next ?? '/'))}`);
  await createSession(c, u.id);
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").bind(u.id).run());
  const next = String(f.next ?? '/');
  return c.redirect(next.startsWith('/') ? next : '/');
});

auth.get('/register', async (c) => {
  const b = { user: c.get('user'), cartCount: 0, categories: await getCategories(c.env.DB) };
  return c.html(
    <Layout {...b} title="حساب جديد">
      <form class="form" method="post">
        <h1>إنشاء حساب</h1>
        <Flash type="err" msg={c.req.query('err') === 'exists' ? 'هذا الرقم مسجّل مسبقًا. سجّلي الدخول.' : c.req.query('err') ? 'تحققي من البيانات' : undefined} />
        <input type="hidden" name="next" value={c.req.query('next') ?? '/'} />
        <label>الاسم</label><input type="text" name="name" required />
        <label>رقم الهاتف</label><input type="tel" name="phone" placeholder="09xxxxxxxx" required />
        <label>كلمة المرور</label><input type="password" name="password" minlength={6} required />
        <button class="btn" type="submit" style="width:100%;margin-top:16px">إنشاء الحساب</button>
        <p style="text-align:center;margin-top:14px;font-size:14px">عندك حساب؟ <a href="/login" style="color:var(--brand);font-weight:700">سجّلي الدخول</a></p>
      </form>
    </Layout>,
  );
});

auth.post('/register', async (c) => {
  const f = await c.req.parseBody();
  const phone = normPhone(String(f.phone ?? ''));
  const name = String(f.name ?? '').trim();
  const pw = String(f.password ?? '');
  if (!/^0\d{9}$/.test(phone) || name.length < 2 || pw.length < 6) return c.redirect('/register?err=1');
  const ex = await c.env.DB.prepare('SELECT 1 FROM users WHERE phone=?').bind(phone).first();
  if (ex) return c.redirect('/register?err=exists');
  const r = await c.env.DB.prepare('INSERT INTO users(phone,name,password_hash) VALUES(?,?,?)').bind(phone, name, await hashPassword(pw)).run();
  await createSession(c, r.meta.last_row_id as number);
  const next = String(f.next ?? '/');
  return c.redirect(next.startsWith('/') ? next : '/');
});

// «خروج» أثناء «ادخل باسمه» يعيد المالك إلى حسابه بدل أن يُخرجه من الموقع
auth.get('/logout', async (c) => { if (await endImpersonation(c)) return c.redirect('/admin/staff'); await destroySession(c); return c.redirect('/'); });
auth.get('/impersonate/end', async (c) => { await endImpersonation(c); return c.redirect('/admin/staff'); });

export default auth;
