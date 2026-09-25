import { Hono } from 'hono';
import type { Env } from '../types';
import { Layout, Flash } from '../views/layout';
import { getCategories } from '../lib/db';
import { Ic } from '../views/icons';
import { hashPassword, verifyPassword, createSession, destroySession, normPhone, endImpersonation } from '../lib/auth';

const auth = new Hono<Env>();

// صفحتا الدخول والتسجيل بالتصميم الجديد (طلب صاحب المشروع ٢٥/٠٩/٢٦): لوحة دافئة باسم هدهد ومزاياه بجانب بطاقة النموذج.
// الكوبون الترحيبي يُذكر فقط إن كان مفعّلًا فعلًا في القاعدة — لا وعد بخصم لا يعمل
const welcome = async (db: D1Database) => db.prepare("SELECT code,value,min_order_lyd FROM coupons WHERE code='WELCOME10' AND active=1 AND (ends_at IS NULL OR ends_at>datetime('now'))").first<{ code: string; value: number; min_order_lyd: number }>().catch(() => null);

const AuthShell = ({ children, w }: { children: any; w: { code: string; value: number; min_order_lyd: number } | null }) => (
  <div class="auth wrap">
    <aside class="auth-brand">
      <img src="/hudhud-logo.svg" alt="" width="92" height="76" />
      <b class="auth-name">هدهد <i>HUDHUDE</i></b>
      <p class="auth-tag">بوابتك إلى الصين — بضاعة 1688 بالدينار الليبي حتى باب بيتك.</p>
      <ul>
        <li><i><Ic n="tag" s={18} /></i><span><b>أسعار نهائية بالدينار</b>السعر المعروض يشمل الشحن من الصين إلى ليبيا</span></li>
        <li><i><Ic n="pin" s={18} /></i><span><b>تتبّع كل طلب</b>من الدفع حتى التسليم في مدينتك</span></li>
        <li><i><Ic n="shield" s={18} /></i><span><b>دفع آمن</b>بطاقة، سداد، إدفع لي، موبي كاش أو نقدًا</span></li>
        <li><i><Ic n="star" s={18} /></i><span><b>نقاط على كل طلب</b>تتحول إلى خصم على طلبك التالي</span></li>
      </ul>
      {w && <div class="auth-gift"><Ic n="gift" s={20} /><span>كوبون ترحيبي <b dir="ltr">{w.code}</b> — خصم {w.value}% على طلبك الأول فوق {w.min_order_lyd} د.ل</span></div>}
    </aside>
    {children}
  </div>
);

const Fld = ({ ic, children }: { ic: string; children: any }) => <div class="fld"><Ic n={ic} s={18} />{children}</div>;
const Pw = (p: { min?: number; auto: string }) => (
  <div class="fld"><Ic n="lock" s={18} /><input type="password" name="password" minlength={p.min} autocomplete={p.auto} required /><button type="button" class="pw-eye" data-pw-eye aria-label="إظهار كلمة المرور"><Ic n="eye" s={18} /></button></div>
);


auth.get('/login', async (c) => {
  const b = { user: c.get('user'), cartCount: 0, categories: await getCategories(c.env.DB) };
  const w = await welcome(c.env.DB);
  return c.html(
    <Layout {...b} title="تسجيل الدخول">
      <AuthShell w={w}>
      <form class="form auth-card" method="post">
        <span class="auth-ic"><Ic n="user" s={24} /></span>
        <h1>تسجيل الدخول</h1>
        <p class="auth-sub">أهلًا بعودتك — ادخل برقم هاتفك.</p>
        <Flash type="err" msg={c.req.query('err') === 'pending' ? 'حسابك بانتظار موافقة إدارة هدهد — ستتمكن من الدخول فور قبوله.' : c.req.query('err') === 'disabled' ? 'هذا الحساب معطّل. تواصل مع الدعم.' : c.req.query('err') ? 'رقم الهاتف أو كلمة المرور غير صحيحة' : undefined} />
        <input type="hidden" name="next" value={c.req.query('next') ?? '/'} />
        <label>رقم الهاتف</label><Fld ic="phone"><input type="tel" name="phone" placeholder="09xxxxxxxx" autocomplete="tel" required autofocus /></Fld>
        <label>كلمة المرور</label><Pw auto="current-password" />
        <button class="btn auth-go" type="submit">دخول</button>
        <p class="auth-alt">جديد هنا؟ <a href={`/register?next=${encodeURIComponent(c.req.query('next') ?? '/')}`}>أنشئ حسابًا</a></p>
      </form>
      </AuthShell>
    </Layout>,
  );
});

auth.post('/login', async (c) => {
  const f = await c.req.parseBody();
  const phone = normPhone(String(f.phone ?? ''));
  // والرقم كما كُتب أيضًا: حسابات أُنشئت قبل توحيد الصيغة محفوظة بـ218… (ترحيل 0034 يوحّدها)
  const raw = String(f.phone ?? '').replace(/\D/g, '');
  const u = await c.env.DB.prepare('SELECT id,password_hash,active,pending_approval FROM users WHERE phone IN (?,?) ORDER BY phone=? DESC LIMIT 1').bind(phone, raw, phone).first<{ id: number; password_hash: string; active: number; pending_approval: number }>();
  const pwOk = !!u && await verifyPassword(String(f.password), u.password_hash);
  // موظف أضافه الشريك ولم يقبله صاحب المشروع بعد: كلمة مروره صحيحة، فنقول له السبب بدل «غير صحيحة»
  if (!u || !pwOk || !u.active) return c.redirect(`/login?err=${u && pwOk && u.pending_approval ? 'pending' : u && !u.active ? 'disabled' : 1}&next=${encodeURIComponent(String(f.next ?? '/'))}`);
  await createSession(c, u.id);
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").bind(u.id).run());
  const next = String(f.next ?? '/');
  return c.redirect(next.startsWith('/') ? next : '/');
});

auth.get('/register', async (c) => {
  const b = { user: c.get('user'), cartCount: 0, categories: await getCategories(c.env.DB) };
  const w = await welcome(c.env.DB);
  return c.html(
    <Layout {...b} title="حساب جديد">
      <AuthShell w={w}>
      <form class="form auth-card" method="post">
        <span class="auth-ic"><Ic n="bird" s={24} /></span>
        <h1>إنشاء حساب</h1>
        <p class="auth-sub">دقيقة واحدة: اسمك ورقم هاتفك وكلمة مرور.</p>
        <Flash type="err" msg={c.req.query('err') === 'exists' ? 'هذا الرقم مسجّل مسبقًا. سجّل الدخول.' : c.req.query('err') ? 'تحقق من البيانات' : undefined} />
        <input type="hidden" name="next" value={c.req.query('next') ?? '/'} />
        <label>الاسم</label><Fld ic="user"><input type="text" name="name" autocomplete="name" required /></Fld>
        <label>رقم الهاتف</label><Fld ic="phone"><input type="tel" name="phone" placeholder="09xxxxxxxx" autocomplete="tel" required /></Fld>
        <label>كلمة المرور <small>(6 أحرف على الأقل)</small></label><Pw min={6} auto="new-password" />
        <button class="btn auth-go" type="submit">إنشاء الحساب</button>
        <p class="auth-alt">عندك حساب؟ <a href={`/login?next=${encodeURIComponent(c.req.query('next') ?? '/')}`}>سجّل الدخول</a></p>
      </form>
      </AuthShell>
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
