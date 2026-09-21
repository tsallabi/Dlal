const $ = (s) => document.querySelector(s);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'status' });
  const c = await chrome.storage.local.get(['api', 'token', 'paused', 'log', 'status', 'lastCheck', 'pending']);
  $('#api').value = c.api || ''; $('#token').value = c.token || '';
  const ok = c.api && c.token;
  $('#st').innerHTML = `<span class="dot" style="background:${!ok ? '#d3262b' : c.paused ? '#d68b00' : s.running ? '#1c47b3' : '#1a9c5b'}"></span>${!ok ? 'غير مضبوطة — أدخل العنوان والرمز' : c.paused ? 'متوقفة مؤقتًا' : s.running ? 'تعمل الآن…' : 'جاهزة'}<br>آخر فحص للمهام: ${c.lastCheck ? new Date(c.lastCheck).toLocaleTimeString('ar-LY') : '—'} · مهام مستحقة: ${c.pending ?? '—'}<br>${c.status || ''}`;
  $('#log').textContent = (c.log || []).join('\n');
  $('#pause').textContent = c.paused ? 'استئناف' : 'إيقاف مؤقت';
}
$('#save').onclick = async () => { await chrome.storage.local.set({ api: $('#api').value.trim(), token: $('#token').value.trim() }); refresh(); };
$('#run').onclick = async () => { $('#st').textContent = 'جارٍ التشغيل…'; chrome.runtime.sendMessage({ type: 'runNow' }); setTimeout(refresh, 1500); };
$('#test').onclick = async () => {
  const box = $('#testres'); box.style.display = 'block'; box.textContent = 'جارٍ الاختبار…';
  const r = await chrome.runtime.sendMessage({ type: 'test' });
  box.innerHTML = r.ok
    ? `<b style="color:#1a9c5b">الاتصال يعمل ✓</b><br>الموقع: <span dir="ltr">${r.site}</span><br>المهام: ${r.all} · المستحقة الآن: ${r.due}`
    : `<b style="color:#d3262b">فشل الاتصال</b><br>${r.error}`;
  refresh();
};
$('#pause').onclick = async () => { const c = await chrome.storage.local.get('paused'); await chrome.storage.local.set({ paused: !c.paused }); refresh(); };
$('#open').onclick = async () => { const c = await chrome.storage.local.get('api'); chrome.tabs.create({ url: (c.api || '') + '/admin/crawler' }); };
refresh(); setInterval(refresh, 3000);
