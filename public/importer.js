/* هدهد — سكربت الاستيراد. يُحقن في صفحة 1688 عبر bookmarklet.
   وضعان: import (استيراد منتجات الصفحة) و check (فحص توفر/سعر قائمة من الخادم).
   يعتمد على DOM الحالي لـ 1688؛ المحددات قابلة للتعديل في SELECTORS عند تغيّر الموقع. */
(function () {
  const me = document.currentScript;
  const API = me.dataset.api, TOKEN = me.dataset.token, MODE = me.dataset.mode || 'import';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.textContent.trim() : '');
  const num = (s) => parseFloat((String(s || '').match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
  const offerIdFrom = (u) => (String(u || '').match(/offer\/(\d+)/) || [])[1] || (String(u || '').match(/[?&]offerId=(\d+)/) || [])[1] || '';

  // ---------- استخراج بيانات من صفحة قائمة ----------
  function extractList() {
    const items = [];
    const seen = new Set();
    $$('a[href*="detail.1688.com/offer/"]').forEach(a => {
      const id = offerIdFrom(a.href); if (!id || seen.has(id)) return;
      const card = a.closest('[class*="card"],[class*="item"],[class*="offer"],li,div') || a;
      const img = $('img', card);
      const priceEl = $('[class*="price"]', card);
      const title = txt($('[class*="title"],[class*="subject"]', card)) || a.title || txt(a);
      if (!img || !priceEl) return;
      seen.add(id);
      items.push({ offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: title.slice(0, 200), priceCny: num(txt(priceEl)),
        images: [img.src || img.dataset.src].filter(Boolean).map(u => u.replace(/\.\d+x\d+(\.\w+)$/, '$1').replace(/_\d+x\d+\w*\.jpg$/, '.jpg')),
        sales: num(txt($('[class*="sale"],[class*="sold"],[class*="deal"]', card))), minQty: 1, inStock: true, variants: [] });
    });
    return items;
  }

  // ---------- استخراج بيانات من صفحة منتج ----------
  function extractDetail() {
    const id = offerIdFrom(location.href); if (!id) return null;
    // 1688 يضع بيانات المنتج في window.__INIT_DATA__ أو iDetailData
    let data = null;
    try { data = (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) || window.iDetailData || null; } catch (e) {}
    const title = txt($('h1,[class*="title-text"],[class*="offer-title"]')) || document.title;
    const images = $$('img').map(i => i.src || i.dataset.src || '').filter(u => /cbu01\.alicdn|img\.alicdn/.test(u) && !/\.gif/.test(u))
      .map(u => u.replace(/\.\d+x\d+(\.\w+)$/, '$1').replace(/_\d+x\d+\w*\.jpg$/, '.jpg')).filter((u, i, a) => a.indexOf(u) === i).slice(0, 8);
    const prices = $$('[class*="price"]').map(e => num(txt(e))).filter(v => v > 0);
    const priceCny = prices.length ? Math.min(...prices) : 0;
    const variants = [];
    // SKU من البيانات المدمجة
    try {
      const skuMap = data && (data.skuModel?.skuInfoMap || data.skuInfoMap);
      const props = data && (data.skuModel?.skuProps || data.skuProps);
      if (skuMap && props) {
        Object.entries(skuMap).forEach(([key, v]) => {
          const parts = key.split('&gt;').join('>').split('>');
          const color = props[0] ? parts[0] : null, size = props[1] ? parts[1] : null;
          variants.push({ skuId: String(v.skuId), color, size, priceCny: num(v.price || v.discountPrice), inStock: (v.canBookCount ?? 1) > 0 });
        });
      }
    } catch (e) {}
    // احتياط: من الـ DOM
    if (!variants.length) {
      const colors = $$('[class*="sku"] [class*="prop"] [class*="value"],[class*="color-item"],[class*="prop-item"]').map(txt).filter(Boolean).slice(0, 20);
      const sizes = $$('[class*="sku-item"] [class*="name"],[class*="size-item"]').map(txt).filter(Boolean).slice(0, 20);
      colors.forEach(c => sizes.length ? sizes.forEach(s => variants.push({ color: c, size: s, inStock: true })) : variants.push({ color: c, inStock: true }));
      if (!colors.length) sizes.forEach(s => variants.push({ size: s, inStock: true }));
    }
    const minQty = num(txt($('[class*="min-order"],[class*="begin-amount"],[class*="mix-amount"]'))) || 1;
    return { offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: title.slice(0, 200), priceCny, images, variants, minQty, inStock: priceCny > 0,
      supplier: txt($('[class*="company-name"],[class*="supplier-name"]')), sales: num(txt($('[class*="sale-count"],[class*="sold"]'))) };
  }

  // ---------- واجهة الاستيراد ----------
  function ui(items, isDetail) {
    const old = $('#dlal-panel'); if (old) old.remove();
    const p = document.createElement('div'); p.id = 'dlal-panel';
    p.style.cssText = 'position:fixed;top:0;right:0;width:420px;height:100vh;background:#fff;z-index:2147483647;box-shadow:-4px 0 20px rgba(0,0,0,.25);font:14px Tahoma,Arial;direction:rtl;display:flex;flex-direction:column';
    p.innerHTML = `<div style="background:#B05A20;color:#fff;padding:12px 16px;font-weight:bold;display:flex;justify-content:space-between"><span>هدهد — استيراد ${items.length} منتج</span><span id="dlal-x" style="cursor:pointer">✕</span></div>
      <div style="padding:10px 16px;border-bottom:1px solid #eee"><label>القسم في هدهد: <select id="dlal-cat" style="width:100%;padding:6px"></select></label>
      <div style="margin-top:8px;font-size:12px;color:#666">${isDetail ? 'صفحة منتج: ستُستورد الصور والمقاسات والألوان.' : 'صفحة قائمة: تُستورد صورة واحدة وسعر البداية؛ افتح المنتج لاستيراد التفاصيل.'}</div></div>
      <div id="dlal-list" style="flex:1;overflow:auto;padding:10px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
      <div style="padding:12px 16px;border-top:1px solid #eee"><button id="dlal-go" style="width:100%;background:#1a1a1a;color:#fff;border:0;padding:12px;border-radius:999px;font-weight:bold;cursor:pointer">استيراد المحدد</button><div id="dlal-msg" style="margin-top:6px;font-size:12px;color:#666"></div></div>`;
    document.body.appendChild(p);
    const list = $('#dlal-list', p);
    items.forEach((it, i) => {
      const d = document.createElement('label');
      d.style.cssText = 'border:1px solid #eee;border-radius:8px;padding:6px;font-size:11px;cursor:pointer';
      d.innerHTML = `<input type="checkbox" checked data-i="${i}"> <img src="${it.images[0] || ''}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block;margin:4px 0"><div style="height:30px;overflow:hidden">${it.title}</div><b>¥${it.priceCny}</b>${it.variants.length ? ` · ${it.variants.length} SKU` : ''}`;
      list.appendChild(d);
    });
    $('#dlal-x', p).onclick = () => p.remove();
    fetch(API + '/api/categories').then(r => r.json()).then(cats => { $('#dlal-cat', p).innerHTML = cats.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name_ar}</option>`).join(''); });
    $('#dlal-go', p).onclick = async () => {
      const chosen = $$('input:checked', list).map(cb => items[+cb.dataset.i]);
      $('#dlal-msg', p).textContent = 'جارٍ الإرسال…';
      const r = await fetch(API + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': TOKEN }, body: JSON.stringify({ category_id: +$('#dlal-cat', p).value, page_url: location.href, items: chosen }) });
      const j = await r.json().catch(() => ({}));
      $('#dlal-msg', p).innerHTML = r.ok ? `✅ جديد: ${j.imported} · محدّث: ${j.updated} · متخطى: ${j.skipped}` : `❌ خطأ: ${j.error || r.status}`;
    };
  }

  // ---------- وضع الفحص ----------
  async function checkMode() {
    const q = await fetch(API + '/api/import/queue', { headers: { 'x-import-token': TOKEN } }).then(r => r.json());
    const ids = q.ids || [];
    const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;bottom:0;right:0;left:0;background:#1a1a1a;color:#fff;padding:10px 16px;z-index:2147483647;font:13px Tahoma;direction:rtl';
    document.body.appendChild(bar);
    for (let i = 0; i < ids.length; i++) {
      bar.textContent = `فحص ${i + 1}/${ids.length} — ${ids[i]}`;
      try {
        const html = await fetch(`https://detail.1688.com/offer/${ids[i]}.html`, { credentials: 'include' }).then(r => r.text());
        const gone = /商品已下架|已失效|不存在|offer-not-found/.test(html);
        const price = (html.match(/"price":"?([\d.]+)/) || [])[1];
        await fetch(API + '/api/import/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': TOKEN }, body: JSON.stringify({ offerId: ids[i], inStock: !gone, priceCny: price ? +price : null }) });
      } catch (e) { bar.textContent += ' ⚠️ ' + e.message; }
      await new Promise(r => setTimeout(r, 12000 + Math.random() * 4000));
    }
    bar.textContent = 'اكتمل الفحص ✓';
  }

  if (MODE === 'check') return checkMode();
  const detail = extractDetail();
  if (detail && detail.priceCny) return ui([detail], true);
  const items = extractList();
  if (!items.length) return alert('لم أجد منتجات في هذه الصفحة. افتح صفحة بحث أو صفحة منتج في 1688.');
  ui(items, false);
})();
