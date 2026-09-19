// دلال — عامل الخلفية: يجلب المهام من الخادم كل 15 دقيقة وينفذها في تبويب خلفي بإيقاع بشري
const VERSION = chrome.runtime.getManifest().version;
const DEF = { api: '', token: '', paused: false, log: [] };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
let running = false;

async function cfg() { return { ...DEF, ...(await chrome.storage.local.get(Object.keys(DEF))) }; }
async function log(line) {
  const c = await cfg(); const l = [`${new Date().toLocaleTimeString('ar-LY')} ${line}`, ...c.log].slice(0, 60);
  await chrome.storage.local.set({ log: l, status: line });
}
async function api(path, opt = {}) {
  const c = await cfg(); if (!c.api || !c.token) throw new Error('الإضافة غير مضبوطة (العنوان/الرمز)');
  const r = await fetch(c.api.replace(/\/+$/, '') + path, { ...opt, headers: { 'content-type': 'application/json', 'x-import-token': c.token, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}
function notify(title, message) { try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message }); } catch (e) {} }

// فتح صفحة في تبويب خلفي وانتظار تحميلها ثم سؤال سكربت المحتوى
async function openAndAsk(url, msg, tabRef) {
  let tab = tabRef.id ? await chrome.tabs.get(tabRef.id).catch(() => null) : null;
  if (!tab) { tab = await chrome.tabs.create({ url, active: false }); tabRef.id = tab.id; }
  else await chrome.tabs.update(tab.id, { url });
  // انتظار اكتمال التحميل
  await new Promise(res => { const t = setTimeout(res, 30000); const h = (id, info) => { if (id === tab.id && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(h); res(); } }; chrome.tabs.onUpdated.addListener(h); });
  await sleep(rnd(4000, 8000));   // وقت لعرض المحتوى الديناميكي + إيقاع بشري
  if (msg.type === 'extractDetail') {   // بيانات SKU تعيش في window الصفحة (العالم الرئيسي) وليس في عالم سكربت المحتوى
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => { try { const d = (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) || window.iDetailData || null; if (!d) return null; const m = d.skuModel || d; return JSON.stringify({ skuInfoMap: m.skuInfoMap || null, skuProps: m.skuProps || null }); } catch (e) { return null; } } });
      msg = { ...msg, init: r && r.result ? JSON.parse(r.result) : null };
    } catch (e) {}
  }
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch (e) {   // سكربت المحتوى لم يُحقن (صفحة خطأ/إعادة توجيه خارج 1688)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    try { return await chrome.tabs.sendMessage(tab.id, msg); } catch (e2) { return { error: e2.message, url }; }
  }
}
const searchUrl = (q, page) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}&beginPage=${page}`;
const pageUrl = (u, page) => { try { const x = new URL(u); x.searchParams.set('beginPage', String(page)); return x.toString(); } catch { return u; } };

async function runJob(job) {
  const started = new Date().toISOString();
  const rep = { job_id: job.id, started_at: started, status: 'ok', pages: 0, found: 0, imported: 0, updated: 0, enriched: 0, checked: 0, note: '' };
  const tabRef = { id: null };
  try {
    if (job.type === 'stock') {
      const q = await api('/api/import/queue');
      const ids = (q.ids || []).slice(0, job.max_new || 100);
      await log(`فحص المخزون: ${ids.length} منتج`);
      for (const id of ids) {
        const r = await openAndAsk(`https://detail.1688.com/offer/${id}.html`, { type: 'extractDetail' }, tabRef);
        if (r?.blocked) { rep.status = 'blocked'; rep.note = 'كابتشا/حجب عند ' + id; break; }
        const it = r?.item;
        await api('/api/import/check', { method: 'POST', body: JSON.stringify({ offerId: id, inStock: !!(it && it.inStock), priceCny: it && it.priceCny ? it.priceCny : null }) });
        rep.checked++;
        await sleep(rnd(9000, 15000));
      }
    } else {
      const newIds = [];
      for (let p = 1; p <= (job.max_pages || 1); p++) {
        const url = job.type === 'url' ? pageUrl(job.query, p) : searchUrl(job.query, p);
        await log(`${job.name}: صفحة ${p}`);
        const r = await openAndAsk(url, { type: 'extractList' }, tabRef);
        if (r?.blocked) { rep.status = 'blocked'; rep.note = `كابتشا/حجب في الصفحة ${p} (${r.url})`; break; }
        const items = r?.items || [];
        rep.pages++; rep.found += items.length;
        if (!items.length) { rep.note += ` صفحة ${p} بلا منتجات (${(r?.title || '').slice(0, 40)}).`; break; }
        const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: job.category_id, page_url: url, items }) });
        rep.imported += res.imported || 0; rep.updated += res.updated || 0; newIds.push(...(res.newIds || []));
        await sleep(rnd(6000, 12000));
      }
      // إثراء المنتجات الجديدة من صفحاتها (صور + مقاسات + ألوان + الحد الأدنى)
      if (job.enrich && rep.status === 'ok') {
        const ids = newIds.slice(0, job.max_new || 40);
        for (const id of ids) {
          await log(`${job.name}: تفاصيل ${id} (${rep.enriched + 1}/${ids.length})`);
          const r = await openAndAsk(`https://detail.1688.com/offer/${id}.html`, { type: 'extractDetail' }, tabRef);
          if (r?.blocked) { rep.status = 'partial'; rep.note += ' توقف الإثراء عند كابتشا.'; break; }
          if (r?.item && r.item.priceCny) { await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: job.category_id, page_url: r.url, items: [r.item] }) }); rep.enriched++; }
          await sleep(rnd(8000, 14000));
        }
      }
    }
  } catch (e) { rep.status = rep.status === 'blocked' ? 'blocked' : 'error'; rep.note += ' ' + e.message; }
  finally { if (tabRef.id) chrome.tabs.remove(tabRef.id).catch(() => {}); }
  await api('/api/crawl/report', { method: 'POST', body: JSON.stringify(rep) }).catch(e => log('تعذر إرسال التقرير: ' + e.message));
  await log(`${job.name}: ${rep.status} — جديد ${rep.imported} · محدّث ${rep.updated} · مُثرى ${rep.enriched} · مفحوص ${rep.checked}`);
  if (rep.status === 'blocked') notify('دلال — توقف الزاحف', `1688 طلب تحققًا. افتح 1688 وحلّ الكابتشا ثم اضغط "شغّل الآن". (${job.name})`);
  return rep;
}

async function tick(force = false) {
  if (running) return; running = true;
  try {
    const c = await cfg();
    if (c.paused && !force) return;
    if (!c.api || !c.token) { await log('بانتظار ضبط العنوان والرمز'); return; }
    const { jobs } = await api('/api/crawl/jobs?v=' + VERSION);
    await chrome.storage.local.set({ lastCheck: new Date().toISOString(), pending: jobs.length });
    if (!jobs.length) { await log('لا مهام مستحقة'); return; }
    for (const job of jobs) { const r = await runJob(job); if (r.status === 'blocked') break; await sleep(rnd(20000, 40000)); }
  } catch (e) { await log('خطأ: ' + e.message); }
  finally { running = false; }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 15, delayInMinutes: 1 }); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 15, delayInMinutes: 1 }); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') tick(); });
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'runNow') { tick(true).then(() => reply({ ok: true })); return true; }
  if (m.type === 'status') { cfg().then(c => reply({ running, ...c })); return true; }
});
