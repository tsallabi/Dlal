import { Hono } from 'hono';
import type { Env } from './types';
import { loadUser } from './lib/auth';
import { cartCount } from './lib/db';
import store from './routes/store';
import auth from './routes/auth';
import admin from './routes/admin';
import partner from './routes/partner';
import api from './routes/api';
import pay from './routes/pay';
import account from './routes/account';
import adminOps from './routes/admin-ops';
import api1688Admin, { getClient, syncStock } from './routes/api1688-admin';
import { loadSettings } from './lib/pricing';
import { Client1688, type Tokens } from './lib/api1688';
import { runServerJobs } from './lib/crawl';

const app = new Hono<Env>();

app.use('*', async (c, next) => {
  const user = await loadUser(c);
  c.set('user', user);
  c.set('cartCount', user ? await cartCount(c) : 0);
  await next();
});

app.route('/api', api);
app.route('/admin/api1688', api1688Admin);
app.route('/admin', adminOps);
app.route('/admin', admin);
app.route('/account', account);
app.route('/', pay);
app.route('/partner', partner);
app.route('/', auth);
app.route('/', store);

app.notFound((c) => c.html('<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma;text-align:center;padding:60px"><h1>404</h1><p>الصفحة غير موجودة</p><a href="/">العودة للرئيسية</a></body></html>', 404));
app.onError((err, c) => { console.error(err); return c.html(`<!doctype html><html dir="rtl"><body style="font-family:Tahoma;padding:40px"><h2>حدث خطأ</h2><pre style="direction:ltr;text-align:left;background:#eee;padding:10px">${String(err.message)}</pre><a href="/">الرئيسية</a></body></html>`, 500); });

// Cron Trigger (wrangler.toml: [triggers] crons) — مزامنة يومية عبر الـ API الرسمي إن كان متصلًا
export default {
  fetch: app.fetch,
  async scheduled(_ev: ScheduledEvent, env: Env['Bindings'], ctx: ExecutionContext) {
    const s = await loadSettings(env.DB);
    if (s.src_key) ctx.waitUntil(runServerJobs(env, { limit: 4 }));   // مزوّد API من طرف ثالث
    if (!s.api1688_key || !s.api1688_tokens) return;
    const client = new Client1688(s.api1688_key, s.api1688_secret, JSON.parse(s.api1688_tokens) as Tokens,
      async (t) => { await env.DB.prepare("INSERT INTO settings(key,value) VALUES('api1688_tokens',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(t)).run(); });
    ctx.waitUntil(syncStock(env.DB, client, 200));
  },
};
void getClient;
