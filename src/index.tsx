import { Hono } from 'hono';
import type { Env } from './types';
import { loadUser } from './lib/auth';
import analytics from './routes/admin-analytics';
import { track, pageKind, trackPath, trackable, visitorId } from './lib/track';
import { cartCount } from './lib/db';
import store from './routes/store';
import auth from './routes/auth';
import admin from './routes/admin';
import partner from './routes/partner';
import api from './routes/api';
import img from './routes/img';
import pay from './routes/pay';
import account from './routes/account';
import pages from './routes/pages';
import request from './routes/request';
import adminOps from './routes/admin-ops';
import api1688Admin, { getClient, syncStock } from './routes/api1688-admin';
import { loadSettings } from './lib/pricing';
import { retranslatePending } from './lib/translate';
import partnerApi from './routes/partner-api';
import { retryDispatch, moveMediaToR2 } from './lib/partner';
import { Client1688, type Tokens } from './lib/api1688';
import { runServerJobs } from './lib/crawl';
import { settleLinkRequests } from './lib/link-requests';
import { metaSettings, metaHead } from './lib/meta';
import feeds from './routes/feeds';

const app = new Hono<Env>();

// عنوان واحد للموقع: www.hudhude.com يحوّل إلى hudhude.com (نفس المسار والمعاملات)،
// فلا تنقسم الجلسات والكوكيز والروابط المحفوظة بين عنوانين
app.use('*', async (c, next) => {
  const u = new URL(c.req.url);
  if (u.hostname === 'www.hudhude.com') { u.hostname = 'hudhude.com'; u.protocol = 'https:'; return c.redirect(u.toString(), 301); }
  await next();
});

// أرقام إنجليزية في كل الموقع (طلب صاحب المشروع ٢٤/٠٩/٢٦: «اجعل كل الأرقام 1 2 3 لا ١ ٢ ٣»).
// الكود صار يكتب 0-9، لكن نصوصًا تأتي من القاعدة قد تحمل أرقامًا عربية: مدة الشحن المحفوظة
// في الإعدادات، وعناوين ترجمها النموذج، وما يكتبه الأدمن بلوحة مفاتيح عربية. نحوّلها عند الإرسال.
const AR_DIGITS = /[\u0660-\u0669\u06F0-\u06F9\u066A-\u066C]/g;
const toLatin = (ch: string) => {
  const c = ch.charCodeAt(0);
  if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
  if (c >= 0x06F0 && c <= 0x06F9) return String(c - 0x06F0);
  return c === 0x066A ? '%' : c === 0x066B ? '.' : ',';   // ٪ ٫ ٬
};
app.use('*', async (c, next) => {
  await next();
  if (!(c.res.headers.get('content-type') ?? '').includes('text/html')) return;
  let html = await c.res.text();
  AR_DIGITS.lastIndex = 0;
  if (AR_DIGITS.test(html)) html = html.replace(AR_DIGITS, toLatin);
  // بكسل ميتا ووسم إثبات النطاق في صفحات الزبونة وحدها — لا اللوحة ولا لوحة الشحن ولا أجزاء HTML
  const path = new URL(c.req.url).pathname;
  if (!/^\/(admin|partner|api)(\/|$)/.test(path) && html.includes('</head>')) {
    const head = metaHead(await metaSettings(c.env.DB));
    if (head) html = html.replace('</head>', head + '</head>');
  }
  // حركة الزوار: كل صفحة زبونة تُفتح (أو تفشل) تُسجَّل — الموظفون والروبوتات مستثنون داخل track
  if (c.req.method === 'GET' && trackPath(path)) {
    const st = c.res.status;
    if (st >= 400) track(c, 'error', st === 404 ? 'صفحة غير موجودة (404)' : `خطأ في الخادم (${st})`, st, path);
    else if (st === 200) { const k = pageKind(new URL(c.req.url)); track(c, k.kind, k.ref, k.kind === 'search' ? c.get('trackN') ?? null : null); }
  }
  // شريط «ادخل باسمه» فوق كل صفحة: المالك يرى دائمًا أنه يعمل بحساب غيره، وكل ما يفعله يُحفظ باسم ذلك الحساب
  const u = c.get('user');
  if (u?.imp_by) {
    const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    const role = u.role === 'partner' ? 'موظف شركة شحن' : u.role === 'customer' ? 'زبونة' : 'موظف إدارة';
    const bar = `<div class="imp-bar" style="position:sticky;top:0;z-index:1000;background:#8c2121;color:#fff;padding:8px 12px;text-align:center;font:600 14px/1.6 Tahoma,sans-serif">👁 أنت الآن داخل حساب <b>${esc(u.name)}</b> (${role} · ${esc(u.phone)}) — كل ما تفعله يُحفظ باسمه. <a href="/impersonate/end" style="color:#fff;text-decoration:underline;margin-inline-start:8px">عودة إلى حسابي ←</a></div>`;
    html = html.replace(/<body([^>]*)>/, `<body$1>${bar}`);
  }
  c.res = new Response(html, { status: c.res.status, headers: c.res.headers });
});

app.use('*', async (c, next) => {
  const user = await loadUser(c);
  c.set('user', user);
  const path0 = new URL(c.req.url).pathname;
  if (c.req.method === 'GET' && trackPath(path0) && trackable(c)) c.set('vid', visitorId(c));
  c.set('cartCount', user ? await cartCount(c) : 0);
  await next();
});

// أخطاء جافاسكربت عند الزبونة (public/app.js يرسل حتى 3 لكل صفحة): «هل واجهتهم مشكلة؟»
app.post('/t/e', async (c) => {
  const b = await c.req.json<{ m?: string; p?: string }>().catch(() => ({} as any));
  const m = String(b.m ?? '').slice(0, 180);
  if (m && !/extension:\/\/|ResizeObserver|Script error/i.test(m)) track(c, 'error', 'جافاسكربت: ' + m, null, String(b.p ?? '/').slice(0, 200));
  return c.body(null, 204);
});

// الاسم القديم لملف الإضافة (قبل هدهدي): رابط محفوظ عند صاحب المشروع يبقى يعمل
app.get('/talin-extension.zip', (c) => c.redirect('/hudhud-extension.zip', 301));
app.route('/', img);
app.route('/api/partner/v1', partnerApi);   // قبل /api: واجهة شركات الشحن برمزها لا برمز الاستيراد
app.route('/api', api);
app.route('/admin/api1688', api1688Admin);
app.route('/admin', analytics);
app.route('/admin', adminOps);
app.route('/admin', admin);
app.route('/account', account);
app.route('/', pay);
app.route('/partner', partner);
app.route('/pages', pages);
app.route('/request', request);
app.route('/feeds', feeds);
app.route('/', auth);
app.route('/', store);

app.notFound((c) => c.html('<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma;text-align:center;padding:60px"><h1>404</h1><p>الصفحة غير موجودة</p><a href="/">العودة للرئيسية</a></body></html>', 404));
app.onError((err, c) => { console.error(err); return c.html(`<!doctype html><html dir="rtl"><body style="font-family:Tahoma;padding:40px"><h2>حدث خطأ</h2><pre style="direction:ltr;text-align:left;background:#eee;padding:10px">${String(err.message)}</pre><a href="/">الرئيسية</a></body></html>`, 500); });

// Cron Trigger (wrangler.toml: [triggers] crons) — مزامنة يومية عبر الـ API الرسمي إن كان متصلًا
export default {
  fetch: app.fetch,
  async scheduled(_ev: ScheduledEvent, env: Env['Bindings'], ctx: ExecutionContext) {
    const s = await loadSettings(env.DB);
    // ميزانية الشهر مقسومة على ساعاته: الحصة 10000 استدعاء (200 ألف كريدت ÷ 20) وكان الكرون
    // ينفق حتى 58 في الساعة أي 41 ألفًا شهريًا، فتنتهي الحصة في ستة أيام. الآن يوزّعها على الشهر.
    const budget = parseInt(s.src_month_limit ?? '') || 9000;
    const perHour = Math.max(1, Math.min(25, Math.floor(budget / (30 * 24))));
    // المتبقي من الميزانية هذا الشهر: نتوقف عند بلوغها بدل تجاوزها
    const spent = (await env.DB.prepare("SELECT COUNT(*) n FROM payment_log WHERE url LIKE 'SRC %' AND created_at >= datetime('now','start of month')").first<{ n: number }>())?.n ?? 0;
    const left = budget - spent;
    // منتج ناقص الصور والوزن يُسعَّر بوزن مُخمَّن، وهذا خطر مال حقيقي على الشحن. فما دام في
    // المخزون ركام ناقص، الميزانية تذهب لإكماله لا لجلب المزيد من الناقص. البحث اليدوي يبقى متاحًا.
    const backlog = (await env.DB.prepare(`SELECT COUNT(*) n FROM products p WHERE p.status IN ('active','draft') AND p.source='1688'
       AND ((SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) <= 1 OR (SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) = 0 OR p.weight_g IS NULL)`).first<{ n: number }>())?.n ?? 0;
    if (s.src_key && left > perHour && backlog <= 1000) ctx.waitUntil(runServerJobs(env, { limit: 4 }));   // مزوّد API من طرف ثالث
    // صيانة الكتالوج كل ساعة بلا تدخل: ترجمة ما بقي صينيًا (بلا استدعاءات مدفوعة)،
    // ثم إثراء دفعتين من الناقص (50 منتجًا) بادئًا بالمحجوزات فتخرج للمتجر بعنوان عربي.
    ctx.waitUntil((async () => {
      try {
        // الترجمة معزولة: عطل فيها (كنمط LIKE طويل في ٢٤/٠٩/٢٦) كان يُسقط ما بعدها في الكتلة نفسها — ربط طلبات الروابط والإثراء
        if (env.AI) try { const r = await retranslatePending(env.DB, env.AI, 40); console.log('cron translate', JSON.stringify(r)); } catch (e: any) { console.error('cron translate', e?.message ?? e); }
        // طلبات لم تصل API شركة الشحن (خادمها معطّل أو بطيء): تُعاد بمهلة متزايدة
        try { const n = await retryDispatch(env.DB, 'https://hudhude.com'); if (n) console.log('partner dispatch retried', n); } catch (e: any) { console.error('partner dispatch', e?.message ?? e); }
        try { const n = await moveMediaToR2(env.DB, env.MEDIA); if (n) console.log('media moved to R2', n); } catch (e: any) { console.error('media to R2', e?.message ?? e); }
        try { await env.DB.prepare("DELETE FROM visits WHERE created_at < datetime('now','-90 days')").run(); } catch (e: any) { console.error('visits cleanup', e?.message ?? e); }
        // طلبات «اطلبي برابط» التي نُشر منتجها بعد ترجمته (كان مسودة لحظة الاستيراد)
        await settleLinkRequests(env.DB);
        if (!s.src_key) return;
        if (left <= 0) { console.log('cron enrich skipped: budget spent', spent, '/', budget); return; }
        // **يجب احترام `runner`**: مهمة موسومة للإضافة ليست للخادم. الكرون كان يأخذها بالمعرّف
        // فيتجاوز الفلتر في runServerJobs، فيُنفق كريدت المزوّد على عمل تفعله الإضافة مجانًا،
        // ويكتب «error (خادم)» في ملخّص المهمة فيظنّ صاحب المشروع أن الإضافة هي التي فشلت.
        const job = await env.DB.prepare("SELECT id FROM crawl_jobs WHERE type='stock' AND runner IN ('any','server') ORDER BY id LIMIT 1").first<{ id: number }>();
        if (!job) return;
        const r = await runServerJobs(env, { jobId: job.id, enrichOnly: true, maxItems: Math.min(perHour, left) });
        const x = (r.results ?? [{}])[0] as any;
        console.log('cron enrich', x?.enriched ?? 0, 'of', perHour, 'budget left', left, x?.note ?? '');
      } catch (e: any) { console.error('cron maintenance', e?.message ?? e); }
    })());
    if (!s.api1688_key || !s.api1688_tokens) return;
    const client = new Client1688(s.api1688_key, s.api1688_secret, JSON.parse(s.api1688_tokens) as Tokens,
      async (t) => { await env.DB.prepare("INSERT INTO settings(key,value) VALUES('api1688_tokens',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(t)).run(); });
    ctx.waitUntil(syncStock(env.DB, client, 200));
  },
};
void getClient;
