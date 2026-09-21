// تالين — سلوك الواجهة (بدون مكتبات)
(function () {
  const $ = (s, r = document) => r.querySelector(s);
// صور 1688 تمر عبر وسيط الموقع (alicdn يمنع العرض الخارجي ويجب ألا يظهر المصدر للزبونة)
const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const proxyImg = (u) => (!u ? u : /(^|\.)(alicdn\.com|1688\.com|taobao\.com|tbcdn\.cn)/i.test(u) ? '/img/' + b64url(u) : u);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // toast
  const toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast);
  const say = (m) => { toast.textContent = m; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1800); };

  // countdown
  $$('[data-countdown]').forEach(el => {
    const end = Date.now() + parseInt(el.dataset.countdown) * 3600e3;
    const tick = () => { const s = Math.max(0, Math.floor((end - Date.now()) / 1000)); el.textContent = [s / 3600, s / 60 % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
    tick(); setInterval(tick, 1000);
  });

  // wishlist toggle
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const r = await fetch('/wishlist/toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: +b.dataset.fav }) });
    if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
    const j = await r.json();
    b.classList.toggle('on', j.fav);
    b.textContent = b.classList.contains('btn') ? (j.fav ? '♥ في المفضلة' : '♡ المفضلة') : (j.fav ? '♥' : '♡');
    say(j.fav ? 'أُضيف إلى المفضلة ♥' : 'أُزيل من المفضلة');
  });

  // qty +/-
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const inp = b.parentElement.querySelector('input');
    const min = parseInt(inp.min || '1');
    inp.value = Math.max(min, (parseInt(inp.value) || min) + parseInt(b.dataset.q));
    if (inp.getAttribute('onchange')) inp.form.submit();
  });

  // gallery
  $$('[data-thumb]').forEach(t => t.addEventListener('click', () => { $('#mainImg').src = t.src; $$('[data-thumb]').forEach(x => x.classList.remove('on')); t.classList.add('on'); }));

  // variants
  const vjson = $('#variantsJson');
  if (vjson) {
    const variants = JSON.parse(vjson.textContent || '[]');
    const sel = { color: null, size: null };
    const opts = $$('[data-opt]');
    const refresh = () => {
      opts.forEach(g => {
        const k = g.dataset.opt, other = k === 'color' ? 'size' : 'color';
        $$('.chip', g).forEach(ch => {
          const ok = variants.some(v => v[k] === ch.dataset.val && (!sel[other] || v[other] === sel[other]) && v.in_stock);
          ch.classList.toggle('off', !ok);
          ch.classList.toggle('on', sel[k] === ch.dataset.val);
        });
      });
      const m = variants.find(v => (!opts.some(g => g.dataset.opt === 'color') || v.color === sel.color) && (!opts.some(g => g.dataset.opt === 'size') || v.size === sel.size));
      $('#variantId').value = m ? m.id : '';
      const cl = $('#colorLbl'); if (cl) cl.textContent = sel.color || '';
      const sl = $('#sizeLbl'); if (sl) sl.textContent = sel.size || '';
      if (m && m.image_url) $('#mainImg').src = proxyImg(m.image_url);
    };
    opts.forEach(g => $$('.chip', g).forEach(ch => ch.addEventListener('click', () => { if (ch.classList.contains('off')) return; sel[g.dataset.opt] = ch.dataset.val; refresh(); })));
    // اختيار افتراضي
    opts.forEach(g => { const first = variants.find(v => v.in_stock && v[g.dataset.opt]); if (first) sel[g.dataset.opt] = first[g.dataset.opt]; });
    refresh();
    $('#addForm')?.addEventListener('submit', (e) => {
      if (opts.length && !$('#variantId').value) { e.preventDefault(); say('اختاري اللون والمقاس أولًا'); }
    });
  }

  // "?err=unavailable"
  if (location.search.includes('err=unavailable')) say('هذا المنتج غير متوفر حاليًا');
})();

// ===== الإصدار 2 =====
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // عنوان جديد في الدفع
  const na = $('#newAddr');
  if (na) {
    const sync = () => { const sel = $('input[name=address_id]:checked'); na.classList.toggle('collapsed', !!(sel && sel.value)); };
    $$('input[name=address_id]').forEach(r => r.addEventListener('change', sync)); sync();
  }
  // انتظار تأكيد الدفع
  const pw = $('#payWait');
  if (pw) {
    let tries = 0;
    const poll = async () => {
      tries++;
      try { const j = await (await fetch('/pay/status?ref=' + encodeURIComponent(pw.dataset.ref))).json();
        if (j.status === 'paid' || j.order_status === 'paid') { location.href = '/orders/' + pw.dataset.order + '?paid=1'; return; }
        if (j.status === 'failed' || j.status === 'cancelled') { location.href = '/orders/' + pw.dataset.order + '?pay=' + j.status; return; }
      } catch {}
      $('#payMsg').textContent = tries > 20 ? 'لم يصل التأكيد بعد. إن خُصم المبلغ فسيُحدَّث الطلب تلقائيًا عند وصول التأكيد.' : 'جارٍ التحقق… (' + tries + ')';
      if (tries < 60) setTimeout(poll, 2000);
    };
    setTimeout(poll, 800);
  }
})();

// ===== بانر الرئيسية (تدوير تلقائي) =====
(function () {
  const c = document.querySelector('[data-carousel]'); if (!c) return;
  const slides = c.querySelector('.slides'), dots = [...c.querySelectorAll('[data-dot]')]; let i = 0, t;
  const go = (n) => { i = (n + dots.length) % dots.length; slides.style.transform = `translateX(${(document.dir === 'rtl' ? 1 : -1) * i * 100}%)`; dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  const auto = () => { clearInterval(t); t = setInterval(() => go(i + 1), 5000); };
  dots.forEach(d => d.addEventListener('click', () => { go(+d.dataset.dot); auto(); }));
  auto();
})();

// ===== الدردشة المباشرة: محادثة واحدة مع خدمة الزبائن، ومحادثة لكل طلب =====
(function () {
  const fab = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  if (!fab || !panel) return;
  const body = document.getElementById('chatBody');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sub = document.getElementById('chatSub');
  const dot = document.getElementById('chatDot');
  let lastId = 0, timer = null, order = null, opened = false;

  const fmtTime = (iso) => { try { return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('ar-LY', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };
  const add = (m) => {
    const el = document.createElement('div');
    el.className = 'ch-msg ' + (m.is_staff ? 'staff' : 'me');
    el.textContent = m.body;
    const t = document.createElement('time'); t.textContent = (m.is_staff ? 'خدمة الزبائن · ' : '') + fmtTime(m.created_at);
    el.appendChild(t); body.appendChild(el); body.scrollTop = body.scrollHeight;
  };
  async function poll(first) {
    try {
      const r = await fetch('/api/chat?since=' + lastId + (order ? '&order=' + encodeURIComponent(order) : ''));
      const d = await r.json();
      if (d.needLogin) { sub.textContent = 'سجّلي الدخول لبدء المحادثة'; return; }
      if (d.ticket) sub.textContent = 'رقم المحادثة ' + d.ticket.code;
      if (d.messages && d.messages.length) {
        const empty = body.querySelector('.ch-empty'); if (empty) empty.remove();
        d.messages.forEach(m => { add(m); lastId = Math.max(lastId, m.id); });
        if (!opened && d.messages.some(m => m.is_staff)) dot.hidden = false;
      }
      if (first && !d.messages?.length) sub.textContent = d.ticket ? sub.textContent : 'نرد خلال ساعات العمل';
    } catch (e) {}
  }
  function open() {
    panel.hidden = false; opened = true; dot.hidden = true;
    input.focus(); poll(true);
    if (!timer) timer = setInterval(poll, 8000);
  }
  function close() { panel.hidden = true; if (timer) { clearInterval(timer); timer = null; } }
  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panel.hidden ? open() : close(); } });
  document.getElementById('chatClose').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: text, order }) });
    if (r.status === 401) { sub.textContent = 'سجّلي الدخول أولًا'; location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
    await poll();
  });
  // زر «راسلنا عن هذا الطلب» في صفحة الطلب يفتح المحادثة مربوطة بالطلب
  document.querySelectorAll('[data-chat-order]').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault(); order = b.getAttribute('data-chat-order'); lastId = 0; body.innerHTML = '';
    if (panel.hidden) open(); else poll(true);
  }));
  // إشعار بردود جديدة حتى والنافذة مغلقة
  setInterval(() => { if (panel.hidden) poll(); }, 45000);
})();

// ===== شريط الأقسام: القائمة الكبيرة والأسهم =====
(function () {
  const btn = document.getElementById('allCats');
  const mega = document.getElementById('megaMenu');
  const row = document.getElementById('catsRow');
  if (btn && mega) {
    const close = () => { mega.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = mega.hidden;
      mega.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!mega.hidden && !mega.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    mega.querySelectorAll('[data-mega]').forEach(b => {
      const show = () => {
        mega.querySelectorAll('[data-mega]').forEach(x => x.classList.toggle('on', x === b));
        const slug = b.getAttribute('data-mega');
        mega.querySelectorAll('.mega-panel').forEach(p => p.classList.toggle('on', p.getAttribute('data-panel') === slug));
      };
      b.addEventListener('mouseenter', show);
      b.addEventListener('click', show);
    });
  }
  if (row) {
    // في RTL يسير scrollLeft بالسالب، فاتجاه السهم معكوس
    const rtl = getComputedStyle(row).direction === 'rtl';
    document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
      const dir = Number(b.getAttribute('data-nav')) * (rtl ? -1 : 1);
      row.scrollBy({ left: dir * 240, behavior: 'smooth' });
    }));
  }
})();

// ===== زر + على بطاقة المنتج: يضيف للسلة بلا مغادرة الصفحة =====
(function () {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const id = b.getAttribute('data-add');
    b.disabled = true; const old = b.textContent; b.textContent = '…';
    try {
      const r = await fetch('/cart/add', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ product_id: id, qty: '1', quick: '1' }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.needVariant) { location.href = '/p/' + d.slug; return; }
      b.textContent = '✓';
      const c = document.querySelector('.hdr-icons a[href="/cart"] b');
      if (d.count != null) { if (c) c.textContent = d.count; else { const a = document.querySelector('.hdr-icons a[href="/cart"]'); if (a) a.insertAdjacentHTML('beforeend', `<b>${d.count}</b>`); } }
      const n = document.querySelector('.bottom-nav a[href="/cart"] .dot');
      if (n && d.count != null) n.textContent = d.count;
      setTimeout(() => { b.textContent = old; b.disabled = false; }, 1200);
    } catch { b.textContent = old; b.disabled = false; }
  });
})();
