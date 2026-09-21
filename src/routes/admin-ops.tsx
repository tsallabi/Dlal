// لوحة الإدارة — العمليات: الكوبونات، التقييمات، التذاكر/الإرجاع، المدفوعات وماي باي، التقارير، سجل النشاط، الزبائن، الموظفون والصلاحيات
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, StaffRole } from '../types';
import { ORDER_STATUS, PAYMENT_METHODS, TICKET_TYPES, TICKET_STATUS } from '../types';
import { AdminShell } from '../views/dash';
import { Flash } from '../views/layout';
import { Stars } from '../views/account';
import { getCategories, fmt, timeAgo, notify } from '../lib/db';
import { hashPassword, requireRole } from '../lib/auth';
import { requirePerm, STAFF_ROLES, ROLE_PERMS, PERM_LABELS, logActivity, permsOf } from '../lib/perm';
import { loadSettings } from '../lib/pricing';
import { loadMyPay, checkConnection } from '../lib/mypay';
import { setOrderStatus, addPoints } from '../lib/orders';
import { getProvider, PROVIDERS } from '../lib/source-providers';
import { runServerJobs } from '../lib/crawl';

const ops = new Hono<Env>();
ops.use('*', requireRole('admin'));

const shell = async (c: Context<Env>, active: string, title: string, body: any) => {
  const db = c.env.DB;
  const k = await db.batch([
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status='pending_payment'"),
    db.prepare("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"),
    db.prepare("SELECT COUNT(*) n FROM reviews WHERE status='pending'"),
  ]);
  const n = (i: number) => (k[i].results[0] as any).n as number;
  return c.html(<AdminShell user={c.get('user')!} active={active} title={title} counts={{ orders: n(0), tickets: n(1), reviews: n(2) }}>{body}</AdminShell>);
};

// ---------- الكوبونات ----------
ops.use('/coupons*', requirePerm('coupons.manage'));
ops.get('/coupons', async (c) => {
  const rows = await c.env.DB.prepare('SELECT c.*,(SELECT COALESCE(SUM(discount_lyd),0) FROM coupon_uses u WHERE u.coupon_id=c.id) total_disc FROM coupons c ORDER BY c.id DESC').all<any>();
  const T: Record<string, string> = { percent: 'نسبة %', fixed: 'مبلغ ثابت', free_ship: 'توصيل مجاني' };
  return shell(c, 'coupons', 'الكوبونات والعروض', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم ✓' : undefined} /><Flash type="err" msg={c.req.query('err') ? 'الكود مستخدم مسبقًا' : undefined} />
      <div class="two" style="grid-template-columns:1fr 360px">
        <div class="tbl-wrap"><table class="tbl"><tr><th>الكود</th><th>النوع</th><th>القيمة</th><th>شروط</th><th>الاستخدام</th><th>إجمالي الخصم</th><th>الحالة</th><th class="acts"></th></tr>
          {rows.results.map(cp => <tr><td><b class="mono" style="display:inline">{cp.code}</b><br /><small>{cp.note}</small></td><td>{T[cp.type]}</td><td>{cp.type === 'percent' ? `${cp.value}%` : cp.type === 'fixed' ? fmt(cp.value) : '—'}{cp.max_discount_lyd ? <><br /><small>حد أقصى {fmt(cp.max_discount_lyd)}</small></> : null}</td><td><small>حد أدنى {fmt(cp.min_order_lyd)}<br />{cp.per_user_limit}/زبونة{cp.ends_at ? ` · حتى ${cp.ends_at.slice(0, 10)}` : ''}</small></td><td>{cp.used_count}{cp.usage_limit ? ` / ${cp.usage_limit}` : ''}</td><td>{fmt(cp.total_disc)}</td><td><span class={`status ${cp.active ? 'green' : 'gray'}`}>{cp.active ? 'نشط' : 'موقوف'}</span></td><td><form method="post" action={`/admin/coupons/${cp.id}/toggle`}><button class="btn sm ghost">{cp.active ? 'إيقاف' : 'تفعيل'}</button></form></td></tr>)}
        </table></div>
        <form method="post" action="/admin/coupons/new" class="card-box"><h3>+ كوبون جديد</h3>
          <label>الكود</label><input type="text" name="code" required style="text-transform:uppercase" placeholder="EID20" />
          <label>النوع</label><select name="type"><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت (د.ل)</option><option value="free_ship">توصيل مجاني</option></select>
          <div class="inline"><div><label>القيمة</label><input type="number" step="0.5" name="value" value="10" /></div><div><label>حد أقصى للخصم</label><input type="number" name="max_discount_lyd" placeholder="—" /></div></div>
          <div class="inline"><div><label>حد أدنى للطلب</label><input type="number" name="min_order_lyd" value="0" /></div><div><label>مرات لكل زبونة</label><input type="number" name="per_user_limit" value="1" /></div></div>
          <div class="inline"><div><label>إجمالي الاستخدامات</label><input type="number" name="usage_limit" placeholder="بلا حد" /></div><div><label>ينتهي في</label><input type="date" name="ends_at" /></div></div>
          <label>ملاحظة تظهر للزبونة</label><input type="text" name="note" /><button class="btn sm" style="margin-top:10px">إنشاء</button></form>
      </div>
    </>
  ));
});
ops.post('/coupons/new', async (c) => {
  const f = await c.req.parseBody(); const u = c.get('user')!;
  try {
    await c.env.DB.prepare('INSERT INTO coupons(code,type,value,min_order_lyd,max_discount_lyd,usage_limit,per_user_limit,ends_at,note) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(String(f.code).trim().toUpperCase(), String(f.type), Number(f.value) || 0, Number(f.min_order_lyd) || 0, f.max_discount_lyd ? Number(f.max_discount_lyd) : null, f.usage_limit ? Number(f.usage_limit) : null, Number(f.per_user_limit) || 1, f.ends_at ? `${f.ends_at}T23:59:59Z` : null, f.note ? String(f.note) : null).run();
  } catch { return c.redirect('/admin/coupons?err=1'); }
  await logActivity(c.env.DB, u.id, 'coupon.create', String(f.code).toUpperCase());
  return c.redirect('/admin/coupons?ok=1');
});
ops.post('/coupons/:id/toggle', async (c) => { await c.env.DB.prepare('UPDATE coupons SET active=1-active WHERE id=?').bind(Number(c.req.param('id'))).run(); await logActivity(c.env.DB, c.get('user')!.id, 'coupon.toggle', c.req.param('id')); return c.redirect('/admin/coupons?ok=1'); });

// ---------- التقييمات ----------
ops.use('/reviews*', requirePerm('reviews.manage'));
ops.get('/reviews', async (c) => {
  const st = c.req.query('status') ?? 'pending';
  const rows = await c.env.DB.prepare('SELECT r.*,u.name,u.phone,p.title_ar,p.slug FROM reviews r JOIN users u ON u.id=r.user_id JOIN products p ON p.id=r.product_id WHERE r.status=? ORDER BY r.id DESC LIMIT 200').bind(st).all<any>();
  return shell(c, 'reviews', 'مراجعة التقييمات', (
    <>
      <div class="tabs">{[['pending', 'بانتظار المراجعة'], ['approved', 'منشورة'], ['rejected', 'مرفوضة']].map(([k, l]) => <a href={`/admin/reviews?status=${k}`} class={st === k ? 'on' : ''}>{l}</a>)}</div>
      {rows.results.length === 0 && <div class="empty">لا شيء هنا</div>}
      {rows.results.map(r => (
        <div class="card-box review"><div class="rv-h"><a href={`/p/${r.slug}`} target="_blank"><b>{r.title_ar}</b></a><Stars n={r.rating} /><small>{r.name} · {r.phone} · {timeAgo(r.created_at)}</small>{r.size_fit && <span class="status">{{ small: 'أصغر', true: 'مطابق', large: 'أكبر' }[r.size_fit as string]}</span>}</div>
          <p>{r.body}</p>{r.image_url && <a href={r.image_url} target="_blank">📷 صورة</a>}
          {st !== 'approved' && <form method="post" action={`/admin/reviews/${r.id}`} class="inline"><button class="btn sm ok" name="status" value="approved">نشر ✓</button><button class="btn sm ghost" name="status" value="rejected">رفض</button></form>}
          {st === 'approved' && <form method="post" action={`/admin/reviews/${r.id}`} class="inline"><button class="btn sm ghost" name="status" value="rejected">إخفاء</button></form>}
        </div>
      ))}
    </>
  ));
});
ops.post('/reviews/:id', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id')); const st = String(f.status);
  if (!['approved', 'rejected'].includes(st)) return c.text('bad', 400);
  const r = await db.prepare('SELECT product_id,user_id FROM reviews WHERE id=?').bind(id).first<any>();
  await db.prepare('UPDATE reviews SET status=? WHERE id=?').bind(st, id).run();
  // تحديث متوسط التقييم وعدده على المنتج
  await db.prepare("UPDATE products SET review_count=(SELECT COUNT(*) FROM reviews WHERE product_id=? AND status='approved'),rating=COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=? AND status='approved'),rating) WHERE id=?").bind(r.product_id, r.product_id, r.product_id).run();
  if (st === 'approved') await notify(db, r.user_id, 'نُشر تقييمك ⭐', 'شكرًا لمشاركة رأيك، يساعد الزبونات الأخريات.', '/account/reviews');
  await logActivity(db, c.get('user')!.id, `review.${st}`, String(id));
  return c.redirect('/admin/reviews?status=pending');
});

// ---------- التذاكر والإرجاع ----------
ops.use('/tickets*', requirePerm('tickets.manage'));
ops.get('/tickets', async (c) => {
  const st = c.req.query('status') ?? 'open';
  const where = st === 'all' ? '1=1' : st === 'open' ? "t.status IN ('open','in_progress')" : 't.status=?';
  const rows = await c.env.DB.prepare(`SELECT t.*,u.name,u.phone,o.code AS order_code,a.name AS agent FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users a ON a.id=t.assigned_to WHERE ${where} ORDER BY t.updated_at DESC LIMIT 200`).bind(...(where.includes('?') ? [st] : [])).all<any>();
  return shell(c, 'tickets', 'التذاكر والإرجاع', (
    <>
      <div class="tabs">{[['open', 'مفتوحة'], ['resolved', 'تم الحل'], ['closed', 'مغلقة'], ['all', 'الكل']].map(([k, l]) => <a href={`/admin/tickets?status=${k}`} class={st === k ? 'on' : ''}>{l}</a>)}</div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>التذكرة</th><th>النوع</th><th>الزبونة</th><th>الطلب</th><th>الموضوع</th><th>الحالة</th><th>المسؤول</th><th>آخر تحديث</th></tr>
        {rows.results.map(t => <tr><td><a href={`/admin/tickets/${t.code}`} style="color:#b5124f;font-weight:700">{t.code}</a></td><td>{TICKET_TYPES[t.type]}</td><td>{t.name}<br /><small>{t.phone}</small></td><td>{t.order_code ? <a href={`/admin/orders/${t.order_code}`}>{t.order_code}</a> : '—'}</td><td>{t.subject}</td><td><span class={`status ${TICKET_STATUS[t.status].color}`}>{TICKET_STATUS[t.status].ar}</span></td><td>{t.agent ?? '—'}</td><td><small>{timeAgo(t.updated_at)}</small></td></tr>)}
      </table></div>
      {rows.results.length === 0 && <div class="empty">لا تذاكر</div>}
    </>
  ));
});
ops.get('/tickets/:code', async (c) => {
  const db = c.env.DB;
  const t = await db.prepare('SELECT t.*,u.name,u.phone,u.points,o.code AS order_code,o.total_lyd,o.status AS order_status FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN orders o ON o.id=t.order_id WHERE t.code=?').bind(c.req.param('code')).first<any>();
  if (!t) return c.notFound();
  const [msgs, agents] = await Promise.all([
    db.prepare('SELECT m.*,u.name FROM ticket_messages m LEFT JOIN users u ON u.id=m.by_user_id WHERE ticket_id=? ORDER BY id').bind(t.id).all<any>(),
    db.prepare("SELECT id,name FROM users WHERE role='admin' AND active=1").all<any>(),
  ]);
  return shell(c, 'tickets', `${t.code} — ${t.subject}`, (
    <div class="two">
      <div>
        <div class="inline" style="margin-bottom:10px"><span class={`status ${TICKET_STATUS[t.status].color}`}>{TICKET_STATUS[t.status].ar}</span><span class="status">{TICKET_TYPES[t.type]}</span>{t.order_code && <a href={`/admin/orders/${t.order_code}`} class="status blue">الطلب {t.order_code} — {ORDER_STATUS[t.order_status]?.ar} — {fmt(t.total_lyd)}</a>}</div>
        <div class="chat">{msgs.results.map(m => <div class={`msg ${m.is_staff ? 'staff' : 'me'}`}><div class="who">{m.is_staff ? `${m.name} (فريق)` : `${t.name} (الزبونة)`} · {timeAgo(m.created_at)}</div><div>{m.body}</div>{m.image_url && <a href={m.image_url} target="_blank">📷 صورة</a>}</div>)}</div>
        <form method="post" action={`/admin/tickets/${t.code}/reply`} class="card-box"><label>رد للزبونة</label><textarea name="body" rows={3} required></textarea><div class="inline" style="margin-top:8px"><button class="btn sm">إرسال الرد</button><label class="radio" style="border:0;padding:0"><input type="checkbox" name="in_progress" value="1" checked /> وضع "قيد المعالجة"</label></div></form>
      </div>
      <div>
        <div class="card-box"><h3>الزبونة</h3>{t.name}<br />{t.phone}<br />رصيد النقاط: {t.points}<br /><a href={`/admin/customers/${t.user_id}`}>ملف الزبونة ›</a></div>
        <form method="post" action={`/admin/tickets/${t.code}/assign`} class="card-box"><h3>المسؤول</h3><div class="inline"><select name="assigned_to"><option value="">—</option>{agents.results.map(a => <option value={a.id} selected={a.id === t.assigned_to}>{a.name}</option>)}</select><button class="btn sm ghost">تعيين</button></div></form>
        <form method="post" action={`/admin/tickets/${t.code}/resolve`} class="card-box" style="border-color:#1a9c5b"><h3>القرار النهائي</h3>
          <label>الإجراء</label><select name="resolution"><option value="none">بدون تعويض (حل بالتوضيح)</option><option value="points">تعويض بالنقاط</option><option value="refund">استرجاع مبلغ (يدوي عبر المالية)</option><option value="replacement">إرسال بديل</option>{t.order_status === 'pending_payment' || t.order_status === 'paid' ? <option value="cancel">إلغاء الطلب</option> : null}</select>
          <div class="inline"><div><label>نقاط</label><input type="number" name="points" placeholder="0" /></div><div><label>مبلغ الاسترجاع (د.ل)</label><input type="number" step="0.5" name="refund_lyd" placeholder="0" /></div></div>
          <label>رسالة الإغلاق للزبونة</label><textarea name="body" rows={2} required>تم حل تذكرتك. شكرًا لصبرك 💕</textarea>
          <button class="btn sm ok" style="margin-top:8px">إغلاق التذكرة بالقرار</button></form>
      </div>
    </div>
  ));
});
ops.post('/tickets/:code/reply', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const u = c.get('user')!;
  const t = await db.prepare('SELECT id,user_id FROM tickets WHERE code=?').bind(c.req.param('code')).first<any>(); if (!t) return c.notFound();
  await db.batch([
    db.prepare('INSERT INTO ticket_messages(ticket_id,by_user_id,is_staff,body) VALUES(?,?,1,?)').bind(t.id, u.id, String(f.body)),
    db.prepare("UPDATE tickets SET status=?,assigned_to=COALESCE(assigned_to,?),updated_at=datetime('now') WHERE id=?").bind(f.in_progress ? 'in_progress' : 'open', u.id, t.id),
  ]);
  await notify(db, t.user_id, `رد على تذكرتك ${c.req.param('code')}`, String(f.body).slice(0, 80), `/account/tickets/${c.req.param('code')}`);
  return c.redirect(`/admin/tickets/${c.req.param('code')}`);
});
ops.post('/tickets/:code/assign', async (c) => { const f = await c.req.parseBody(); await c.env.DB.prepare("UPDATE tickets SET assigned_to=?,updated_at=datetime('now') WHERE code=?").bind(f.assigned_to ? Number(f.assigned_to) : null, c.req.param('code')).run(); return c.redirect(`/admin/tickets/${c.req.param('code')}`); });
ops.post('/tickets/:code/resolve', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const u = c.get('user')!;
  const t = await db.prepare('SELECT t.*,o.code AS order_code FROM tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.code=?').bind(c.req.param('code')).first<any>(); if (!t) return c.notFound();
  const res = String(f.resolution); const pts = Number(f.points) || 0; const refund = Number(f.refund_lyd) || 0;
  let resolution = res === 'cancel' ? 'refund' : res;
  if (res === 'cancel' && t.order_code) await setOrderStatus(db, t.order_code, 'cancelled', u.id, `إلغاء عبر التذكرة ${t.code}`);
  if (res === 'points' && pts > 0) await addPoints(db, t.user_id, pts, `تعويض تذكرة ${t.code}`, u.id, t.order_id);
  await db.batch([
    db.prepare("UPDATE tickets SET status='resolved',resolution=?,refund_lyd=?,points_awarded=?,assigned_to=COALESCE(assigned_to,?),updated_at=datetime('now') WHERE id=?").bind(resolution, refund || null, pts || null, u.id, t.id),
    db.prepare('INSERT INTO ticket_messages(ticket_id,by_user_id,is_staff,body) VALUES(?,?,1,?)').bind(t.id, u.id, String(f.body)),
  ]);
  await notify(db, t.user_id, `تم حل تذكرتك ${t.code} ✓`, String(f.body).slice(0, 80), `/account/tickets/${t.code}`);
  await logActivity(db, u.id, 'ticket.resolve', t.code, `${res} pts=${pts} refund=${refund}`);
  return c.redirect(`/admin/tickets?status=resolved`);
});

// ---------- المدفوعات وماي باي ----------
ops.use('/payments*', requirePerm('payments.view', 'payments.manage'));
ops.get('/payments', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db); const cfg = loadMyPay(s, c.env);
  const [pays, logs, sums] = await Promise.all([
    db.prepare('SELECT p.*,o.code FROM payments p JOIN orders o ON o.id=p.order_id ORDER BY p.id DESC LIMIT 100').all<any>(),
    db.prepare('SELECT * FROM payment_log ORDER BY id DESC LIMIT 30').all<any>(),
    db.prepare("SELECT status,COUNT(*) n,COALESCE(SUM(amount_lyd),0) s FROM payments GROUP BY status").all<any>(),
  ]);
  const sm = Object.fromEntries(sums.results.map(r => [r.status, r]));
  const canManage = permsOf(c.get('user')).has('payments.manage');
  const origin = new URL(c.req.url).origin;
  return shell(c, 'payments', 'المدفوعات وبوابة ماي باي', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : undefined} />
      {c.req.query('test') && <Flash type={c.req.query('test') === 'ok' ? 'ok' : 'err'} msg={`اختبار الاتصال: ${decodeURIComponent(c.req.query('detail') ?? '')}`} />}
      <div class="kpis">
        <div class="kpi"><b style="color:#1a9c5b">{fmt(sm.paid?.s ?? 0)}</b><span>مدفوعات ناجحة ({sm.paid?.n ?? 0})</span></div>
        <div class="kpi"><b style="color:#d68b00">{sm.pending?.n ?? 0}</b><span>بانتظار البوابة</span></div>
        <div class="kpi"><b style="color:#d3262b">{(sm.failed?.n ?? 0) + (sm.cancelled?.n ?? 0)}</b><span>فاشلة / ملغاة</span></div>
        <div class="kpi"><b>{cfg.mode === 'live' ? 'حقيقي' : 'محاكاة'}</b><span>وضع البوابة</span></div>
      </div>
      <div class="two">
        <div>
          <div class="card-box"><h3>آخر العمليات</h3><div class="tbl-wrap"><table class="tbl"><tr><th>المرجع</th><th>الطلب</th><th>الوسيلة</th><th>المبلغ</th><th>الحالة</th><th>مرجع البوابة</th><th>الوقت</th></tr>
            {pays.results.map(p => <tr><td class="mono" style="display:table-cell">{p.trx_ref}</td><td><a href={`/admin/orders/${p.code}`}>{p.code}</a></td><td>{p.gateway}</td><td>{fmt(p.amount_lyd)}</td><td><span class={`status ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'blue' : p.status === 'created' ? 'gray' : 'red'}`}>{p.status}</span></td><td><small>{p.provider_ref ?? '—'}</small></td><td><small>{timeAgo(p.updated_at)}</small></td></tr>)}
          </table></div>{pays.results.length === 0 && <p style="color:#888">لا عمليات بعد.</p>}</div>
          <div class="card-box"><h3>سجل الاتصال بالبوابة (طلبات وردود)</h3><p style="font-size:12px;color:#666">كل ما يُرسل إلى ماي باي وكل ما يصل منها يُسجل هنا حرفيًا. إن اختلف شكل الرد عن المتوقع تعرف السبب فورًا.</p>
            {logs.results.map(l => <details class="plog"><summary><span class={`status ${l.ok ? 'green' : 'red'}`}>{l.direction === 'out' ? '⬆ إرسال' : '⬇ استقبال'} {l.status_code}</span> <small>{l.url} · {timeAgo(l.created_at)}</small></summary><pre class="mono">{l.request}</pre><pre class="mono">{l.response}</pre></details>)}
          </div>
        </div>
        <div>
          <form method="post" action="/admin/payments/settings" class="card-box"><h3>إعدادات ماي باي</h3>
            <label>الوضع</label><select name="mypay_mode" disabled={!canManage}><option value="mock" selected={cfg.mode === 'mock'}>محاكاة (اختبار بدون خصم)</option><option value="live" selected={cfg.mode === 'live'}>حقيقي (بوابة ماي باي)</option></select>
            <label>عنوان API الأساسي</label><input type="url" name="mypay_base_url" value={s.mypay_base_url ?? ''} dir="ltr" disabled={!canManage} />
            <div class="inline"><div><label>مسار إنشاء الدفعة</label><input type="text" name="mypay_create_path" value={s.mypay_create_path ?? '/payment/create'} dir="ltr" disabled={!canManage} /></div></div>
            <label>مفتاح API (من لوحة التاجر) {c.env.MYPAY_API_KEY && <small style="color:#1a9c5b">— مضبوط كسرّ في Cloudflare</small>}</label><input type="password" name="mypay_api_key" value={s.mypay_api_key ?? ''} dir="ltr" placeholder="••••••" disabled={!canManage} />
            <label>سر الويبهوك (Webhook Secret)</label><input type="password" name="mypay_webhook_secret" value={s.mypay_webhook_secret ?? ''} dir="ltr" disabled={!canManage} />
            <label>الوسائل المفعّلة (aliases مفصولة بفاصلة)</label><input type="text" name="mypay_gateways" value={s.mypay_gateways ?? ''} dir="ltr" disabled={!canManage} />
            <p style="font-size:12px;color:#666">عنوان الويبهوك الذي تسجّله في لوحة ماي باي: <b class="mono" style="display:inline">{origin}/api/mypay/webhook</b></p>
            {canManage && <div class="inline" style="margin-top:8px"><button class="btn sm">حفظ</button><button class="btn sm ghost" formaction="/admin/payments/test">اختبار الاتصال</button></div>}
          </form>
          <div class="card-box"><h3>كيف يعمل التكامل</h3><ol style="font-size:13px;line-height:1.8;padding-inline-start:18px"><li>الزبونة تختار وسيلة فورية عند الدفع → دلال ينشئ دفعة بمرجع فريد ويطلب رابط الدفع من ماي باي.</li><li>تُحوَّل لصفحة ماي باي وتدفع.</li><li>ماي باي يرسل Webhook موقّعًا (HMAC-SHA256 في X-MyPay-Signature) → دلال يتحقق من التوقيع والمبلغ ويحوّل الطلب إلى "مدفوع" ويُبلغ الزبونة وشريك الشراء.</li><li>عودة المتصفح وحدها لا تؤكد الدفع — الويبهوك هو مصدر الحقيقة.</li></ol></div>
        </div>
      </div>
    </>
  ));
});
ops.post('/payments/settings', requirePerm('payments.manage'), async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const keys = ['mypay_mode', 'mypay_base_url', 'mypay_create_path', 'mypay_api_key', 'mypay_webhook_secret', 'mypay_gateways'];
  await db.batch(keys.filter(k => f[k] !== undefined).map(k => db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, String(f[k]).trim())));
  await logActivity(db, c.get('user')!.id, 'payments.settings', 'mypay', `mode=${f.mypay_mode}`);
  return c.redirect('/admin/payments?ok=1');
});
ops.post('/payments/test', requirePerm('payments.manage'), async (c) => {
  const f = await c.req.parseBody(); const s = await loadSettings(c.env.DB);
  const cfg = loadMyPay({ ...s, mypay_mode: String(f.mypay_mode), mypay_base_url: String(f.mypay_base_url), mypay_api_key: String(f.mypay_api_key) }, c.env);
  const r = await checkConnection(cfg);
  return c.redirect(`/admin/payments?test=${r.ok ? 'ok' : 'fail'}&detail=${encodeURIComponent(`${r.status} — ${r.detail}`.slice(0, 300))}`);
});

// ---------- التقارير ----------
ops.use('/reports*', requirePerm('reports.view'));
ops.get('/reports', async (c) => {
  const db = c.env.DB;
  const [daily, top, cities, methods, funnel] = await Promise.all([
    db.prepare("SELECT date(created_at) d,COUNT(*) n,COALESCE(SUM(total_lyd),0) s FROM orders WHERE status NOT IN ('cancelled','refunded') AND created_at>datetime('now','-30 day') GROUP BY d ORDER BY d").all<any>(),
    db.prepare("SELECT oi.title_ar,SUM(oi.qty) q,SUM(oi.qty*oi.unit_price_lyd) s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status NOT IN ('pending_payment','cancelled','refunded') GROUP BY oi.product_id ORDER BY q DESC LIMIT 10").all<any>(),
    db.prepare("SELECT ship_city,COUNT(*) n,COALESCE(SUM(total_lyd),0) s FROM orders WHERE status NOT IN ('cancelled','refunded') GROUP BY ship_city ORDER BY n DESC LIMIT 10").all<any>(),
    db.prepare("SELECT payment_method,COUNT(*) n,COALESCE(SUM(total_lyd),0) s FROM orders WHERE status NOT IN ('pending_payment','cancelled','refunded') GROUP BY payment_method ORDER BY n DESC").all<any>(),
    db.prepare("SELECT status,COUNT(*) n FROM orders GROUP BY status").all<any>(),
  ]);
  const maxS = Math.max(1, ...daily.results.map(r => r.s));
  const tot = daily.results.reduce((a, r) => a + r.s, 0), cnt = daily.results.reduce((a, r) => a + r.n, 0);
  return shell(c, 'reports', 'التقارير', (
    <>
      <div class="kpis"><div class="kpi"><b>{fmt(tot)}</b><span>مبيعات 30 يومًا</span></div><div class="kpi"><b>{cnt}</b><span>طلبات 30 يومًا</span></div><div class="kpi"><b>{fmt(cnt ? tot / cnt : 0)}</b><span>متوسط قيمة الطلب</span></div></div>
      <div class="card-box"><h3>المبيعات اليومية (30 يومًا)</h3><div class="bars">{daily.results.map(r => <div class="bar" title={`${r.d}: ${fmt(r.s)} (${r.n})`}><i style={`height:${Math.round(r.s / maxS * 100)}%`}></i><small>{r.d.slice(5)}</small></div>)}</div>{daily.results.length === 0 && <p style="color:#888">لا بيانات بعد.</p>}</div>
      <div class="two" style="grid-template-columns:1fr 1fr">
        <div class="card-box"><h3>الأكثر مبيعًا</h3><table class="tbl"><tr><th>المنتج</th><th>قطع</th><th>مبيعات</th></tr>{top.results.map(r => <tr><td>{r.title_ar}</td><td>{r.q}</td><td>{fmt(r.s)}</td></tr>)}</table></div>
        <div class="card-box"><h3>حسب المدينة</h3><table class="tbl"><tr><th>المدينة</th><th>طلبات</th><th>مبيعات</th></tr>{cities.results.map(r => <tr><td>{r.ship_city}</td><td>{r.n}</td><td>{fmt(r.s)}</td></tr>)}</table></div>
        <div class="card-box"><h3>طرق الدفع</h3><table class="tbl"><tr><th>الطريقة</th><th>طلبات</th><th>مبيعات</th></tr>{methods.results.map(r => <tr><td>{PAYMENT_METHODS[r.payment_method]?.ar ?? r.payment_method}</td><td>{r.n}</td><td>{fmt(r.s)}</td></tr>)}</table></div>
        <div class="card-box"><h3>حالات الطلبات</h3><table class="tbl"><tr><th>الحالة</th><th>عدد</th></tr>{funnel.results.map(r => <tr><td><span class={`status ${ORDER_STATUS[r.status]?.color}`}>{ORDER_STATUS[r.status]?.ar}</span></td><td>{r.n}</td></tr>)}</table></div>
      </div>
    </>
  ));
});

// ---------- سجل النشاط ----------
ops.get('/activity', requirePerm('logs.view'), async (c) => {
  const rows = await c.env.DB.prepare('SELECT a.*,u.name FROM activity_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300').all<any>();
  return shell(c, 'activity', 'سجل النشاط', <div class="tbl-wrap"><table class="tbl"><tr><th>الوقت</th><th>الموظف</th><th>الإجراء</th><th>الهدف</th><th>تفاصيل</th></tr>{rows.results.map(a => <tr><td><small>{timeAgo(a.created_at)}</small></td><td>{a.name ?? 'النظام'}</td><td class="mono" style="display:table-cell">{a.action}</td><td>{a.target}</td><td><small>{a.detail}</small></td></tr>)}</table></div>);
});

// ---------- ملف الزبونة ----------
ops.use('/customers/:id*', requirePerm('customers.view', 'customers.manage'));
ops.get('/customers/:id', async (c) => {
  const db = c.env.DB; const id = Number(c.req.param('id'));
  const u = await db.prepare("SELECT * FROM users WHERE id=? AND role='customer'").bind(id).first<any>(); if (!u) return c.notFound();
  const [orders, tickets, pts, addrs] = await Promise.all([
    db.prepare('SELECT code,status,total_lyd,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(id).all<any>(),
    db.prepare('SELECT code,type,subject,status,updated_at FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(id).all<any>(),
    db.prepare('SELECT * FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(id).all<any>(),
    db.prepare('SELECT * FROM addresses WHERE user_id=?').bind(id).all<any>(),
  ]);
  const canM = permsOf(c.get('user')).has('customers.manage');
  const spent = orders.results.filter(o => !['pending_payment', 'cancelled', 'refunded'].includes(o.status)).reduce((a, o) => a + o.total_lyd, 0);
  return shell(c, 'customers', `الزبونة: ${u.name}`, (
    <div class="two">
      <div>
        <div class="kpis"><div class="kpi"><b>{orders.results.length}</b><span>طلب</span></div><div class="kpi"><b>{fmt(spent)}</b><span>مشتريات</span></div><div class="kpi"><b>{u.points}</b><span>نقطة</span></div><div class="kpi"><b class={u.active ? '' : 'red'}>{u.active ? 'نشط' : 'معطّل'}</b><span>الحساب</span></div></div>
        <div class="card-box"><h3>الطلبات</h3><table class="tbl"><tr><th>الطلب</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr>{orders.results.map(o => <tr><td><a href={`/admin/orders/${o.code}`} style="color:#b5124f">{o.code}</a></td><td><span class={`status ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.ar}</span></td><td>{fmt(o.total_lyd)}</td><td><small>{timeAgo(o.created_at)}</small></td></tr>)}</table></div>
        <div class="card-box"><h3>التذاكر</h3>{tickets.results.length === 0 ? <p style="color:#888">لا تذاكر</p> : <table class="tbl"><tr><th>التذكرة</th><th>النوع</th><th>الموضوع</th><th>الحالة</th></tr>{tickets.results.map(t => <tr><td><a href={`/admin/tickets/${t.code}`}>{t.code}</a></td><td>{TICKET_TYPES[t.type]}</td><td>{t.subject}</td><td><span class={`status ${TICKET_STATUS[t.status].color}`}>{TICKET_STATUS[t.status].ar}</span></td></tr>)}</table>}</div>
      </div>
      <div>
        <div class="card-box"><h3>البيانات</h3>{u.phone}<br />{u.email ?? '—'}<br />{u.city ?? '—'}<br /><small>مسجلة {timeAgo(u.created_at)}</small><hr />{addrs.results.map(a => <div style="font-size:13px">📍 {a.name} · {a.phone} · {a.city} — {a.address}</div>)}</div>
        {canM && <form method="post" action={`/admin/customers/${id}/points`} class="card-box"><h3>تعديل النقاط</h3><div class="inline"><input type="number" name="delta" placeholder="+50 أو -20" required /><input type="text" name="reason" placeholder="السبب" required /><button class="btn sm">تطبيق</button></div></form>}
        {canM && <form method="post" action={`/admin/customers/${id}/toggle`} class="card-box"><h3>الحساب</h3><button class="btn sm ghost" style={u.active ? 'color:#d3262b' : ''}>{u.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}</button></form>}
        <div class="card-box"><h3>سجل النقاط</h3>{pts.results.map(l => <div style="font-size:13px;display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:4px 0"><span>{l.reason}</span><b style={`color:${l.delta > 0 ? '#1a9c5b' : '#d3262b'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</b></div>)}</div>
      </div>
    </div>
  ));
});
ops.post('/customers/:id/points', requirePerm('customers.manage'), async (c) => { const f = await c.req.parseBody(); const id = Number(c.req.param('id')); await addPoints(c.env.DB, id, Number(f.delta) || 0, String(f.reason), c.get('user')!.id); await logActivity(c.env.DB, c.get('user')!.id, 'customer.points', String(id), `${f.delta} ${f.reason}`); return c.redirect(`/admin/customers/${id}`); });
ops.post('/customers/:id/toggle', requirePerm('customers.manage'), async (c) => { const id = Number(c.req.param('id')); await c.env.DB.prepare("UPDATE users SET active=1-active WHERE id=? AND role='customer'").bind(id).run(); await logActivity(c.env.DB, c.get('user')!.id, 'customer.toggle', String(id)); return c.redirect(`/admin/customers/${id}`); });

// ---------- الموظفون والصلاحيات ----------
ops.use('/staff*', requirePerm('staff.manage'));
ops.get('/staff', async (c) => {
  const rows = await c.env.DB.prepare("SELECT u.id,u.name,u.phone,u.role,u.staff_role,u.active,u.last_login_at,p.name AS partner FROM users u LEFT JOIN partners p ON p.id=u.partner_id WHERE u.role IN ('admin','partner') ORDER BY u.role,u.id").all<any>();
  const partners = await c.env.DB.prepare('SELECT id,name FROM partners').all<any>();
  const me = c.get('user')!;
  return shell(c, 'staff', 'الموظفون والصلاحيات', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم ✓' : undefined} /><Flash type="err" msg={c.req.query('err') ? 'رقم الهاتف مستخدم' : undefined} />
      <div class="two staff-grid">
        <div>
          <div class="tbl-wrap"><table class="tbl"><tr><th>الاسم</th><th>الهاتف</th><th>الدور</th><th>الشريك</th><th>الحالة</th><th></th></tr>
            {rows.results.map(u => <tr><form method="post" action={`/admin/staff/${u.id}`}><td>{u.name}</td><td>{u.phone}</td><td>{u.role === 'partner' ? 'موظف شريك شحن' : <select name="staff_role" disabled={u.id === me.id}>{(Object.keys(STAFF_ROLES) as StaffRole[]).map(r => <option value={r} selected={r === (u.staff_role ?? 'admin')}>{STAFF_ROLES[r].ar}</option>)}</select>}</td><td>{u.partner ?? '—'}</td><td><span class={`status ${u.active ? 'green' : 'red'}`}>{u.active ? 'نشط' : 'معطّل'}</span></td><td class="inline">{u.id !== me.id && <><button class="btn sm ghost" name="action" value="save">حفظ</button><button class="btn sm ghost" name="action" value="toggle">{u.active ? 'تعطيل' : 'تفعيل'}</button><input type="text" name="password" placeholder="كلمة مرور جديدة" style="width:130px" /><button class="btn sm ghost" name="action" value="password">تعيين</button></>}</td></form></tr>)}
          </table></div>
          <div class="card-box"><h3>مصفوفة الصلاحيات</h3><div class="tbl-wrap"><table class="tbl perm-matrix"><tr><th>الصلاحية</th>{(Object.keys(STAFF_ROLES) as StaffRole[]).map(r => <th>{STAFF_ROLES[r].ar}</th>)}</tr>
            {(Object.keys(PERM_LABELS) as (keyof typeof PERM_LABELS)[]).map(p => <tr><td>{PERM_LABELS[p]}</td>{(Object.keys(STAFF_ROLES) as StaffRole[]).map(r => <td style="text-align:center">{ROLE_PERMS[r].includes(p) ? '✓' : <span style="color:#ccc">—</span>}</td>)}</tr>)}
          </table></div></div>
        </div>
        <form method="post" action="/admin/staff/new" class="card-box"><h3>+ إضافة موظف</h3>
          <label>الاسم</label><input type="text" name="name" required /><label>الهاتف (اسم الدخول)</label><input type="tel" name="phone" required /><label>كلمة المرور</label><input type="text" name="password" required minlength={6} />
          <label>الدور</label><select name="role"><option value="admin">موظف إدارة (اختر الصلاحية أدناه)</option><option value="partner">موظف شريك شحن</option></select>
          <label>صلاحية الإدارة</label><select name="staff_role">{(Object.keys(STAFF_ROLES) as StaffRole[]).map(r => <option value={r}>{STAFF_ROLES[r].ar} — {STAFF_ROLES[r].desc}</option>)}</select>
          <label>الشريك (لموظف الشريك)</label><select name="partner_id"><option value="">—</option>{partners.results.map(p => <option value={p.id}>{p.name}</option>)}</select>
          <button class="btn" style="margin-top:10px">إضافة</button></form>
      </div>
    </>
  ));
});
ops.post('/staff/new', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const role = f.role === 'partner' ? 'partner' : 'admin';
  try {
    await db.prepare('INSERT INTO users(phone,name,password_hash,role,staff_role,partner_id) VALUES(?,?,?,?,?,?)').bind(String(f.phone).replace(/\D/g, ''), String(f.name), await hashPassword(String(f.password)), role, role === 'admin' ? String(f.staff_role) : null, f.partner_id ? Number(f.partner_id) : null).run();
  } catch { return c.redirect('/admin/staff?err=1'); }
  await logActivity(db, c.get('user')!.id, 'staff.create', String(f.phone), `${role}/${f.staff_role}`);
  return c.redirect('/admin/staff?ok=1');
});
ops.post('/staff/:id', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id')); const me = c.get('user')!;
  if (id === me.id) return c.redirect('/admin/staff');
  if (f.action === 'toggle') await db.prepare('UPDATE users SET active=1-active WHERE id=?').bind(id).run();
  else if (f.action === 'password' && f.password) await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(String(f.password)), id).run();
  else if (f.staff_role && STAFF_ROLES[String(f.staff_role) as StaffRole]) await db.prepare("UPDATE users SET staff_role=? WHERE id=? AND role='admin'").bind(String(f.staff_role), id).run();
  await logActivity(db, me.id, `staff.${f.action ?? 'save'}`, String(id), f.staff_role ? String(f.staff_role) : undefined);
  return c.redirect('/admin/staff?ok=1');
});

// ---------- الزاحف: إضافة المتصفح ----------
ops.use('/crawler*', requirePerm('catalog.manage'));
ops.get('/crawler', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db);
  const [jobs, runs, cats] = await Promise.all([
    db.prepare('SELECT j.*,c.name_ar AS cat FROM crawl_jobs j LEFT JOIN categories c ON c.id=j.category_id ORDER BY j.id').all<any>(),
    db.prepare('SELECT r.*,j.name FROM crawl_runs r LEFT JOIN crawl_jobs j ON j.id=r.job_id ORDER BY r.id DESC LIMIT 30').all<any>(),
    getCategories(db),
  ]);
  const origin = new URL(c.req.url).origin;
  const seen = s.crawler_last_seen ? timeAgo(s.crawler_last_seen) : 'لم تتصل بعد';
  const online = s.crawler_last_seen && (Date.now() - new Date(s.crawler_last_seen + 'Z').getTime()) < 40 * 60000;
  const T: Record<string, string> = { search: 'بحث بكلمة', url: 'رابط قائمة', stock: 'فحص مخزون' };
  return shell(c, 'crawler', 'الزاحف — إضافة المتصفح', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم ✓' : undefined} />
      <div class="kpis">
        <div class="kpi"><b class={online ? 'ok' : ''} style={online ? 'color:#1a9c5b' : 'color:#d3262b'}>{online ? 'متصلة' : 'غير متصلة'}</b><span>آخر اتصال: {seen} {s.crawler_version ? `· v${s.crawler_version}` : ''}</span></div>
        <div class="kpi"><b>{jobs.results.filter(j => j.active).length}</b><span>مهمة نشطة</span></div>
        <div class="kpi"><b>{runs.results.reduce((a, r) => a + r.imported, 0)}</b><span>منتج جديد في آخر 30 تشغيلًا</span></div>
        <div class="kpi"><b>{runs.results.filter(r => r.status === 'blocked').length}</b><span>حجب/كابتشا مؤخرًا</span></div>
      </div>
      <div class="two" style="grid-template-columns:1fr 360px">
        <div>
          <div class="card-box"><h3>المهام</h3>
            <p style="font-size:12px;color:#666;margin:0 0 8px">البحث عن منتجات جديدة يحتاج حساب 1688، لذلك ينفّذه <b>الخادم</b> عبر مزوّد API. فحص المخزون والأسعار وجلب التفاصيل تعمل بلا حساب، لذلك تنفّذها <b>الإضافة</b> مجانًا من متصفحك.</p>
            <div class="tbl-wrap"><table class="tbl"><tr><th>المهمة</th><th>النوع</th><th>من ينفّذها</th><th>القسم</th><th>صفحات</th><th>كل</th><th>آخر تشغيل</th><th>الحالة</th><th></th></tr>
              {jobs.results.map(j => <tr><td><b>{j.name}</b><br /><small class="mono" style="display:inline">{(j.query ?? '').slice(0, 40)}</small></td><td>{T[j.type]}</td>
                <td><form method="post" action={`/admin/crawler/${j.id}`} class="inline"><input type="hidden" name="action" value="runner" /><select name="runner" onchange="this.form.submit()" style="font-size:12px;padding:2px 4px"><option value="any" selected={j.runner === 'any'}>أيهما</option><option value="server" selected={j.runner === 'server'}>الخادم (API)</option><option value="extension" selected={j.runner === 'extension'}>الإضافة (مجانًا)</option></select></form></td>
                <td>{j.cat ?? '—'}</td><td>{j.type === 'stock' ? `${j.max_new} منتج` : j.max_pages}</td><td>{j.interval_hours} س</td><td class="sum"><small title={j.last_summary ?? ''}>{j.last_run_at ? timeAgo(j.last_run_at) : '—'}<br />{(j.last_summary ?? '').slice(0, 70)}</small></td><td><span class={`status ${j.cooldown_until && j.cooldown_until > new Date().toISOString().slice(0, 19).replace('T', ' ') ? 'red' : j.run_now ? 'blue' : j.active ? 'green' : 'gray'}`}>{j.run_now ? 'في الطابور' : j.active ? 'نشطة' : 'موقوفة'}</span></td>
                <td class="acts"><form method="post" action={`/admin/crawler/${j.id}`} class="inline"><button class="btn sm ok" name="action" value="run">شغّل الآن</button><button class="btn sm ghost" name="action" value="toggle">{j.active ? 'إيقاف' : 'تفعيل'}</button><button class="btn sm ghost" name="action" value="delete" style="color:#d3262b">حذف</button></form></td></tr>)}
            </table></div>
          </div>
          <div class="card-box"><h3>سجل التشغيل</h3>
            {runs.results.length === 0 ? <p style="color:#888">لا تشغيلات بعد. ثبّت الإضافة وستظهر هنا.</p> : <div class="tbl-wrap"><table class="tbl"><tr><th>الوقت</th><th>المهمة</th><th>الحالة</th><th>صفحات</th><th>وُجد</th><th>جديد</th><th>محدّث</th><th>مُثرى</th><th>مفحوص</th><th>ملاحظة</th></tr>
              {runs.results.map(r => <tr><td><small>{timeAgo(r.finished_at)}</small></td><td>{r.name ?? '—'}</td><td><span class={`status ${r.status === 'ok' ? 'green' : r.status === 'blocked' ? 'red' : 'gray'}`}>{r.status}</span></td><td>{r.pages}</td><td>{r.found}</td><td><b>{r.imported}</b></td><td>{r.updated}</td><td>{r.enriched}</td><td>{r.checked}</td><td><small>{r.note}</small></td></tr>)}
            </table></div>}
          </div>
        </div>
        <div>
          <form method="post" action="/admin/crawler/new" class="card-box"><h3>+ مهمة جديدة</h3>
            <label>الاسم</label><input type="text" name="name" required placeholder="عبايات سوداء" />
            <label>النوع</label><select name="type"><option value="search">بحث بكلمة صينية في 1688</option><option value="url">رابط صفحة قائمة/قسم في 1688</option><option value="stock">فحص المخزون والأسعار للمنتجات الحالية</option></select>
            <label>الكلمة أو الرابط</label><input type="text" name="query" placeholder="黑色 长袍 女 或 https://s.1688.com/..." dir="ltr" />
            <label>القسم في دلال</label><select name="category_id">{cats.map(ct => <option value={ct.id}>{ct.icon} {ct.name_ar}</option>)}</select>
            <div class="inline"><div><label>عدد الصفحات</label><input type="number" name="max_pages" value="2" min="1" max="20" /></div><div><label>كل (ساعات)</label><input type="number" name="interval_hours" value="24" min="1" /></div></div>
            <div class="inline"><div><label>أقصى منتجات تُثرى/تُفحص</label><input type="number" name="max_new" value="40" min="1" /></div><div><label>جلب التفاصيل</label><select name="enrich"><option value="1">نعم (صور+مقاسات)</option><option value="0">لا (سريع)</option></select></div></div>
            <button class="btn sm" style="margin-top:10px">إضافة</button></form>
          <div class="card-box"><h3>تثبيت الإضافة (مرة واحدة)</h3>
            <div id="dlal-ext-config" data-api={origin} data-token={c.env.IMPORT_TOKEN ?? ''} style="display:none"></div>
            <ol style="font-size:13px;line-height:1.9;padding-inline-start:18px">
              <li><a class="btn sm brand" href="/dlal-extension.zip">⬇️ تنزيل dlal-extension.zip</a> وفكّ الضغط في مجلد على حاسوب Chrome.</li>
              <li>افتح <span class="mono" style="display:inline">chrome://extensions</span> → فعّل "وضع المطوّر" → "تحميل غير مضغوط" → اختر المجلد.</li>
              <li>أعد تحميل هذه الصفحة بعد التثبيت: تأخذ الإضافة العنوان والرمز تلقائيًا ويظهر شريط أخضر بالأعلى. (يدويًا عند الحاجة: العنوان <span class="mono" style="display:inline">{origin}</span> والرمز <span class="mono" style="display:inline">{c.env.IMPORT_TOKEN ?? '(IMPORT_TOKEN غير مضبوط)'}</span>.)</li>
              <li>اضغط أيقونة الإضافة ثم "اختبار الاتصال"؛ يجب أن يظهر عدد المهام. بعدها "شغّل الآن".</li>
              <li>سجّل الدخول في 1688 مرة واحدة في نفس المتصفح، واتركه مفتوحًا. الإضافة تفحص المهام كل 15 دقيقة وتعمل في تبويب خلفي.</li>
            </ol>
            <p style="font-size:12px;color:#666">عند ظهور كابتشا من 1688 تتوقف الإضافة ساعتين وتُعلمك بإشعار؛ حلّ الكابتشا في التبويب ثم اضغط "شغّل الآن". لا تفتح أكثر من مهمة بحث كل ساعة في الأيام الأولى حتى لا يُقيَّد حساب 1688.</p>
          </div>
        </div>
      </div>
    </>
  ));
});
ops.post('/crawler/new', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const type = ['search', 'url', 'stock'].includes(String(f.type)) ? String(f.type) : 'search';
  await db.prepare('INSERT INTO crawl_jobs(name,type,query,category_id,max_pages,enrich,max_new,interval_hours,run_now) VALUES(?,?,?,?,?,?,?,?,1)')
    .bind(String(f.name).slice(0, 80), type, f.query ? String(f.query).trim() : null, type === 'stock' ? null : Number(f.category_id) || null, Math.min(20, Number(f.max_pages) || 2), Number(f.enrich) ? 1 : 0, Number(f.max_new) || 40, Number(f.interval_hours) || 24).run();
  await logActivity(db, c.get('user')!.id, 'crawler.job.create', String(f.name));
  return c.redirect('/admin/crawler?ok=1');
});
ops.post('/crawler/:id', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB; const id = Number(c.req.param('id'));
  if (f.action === 'delete') await db.prepare('DELETE FROM crawl_jobs WHERE id=?').bind(id).run();
  else if (f.action === 'toggle') await db.prepare('UPDATE crawl_jobs SET active=1-active WHERE id=?').bind(id).run();
  else if (f.action === 'run') await db.prepare('UPDATE crawl_jobs SET run_now=1,cooldown_until=NULL,active=1 WHERE id=?').bind(id).run();
  else if (f.action === 'runner') await db.prepare("UPDATE crawl_jobs SET runner=? WHERE id=?").bind(['any', 'server', 'extension'].includes(String(f.runner)) ? String(f.runner) : 'any', id).run();
  await logActivity(db, c.get('user')!.id, `crawler.job.${f.action}`, String(id));
  return c.redirect('/admin/crawler?ok=1');
});

// ---------- مزوّد API لبيانات 1688 (طرف ثالث) ----------
ops.use('/source*', requirePerm('catalog.manage'));
ops.get('/source', async (c) => {
  const db = c.env.DB; const s = await loadSettings(db);
  const logs = await db.prepare("SELECT * FROM payment_log WHERE url LIKE 'SRC %' ORDER BY id DESC LIMIT 20").all<any>();
  const probes = await db.prepare("SELECT id,url,response,created_at FROM payment_log WHERE url LIKE 'PROBE %' ORDER BY id DESC LIMIT 5").all<{ id: number; url: string; response: string; created_at: string }>();
  const prov = getProvider(s);
  return shell(c, 'source', 'مزوّد API لبيانات 1688', (
    <>
      <Flash msg={c.req.query('ok') ? 'تم الحفظ ✓' : c.req.query('ran') ? `شُغّلت ${c.req.query('ran')} مهمة من الخادم — انظر سجل التشغيل في صفحة الزاحف` : undefined} />
      {c.req.query('test') && <Flash type={c.req.query('test') === 'ok' ? 'ok' : 'err'} msg={decodeURIComponent(c.req.query('detail') ?? '')} />}
      <div class="two">
        <div>
          <form method="post" action="/admin/source" class="card-box"><h3>الإعدادات</h3>
            <p style="font-size:13px;color:#666">مع مزوّد API يعمل الاستيراد وفحص المخزون من خادم دلال تلقائيًا كل ليلة (Cron 03:00 UTC) بلا متصفح مفتوح. بدون مزوّد تبقى إضافة المتصفح هي الطريقة.</p>
            <label>المزوّد</label><select name="src_provider"><option value="none" selected={!s.src_provider || s.src_provider === 'none'}>— بلا (استخدم إضافة المتصفح) —</option>{Object.entries(PROVIDERS).map(([k, v]) => <option value={k} selected={s.src_provider === k}>{v.ar}</option>)}</select>
            <label>عنوان API الأساسي</label><input type="url" name="src_base_url" value={s.src_base_url ?? ''} placeholder="https://otapi.net أو https://api.tmapi.top" dir="ltr" />
            <label>المفتاح (instanceKey / apiToken)</label><input type="password" name="src_key" value={s.src_key ?? ''} dir="ltr" />
            <label>لغة البيانات المطلوبة من المزوّد</label><select name="src_lang"><option value="zh" selected={(s.src_lang ?? 'zh') === 'zh'}>صينية (ثم تُترجم عندنا بالذكاء الاصطناعي)</option><option value="en" selected={s.src_lang === 'en'}>إنجليزية</option><option value="ar" selected={s.src_lang === 'ar'}>عربية (إن دعمها المزوّد)</option></select>
            <div class="inline" style="margin-top:10px"><button class="btn sm">حفظ</button>
              <input type="text" name="test_id" placeholder="معرف منتج 1688 للاختبار" style="width:200px" dir="ltr" /><button class="btn sm ghost" formaction="/admin/source/test">اختبار: جلب منتج</button>
              <input type="text" name="test_kw" placeholder="كلمة بحث صينية" style="width:160px" /><button class="btn sm ghost" formaction="/admin/source/test">اختبار: بحث</button></div>
          </form>
          <form method="post" action="/admin/source/run" class="card-box"><h3>تشغيل من الخادم الآن</h3><p style="font-size:13px;color:#666">ينفذ المهام المستحقة في صفحة الزاحف عبر المزوّد (حتى 3 مهام في الضغطة الواحدة).</p><button class="btn sm ok" disabled={!prov}>شغّل المهام المستحقة</button> <a class="btn sm ghost" href="/admin/crawler">صفحة الزاحف ›</a></form>
        </div>
        <div>
          <div class="card-box"><h3>المزوّدون المدعومون</h3><table class="tbl"><tr><th>المزوّد</th><th>الموقع</th><th>المفتاح</th></tr>{Object.entries(PROVIDERS).map(([k, v]) => <tr><td>{v.ar}</td><td><a href={v.site} target="_blank" class="src-link">{v.site}</a></td><td class="mono" style="display:table-cell">{v.keyLabel}</td></tr>)}</table>
            <p style="font-size:12px;color:#666;margin-top:8px">سجّل عند المزوّد، خذ المفتاح، الصقه هنا، ثم "اختبار: جلب منتج". إن ظهر الرد بشكل مختلف عن المتوقع فالرد الخام أدناه يوضح الحقول وسنعدّل الموصّل.</p></div>
          <div class="card-box"><h3>تشخيص صفحات 1688 من متصفحك</h3>
            <p style="font-size:12px;color:#666">افتحي صفحة منتج على 1688 ثم اضغطي في الإضافة «فحص صفحة 1688 المفتوحة». ما تقرأه الإضافة يظهر هنا، ومنه نضبط القارئ على بنية الصفحة الحقيقية.</p>
            {probes.results.length === 0 ? <p style="color:#888">لا تشخيص بعد.</p> : probes.results.map(l => <details class="plog"><summary><small>{l.url.slice(6, 90)} · {timeAgo(l.created_at)}</small></summary><pre class="mono">{l.response}</pre></details>)}</div>
          <div class="card-box"><h3>آخر الردود الخام من المزوّد</h3>{logs.results.length === 0 ? <p style="color:#888">لا استدعاءات بعد.</p> : logs.results.map(l => <details class="plog"><summary><span class={`status ${l.ok ? 'green' : 'red'}`}>{l.status_code}</span> <small>{l.url.slice(0, 90)} · {timeAgo(l.created_at)}</small></summary><pre class="mono">{l.response}</pre></details>)}</div>
        </div>
      </div>
    </>
  ));
});
ops.post('/source', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const keys = ['src_provider', 'src_base_url', 'src_key', 'src_lang'];
  await db.batch(keys.map(k => db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, String(f[k] ?? '').trim())));
  await logActivity(db, c.get('user')!.id, 'source.settings', String(f.src_provider));
  return c.redirect('/admin/source?ok=1');
});
ops.post('/source/test', async (c) => {
  const f = await c.req.parseBody(); const db = c.env.DB;
  const s = { ...(await loadSettings(db)), src_provider: String(f.src_provider), src_base_url: String(f.src_base_url), src_key: String(f.src_key), src_lang: String(f.src_lang) };
  const prov = getProvider(s); if (!prov) return c.redirect('/admin/source?test=fail&detail=' + encodeURIComponent('اختر مزوّدًا وأدخل المفتاح'));
  const r = f.test_kw ? await prov.search(String(f.test_kw), 1) : await prov.item(String(f.test_id).replace(/\D/g, ''));
  await db.prepare('INSERT INTO payment_log(payment_id,direction,url,status_code,request,response,ok) VALUES(NULL,?,?,?,?,?,?)').bind('in', 'SRC ' + r.url.replace(/(instanceKey|apiToken)=[^&]+/g, '$1=***'), r.status, '', r.raw.slice(0, 60000), r.ok ? 1 : 0).run();
  const d: any = r.data;
  const detail = r.ok ? (Array.isArray(d) ? `نجح البحث: ${d.length} منتج. الأول: ${d[0]?.title?.slice(0, 40)} — ¥${d[0]?.priceCny}` : `نجح: ${d?.title?.slice(0, 50)} — ¥${d?.priceCny} — صور ${d?.images?.length} — متغيرات ${d?.variants?.length} — حد أدنى ${d?.minQty}`) : `فشل: ${r.error} (HTTP ${r.status})`;
  return c.redirect(`/admin/source?test=${r.ok ? 'ok' : 'fail'}&detail=${encodeURIComponent(detail)}`);
});
ops.post('/source/run', async (c) => {
  const r = await runServerJobs(c.env, { limit: 3, byUserId: c.get('user')!.id });
  await logActivity(c.env.DB, c.get('user')!.id, 'source.run', String(r.ran));
  return c.redirect(`/admin/source?ran=${r.ran}`);
});

export default ops;
