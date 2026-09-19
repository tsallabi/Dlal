import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { AdminShell } from '../views/dash';
import { Flash } from '../views/layout';
import { requireRole } from '../lib/auth';
import { loadSettings } from '../lib/pricing';
import { authorizeUrl, exchangeCode, Client1688, type Tokens } from '../lib/api1688';
import { importProducts } from './admin';
import { getCategories, timeAgo } from '../lib/db';

const r = new Hono<Env>();
r.use('*', requireRole('admin'));

const setS = (db: D1Database, k: string, v: string) => db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(k, v).run();

export async function getClient(c: Context<Env>): Promise<Client1688 | null> {
  const s = await loadSettings(c.env.DB);
  if (!s.api1688_key || !s.api1688_secret || !s.api1688_tokens) return null;
  const tokens = JSON.parse(s.api1688_tokens) as Tokens;
  return new Client1688(s.api1688_key, s.api1688_secret, tokens, async (t) => { await setS(c.env.DB, 'api1688_tokens', JSON.stringify(t)); });
}

r.get('/', async (c) => {
  const s = await loadSettings(c.env.DB);
  const tokens = s.api1688_tokens ? JSON.parse(s.api1688_tokens) as Tokens : null;
  const redirect = new URL('/admin/api1688/callback', c.req.url).toString();
  const cats = await getCategories(c.env.DB);
  return c.html(
    <AdminShell user={c.get('user')!} active="api1688" title="ربط الـ API الرسمي لـ 1688">
      <Flash msg={c.req.query('ok')} type="ok" /><Flash msg={c.req.query('err')} type="err" />
      <div class="two">
        <div>
          <form method="post" class="card-box">
            <h3>1) بيانات التطبيق من open.1688.com → 控制中心</h3>
            <label>appKey</label><input type="text" name="api1688_key" value={s.api1688_key ?? ''} style="direction:ltr" />
            <label>appSecret</label><input type="password" name="api1688_secret" value={s.api1688_secret ?? ''} style="direction:ltr" />
            <label>redirect_uri (سجّله كما هو في إعدادات التطبيق)</label><input type="text" value={redirect} readonly style="direction:ltr" />
            <button class="btn sm" style="margin-top:10px">حفظ</button>
          </form>
          <div class="card-box">
            <h3>2) التفويض OAuth</h3>
            <p style="font-size:13px;color:#666">يفتح صفحة auth.1688.com بحساب 1688 الخاص بك (أو بشاهين). بعد الموافقة يعود بـ code صالح لدقيقتين، فنستبدله برمز وصول ورمز تجديد تلقائيًا.</p>
            {s.api1688_key ? <a class="btn brand" href={authorizeUrl(s.api1688_key, redirect)}>ابدأ التفويض ↗</a> : <span style="color:#888">احفظ appKey أولًا</span>}
          </div>
          <div class="card-box">
            <h3>3) الحالة</h3>
            {tokens ? (
              <div style="font-size:14px">✅ متصل — memberId: <b>{tokens.memberId ?? '—'}</b><br />access_token ينتهي: {new Date(tokens.expires_at).toLocaleString('ar-LY')} (يتجدد تلقائيًا)<br />refresh_token ينتهي: {tokens.refresh_expires_at ? new Date(tokens.refresh_expires_at).toLocaleDateString('ar-LY') : 'بعد 6 أشهر'}</div>
            ) : <div style="color:#d68b00">⏳ غير متصل بعد — حين يُقبل طلب الشراكة أكمل الخطوتين أعلاه، وإلى ذلك الحين يعمل الاستيراد عبر المتصفح.</div>}
          </div>
        </div>
        <div>
          <form method="post" action="/admin/api1688/search" class="card-box">
            <h3>بحث واستيراد عبر الـ API</h3>
            <label>كلمة بحث (عربي/إنجليزي/صيني)</label><input type="text" name="q" required />
            <label>القسم</label><select name="category_id">{cats.map(ct => <option value={ct.id}>{ct.icon} {ct.name_ar}</option>)}</select>
            <label>عدد النتائج</label><input type="number" name="n" value="40" />
            <button class="btn sm" style="margin-top:10px" disabled={!tokens}>بحث واستيراد</button>
          </form>
          <form method="post" action="/admin/api1688/sync" class="card-box">
            <h3>مزامنة المخزون والأسعار</h3>
            <p style="font-size:13px;color:#666">يفحص أهم 100 منتج (مبيعات ومشاهدات) وأقدمها فحصًا عبر alibaba.product.get ويحدّث السعر والتوفر. اربطه بـ Cron Trigger في Cloudflare ليعمل يوميًا.</p>
            <button class="btn sm dark" disabled={!tokens}>مزامنة الآن</button>
          </form>
          <div class="card-box"><h3>آخر مزامنة</h3><div style="font-size:13px">{s.api1688_last_sync ? `${timeAgo(s.api1688_last_sync)} — ${s.api1688_last_sync_result ?? ''}` : 'لم تتم بعد'}</div></div>
        </div>
      </div>
    </AdminShell>,
  );
});

r.post('/', async (c) => {
  const f = await c.req.parseBody();
  await setS(c.env.DB, 'api1688_key', String(f.api1688_key ?? '').trim());
  await setS(c.env.DB, 'api1688_secret', String(f.api1688_secret ?? '').trim());
  return c.redirect('/admin/api1688?ok=تم حفظ بيانات التطبيق');
});

r.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.redirect('/admin/api1688?err=لم يصل code من 1688');
  const s = await loadSettings(c.env.DB);
  try {
    const t = await exchangeCode(s.api1688_key, s.api1688_secret, new URL('/admin/api1688/callback', c.req.url).toString(), code);
    await setS(c.env.DB, 'api1688_tokens', JSON.stringify(t));
    return c.redirect('/admin/api1688?ok=تم الربط بنجاح');
  } catch (e: any) { return c.redirect('/admin/api1688?err=' + encodeURIComponent(e.message)); }
});

r.post('/search', async (c) => {
  const client = await getClient(c); if (!client) return c.redirect('/admin/api1688?err=غير متصل');
  const f = await c.req.parseBody();
  try {
    const hits = await client.search(String(f.q), 1, Number(f.n) || 40);
    const items = [];
    for (const h of hits) { const p = await client.product(h.offerId); if (p) items.push({ ...p, titleAr: h.title }); }
    const res = await importProducts(c.env.DB, items, Number(f.category_id), c.get('user')!.id, `api:search:${f.q}`);
    return c.redirect(`/admin/products?imported=${res.imported}&updated=${res.updated}`);
  } catch (e: any) { return c.redirect('/admin/api1688?err=' + encodeURIComponent(e.message)); }
});

export async function syncStock(db: D1Database, client: Client1688, limit = 100) {
  const { results } = await db.prepare("SELECT id,source_offer_id,source_price_cny FROM products WHERE status='active' AND source IN ('1688','api') ORDER BY (sales*10+views) DESC, last_checked_at ASC LIMIT ?").bind(limit).all<any>();
  let ok = 0, gone = 0, flagged = 0;
  for (const p of results) {
    try {
      const sp = await client.product(p.source_offer_id);
      if (!sp || !sp.inStock) { await db.prepare("UPDATE products SET in_stock=0,last_checked_at=datetime('now') WHERE id=?").bind(p.id).run(); gone++; continue; }
      const big = Math.abs(sp.priceCny - p.source_price_cny) / p.source_price_cny > 0.15;
      await db.prepare("UPDATE products SET in_stock=1,source_price_cny=?,status=CASE WHEN ?=1 THEN 'hidden' ELSE status END,weight_g=COALESCE(?,weight_g),last_checked_at=datetime('now') WHERE id=?").bind(sp.priceCny, big ? 1 : 0, sp.weightG ?? null, p.id).run();
      if (big) flagged++; else ok++;
    } catch { /* نتخطى ونكمل */ }
  }
  const summary = `فُحص ${results.length}: متوفر ${ok} · نفد ${gone} · تغيّر سعره ${flagged}`;
  await setS(db, 'api1688_last_sync', new Date().toISOString().replace('T', ' ').slice(0, 19));
  await setS(db, 'api1688_last_sync_result', summary);
  return summary;
}

r.post('/sync', async (c) => {
  const client = await getClient(c); if (!client) return c.redirect('/admin/api1688?err=غير متصل');
  try { const s = await syncStock(c.env.DB, client); return c.redirect('/admin/api1688?ok=' + encodeURIComponent(s)); }
  catch (e: any) { return c.redirect('/admin/api1688?err=' + encodeURIComponent(e.message)); }
});

export default r;
