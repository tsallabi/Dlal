// هدهد — سكربت المحتوى: يستخرج بيانات المنتجات من صفحات 1688 عند طلب الخلفية
(function () {
  if (window.__dlalContent) return; window.__dlalContent = true;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.textContent.trim() : '');
  const num = (s) => parseFloat((String(s || '').match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
  const offerIdFrom = (u) => (String(u || '').match(/offer\/(\d+)/) || [])[1] || (String(u || '').match(/[?&]offerId=(\d+)/) || [])[1] || '';
  const cleanImg = (u) => u.replace(/\.\d+x\d+(\.\w+)$/, '$1').replace(/_\d+x\d+\w*\.jpg$/, '.jpg');

  // حجب / كابتشا / دخول — نفرّق بينها لأن العلاج مختلف تمامًا:
  // كابتشا = افتح 1688 وحلّها ثم أعد التشغيل (دقيقة واحدة).
  // طلب تسجيل دخول = صفحة المنتج لم تعد تفتح لزائر غير مسجّل، وصاحب المشروع **لا يملك
  // حسابًا صينيًا**، فلا جدوى من إعادة المحاولة — هذا تغيّر في 1688 يحتاج خطة أخرى.
  function blocked() {
    const u = location.href, t = document.title;
    // 1688 يحوّل الزائر غير المسجّل إلى login.taobao.com لا إلى نطاقه — كان يفوتنا فتعود صفحة الدخول «ok — ٠»
    if (/login\.1688|login\.taobao\.com|login\.alibaba|passport\.|member\.1688\.com\/(login|signin)|请登录|登录后查看|账号登录|密码登录/i.test(u + ' ' + t)) return 'login';
    if (/punish|captcha|\/verify|访问被拒绝|安全验证|滑动验证|baxia/i.test(u + ' ' + t)) return 'captcha';
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

  // ===== قراءة صفحة المنتج كما تظهر فعلًا بلا تسجيل دخول =====
  // مبنية على تشخيص صفحة حقيقية: لا يوجد __INIT_DATA__، العنوان في document.title،
  // السعر في عنصر نصّه يبدأ بـ Price/السعر، الصور من cbu*.alicdn.com/img/ibank،
  // والمواصفات في جدول أعمدته أزواج: مفتاح | قيمة | مفتاح | قيمة.
  const TITLE_SUFFIX = /\s*[-|]\s*(阿里巴巴|Alibaba|1688).*$/;
  const isProductImg = (u) => /\/\/cbu\d*\.alicdn\.com\/img\/ibank\//.test(u) && !/\.(svg|gif)(\?|$|_)/i.test(u);
  const normImg = (u) => u.replace(/^\/\//, 'https://').replace(/_\.webp$/i, '').replace(/\.\d+x\d+(\.\w+)$/, '$1').split('?')[0];

  function attrTable() {
    const out = {};
    $$('table tr').forEach(tr => {
      const cells = [...tr.cells].map(c => txt(c));
      for (let i = 0; i + 1 < cells.length; i += 2) if (cells[i] && cells[i + 1]) out[cells[i]] = cells[i + 1];
      if (cells.length === 1 && cells[0]) out.__last = cells[0];
    });
    // صف الوزن يأتي أحيانًا في صفّين: العنوان ثم القيمة
    const rows = $$('table tr').map(tr => [...tr.cells].map(c => txt(c)).join('|'));
    const wi = rows.findIndex(r => /^Weight|重量|净重/i.test(r));
    if (wi >= 0 && rows[wi + 1] && /^[\d.]+$/.test(rows[wi + 1])) out['Weight'] = rows[wi + 1];
    return out;
  }
  const pick = (attrs, re) => { const k = Object.keys(attrs).find(k => re.test(k)); return k ? attrs[k] : ''; };
  const splitList = (v) => String(v || '').split(/[,،;；\/]/).map(x => x.trim()).filter(x => x && x.length <= 30).slice(0, 20);

  function extractDetail(init) {
    const id = offerIdFrom(location.href); if (!id) return null;
    const data = init || null;

    const title = (document.title || '').replace(TITLE_SUFFIX, '').trim() || txt($('h1'));

    const images = $$('img').map(i => i.currentSrc || i.src || i.dataset.src || '')
      .filter(isProductImg).map(normImg).filter((u, i, a) => a.indexOf(u) === i).slice(0, 8);

    // السعر: العنصر الذي يذكر Price/السعر ثم أي ¥ في الصفحة
    let priceCny = 0;
    const priceEls = $$('[class*="price" i],[class*="Price"]').map(txt).filter(Boolean);
    for (const t of priceEls) { const m = t.match(/¥\s*([\d.]+)/); if (m) { const v = parseFloat(m[1]); if (v > 0 && v < 1e6) { priceCny = v; break; } } }
    if (!priceCny) { const m = (document.body.innerText || '').match(/¥\s*([\d.]+)/); if (m) priceCny = parseFloat(m[1]); }

    const attrs = attrTable();
    const colors = splitList(pick(attrs, /^(Color|颜色|色系)/i));
    const sizes = splitList(pick(attrs, /^(Size|尺码|尺寸|规格)/i));
    // جدول المواصفات لا يذكر الوحدة دائمًا: رقم أقل من ٥٠ كيلوغرامات، وإلا غرامات.
    // (نفس قاعدة normWeightG في الخادم — المورّد الذي يكتب 0.65 يقصد ٦٥٠ غ لا ٦٥٠ ملغ.)
    const wRaw = parseFloat(pick(attrs, /^(Weight|重量|净重)/i)) || 0;
    const weightG = wRaw > 0 && wRaw < 50 ? Math.round(wRaw * 1000) : Math.round(wRaw);

    const variants = [];
    try {   // إن وُجدت بيانات SKU في الصفحة (عند تسجيل الدخول) فهي الأدق
      const skuMap = data && (data.skuModel?.skuInfoMap || data.skuInfoMap); const props = data && (data.skuModel?.skuProps || data.skuProps);
      if (skuMap && props) Object.entries(skuMap).forEach(([key, v]) => { const parts = key.split('&gt;').join('>').split('>'); variants.push({ skuId: String(v.skuId), color: parts[0], size: parts[1], priceCny: parseFloat(v.price) || 0, inStock: (v.canBookCount ?? v.quantity ?? 1) > 0 }); });
    } catch (e) {}
    if (!variants.length) {   // بلا تسجيل دخول: نبني المتغيرات من جدول المواصفات
      if (colors.length && sizes.length) colors.forEach(c => sizes.forEach(z => variants.push({ color: c, size: z, inStock: true })));
      else if (colors.length) colors.forEach(c => variants.push({ color: c, inStock: true }));
      else sizes.forEach(z => variants.push({ size: z, inStock: true }));
    }

    const body = (document.body.innerText || '').slice(0, 20000);
    const minQty = num((body.match(/(?:起批量|Minimum order|≥)\s*([\d,]+)/) || [])[1]) || 1;
    const sales = num((body.match(/([\d.]+\s*(?:million|万)?\+?)\s*(?:pcs|tickets|件)?\s*(?:have been )?sold/i) || [])[1]) || 0;
    const gone = /商品已下架|已失效|不存在|offer-not-found|This product has been removed/i.test(body);
    const supplier = txt($('h1')) || txt($('[class*="company-name"],[class*="shop-name"],[class*="supplier"]'));

    return {
      offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: String(title).slice(0, 200),
      priceCny, images, variants, minQty, weightG: weightG || undefined,
      inStock: priceCny > 0 && !gone, supplier: String(supplier || '').slice(0, 80), sales,
      attrs,
    };
  }

  // ===== اكتشاف مجاني: روابط منتجات أخرى في صفحة المنتج =====
  // توصيات «看了又看» ومنتجات المتجر نفسه تحمل روابط detail.1688.com/offer/{id}. نلتقطها من
  // الروابط وسمات data-* ومن نصّ الصفحة (بعض الأقسام تُرسم من JSON مضمّن). لا ندري أتعرضها 1688
  // لزائر غير مسجّل — العدد الذي يصل الخادم هو الجواب، والصفر جواب أيضًا.
  function offerLinks(own) {
    const ids = new Set();
    const add = (v) => { const id = String(v || ''); if (/^\d{9,15}$/.test(id) && id !== own) ids.add(id); };
    $$('a[href]').forEach(a => add(offerIdFrom(a.getAttribute('href'))));
    $$('[data-offer-id],[data-offerid],[data-id][class*="offer" i]').forEach(e => add(e.dataset.offerId || e.dataset.offerid || e.dataset.id));
    const html = document.documentElement.innerHTML;
    for (const m of html.matchAll(/detail\.1688\.com\/offer\/(\d{9,15})/g)) add(m[1]);
    return [...ids].slice(0, 80);
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    try {
      const b = blocked();
      if (b) return reply({ blocked: b, url: location.href, title: document.title });
      if (msg.type === 'extractList') return reply({ items: extractList(), url: location.href, title: document.title });
      if (msg.type === 'extractDetail') { const item = extractDetail(msg.init); return reply({ item, links: offerLinks(item?.offerId || offerIdFrom(location.href)), url: location.href }); }
      reply({ error: 'unknown' });
    } catch (e) { reply({ error: e.message }); }
    return true;
  });
})();
