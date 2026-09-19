// دلال — سكربت المحتوى: يستخرج بيانات المنتجات من صفحات 1688 عند طلب الخلفية
(function () {
  if (window.__dlalContent) return; window.__dlalContent = true;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.textContent.trim() : '');
  const num = (s) => parseFloat((String(s || '').match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
  const offerIdFrom = (u) => (String(u || '').match(/offer\/(\d+)/) || [])[1] || (String(u || '').match(/[?&]offerId=(\d+)/) || [])[1] || '';
  const cleanImg = (u) => u.replace(/\.\d+x\d+(\.\w+)$/, '$1').replace(/_\d+x\d+\w*\.jpg$/, '.jpg');

  // حجب / كابتشا / دخول
  function blocked() {
    const u = location.href, t = document.title;
    if (/punish|captcha|login\.1688|passport\.|\/verify|访问被拒绝|安全验证|滑动验证|baxia/i.test(u + ' ' + t)) return 'captcha';
    if ($('#nc_1_n1z, .nc-container, #baxia-dialog-content, .J_MIDDLEWARE_FRAME_WIDGET')) return 'captcha';
    return null;
  }

  function extractList() {
    const items = []; const seen = new Set();
    $$('a[href*="detail.1688.com/offer/"]').forEach(a => {
      const id = offerIdFrom(a.href); if (!id || seen.has(id)) return;
      const card = a.closest('[class*="card"],[class*="item"],[class*="offer"],li,div') || a;
      const img = $('img', card);
      const priceEl = $('[class*="price"]', card);
      const title = txt($('[class*="title"],[class*="subject"]', card)) || a.title || txt(a);
      if (!img || !priceEl) return;
      seen.add(id);
      items.push({ offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: title.slice(0, 200), priceCny: num(txt(priceEl)),
        images: [img.src || img.dataset.src].filter(Boolean).map(cleanImg), sales: num(txt($('[class*="sale"],[class*="sold"],[class*="deal"]', card))), minQty: 1, inStock: true, variants: [] });
    });
    return items;
  }

  function extractDetail(init) {
    const id = offerIdFrom(location.href); if (!id) return null;
    let data = init || null; try { if (!data) data = (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) || window.iDetailData || null; } catch (e) {}
    const title = txt($('h1,[class*="title-text"],[class*="offer-title"]')) || document.title;
    const images = $$('img').map(i => i.src || i.dataset.src || '').filter(u => /cbu01\.alicdn|img\.alicdn/.test(u) && !/\.gif/.test(u)).map(cleanImg).filter((u, i, a) => a.indexOf(u) === i).slice(0, 8);
    const prices = $$('[class*="price"]').map(e => num(txt(e))).filter(v => v > 0 && v < 100000);
    let priceCny = prices.length ? Math.min(...prices) : 0;
    if (!priceCny) { const m = document.documentElement.innerHTML.match(/"price":"?([\d.]+)/); if (m) priceCny = parseFloat(m[1]); }
    const variants = [];
    try {
      const skuMap = data && (data.skuModel?.skuInfoMap || data.skuInfoMap); const props = data && (data.skuModel?.skuProps || data.skuProps);
      if (skuMap && props) Object.entries(skuMap).forEach(([key, v]) => { const parts = key.split('&gt;').join('>').split('>'); variants.push({ skuId: String(v.skuId), color: props[0] ? parts[0] : null, size: props[1] ? parts[1] : null, priceCny: num(v.price || v.discountPrice), inStock: (v.canBookCount ?? 1) > 0 }); });
    } catch (e) {}
    if (!variants.length) {
      const colors = $$('[class*="sku"] [class*="prop"] [class*="value"],[class*="color-item"],[class*="prop-item"]').map(txt).filter(Boolean).slice(0, 20);
      const sizes = $$('[class*="sku-item"] [class*="name"],[class*="size-item"]').map(txt).filter(Boolean).slice(0, 20);
      colors.forEach(c => sizes.length ? sizes.forEach(s => variants.push({ color: c, size: s, inStock: true })) : variants.push({ color: c, inStock: true }));
      if (!colors.length) sizes.forEach(s => variants.push({ size: s, inStock: true }));
    }
    const minQty = num(txt($('[class*="min-order"],[class*="begin-amount"],[class*="mix-amount"]'))) || 1;
    const gone = /商品已下架|已失效|不存在|offer-not-found/.test(document.body.innerText.slice(0, 5000));
    return { offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: title.slice(0, 200), priceCny, images, variants, minQty, inStock: priceCny > 0 && !gone,
      supplier: txt($('[class*="company-name"],[class*="supplier-name"]')), sales: num(txt($('[class*="sale-count"],[class*="sold"]'))) };
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    try {
      const b = blocked();
      if (b) return reply({ blocked: b, url: location.href, title: document.title });
      if (msg.type === 'extractList') return reply({ items: extractList(), url: location.href, title: document.title });
      if (msg.type === 'extractDetail') return reply({ item: extractDetail(msg.init), url: location.href });
      reply({ error: 'unknown' });
    } catch (e) { reply({ error: e.message }); }
    return true;
  });
})();
