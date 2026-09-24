// هدهدي — عامل الخلفية: يجلب المهام من الخادم كل 15 دقيقة وينفذها في تبويب خلفي بإيقاع بشري
const VERSION = chrome.runtime.getManifest().version;
const DEF = { api: '', token: '', paused: false, log: [], fast: false };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
// وضع سريع للاختبار المحلي فقط: يختصر الإيقاع البشري حتى تكتمل التجربة في دقائق
let FAST = false;
const pace = (a, b) => (FAST ? rnd(150, 400) : rnd(a, b));
let running = false;

async function cfg() { const c = { ...DEF, ...(await chrome.storage.local.get(Object.keys(DEF))) }; FAST = !!c.fast; return c; }
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
// مهلة لأي انتظار: صفحة 1688 لا يكتمل تحميلها كانت تُعلّق الدفعة كلها — executeScript ينتظر
// اكتمال المستند بلا حدّ، وبعد ٥ دقائق يقتل كروم عامل الخلفية فتموت الدفعة بلا أي تقرير.
// (حدث ثلاث مرات مساء ٢٣/٠٩/٢٦: ١٧ ثم ٠ ثم ٤ منتجات ثم صمت.)
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ timeout: true }), ms))]);
const PRODUCT_MS = 60000;
function notify(title, message) { try { chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title, message }); } catch (e) {} }

// فتح صفحة في تبويب خلفي وانتظار تحميلها ثم سؤال سكربت المحتوى
async function openAndAsk(url, msg, tabRef) {
  let tab = tabRef.id ? await chrome.tabs.get(tabRef.id).catch(() => null) : null;
  if (!tab) { tab = await chrome.tabs.create({ url, active: false }); tabRef.id = tab.id; }
  else await chrome.tabs.update(tab.id, { url });
  // انتظار اكتمال التحميل
  const loaded = await new Promise(res => { const h = (id, info) => { if (id === tab.id && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(h); res(true); } }; const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(h); res(false); }, 30000); chrome.tabs.onUpdated.addListener(h); });
  // صفحة لم يكتمل تحميلها في ٣٠ ثانية لا تُقرأ: قراءتها ناقصة تعطي «بلا سعر» فيُعلَّم منتج متوفر «غير متوفر»
  if (!loaded) return { timeout: true, url };
  // التوصيات ومنتجات المتجر تُحمَّل عند التمرير إليها: ننزل إلى أسفل الصفحة كما يفعل الإنسان
  if (msg.type === 'extractDetail') await within(chrome.scripting.executeScript({ target: { tabId: tab.id }, injectImmediately: true, func: () => { window.scrollTo(0, document.body ? document.body.scrollHeight : 0); } }), 5000).catch(() => {});
  await sleep(pace(4000, 8000));   // وقت لعرض المحتوى الديناميكي + إيقاع بشري
  if (msg.type === 'extractDetail') {   // بيانات SKU تعيش في window الصفحة (العالم الرئيسي) وليس في عالم سكربت المحتوى
    try {
      const [r] = await within(chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', injectImmediately: true, func: () => { try { const d = (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) || window.iDetailData || null; if (!d) return null; const m = d.skuModel || d; return JSON.stringify({ skuInfoMap: m.skuInfoMap || null, skuProps: m.skuProps || null }); } catch (e) { return null; } } }), 10000).then(x => Array.isArray(x) ? x : [null]);
      msg = { ...msg, init: r && r.result ? JSON.parse(r.result) : null };
    } catch (e) {}
  }
  try { return await within(chrome.tabs.sendMessage(tab.id, msg), 15000); }
  catch (e) {   // سكربت المحتوى لم يُحقن (صفحة خطأ/إعادة توجيه خارج 1688)
    await within(chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'], injectImmediately: true }), 10000).catch(() => {});
    try { return await within(chrome.tabs.sendMessage(tab.id, msg), 15000); } catch (e2) { return { error: e2.message, url }; }
  }
}
const searchUrl = (q, page) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}&beginPage=${page}`;
const pageUrl = (u, page) => { try { const x = new URL(u); x.searchParams.set('beginPage', String(page)); return x.toString(); } catch { return u; } };

async function runJob(job) {
  const started = new Date().toISOString();
  const rep = { job_id: job.id, started_at: started, status: 'ok', pages: 0, found: 0, imported: 0, updated: 0, enriched: 0, checked: 0, note: '' };
  const tabRef = { id: null };
  // كروم يوقف عامل الخلفية بعد ٣٠ ثانية بلا نداء لواجهات الإضافة: نداء خفيف كل ٢٠ ثانية طوال الدفعة
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  try {
    if (job.type === 'stock') {
      const q = await api('/api/import/queue?v=' + VERSION);
      const ids = (q.ids || []).slice(0, job.max_new || 100);
      const fresh = q.fresh || [];   // منتجات جديدة اكتُشفت روابطها في صفحات الدفعات السابقة
      const total = ids.length + fresh.length;
      await log(`فحص المخزون: ${ids.length} منتج` + (fresh.length ? ` + ${fresh.length} جديد مكتشف` : ''));
      // روابط المنتجات الأخرى في الصفحة → الخادم (ولو صفرًا: هذا ما يثبت هل تعرضها 1688 لزائر غير مسجّل)
      const harvest = (from, r) => api('/api/crawl/discover', { method: 'POST', body: JSON.stringify({ from, ids: r?.links || [] }) }).catch(() => {});
      for (const id of ids) {
        // سطر الحالة في النافذة يتحرّك مع كل منتج (لا يُكتب في السجل حتى لا يُغرقه ١٠٠ سطر)
        await chrome.storage.local.set({ status: `فحص المخزون والإثراء: ${rep.checked + 1} من ${total}`, progress: { done: rep.checked, total, at: Date.now() } });
        const r = await within(openAndAsk(`https://detail.1688.com/offer/${id}.html`, { type: 'extractDetail' }, tabRef), PRODUCT_MS);
        if (r?.timeout || r?.error) {
          // الصفحة لم تُحمَّل أو لم تُجب خلال دقيقة: نغلق تبويبها (الجديد يُفتح للمنتج التالي) ونتخطّاها.
          // الخادم يؤخّرها في الطابور ويعدّها «لم يُقرأ» — لا يعلّمها غير متوفرة.
          if (tabRef.id) { chrome.tabs.remove(tabRef.id).catch(() => {}); tabRef.id = null; }
          rep.skipped = (rep.skipped || 0) + 1;
          await api('/api/import/check', { method: 'POST', body: JSON.stringify({ offerId: id, skipped: true }) }).catch(() => {});
          rep.checked++;
          continue;
        }
        if (r?.blocked) {
          rep.status = 'blocked';
          rep.note = r.blocked === 'login'
            ? `1688 طلب تسجيل دخول لعرض صفحة المنتج ${id} — لم تعد تفتح لزائر غير مسجّل`
            : 'كابتشا/حجب عند ' + id;
          break;
        }
        const it = r?.item;
        if (it && it.priceCny) {
          // الصفحة تُقرأ كاملة بلا تسجيل دخول: نرسل المنتج كله ليُحدَّث السعر ويُثرى بالصور والمقاسات والوزن
          const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: job.category_id ?? null, page_url: 'ext:stock', items: [it] }) });
          rep.updated += res.updated || 0; rep.enriched += res.enriched || 0; rep.imported += res.imported || 0;
        } else {
          await api('/api/import/check', { method: 'POST', body: JSON.stringify({ offerId: id, inStock: false, priceCny: null }) });
        }
        await harvest(id, r);
        rep.checked++;
        await sleep(pace(9000, 15000));
      }
      // اكتشاف مجاني: نفتح صفحة المنتج الجديد (تفتح بلا حساب) ونستورده منها في قسم الصفحة التي وُجد فيها
      if (rep.status === 'ok') for (const f of fresh) {
        await chrome.storage.local.set({ status: `منتج جديد مكتشف: ${rep.checked + 1} من ${total}`, progress: { done: rep.checked, total, at: Date.now() } });
        const r = await within(openAndAsk(`https://detail.1688.com/offer/${f.id}.html`, { type: 'extractDetail' }, tabRef), PRODUCT_MS);
        if (r?.blocked) {
          rep.status = 'blocked';
          rep.note = r.blocked === 'login' ? `1688 طلب تسجيل دخول لعرض صفحة المنتج ${f.id} — لم تعد تفتح لزائر غير مسجّل` : 'كابتشا/حجب عند ' + f.id;
          break;
        }
        if (r?.timeout || r?.error) { if (tabRef.id) { chrome.tabs.remove(tabRef.id).catch(() => {}); tabRef.id = null; } }
        if (r?.item && r.item.priceCny) {
          const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: f.category_id ?? null, page_url: 'ext:discover', items: [r.item] }) });
          rep.imported += res.imported || 0;
        } else await api('/api/crawl/discover/fail', { method: 'POST', body: JSON.stringify({ offerId: f.id }) }).catch(() => {});
        if (!r?.timeout && !r?.error) await harvest(f.id, r);
        rep.checked++;
        await sleep(pace(9000, 15000));
      }
    } else {
      const newIds = [];
      for (let p = 1; p <= (job.max_pages || 1); p++) {
        const url = job.type === 'url' ? pageUrl(job.query, p) : searchUrl(job.query, p);
        await log(`${job.name}: صفحة ${p}`);
        const r = await openAndAsk(url, { type: 'extractList' }, tabRef);
        if (r?.blocked) { rep.status = 'blocked'; rep.note = r.blocked === 'login' ? `صفحة البحث طلبت تسجيل دخول 1688 (${r.url}) — البحث يتطلب حسابًا، تنفّذه مهام الخادم` : `كابتشا/حجب في الصفحة ${p} (${r.url})`; break; }
        const items = r?.items || [];
        rep.pages++; rep.found += items.length;
        if (!items.length) { rep.note += ` صفحة ${p} بلا منتجات (${(r?.title || '').slice(0, 40)}).`; break; }
        const res = await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: job.category_id, page_url: url, items }) });
        rep.imported += res.imported || 0; rep.updated += res.updated || 0; newIds.push(...(res.newIds || []));
        await sleep(pace(6000, 12000));
      }
      // إثراء المنتجات الجديدة من صفحاتها (صور + مقاسات + ألوان + الحد الأدنى)
      if (job.enrich && rep.status === 'ok') {
        const ids = newIds.slice(0, job.max_new || 40);
        for (const id of ids) {
          await log(`${job.name}: تفاصيل ${id} (${rep.enriched + 1}/${ids.length})`);
          const r = await within(openAndAsk(`https://detail.1688.com/offer/${id}.html`, { type: 'extractDetail' }, tabRef), PRODUCT_MS);
          if (r?.timeout) { if (tabRef.id) { chrome.tabs.remove(tabRef.id).catch(() => {}); tabRef.id = null; } continue; }
          if (r?.blocked) { rep.status = 'partial'; rep.note += ' توقف الإثراء عند كابتشا.'; break; }
          if (r?.item && r.item.priceCny) { await api('/api/import', { method: 'POST', body: JSON.stringify({ category_id: job.category_id, page_url: r.url, items: [r.item] }) }); rep.enriched++; }
          await sleep(pace(8000, 14000));
        }
      }
    }
  } catch (e) { rep.status = rep.status === 'blocked' ? 'blocked' : 'error'; rep.note += ' ' + e.message; }
  finally { clearInterval(keepAlive); if (tabRef.id) chrome.tabs.remove(tabRef.id).catch(() => {}); }
  if (rep.skipped) rep.note += ` تخطّيت ${rep.skipped} صفحة لم تُجب خلال دقيقة.`;
  await api('/api/crawl/report', { method: 'POST', body: JSON.stringify(rep) }).catch(e => log('تعذر إرسال التقرير: ' + e.message));
  await log(`${job.name}: ${rep.status} — جديد ${rep.imported} · محدّث ${rep.updated} · مُثرى ${rep.enriched} · مفحوص ${rep.checked}`);
  if (rep.status === 'blocked') notify('هدهدي — توقف الزاحف', /تسجيل دخول/.test(rep.note)
    ? `1688 لم يعد يعرض صفحات المنتجات لزائر غير مسجّل. لا تُعِد المحاولة — راجع لوحة الزاحف في هدهدي. (${job.name})`
    : `1688 طلب تحققًا. افتح 1688 وحلّ الكابتشا ثم اضغط "شغّل الآن". (${job.name})`);
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
    for (const job of jobs) { const r = await runJob(job); if (r.status === 'blocked') break; await sleep(pace(20000, 40000)); }
  } catch (e) { await log('خطأ: ' + e.message); }
  finally { running = false; }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 15, delayInMinutes: 1 }); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('tick', { periodInMinutes: 15, delayInMinutes: 1 }); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') tick(); });
// اختبار الاتصال بالموقع: يتحقق من العنوان والرمز ويعيد عدد المهام المستحقة
async function testConn() {
  try {
    const c = await cfg();
    if (!c.api || !c.token) return { ok: false, error: 'العنوان أو الرمز غير مضبوط. افتح لوحة الزاحف في موقع هدهدي ليُضبط تلقائيًا.' };
    const j = await api('/api/crawl/jobs?v=' + VERSION);
    const due = (j.jobs || []).length, all = (j.all || []).length;
    await log(`اختبار الاتصال: نجح — ${all} مهمة، ${due} مستحقة الآن`);
    return { ok: true, due, all, site: c.api };
  } catch (e) {
    const msg = /401|403/.test(e.message) ? 'الرمز غير صحيح (401/403)' : /Failed to fetch|NetworkError/i.test(e.message) ? 'تعذّر الوصول إلى الموقع — تحقق من العنوان' : e.message;
    await log('اختبار الاتصال: فشل — ' + msg);
    return { ok: false, error: msg };
  }
}


// ===== تشخيص صفحة 1688 المفتوحة =====
// يقرأ التبويب النشط كما هو (بلا فتح صفحات) ويرسل ما وجده إلى الموقع لضبط القارئ على البنية الحقيقية
async function probeActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/1688\.com/.test(tab.url || '')) return { ok: false, error: 'افتحي صفحة منتج على 1688.com في التبويب النشط أولًا' };
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: () => {
        const out = { url: location.href, title: document.title, loggedIn: !/Login|登录/i.test(document.querySelector('#login, .login-btn, [class*=loginBtn]')?.textContent || '') };
        const keys = [];
        for (const k of ['__INIT_DATA__', 'iDetailData', '__NEXT_DATA__', '__GLOBAL_DATA', 'detailData', '__AXIOM_DATA__']) if (window[k]) keys.push(k);
        out.globalKeys = keys;
        try { const d = window.__INIT_DATA__; if (d) out.initSample = JSON.stringify(d).slice(0, 4000); } catch (e) { out.initErr = String(e).slice(0, 120); }
        const txt = (s) => (document.querySelector(s)?.textContent || '').trim().slice(0, 160);
        out.dom = {
          h1: txt('h1'),
          titleCandidates: [...document.querySelectorAll('h1,[class*=title],[class*=Title]')].slice(0, 6).map(e => (e.textContent || '').trim().slice(0, 90)).filter(Boolean),
          priceCandidates: [...document.querySelectorAll('[class*=price],[class*=Price]')].slice(0, 8).map(e => (e.textContent || '').trim().slice(0, 60)).filter(Boolean),
          imgs: [...document.querySelectorAll('img')].map(i => i.currentSrc || i.src).filter(u => /alicdn/.test(u)).slice(0, 10),
          tableRows: [...document.querySelectorAll('table tr')].slice(0, 25).map(tr => [...tr.cells].map(c => (c.textContent || '').trim().slice(0, 40)).join(' | ')),
          loginWall: /Login to view|登录查看|立即登录/i.test(document.body.innerText || ''),
          bodyLen: (document.body.innerText || '').length,
        };
        return JSON.stringify(out);
      },
    });
    const data = r && r.result ? JSON.parse(r.result) : null;
    if (!data) return { ok: false, error: 'تعذّرت قراءة الصفحة' };
    await api('/api/crawl/probe', { method: 'POST', body: JSON.stringify(data) });
    await log('أُرسل تشخيص الصفحة: ' + (data.dom?.h1 || data.title || '').slice(0, 40));
    return { ok: true, sent: true, title: data.dom?.h1 || data.title, imgs: (data.dom?.imgs || []).length, keys: data.globalKeys, loginWall: data.dom?.loginWall };
  } catch (e) {
    await log('فشل التشخيص: ' + e.message);
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m.type === 'runNow') { tick(true).then(() => reply({ ok: true })); return true; }
  if (m.type === 'status') { cfg().then(c => reply({ running, ...c })); return true; }
  if (m.type === 'test') { testConn().then(reply); return true; }
  if (m.type === 'probe') { probeActiveTab().then(reply); return true; }
  // شريط التقدّم في النافذة: الخادم يعرف ما أُضيف فعلًا لكل منتج (صور، مقاسات، وزن)
  if (m.type === 'live') { api('/api/crawl/live').then(reply, e => reply({ error: e.message })); return true; }
});
