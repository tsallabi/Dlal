// دلال — سلوك الواجهة (بدون مكتبات)
(function () {
  const $ = (s, r = document) => r.querySelector(s);
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
      if (m && m.image_url) $('#mainImg').src = m.image_url;
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
