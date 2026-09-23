import { Hono } from 'hono';
import type { Env } from './types';
import { loadUser } from './lib/auth';
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
import adminOps from './routes/admin-ops';
import api1688Admin, { getClient, syncStock } from './routes/api1688-admin';
import { loadSettings } from './lib/pricing';
import { retranslatePending } from './lib/translate';
import { Client1688, type Tokens } from './lib/api1688';
import { runServerJobs } from './lib/crawl';

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  const user = await loadUser(c);
  c.set('user', user);
  c.set('cartCount', user ? await cartCount(c) : 0);
  await next();
});

app.route('/', img);
app.route('/api', api);
app.route('/admin/api1688', api1688Admin);
app.route('/admin', adminOps);
app.route('/admin', admin);
app.route('/account', account);
app.route('/', pay);
app.route('/partner', partner);
app.route('/pages', pages);
app.route('/', auth);
app.route('/', store);

app.notFound((c) => c.html('<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma;text-align:center;padding:60px"><h1>404</h1><p>الصفحة غير موجودة</p><a href="/">العودة للرئيسية</a></body></html>', 404));
app.onError((err, c) => { console.error(err); return c.html(`<!doctype html><html dir="rtl"><body style="font-family:Tahoma;padding:40px"><h2>حدث خطأ</h2><pre style="direction:ltr;text-align:left;background:#eee;padding:10px">${String(err.message)}</pre><a href="/">الرئيسية</a></body></html>`, 500); });

// Cron Trigger (wrangler.toml: [triggers] crons) — مزامنة يومية عبر الـ API الرسمي إن كان متصلًا
export default {
  fetch: app.fetch,
  async scheduled(_ev: ScheduledEvent, env: Env['Bindings'], ctx: ExecutionContext) {
    const s = await loadSettings(env.DB);
    // ميزانية الشهر مقسومة على ساعاته: الحصة ١٠٠٠٠ استدعاء (٢٠٠ ألف كريدت ÷ ٢٠) وكان الكرون
    // ينفق حتى ٥٨ في الساعة أي ٤١ ألفًا شهريًا، فتنتهي الحصة في ستة أيام. الآن يوزّعها على الشهر.
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
    // ثم إثراء دفعتين من الناقص (٥٠ منتجًا) بادئًا بالمحجوزات فتخرج للمتجر بعنوان عربي.
    ctx.waitUntil((async () => {
      try {
        if (env.AI) { const r = await retranslatePending(env.DB, env.AI, 40); console.log('cron translate', JSON.stringify(r)); }
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
