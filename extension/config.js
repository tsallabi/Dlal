// دلال — ضبط تلقائي: عند فتح لوحة الزاحف في موقع دلال تأخذ الإضافة العنوان والرمز بنفسها
(async function () {
  const el = document.getElementById('dlal-ext-config');
  if (!el) return;
  const api = (el.dataset.api || location.origin).replace(/\/+$/, '');
  const token = el.dataset.token || '';
  const banner = (text, color) => {
    const d = document.createElement('div');
    d.textContent = text;
    d.setAttribute('style', `position:fixed;inset-inline:0;top:0;z-index:2147483647;background:${color};color:#fff;font:700 14px Tahoma,Arial;padding:10px 16px;text-align:center;direction:rtl`);
    document.documentElement.appendChild(d);
    setTimeout(() => d.remove(), 6000);
  };
  if (!token) { banner('إضافة دلال مثبّتة، لكن IMPORT_TOKEN غير مضبوط على الخادم', '#d3262b'); return; }
  const cur = await chrome.storage.local.get(['api', 'token']);
  if (cur.api === api && cur.token === token) { banner('إضافة الزاحف مربوطة بهذا الموقع ✓', '#1a9c5b'); return; }
  await chrome.storage.local.set({ api, token });
  banner('تم ربط إضافة الزاحف بهذا الموقع تلقائيًا ✓ — افتح أيقونة الإضافة واضغط «شغّل الآن»', '#1a9c5b');
})();
