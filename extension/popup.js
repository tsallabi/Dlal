const $ = (s) => document.querySelector(s);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'status' });
  const c = await chrome.storage.local.get(['api', 'token', 'paused', 'log', 'status', 'lastCheck', 'pending']);
  $('#api').value = c.api || ''; $('#token').value = c.token || '';
  const ok = c.api && c.token;
  $('#st').innerHTML = `<span class="dot" style="background:${!ok ? '#d3262b' : c.paused ? '#d68b00' : s.running ? '#1c47b3' : '#1a9c5b'}"></span>${!ok ? 'غير مضبوطة — افتحي لوحة الزاحف في موقع دلال لتُضبط تلقائيًا' : c.paused ? 'متوقفة مؤقتًا' : s.running ? 'تعمل الآن…' : 'جاهزة'}<br>آخر فحص للمهام: ${c.lastCheck ? new Date(c.lastCheck).toLocaleTimeString('ar-LY') : '—'} · مهام مستحقة: ${c.pending ?? '—'}<br>${c.status || ''}`;
  $('#log').textContent = (c.log || []).join('\n');
  $('#pause').textContent = c.paused ? 'استئناف' : 'إيقاف مؤقت';
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
$('#open').onclick = async () => { const c = await chrome.storage.local.get('api'); chrome.tabs.create({ url: (c.api || '') + '/admin/crawler' }); };
refresh(); setInterval(refresh, 3000);
