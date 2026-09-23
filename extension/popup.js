const $ = (s) => document.querySelector(s);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'status' });
  const c = await chrome.storage.local.get(['api', 'token', 'paused', 'log', 'status', 'lastCheck', 'pending']);
  $('#api').value = c.api || ''; $('#token').value = c.token || '';
  const ok = c.api && c.token;
  $('#st').innerHTML = `<span class="dot" style="background:${!ok ? '#d3262b' : c.paused ? '#d68b00' : s.running ? '#1c47b3' : '#1a9c5b'}"></span>${!ok ? 'غير مضبوطة — افتحي لوحة الزاحف في موقع تالين لتُضبط تلقائيًا' : c.paused ? 'متوقفة مؤقتًا' : s.running ? 'تعمل الآن…' : 'جاهزة'}<br>آخر فحص للمهام: ${c.lastCheck ? new Date(c.lastCheck).toLocaleTimeString('ar-LY') : '—'} · مهام مستحقة: ${c.pending ?? '—'}<br>${c.status || ''}`;
  $('#log').textContent = (c.log || []).join('\n');
  $('#pause').textContent = c.paused ? 'استئناف' : 'إيقاف مؤقت';
  $('#dashUrl').textContent = c.api ? c.api.replace(/^https?:\/\//, '') + '/admin/crawler' : '';
}
// شريط التقدّم من الخادم: كم منتجًا قُرئ في الدفعة الجارية وماذا أُضيف فعلًا
async function refreshLive() {
  const l = await chrome.runtime.sendMessage({ type: 'live' }).catch(() => null);
  if (!l || l.error) { $('#progHead').textContent = 'شريط التقدّم: تعذّر الاتصال بالموقع'; return; }
  const head = { running: '🟢 تعمل الآن', stalled: '🟠 توقفت في منتصف الدفعة', idle: 'لم تبدأ أي دفعة بعد', finished: l.status === 'blocked' ? '⛔ توقفت عند كابتشا' : '✅ اكتملت الدفعة الأخيرة' }[l.state] || '';
  $('#progHead').textContent = head;
  $('#progBar').style.width = (l.total ? l.pct : l.done ? 100 : 0) + '%';
  $('#progNums').textContent = l.total ? `${l.done} من ${l.total} منتجًا · ${l.pct}%` + (l.etaMin ? ` · يتبقّى ~${l.etaMin} دقيقة` : '') : `${l.done} منتجًا قُرئ في هذه الدفعة`;
  $('#progGain').textContent = `أُضيف في هذه الدفعة: صور +${l.gain.img} · مقاسات وألوان +${l.gain.vars} · وزن +${l.gain.wt}` + (l.state === 'running' ? '' : ` — ${l.next}`);
}
const saveCfg = async () => {
  const api = $('#api').value.trim().replace(/\/+$/, '');
  const token = $('#token').value.trim();
  if (api || token) await chrome.storage.local.set({ api, token });
  refresh();
};
$('#save').onclick = saveCfg;
// حفظ تلقائي: كثيرًا ما يُكتب العنوان والرمز ثم يُنسى زر الحفظ
['#api', '#token'].forEach(sel => { const el = $(sel); el.addEventListener('change', saveCfg); el.addEventListener('blur', saveCfg); });
$('#run').onclick = async () => { $('#st').textContent = 'جارٍ التشغيل…'; chrome.runtime.sendMessage({ type: 'runNow' }); setTimeout(refresh, 1500); };
$('#test').onclick = async () => {
  await saveCfg();
  const box = $('#testres'); box.style.display = 'block'; box.textContent = 'جارٍ الاختبار…';
  const r = await chrome.runtime.sendMessage({ type: 'test' });
  box.innerHTML = r.ok
    ? `<b style="color:#1a9c5b">الاتصال يعمل ✓</b><br>الموقع: <span dir="ltr">${r.site}</span><br>المهام: ${r.all} · المستحقة الآن: ${r.due}`
    : `<b style="color:#d3262b">فشل الاتصال</b><br>${r.error}`;
  refresh();
};
$('#probe').onclick = async () => {
  await saveCfg();
  const box = $('#testres'); box.style.display = 'block'; box.textContent = 'جارٍ قراءة التبويب المفتوح…';
  const r = await chrome.runtime.sendMessage({ type: 'probe' });
  box.innerHTML = r.ok
    ? `<b style="color:#1a9c5b">أُرسل التشخيص ✓</b><br>العنوان: ${(r.title || '—').slice(0, 60)}<br>صور: ${r.imgs} · جدار دخول: ${r.loginWall ? 'نعم' : 'لا'}<br>مفاتيح: ${(r.keys || []).join(', ') || '—'}`
    : `<b style="color:#d3262b">تعذّر الفحص</b><br>${r.error}`;
  refresh();
};
$('#pause').onclick = async () => { const c = await chrome.storage.local.get('paused'); await chrome.storage.local.set({ paused: !c.paused }); refresh(); };
$('#open').onclick = async (e) => { e.preventDefault(); const c = await chrome.storage.local.get('api'); chrome.tabs.create({ url: (c.api || 'https://dlal.tsallabi.workers.dev') + '/admin/crawler' }); };
refresh(); setInterval(refresh, 3000);
refreshLive(); setInterval(refreshLive, 5000);
