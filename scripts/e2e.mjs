// تجربة حقيقية على الشاشة (Playwright) — الإصدار 2
// زبونة (كوبون + ماي باي) → أدمن → موظف شاهين → تسليم → نقاط وتقييم وتذكرة → مراجعة الأدمن → الأدوار والصلاحيات → دفع فاشل وإلغاء → جوال
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || './shots';
mkdirSync(OUT, { recursive: true });
const problems = [];
const PHONE = '09' + String(Date.now()).slice(-8);
let n = 0;
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: false }); };
let passed = 0;
const expect = (cond, msg) => { if (!cond) { problems.push(msg); console.log('❌', msg); } else { passed++; console.log('✅', msg); } };
const has = async (page, t) => (await page.content()).includes(t);
// الأرقام إنجليزية (en-US): الفاصلة للآلاف والنقطة للعشور «1,234.5 د.ل». و«د.ل» فيها نقطة تُربك أي تنظيف أعمى: نأخذ أول رقم فقط
const num = (t) => {
  const m = String(t).match(/\d[\d,]*(\.\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0].replace(/,/g, ''));
};
const login = async (page, phone, pw) => { await page.goto(BASE + '/logout'); await page.goto(BASE + '/login'); await page.fill('input[name=phone]', phone); await page.fill('input[name=password]', pw); await page.click('button:has-text("دخول")'); await page.waitForLoadState('networkidle'); };

// المتصفح: نسخة Playwright المثبّتة على الجهاز (ويندوز/ماك) أو نسخة الخادم إن وُجدت. PW_CHROMIUM يتقدّم عليهما.
// node scripts/e2e.mjs --headed  ← لمشاهدة الاختبار وهو يضغط ويتنقّل على الشاشة
const HEADED = process.argv.includes('--headed');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const exePath = process.env.PW_CHROMIUM || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
let browser;
try {
  browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 350 : 0, ...(exePath ? { executablePath: exePath } : {}) });
} catch (e) {
  console.error('\n✖ تعذّر فتح المتصفح. ثبّته مرة واحدة بالأمر:  npx playwright install chromium\n' + e.message);
  process.exit(1);
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar' });
const page = await ctx.newPage();
page.on('pageerror', e => problems.push('JS error: ' + e.message));
page.on('response', r => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });

// ---------- الحد الأدنى للمورّد: يُفرض في السلة أيضًا لا عند الإضافة فقط ----------
// وجده صاحب المشروع على الموقع الحي: قطعة أقلّها 100 عند المورّد، والسلة قبلت 1.
// أثره مال حقيقي: نشتري 100 من 1688 ونبيع واحدة.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
// sameProduct يرفض أي عنوان أقل من أربع كلمات، فنُبقي كل عيّنة عند ثلاث كلمات أو أقل:
// تشغيلة سابقة تترك عيّنتها في القاعدة، وعنوان مطابق في ثلاث كلمات من أربع يُعدّ «توأمًا»
// فيُتجاهل الاستيراد بصمت ويسقط الفحص لسبب لا علاقة له به.
// أرقام لا حروف لاتينية: «تku498» حرف عربي ملتصق بلاتيني = عنوان «مكسور» في نظر mixedScript،
// فكانت كل تشغيلة تترك ٧ عناوين مكسورة حتى بلغت ٢١١ وأزاحت عيّنة فحص الكنس خارج دفعته (٢٤/٠٩/٢٦)
const uniqTag = () => 'ت' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const moqOffer = '65' + String(Date.now()).slice(-10);
const moqTag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: moqOffer, url: `https://detail.1688.com/offer/${moqOffer}.html`, title: `قطعة جملة ${moqTag}`,
  priceCny: 3, images: ['https://cbu01.alicdn.com/img/ibank/moq.jpg'], minQty: 100, inStock: true, weightG: 120,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?q=' + moqOffer);
// اللوط يدخل مخفيًا الآن (أقل طلب 100 ≥ الحد الفاصل): هذا هو السلوك المقصود.
// صاحب المشروع يراجع المخفي ويُعيد ما يريد بيعه لوطًا — وهذا ما نفعله هنا قبل فحص العرض.
const moqAdmin = await page.locator(`tr:has-text("${moqOffer}") a[href^="/admin/products/"]`).first().getAttribute('href');
expect((await page.locator(`tr:has-text("${moqOffer}")`).first().textContent()).includes('hidden'), 'اللوط يدخل مخفيًا لا نشطًا');
await page.goto(BASE + moqAdmin);
await page.selectOption('select[name=status]', 'active');
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
expect(await page.locator('select[name=status]').inputValue() === 'active', 'الأدمن أعاد اللوط للرف بنفسه');
await page.goto(BASE + '/admin/products?q=' + moqOffer);
const moqHref = await page.locator(`tr:has-text("${moqOffer}") a[href^="/p/"]`).first().getAttribute('href');
await login(page, '0910000000', 'admin123');
await page.goto(BASE + moqHref);
expect(await has(page, 'أقل طلب'), 'صفحة المنتج تقول إنه يُباع بالكمية وتذكر الإجمالي');
const moqTotal = (await page.locator('.moq-note').textContent()).replace(/\s+/g, ' ');
expect(/100 قطعة/.test(moqTotal), `تنبيه الحد الأدنى يذكر العدد (${moqTotal.slice(0, 70)})`);
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
const moqRow = page.locator('.cart-row', { hasText: moqTag }).first();
expect((await moqRow.locator('input[name=qty]').first().inputValue()) === '100', 'السلة تبدأ بالحد الأدنى 100');
// الزبونة تحاول إنزالها إلى 1 — يجب أن تعود إلى 100
// لا يوجد زر «تحديث»: الحقل يُرسل النموذج عند تغيّره (onchange) — نفعل ما تفعله الزبونة
const moqInput = moqRow.locator('input[name=qty]').first();
await moqInput.fill('1');
// النموذج يُرسل عند التغيّر فيحدث انتقال؛ ننتظر الانتقال نفسه لا «شبكة هادئة»
// (الأخيرة قد تتحقق على الصفحة القديمة قبل أن يبدأ الإرسال فنقرأ قيمة قديمة)
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), moqInput.dispatchEvent('change')]);
const afterQty = await page.locator('.cart-row', { hasText: moqTag }).first().locator('input[name=qty]').first().inputValue();
expect(afterQty === '100', `السلة ترفض النزول تحت الحد الأدنى (${afterQty})`);
await page.locator('.cart-row', { hasText: moqTag }).first().locator('button:has-text("حذف")').first().click();
await page.waitForLoadState('networkidle');

// ---------- أداة الجملة: إخفاء وإظهار دفعةً واحدة، عكسيّة تمامًا ----------
// 303 قطع نشطة حدّها الأدنى 10 فأكثر على الموقع الحي. القرار تجاري لصاحب المشروع،
// فالأداة تُعطى له ولا يُقرَّر عنه — لكن يجب أن تعمل ذهابًا وإيابًا بلا خسارة.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/products?moq=10');
expect(await has(page, moqOffer), 'فلتر «أقل طلب ≥ 10» يُظهر قطعة الجملة');
await page.fill('form[action$="/products/wholesale"] input[name=min]', '100');
await page.uncheck('form[action$="/products/wholesale"] input[name=pack]');
await page.locator('form[action$="/products/wholesale"] button:has-text("أخفِها")').click();
await page.waitForLoadState('networkidle');
expect(await has(page, 'أُخفيت'), 'اللوحة تقول كم قطعة أُخفيت');
await page.goto(BASE + '/admin/products?q=' + moqOffer);
expect(await has(page, 'hidden'), 'قطعة الجملة صارت مخفية');
await page.goto(BASE + '/logout');
const hid = await page.goto(BASE + moqHref);
expect(hid.status() === 404, `الزبونة لا تفتح صفحة القطعة المخفية (${hid.status()})`);
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/products?moq=10');
await page.fill('form[action$="/products/wholesale"] input[name=min]', '100');
await page.uncheck('form[action$="/products/wholesale"] input[name=pack]');
await page.locator('form[action$="/products/wholesale"] button:has-text("أعِدها")').click();
await page.waitForLoadState('networkidle');
expect(await has(page, 'أُعيدت للمتجر'), 'اللوحة تقول كم قطعة عادت');
// «أعِدها» بحدّ 100 يشمل أيضًا عيّنة مصنع التغليف (200 قطعة) التي تركتها تشغيلة سابقة،
// فتعود بعنوانها الصيني إلى الرف ويسقط فحص «لا عنوان صيني ظاهر». نُعيد إخفاء التغليف وحده:
// حدّ مستحيل + صندوق التغليف مؤشّر ⟵ الشرط يطابق إعلانات التغليف فقط ولا يمسّ غيرها.
await page.fill('form[action$="/products/wholesale"] input[name=min]', '999999');
await page.check('form[action$="/products/wholesale"] input[name=pack]');
await page.locator('form[action$="/products/wholesale"] button:has-text("أخفِها")').click();
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/logout');
const back = await page.goto(BASE + moqHref);
expect(back.status() === 200, `القطعة عادت للمتجر بعد الإظهار (${back.status()})`);

// ---------- رأس عمود جدول المواصفات لا يصير زرّ مقاس على الرف ----------
// صاحب المشروع فتح كيسًا فوجد «اللون: سمك مزدوج» و«المقاس: المقاس» — الثاني اسم العمود
// نفسه التقطه القارئ من رأس الجدول. 13 منتجًا حيًا في 22/09/26.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
const attrOffer = '66' + String(Date.now()).slice(-10); const attrTag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: attrOffer, url: `https://detail.1688.com/offer/${attrOffer}.html`, title: `أعمدة ${attrTag}`,
  priceCny: 5, images: ['https://cbu01.alicdn.com/img/ibank/attr.jpg'], minQty: 1, inStock: true, weightG: 200,
  variants: [{ color: '颜色', size: '尺码' }, { color: 'اللون', size: 'المقاس' }, { color: 'أحمر', size: 'XL' }],
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?q=' + attrOffer);
const attrHref = await page.locator(`tr:has-text("${attrOffer}") a[href^="/p/"]`).first().getAttribute('href');
await page.goto(BASE + '/logout');
await page.goto(BASE + attrHref);
const sizeChips = await page.locator('.chips[data-opt=size] .chip').allTextContents();
const colorChips = await page.locator('.chips[data-opt=color] .chip').allTextContents();
expect(sizeChips.join('،') === 'XL', `زرّ المقاس الوحيد هو المقاس الحقيقي (${sizeChips.join('،') || 'لا شيء'})`);
expect(colorChips.join('،') === 'أحمر', `زرّ اللون الوحيد هو اللون الحقيقي (${colorChips.join('،') || 'لا شيء'})`);
expect(!sizeChips.includes('المقاس') && !colorChips.includes('اللون'), 'لا زرّ اسمه «المقاس» ولا «اللون»');
expect(!sizeChips.includes('尺码') && !colorChips.includes('颜色'), 'ولا رأس عمود صيني');
await shot(page, 'variant-headers-clean');

// ---------- إعلان مصنع تغليف لا يصل الرف أصلًا ----------
// «صندوق هدايا للهواتف والسماعات» بأقل طلب 200: المورّد مصنع علب (包装/印刷) يبيع العلبة
// الفارغة والسماعات في الصورة محتوى توضيحي. 96 إعلانًا كهذا دخل المتجر كأنه منتج.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
const packOffer = '67' + String(Date.now()).slice(-10); const packTag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: packOffer, url: `https://detail.1688.com/offer/${packOffer}.html`,
  title: `包装盒 ${packTag}`,                      // «علبة تغليف» — كلمتان فقط فلا تصطدم بعيّنة تشغيلة سابقة
  descriptionAr: 'صندوق هدايا', priceCny: 5, images: ['https://cbu01.alicdn.com/img/ibank/pack.jpg'],
  minQty: 200, inStock: true, weightG: 120,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?q=' + packOffer);
const packRow = page.locator(`tr:has-text("${packOffer}")`).first();
expect((await packRow.textContent()).includes('hidden'), 'إعلان مصنع التغليف يدخل مخفيًا لا نشطًا');
const packHref = await packRow.locator('a[href^="/p/"]').first().getAttribute('href');
await page.goto(BASE + '/logout');
const packRes = await page.goto(BASE + packHref);
expect(packRes.status() === 404, `الزبونة لا ترى إعلان مصنع التغليف (${packRes.status()})`);
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/products?pack=1');
expect(await has(page, packOffer), 'فلتر «إعلانات التغليف» يجمعها للمراجعة');

// ---------- «ماذا أستلم بالضبط؟» — توضيح لا إخفاء ----------
// صاحب المشروع رفض إخفاء الآلات وحوامل العرض والقماش وطلب شرحها (22/09/26).
// حامل العرض يصل فارغًا والبضاعة في صورته للتوضيح — يجب أن تقرأ الزبونة ذلك قبل الشراء.
await page.goto(BASE + '/admin/import');
const rackOffer = '68' + String(Date.now()).slice(-10); const rackTag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: rackOffer, url: `https://detail.1688.com/offer/${rackOffer}.html`,
  title: `展示架 ${rackTag}`,                      // «حامل عرض» — كلمتان فقط فلا تصطدم بعيّنة سابقة
  priceCny: 40, images: ['https://cbu01.alicdn.com/img/ibank/rack.jpg'], minQty: 1, inStock: true, weightG: 900,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?q=' + rackOffer);
const rackAdmin = await page.locator(`tr:has-text("${rackOffer}") a[href^="/admin/products/"]`).first().getAttribute('href');
// النسخة المحلية بلا Workers AI فيبقى العنوان صينيًا ومحجوزًا مسودة — نعرّبه كما تفعل الترجمة على الحي
await page.goto(BASE + rackAdmin);
await page.fill('input[name=title_ar]', `حامل عرض أكسسوارات ${rackTag}`);
await page.selectOption('select[name=status]', 'active');
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
const rackSlug = await page.locator('a:has-text("معاينة")').first().getAttribute('href');
await page.goto(BASE + '/logout');
await page.goto(BASE + rackSlug);
const kindNote = await page.locator('.kind-note').first().textContent().catch(() => '');
expect(/حامل عرض/.test(kindNote), `صفحة المنتج تقول ما هو (${(kindNote || 'لا يوجد سطر').slice(0, 45)})`);
expect(/يصلكِ الحامل وحده فارغًا/.test(kindNote), 'وتقول صراحةً إن البضاعة في الصورة للتوضيح فقط');
expect(await has(page, 'يصلكِ الحامل وحده فارغًا'), 'والوصف التلقائي يكرّرها لمن يقرأ الوصف');
await shot(page, 'kind-note-rack');
// وعلى البطاقة في القسم: شارة تقول ما هو قبل أن تضغط
await page.goto(BASE + '/search?q=' + encodeURIComponent(rackTag));
const tag = await page.locator('.card .kind-tag').first().textContent().catch(() => '');
expect(tag.trim() === 'حامل عرض', `بطاقة القسم تحمل الشارة (${tag || 'لا شارة'})`);

// ---------- ترجمة سليمة نحويًا لكنها ليست ترجمة العنوان ----------
// خمسة عناوين حية كانت «الوسومالوسومالوسوم…» (شُعيرات، أقراط، دمبل، أحمرا شفاه):
// تكرار بلا مسافة واحدة مرّ من حارس التكرار القديم لأنه يقسّم على المسافات ولا مسافة هنا.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
const brokOffer = '69' + String(Date.now()).slice(-10); const brokTag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: brokOffer, url: `https://detail.1688.com/offer/${brokOffer}.html`,
  title: 'الوسومالوسومالوسومالوسومالوسومالوسوم' + brokTag,
  priceCny: 9, images: ['https://cbu01.alicdn.com/img/ibank/brok.jpg'], minQty: 1, inStock: true, weightG: 150,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?broken=1');
expect(await has(page, brokOffer), 'فلتر الترجمات المكسورة يجمعها للمراجعة');
expect(await has(page, 'ترجمتُه مكسورة'), 'اللوحة تنبّه بعددها فوق القائمة');
await shot(page, 'broken-titles');
// ولا يلتقط السليم: نستورد عنوانًا عربيًا سليمًا ونتأكد أنه خارج الفلتر
const okOffer = '70' + String(Date.now()).slice(-10); const okTag = uniqTag();
await page.goto(BASE + '/admin/import');
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: okOffer, url: `https://detail.1688.com/offer/${okOffer}.html`, title: `عباءة سوداء ${okTag}`,
  priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/ok.jpg'], minQty: 1, inStock: true, weightG: 400,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?broken=1');
expect(!(await has(page, okOffer)), 'العنوان العربي السليم لا يقع في الفلتر');
// تفتيش الكتالوج كله يجري على الخادم ويعيد أعدادًا وعيّنات — قراءة فقط بلا كريدت
const audit = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/source/audit', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: '{}' });
  return r.json();
}, BASE);
expect(audit.scanned > 0, `التفتيش يمرّ على الكتالوج كله (${audit.scanned} عنوانًا)`);
const foundRepeat = Object.entries(audit.findings ?? {}).find(([k]) => /مكرّرة بلا مسافات/.test(k));
expect(!!foundRepeat && foundRepeat[1].n >= 1, `التفتيش يجد العنوان المكرّر الملتصق (${foundRepeat?.[1]?.n ?? 0})`);
expect((foundRepeat?.[1]?.ex ?? []).some(x => x.includes('الوسوم')), 'ويعرض عيّنة منه ليراها صاحب المشروع');
// وبوضع «fix» يضع علامة إعادة الترجمة فيتصدّرون الطابور في الدفعة التالية
const auditFix = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/source/audit', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: JSON.stringify({ fix: true }) });
  return r.json();
}, BASE);
expect(auditFix.flaggedForRetranslation >= 1, `التفتيش يسم ما وجده لإعادة الترجمة (${auditFix.flaggedForRetranslation})`);
expect(auditFix.flaggedForRetranslation === auditFix.wouldFlag, `يسم كل ما وجده لا بعضه (${auditFix.flaggedForRetranslation}/${auditFix.wouldFlag})`);

// ---------- شروط البداية: الفحص يضبطها ولا يرثها ----------
// تشغيلة سابقة قد تنهار وهي في وضع «حقيقي» مشيرة إلى خادم وهمي مغلق، فتسقط فحوص الدفع
// في التشغيلة التالية لسبب لا علاقة له بها. حدث هذا ثلاث مرات في 22/09/26.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/payments');
await page.selectOption('select[name=mypay_mode]', 'mock');
await page.fill('input[name=mypay_base_url]', 'https://mypay.ly');
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
expect(await has(page, 'محاكاة'), 'الفحص يبدأ ببوابة دفع في وضع المحاكاة');
await page.goto(BASE + '/logout');

// ---------- الزبونة: تصفح ----------
await page.goto(BASE + '/');
expect((await page.locator('.card').count()) >= 20, 'الرئيسية تعرض شبكة منتجات');
expect((await page.locator('.tiles .tile').count()) >= 12, 'الرئيسية تعرض بلاطات الأقسام الدائرية');
expect(await page.locator('.promo-hero .ph-item').count() > 0, 'البانر الترويجي يعرض منتجات بأسعارها');
expect((await page.locator('.duo .duo-card').count()) === 2, 'بطاقتا «أرخص الأسعار» و«الأكثر رواجًا» جنبًا إلى جنب');
expect((await page.locator('.trust > div').count()) === 4, 'شريط الثقة فيه أربع ضمانات');
expect(await has(page, 'اختيارات لك'), 'الشبكة الرئيسية معنونة');
expect((await page.locator('.card .unavail').count()) === 0, 'لا منتجات غير متوفرة على الرئيسية');
// البلاطات لا تمرّ إلا إذا تجاوزت عرض الشاشة — نضيّق النافذة لنفرض ذلك ثم نختبر السهم
await page.setViewportSize({ width: 900, height: 900 });
await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
const overflow = await page.evaluate(() => { const r = document.getElementById('catTiles'); return r.scrollWidth - r.clientWidth; });
expect(overflow > 100, `بلاطات الأقسام تتجاوز العرض فتحتاج تمريرًا (${overflow}px)`);
const tilesX = await page.evaluate(() => document.getElementById('catTiles').scrollLeft);
await page.click('[data-tiles="1"]'); await page.waitForTimeout(700);
const tilesX2 = await page.evaluate(() => document.getElementById('catTiles').scrollLeft);
expect(Math.abs(tilesX2 - tilesX) > 50, `سهم البلاطات يمرّرها (${tilesX} → ${tilesX2})`);
await page.setViewportSize({ width: 1280, height: 860 });
await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
// الاسم صار «هدهدي» وسطر «بوابتك إلى الصين» عاد تحته (قرار صاحب المشروع بعد شراء hudhude.com)
expect(await page.locator('.hdr-main .logo u').textContent() === 'بوابتك إلى الصين' && await page.locator('.hdr-main .logo b em').count() === 0, 'الشعار: «هدهدي» وتحته «بوابتك إلى الصين»');
// طوابق الأقسام: كل طابق شريط أفقي يمرَّر وله رابط إلى قسمه
const floors = await page.locator('.floor').count();
expect(floors >= 4, `الرئيسية تعرض ${floors} طوابق أقسام`);
const fl = page.locator('.floor').first();
expect((await fl.locator('.card').count()) >= 4, 'الطابق يعرض أربع بطاقات فأكثر');
const flHref = await fl.locator('.feed-h .all').getAttribute('href');
expect(flHref.startsWith('/c/'), 'رابط «عرض القسم» يفتح القسم نفسه');
// على شاشة ضيقة يجب أن يفيض الشريط فيُمرَّر — على الشاشة العريضة تتسع البطاقات فلا فيض وهذا صحيح
await page.setViewportSize({ width: 700, height: 900 });
const scrollable = await page.locator('.floor .floor-row').first().evaluate(el => el.scrollWidth - el.clientWidth);
expect(scrollable > 50, `شريط الطابق يفيض على شاشة الجوال فيُمرَّر (${scrollable}px)`);
await page.setViewportSize({ width: 1280, height: 860 });
await page.goto(BASE + '/'); await page.waitForLoadState('networkidle');
await fl.locator('.feed-h .all').click(); await page.waitForLoadState('networkidle');
expect(page.url().includes(flHref), 'الضغط على «عرض القسم» ينقل فعلًا إلى صفحة القسم');
await page.goto(BASE + '/');
// لا نص صيني أمام الزبونة في أي صفحة تصفّح
const SHOPPER_PAGES = ['/', '/c/dresses', '/c/bags', '/new', '/sale', '/search?q=%D9%81%D8%B3%D8%AA%D8%A7%D9%86'];
for (const path of SHOPPER_PAGES) {
  await page.goto(BASE + path);
  const cjk = ((await page.locator('body').textContent()).match(/[一-鿿]/g) || []).join('');
  expect(!cjk, `${path} بلا نص صيني${cjk ? ` (وجدنا «${cjk.slice(0, 20)}»)` : ''}`);
}
await page.goto(BASE + '/');
await shot(page, 'home');
await page.click('.cats a:has-text("فساتين")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/c/dresses'), 'الضغط على قسم فساتين يفتح صفحة القسم');
await page.click('.fsizes a:has-text("M")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('size=M'), 'فلتر المقاس يعمل');
await page.click('.sortbar a:has-text("السعر: من الأقل")'); await page.waitForLoadState('networkidle');
const prices = (await page.$$eval('.card .p', els => els.map(e => { const c = e.cloneNode(true); c.querySelectorAll('s').forEach(n => n.remove()); return c.textContent; }))).map(num);
expect(prices.every((v, i) => i === 0 || v >= prices[i - 1]), 'الترتيب بالسعر تصاعدي صحيح');
await page.fill('.search input', 'حقيبة'); await page.press('.search input', 'Enter'); await page.waitForLoadState('networkidle');
expect((await page.locator('.card').count()) >= 3, 'البحث عن "حقيبة" يعيد نتائج');
// البحث بكلمتين لا يشترط ترتيبهما ولا يرتبك بـ «ال» التعريف
const nFound = async (q) => { await page.goto(BASE + '/search?q=' + encodeURIComponent(q)); return page.locator('.card').count(); };
const nOne = await nFound('فستان');
const nTwo = await nFound('فستان سهرة');
const nRev = await nFound('سهرة فستان');
const nAl = await nFound('الفستان');
expect(nTwo > 0 && nTwo === nRev, `«فستان سهرة» و«سهرة فستان» نتيجة واحدة (${nTwo} = ${nRev})`);
expect(nTwo <= nOne, `كلمتان تضيّقان النتيجة (${nTwo} ≤ ${nOne})`);
expect(nAl === nOne, `«الفستان» = «فستان» (${nAl} = ${nOne})`);
// افتح أول منتج في القسم يملك ألوانًا ومقاسات (المنتجات المستوردة حديثًا قد تكون بلا متغيرات بعد)
async function openProductWithVariants(cat = 'dresses') {
  await page.goto(BASE + '/c/' + cat);
  const n = Math.min(await page.locator('.card').count(), 8);
  for (let i = 0; i < n; i++) {
    await page.goto(BASE + '/c/' + cat);
    await page.locator('.card').nth(i).click();
    await page.waitForLoadState('networkidle');
    if (await page.locator('.chips[data-opt=color] .chip:not(.off)').count() && await page.locator('.chips[data-opt=size] .chip:not(.off)').count()) return true;
  }
  return false;
}
expect(await openProductWithVariants(), 'يوجد منتج بألوان ومقاسات في قسم فساتين');
expect(await page.locator('.pd h1').isVisible(), 'صفحة المنتج تفتح');
expect(await has(page, 'التقييمات ('), 'صفحة المنتج تعرض قسم التقييمات');
expect(!(await has(page, 'detail.1688.com')), 'رابط المصدر مخفي عن الزبونة');
const productSlug = page.url().split('/p/')[1];
// طريقة الشحن داخل صفحة المنتج: السعر والمدة يتغيران فعلًا بالنقر
const airShown = num(await page.locator('.price').first().textContent());
const airDays = (await page.locator('.trust > div').first().textContent()).trim();
expect((await page.locator('.pship label').count()) === 2, 'صفحة المنتج تعرض خياري الشحن جوي وبحري');
await page.locator('.pship label').nth(1).click(); await page.waitForLoadState('networkidle');
const seaShown = num(await page.locator('.price').first().textContent());
const seaDays = (await page.locator('.trust > div').first().textContent()).trim();
expect(seaShown < airShown, `سعر المنتج البحري أقل من الجوي (${seaShown} < ${airShown})`);
expect(seaDays !== airDays && seaDays.includes('بحري'), 'بطاقة الشحن تعرض مدة الشحن البحري بعد الاختيار');
expect(await page.locator('.pship label').nth(1).getAttribute('class') === 'on', 'الخيار البحري يبقى محددًا بعد إعادة التحميل');
await shot(page, 'product-sea');
// الاختيار يسري على كل الشبكة: البطاقة تعرض سعر البحري ومدّته والبديل الجوي
await page.goto(BASE + '/c/dresses');
const c1 = page.locator('.card').first();
expect((await c1.locator('.ship').first().textContent()).includes('بحري'), 'بطاقة القسم تعرض المدة البحرية بعد اختيار البحري');
expect((await c1.locator('.ship.sea').first().textContent()).includes('جوي'), 'البطاقة تعرض البديل الجوي بسعره');
const cardSea = num(await c1.locator('.buy .p').first().textContent());
expect((await page.locator('.card .best-pill').count()) <= 1, `شارة «الأكثر مبيعًا» لبطاقة واحدة في القسم (${await page.locator('.card .best-pill').count()})`);
await page.goto(BASE + '/p/' + productSlug);
await page.locator('.pship label').nth(0).click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/c/dresses');
const cardAir = num(await page.locator('.card').first().locator('.buy .p').first().textContent());
expect(cardAir > cardSea, `سعر البطاقة يرتفع بالعودة للجوي (${cardSea} → ${cardAir})`);
await page.goto(BASE + '/p/' + productSlug);
expect(num(await page.locator('.price').first().textContent()) === airShown, 'العودة للجوي تعيد السعر الأصلي');
expect(!(await has(page, 'لا يوجد وصف')), 'كل منتج له وصف عربي ولو لم يصل معه وصف من المصدر');
await shot(page, 'product');
await page.goto(BASE + '/'); expect(await has(page, 'شاهدتِ مؤخرًا'), 'الرئيسية تعرض "شاهدتِ مؤخرًا" بعد زيارة منتج');
await page.goto(BASE + '/p/' + productSlug);
await page.click('.chips[data-opt=color] .chip:not(.off) >> nth=0'); await page.click('.chips[data-opt=size] .chip:not(.off) >> nth=0');
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/login'), 'إضافة للسلة بدون دخول تحوّل لصفحة الدخول');

// تسجيل
await page.click('a:has-text("أنشئي حسابًا")');
await page.fill('input[name=name]', 'منى التجريبية'); await page.fill('input[name=phone]', PHONE); await page.fill('input[name=password]', 'secret123');
await page.click('button:has-text("إنشاء الحساب")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/p/'), 'بعد التسجيل يعود لصفحة المنتج');
await page.click('.chips[data-opt=color] .chip:not(.off) >> nth=0'); await page.click('.chips[data-opt=size] .chip:not(.off) >> nth=0');
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
expect((await page.locator('.cart-row').count()) === 1, 'أضيف للسلة');
// طرق الدفع: الخياران القديمان مخفيان، والدفع نقدًا في الفرع معروض بعناوين الفروع
await page.goto(BASE + '/checkout');
expect(!(await has(page, 'عربون 30%')) && !(await has(page, 'تحويل مصرفي / إيصال')), 'خيارا التحويل والعربون مخفيان من الدفع');
expect(await has(page, 'دفع كاش في أقرب فرع'), 'خيار الدفع نقدًا في الفرع معروض');
expect((await has(page, 'الفرناج')) && (await has(page, 'بنغازي')), 'عناوين الفروع تظهر في صفحة الدفع');
await page.goto(BASE + '/c/bags'); await page.click('.card .fav >> nth=0'); await page.waitForTimeout(400);
await page.goto(BASE + '/wishlist'); expect((await page.locator('.card').count()) === 1, 'المفضلة تحفظ المنتج');
await page.goto(BASE + '/c/bags'); await page.click('.card >> nth=1'); await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
expect((await page.locator('.cart-row').count()) === 2, 'السلة فيها منتجان');
// كوبون
await page.fill('.coupon-box input[name=code]', 'BADCODE'); await page.click('.coupon-box button:has-text("تطبيق")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'الكوبون غير صالح'), 'كوبون خاطئ يُرفض برسالة');
await page.fill('.coupon-box input[name=code]', 'welcome10'); await page.click('.coupon-box button:has-text("تطبيق")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'WELCOME10'), 'كوبون WELCOME10 يُطبَّق (بغض النظر عن حالة الأحرف)');
expect(await has(page, 'خصم الكوبون'), 'الملخص يعرض سطر الخصم');
await shot(page, 'cart-coupon');

// ---------- الدفع بماي باي ----------
await page.click('a:has-text("إتمام الطلب")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/checkout'), 'صفحة إتمام الطلب');
expect((await page.locator('.pm-list .radio').count()) >= 5, 'صفحة الدفع تعرض وسائل ماي باي واليدوية');
await page.selectOption('select[name=city]', 'بنغازي'); await page.fill('textarea[name=address]', 'شارع جمال عبد الناصر، عمارة 5');
await page.check('input[value=mypay_moamalat]');
await shot(page, 'checkout');
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/pay/mock/'), 'بعد التأكيد تُحوَّل الزبونة لصفحة الدفع (ماي باي)');
expect(await has(page, 'MyPay'), 'صفحة البوابة تعرض المبلغ والمرجع');
const trxRef = (await page.locator('.mock-body .mono').textContent()).trim();
const orderCode = trxRef.match(/DL-\d{4}-\d{6}/)[0];
await shot(page, 'mypay-hosted');
await page.click('button:has-text("تأكيد الدفع")');
await page.waitForURL(/paid=1/, { timeout: 30000 }).catch(() => {});
expect(page.url().includes('paid=1'), 'بعد الدفع تعود الزبونة لصفحة الطلب مع تأكيد');
expect(await has(page, 'مدفوع — بانتظار الشراء'), 'الويبهوك حوّل الطلب إلى "مدفوع" تلقائيًا بدون تدخل الأدمن');
expect(await has(page, 'مدفوع عبر'), 'صفحة الطلب تعرض بطاقة الدفع الناجح');
expect(await has(page, 'WELCOME10'), 'ملخص الطلب يعرض الكوبون المستخدم');
await shot(page, 'order-paid');
// ويبهوك بتوقيع خاطئ يُرفض
const bad = await ctx.request.post(BASE + '/api/mypay/webhook', { headers: { 'content-type': 'application/json', 'x-mypay-signature': 'deadbeef' }, data: { event: 'payment.success', trx_ref: trxRef, amount: 1 } });
expect(bad.status() === 401, 'ويبهوك بتوقيع غير صالح يُرفض 401');

// ---------- حسابي ----------
await page.goto(BASE + '/account');
expect(await has(page, orderCode), 'نظرة عامة حسابي تعرض الطلب');
expect((await page.locator('.pc-side a').count()) >= 18, 'مركز الحساب فيه كل الروابط (طلبات، تذاكر، تقييمات، كوبونات، نقاط، عناوين، سياسات…)');
expect((await page.locator('.pc-grp').count()) === 6, 'مركز الحساب مقسّم إلى ست مجموعات');
expect(await page.locator('.pc-grp', { hasText: 'حسابي' }).first().getAttribute('open') !== null, 'المجموعة التي تحوي الصفحة الحالية مفتوحة');
expect(await page.locator('.pc-side .acct-me b').isVisible(), 'اسم الزبونة يظهر في أعلى مركز الحساب');
await shot(page, 'account-center');
await shot(page, 'account-home');
await page.goto(BASE + '/account/orders'); expect((await page.locator('.order-card').count()) >= 1, 'صفحة طلباتي تعرض بطاقات الطلبات'); await shot(page, 'account-orders');
await page.goto(BASE + '/account/addresses');
expect(await has(page, 'بنغازي'), 'العنوان المستخدم في الدفع حُفظ في دفتر العناوين');
await page.fill('input[name=label]', 'العمل'); await page.selectOption('select[name=city]', 'طرابلس'); await page.fill('textarea[name=address]', 'برج طرابلس، الطابق 3');
await page.click('button:has-text("حفظ العنوان")'); await page.waitForLoadState('networkidle');
expect((await page.locator('.addr').count()) === 2, 'إضافة عنوان ثانٍ'); await shot(page, 'account-addresses');
await page.goto(BASE + '/account/coupons'); expect(await has(page, 'مستخدم') && await has(page, 'FREESHIP'), 'كوبوناتي تعرض المستخدم والمتاح'); await shot(page, 'account-coupons');
await page.goto(BASE + '/account/points'); expect(await has(page, 'كيف تكسبين'), 'صفحة النقاط'); 
await page.goto(BASE + '/account/profile'); await page.fill('input[name=email]', 'mona@example.com'); await page.click('button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
expect((await page.inputValue('input[name=email]')) === 'mona@example.com', 'تعديل البريد في الملف الشخصي');
await page.fill('input[name=current]', 'secret123'); await page.fill('input[name=password]', 'secret456'); await page.click('button:has-text("تغيير")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'غُيّرت كلمة المرور'), 'تغيير كلمة المرور');
await page.goto(BASE + '/account/notifications'); expect(await has(page, 'تم تأكيد دفع'), 'إشعار الدفع يظهر في الإشعارات'); await shot(page, 'account-notifications');

// ---------- الأدمن ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin');
expect((await page.locator('.kpi').count()) >= 10, 'لوحة الأدمن تعرض المؤشرات الموسعة');
expect(await has(page, 'المالك'), 'الأدمن يرى دوره (المالك) في الترويسة');
await shot(page, 'admin-home');
await page.goto(BASE + '/admin/orders?status=paid'); expect(await has(page, orderCode), 'الطلب المدفوع بماي باي يظهر في قائمة "مدفوع"');
await page.goto(BASE + '/admin/orders/' + orderCode);
expect(await has(page, 'detail.1688.com'), 'الأدمن يرى رابط المصدر');
expect(await has(page, 'دفع إلكتروني عبر ماي باي'), 'سجل الطلب يوثّق الدفع الإلكتروني');
await shot(page, 'admin-order');
await page.goto(BASE + '/admin/payments');
expect(await has(page, trxRef), 'صفحة المدفوعات تعرض العملية بمرجعها');
expect(await has(page, 'تم تأكيد الدفع وتحويل الطلب'), 'سجل الويبهوك يظهر في صفحة المدفوعات');
expect(await has(page, 'توقيع غير صالح'), 'الويبهوك المرفوض مسجّل أيضًا');
expect(await has(page, '/api/mypay/webhook'), 'صفحة الإعدادات تعرض عنوان الويبهوك للتسجيل في ماي باي');
await shot(page, 'admin-payments');
// كوبون جديد
await page.goto(BASE + '/admin/coupons');
await page.fill('input[name=code]', 'test' + String(Date.now()).slice(-4)); await page.fill('input[name=value]', '15'); await page.click('button:has-text("إنشاء")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'TEST'), 'إنشاء كوبون جديد من الإدارة'); await shot(page, 'admin-coupons');
for (const [path, name, check] of [
  ['/admin/import', 'admin-import', 'استورد إلى هدهدي'], ['/admin/products', 'admin-products', 'offerId'], ['/admin/categories', 'admin-categories', 'الوزن التقديري'],
  ['/admin/stock', 'admin-stock', 'فحص المخزون'], ['/admin/pricing', 'admin-pricing', 'سعر الصرف'], ['/admin/partners', 'admin-partners', 'شاهين'], ['/admin/staff', 'admin-staff', 'مصفوفة الصلاحيات'], ['/admin/customers', 'admin-customers', 'منى'],
  ['/admin/reports', 'admin-reports', 'المبيعات اليومية'], ['/admin/activity', 'admin-activity', 'سجل النشاط'], ['/admin/tickets', 'admin-tickets', 'التذاكر'], ['/admin/reviews', 'admin-reviews', 'بانتظار المراجعة'],
]) { await page.goto(BASE + path); expect(await has(page, check), `صفحة ${path} تعمل`); await shot(page, name); }

// كل رابط في شريط لوحة الإدارة يفتح صفحة سليمة (فحص شامل لا يحتاج تحديثًا عند إضافة صفحة)
await page.goto(BASE + '/admin');
const sideLinks = await page.locator('.side a').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('href')).filter(h => h && h.startsWith('/admin')))]);
expect(sideLinks.length >= 12, `شريط لوحة الإدارة فيه ${sideLinks.length} رابطًا`);
const broken = [];
for (const href of sideLinks) {
  const res = await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  const bad = !res || res.status() >= 400 || /Internal Server Error|D1_ERROR|SQLITE_|<title>Error/i.test(html) || !html.includes('dash-title');
  if (bad) broken.push(`${href} (${res?.status()})`);
}
expect(broken.length === 0, `كل صفحات لوحة الإدارة تعمل${broken.length ? ' — المعطوبة: ' + broken.join(', ') : ''}`);
// صور المنتجات تمر عبر وسيط الموقع ولا تكشف المصدر
await page.goto(BASE + '/');
const html0 = await page.content();
expect(!/alicdn\.com|1688\.com/.test(html0), 'الصفحة الرئيسية لا تكشف روابط 1688/alicdn للزبونة');
const srcs = await page.locator('.card .ph img').evaluateAll(els => els.map(e => e.getAttribute('src') || ''));
expect(srcs.length > 0 && !srcs.some(u => /alicdn|1688/i.test(u)), 'لا توجد بطاقة تشير مباشرة إلى صور 1688');
// وسيط الصور نفسه: رابط صورة 1688 حقيقي معمّى بـ base64url
const b64 = (t) => Buffer.from(t, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const proxied = '/img/' + b64('https://cbu01.alicdn.com/img/ibank/O1CN01DiEsNY1Wgh229kMT8_!!1948462818-0-cib.jpg');
const imgRes = await ctx.request.get(BASE + proxied);
expect(imgRes.ok() && (imgRes.headers()['content-type'] || '').startsWith('image/'), `وسيط الصور يعيد صورة (${imgRes.status()} ${imgRes.headers()['content-type']})`);
const badRes = await ctx.request.get(BASE + '/img/' + b64('https://evil.example.com/x.jpg'));
expect(badRes.ok() && (badRes.headers()['content-type'] || '').includes('svg'), 'وسيط الصور يرفض النطاقات غير المسموح بها');

// لوحة الزاحف تحمل بيانات الضبط التلقائي للإضافة
await page.goto(BASE + '/admin/crawler');
expect(await has(page, 'id="dlal-ext-config"'), 'لوحة الزاحف تعرض بيانات الضبط التلقائي للإضافة');
expect(await has(page, 'data-token="dev-import-token"'), 'بيانات الضبط تحمل رمز الاستيراد الصحيح');
expect(await has(page, '/hudhud-extension.zip'), 'رابط تنزيل الإضافة موجود في لوحة الزاحف باسمها الجديد');
await shot(page, 'admin-crawler-config');

await page.goto(BASE + '/admin/customers'); await page.click(`a:has-text("منى التجريبية")`); await page.waitForLoadState('networkidle');
expect(await has(page, 'تعديل النقاط'), 'ملف الزبونة يفتح من قائمة الزبائن');
await page.fill('input[name=delta]', '30'); await page.fill('input[name=reason]', 'هدية ترحيب'); await page.click('button:has-text("تطبيق")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'هدية ترحيب'), 'الأدمن يضيف نقاطًا للزبونة');
// تسعير
await page.goto(BASE + '/admin/pricing'); await page.fill('input[name=fx_cny_lyd]', '1.05'); await page.click('form.card-box button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
expect((await page.inputValue('input[name=fx_cny_lyd]')) === '1.05', 'حفظ سعر الصرف الجديد');
// استيراد JSON
await page.goto(BASE + '/admin/import');
await page.fill('textarea[name=json]', JSON.stringify([{ offerId: '999000111', url: 'https://detail.1688.com/offer/999000111.html', title: '测试连衣裙', titleAr: 'فستان تجريبي مستورد', priceCny: 39.9, images: [], variants: [{ color: 'أحمر', size: 'M' }], minQty: 1, inStock: true }]));
await page.click('button:has-text("استيراد")'); await page.waitForLoadState('networkidle');
// القائمة تعرض 200 الأحدث فقط، وعيّنات التشغيلات المتراكمة تدفع هذه خارجها: نبحث بالرقم
await page.goto(BASE + '/admin/products?q=999000111');
expect(await has(page, 'فستان تجريبي مستورد'), 'استيراد JSON أضاف المنتج');
const r = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: 1, page_url: 'test', items: [{ offerId: '999000111', priceCny: 45, inStock: true }] } });
expect((await r.json()).updated === 1, 'API الاستيراد يحدّث منتجًا موجودًا بدل تكراره');
// إعادة فحص منتج من مهمة بلا قسم يجب ألا تغيّر سعره (يُسعَّر بقسمه هو)
await page.goto(BASE + '/admin/products?q=999000111');
const priceBefore = await page.locator('table.tbl tr:has-text("فستان تجريبي مستورد") td').nth(4).textContent();
const again = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: null, page_url: 'ext:stock', items: [{ offerId: '999000111', url: 'https://detail.1688.com/offer/999000111.html', title: 'فستان تجريبي مستورد', priceCny: 45, images: [], variants: [], inStock: true }] } });
expect(again.ok(), 'إعادة الفحص بلا قسم تنجح');
await page.goto(BASE + '/admin/products?q=999000111');
const priceAfter = await page.locator('table.tbl tr:has-text("فستان تجريبي مستورد") td').nth(4).textContent();
expect(priceBefore === priceAfter, `سعر المنتج لا يتغير عند إعادة الفحص بلا قسم (${priceBefore} → ${priceAfter})`);

// ---------- الأدوار والصلاحيات ----------
await login(page, '0950000000', 'staff123');   // دعم الزبائن
await page.goto(BASE + '/admin'); expect(await has(page, 'دعم الزبائن'), 'موظفة الدعم تدخل اللوحة بدورها');
expect(!(await has(page, 'التسعير وسعر الصرف')), 'قائمة الدعم لا تعرض التسعير');
expect(await has(page, 'التذاكر والإرجاع'), 'قائمة الدعم تعرض التذاكر');
const r403 = await page.goto(BASE + '/admin/pricing'); expect(r403.status() === 403, 'موظفة الدعم تُمنع من صفحة التسعير (403)');
await shot(page, 'role-support-403');
const rOk = await page.goto(BASE + '/admin/tickets'); expect(rOk.status() === 200, 'موظفة الدعم تفتح التذاكر');
await login(page, '0960000000', 'staff123');   // مالية
const rf = await page.goto(BASE + '/admin/payments'); expect(rf.status() === 200, 'موظف المالية يفتح المدفوعات');
const rf2 = await page.goto(BASE + '/admin/tickets'); expect(rf2.status() === 403, 'موظف المالية يُمنع من التذاكر');
await login(page, '0970000000', 'staff123');   // كتالوج
const rc = await page.goto(BASE + '/admin/products'); expect(rc.status() === 200, 'موظفة الكتالوج تفتح المنتجات');
const rc2 = await page.goto(BASE + '/admin/orders'); expect(rc2.status() === 403, 'موظفة الكتالوج تُمنع من الطلبات');

// ---------- موظف شاهين ----------
await login(page, '0920000000', 'partner123');
await page.goto(BASE + '/partner');
expect(await has(page, orderCode), 'الطلب المدفوع بماي باي يظهر مباشرة في قائمة شاهين');
await shot(page, 'partner-queue');
const card = page.locator('.card-box', { hasText: orderCode });
const forms = card.locator('form[action*="/purchased"]'); const cnt = await forms.count();
await forms.nth(0).locator('input[name=supplier_order_no]').fill('1688-20260919-001'); await forms.nth(0).locator('input[name=actual_cost_cny]').fill('42.5');
await forms.nth(0).locator('button:has-text("تم الشراء")').click(); await page.waitForLoadState('networkidle');
if (cnt > 1) { const c2 = page.locator('.card-box', { hasText: orderCode }); await c2.locator('input[name=supplier_order_no]').first().fill('1688-20260919-002'); await c2.locator('input[name=actual_cost_cny]').first().fill('30'); await c2.locator('button:has-text("تم الشراء")').first().click(); await page.waitForLoadState('networkidle'); }
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("اكتمل الشراء")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("وصلت البضاعة للمخزن")').click(); await page.waitForLoadState('networkidle');
const wc = page.locator('.card-box', { hasText: orderCode });
await wc.locator('input[name=actual_weight_g]').first().fill('420'); await wc.locator('input[name=proof_image_url]').first().fill('https://example.com/proof.jpg'); await wc.locator('button:has-text("حفظ")').first().click(); await page.waitForLoadState('networkidle');
await page.click('button:has-text("فتح شحنة جديدة")'); await page.waitForLoadState('networkidle');
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("ضمّ إلى الشحنة")').click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/partner/shipments');
const sh = page.locator('.card-box').first(); await sh.locator('input[name=tracking_no]').fill('CA987654321CN'); await sh.locator('input[name=total_weight_kg]').fill('12.4');
await sh.locator('button:has-text("شُحنت إلى ليبيا")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("وصلت ليبيا")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("دخلت الجمارك")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("خرجت من الجمارك")').click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/partner/delivery'); expect(await has(page, orderCode), 'الطلب وصل لصفحة التسليم');
await page.locator('tr', { hasText: orderCode }).locator('button:has-text("تم التسليم")').click(); await page.waitForLoadState('networkidle');
await shot(page, 'partner-delivered');

// ---------- الزبونة بعد التسليم: نقاط، تقييم، تذكرة ----------
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/orders/' + orderCode);
expect(await has(page, 'تم التسليم'), 'الزبونة ترى "تم التسليم"');
expect(await has(page, 'نقاط مكتسبة'), 'صفحة الطلب تعرض النقاط المكتسبة');
await page.goto(BASE + '/account/points');
expect(await has(page, 'مكافأة طلب مُسلَّم'), 'نقاط التسليم سُجلت في السجل');
const ptsBefore = parseInt((await page.locator('.acct-card b').first().textContent()).replace(/\D/g, ''));
expect(ptsBefore > 30, `رصيد النقاط بعد التسليم = ${ptsBefore}`);
await shot(page, 'customer-points');
await page.goto(BASE + '/account/reviews');
expect((await page.locator('.review-form').count()) >= 1, 'منتجات الطلب المُسلَّم بانتظار التقييم');
const rf1 = page.locator('.review-form').first();
await rf1.locator('.rate label').nth(1).click(); await rf1.locator('select[name=size_fit]').selectOption('true'); await rf1.locator('textarea[name=body]').fill('الخامة ممتازة والمقاس مطابق تمامًا، أنصح به.');
await rf1.locator('button:has-text("نشر التقييم")').click(); await page.waitForLoadState('networkidle');
expect(await has(page, 'شكرًا! أُضيف تقييمك'), 'نشر التقييم يمنح نقاطًا'); await shot(page, 'customer-review');
await page.goto(BASE + '/account/tickets/new?order=' + orderCode + '&type=return');
await page.fill('input[name=subject]', 'وصل الفستان بلون مختلف'); await page.fill('textarea[name=body]', 'اللون المستلم أزرق بينما طلبت أسود، أرفق صورة.'); await page.fill('input[name=image_url]', 'https://example.com/photo.jpg');
await page.click('button:has-text("إرسال")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'TK-'), 'إنشاء تذكرة إرجاع مرتبطة بالطلب');
const ticketCode = (await page.content()).match(/TK-\d{4}-\d{6}/)[0];
await shot(page, 'customer-tickets');

// ---------- الأدمن: مراجعة التقييم وحل التذكرة ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin'); expect(await has(page, 'تذاكر مفتوحة'), 'لوحة الأدمن تعدّ التذاكر المفتوحة');
await page.goto(BASE + '/admin/reviews'); expect(await has(page, 'الخامة ممتازة'), 'التقييم الجديد بانتظار المراجعة');
await page.click('button:has-text("نشر")'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/p/' + productSlug);
expect(await has(page, 'الخامة ممتازة'), 'التقييم المنشور يظهر على صفحة المنتج');
expect(await has(page, 'رأي الزبونات في المقاس'), 'إحصائية المقاس تظهر على صفحة المنتج');
await shot(page, 'product-with-review');
await page.goto(BASE + '/admin/tickets'); expect(await has(page, ticketCode), 'التذكرة تظهر لدى الإدارة');
await page.click(`a:has-text("${ticketCode}")`); await page.waitForLoadState('networkidle');
await page.fill('form[action$="/reply"] textarea', 'نعتذر، سنعوضك بالنقاط فورًا.'); await page.click('button:has-text("إرسال الرد")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'قيد المعالجة'), 'الرد يحوّل التذكرة إلى قيد المعالجة');
await page.selectOption('select[name=resolution]', 'points'); await page.fill('input[name=points]', '50'); await page.click('button:has-text("إغلاق التذكرة بالقرار")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('status=resolved'), 'التذكرة حُلّت بتعويض نقاط'); await shot(page, 'admin-ticket-resolved');
await page.goto(BASE + '/admin/activity'); expect(await has(page, 'ticket.resolve'), 'سجل النشاط وثّق حل التذكرة');

// ---------- الزبونة: النتيجة + دفع بالنقاط + دفع فاشل + إلغاء ----------
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/account/tickets/' + ticketCode);
expect(await has(page, 'تعويض 50 نقطة'), 'الزبونة ترى قرار التعويض');
expect(await has(page, 'سنعوضك بالنقاط'), 'الزبونة ترى رد الفريق');
await page.goto(BASE + '/account/points');
const ptsAfter = parseInt((await page.locator('.acct-card b').first().textContent()).replace(/\D/g, ''));
expect(ptsAfter === ptsBefore + 5 + 50, `النقاط ازدادت بالتقييم (5) والتعويض (50): ${ptsBefore} → ${ptsAfter}`);
// طلب ثانٍ بالنقاط
await page.goto(BASE + '/c/shoes'); await page.click('.card >> nth=0'); await page.waitForLoadState('networkidle');
const chips = await page.locator('.chips[data-opt] .chip:not(.off)').count();
if (chips) { for (const g of await page.locator('.chips[data-opt]').all()) await g.locator('.chip:not(.off)').first().click(); }
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/checkout');
expect(await has(page, 'استخدام نقاطي'), 'خيار استخدام النقاط يظهر في الدفع');
await Promise.all([page.waitForURL(/use_points=1/), page.check('input[name=use_points]')]); await page.waitForLoadState('networkidle');
expect((await page.locator('label.row', { hasText: 'استخدام نقاطي' }).textContent()).includes('−'), 'الملخص يخصم قيمة النقاط');
await page.check('input[value=mypay_sadad]'); await shot(page, 'checkout-points');
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/pay/mock/'), 'الطلب الثاني يذهب لبوابة سداد');
await page.click('button:has-text("فشل الدفع")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'فشلت عملية الدفع'), 'فشل الدفع يظهر للزبونة مع خيار إعادة المحاولة');
expect(await has(page, 'ادفعي الآن عبر MyPay'), 'زر إعادة الدفع متاح');
const order2 = page.url().match(/DL-\d{4}-\d{6}/)[0];
await shot(page, 'order-payment-failed');
page.once('dialog', d => d.accept());
await page.click('button:has-text("إلغاء الطلب")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'ملغي'), 'إلغاء الطلب قبل الدفع');
await page.goto(BASE + '/account/points');
const ptsFinal = parseInt((await page.locator('.acct-card b').first().textContent()).replace(/\D/g, ''));
expect(ptsFinal === ptsAfter, `النقاط المستخدمة أُعيدت بعد الإلغاء (${ptsFinal})`);
await page.goto(BASE + '/account/orders?stage=cancelled'); expect(await has(page, order2), 'فلتر الطلبات الملغاة يعمل');

// ---------- صفحات المساعدة والسياسات بالعربية ----------
const HELP = [
  ['/pages/how', 'كيف يعمل هدهدي؟', 'شحن جوي إلى ليبيا'],
  ['/pages/how-to-order', 'كيف أطلب من هدهدي؟', 'أكّدي الطلب وادفعي'],
  ['/pages/shipping', 'معلومات الشحن', 'التوصيل داخل ليبيا'],
  ['/pages/returns', 'سياسة الإرجاع والاسترداد', 'متى تستحقين تعويضًا كاملًا'],
  ['/pages/payment', 'طرق الدفع والرسوم', 'الدفع كاش في أحد فروعنا'],
  ['/pages/points', 'نقاط المكافآت', 'كيف تكسبين النقاط'],
  ['/pages/sizes', 'دليل المقاسات', 'المقاس الصيني'],
  ['/pages/branches', 'فروعنا في ليبيا', 'الدفع كاش في الفرع'],
  ['/pages/faq', 'الأسئلة الشائعة', 'متى يصل طلبي'],
  ['/pages/contact', 'خدمة الزبائن', 'ساعات العمل'],
  ['/pages/privacy', 'إشعار الخصوصية', 'لا نبيع بياناتك'],
  ['/pages/terms', 'الشروط والأحكام', 'المنتجات الممنوعة'],
];
for (const [path, title, needle] of HELP) {
  const r = await page.goto(BASE + path);
  const okStatus = r.status() === 200;
  const h1 = okStatus ? (await page.locator('.doc h1').textContent().catch(() => '')) : '';
  const hasBody = okStatus && await has(page, needle);
  const cjk = okStatus && /[一-鿿]/.test(await page.locator('.doc').textContent());
  expect(okStatus && h1.includes(title) && hasBody && !cjk, `${path} يفتح بالعربية بعنوان «${title}» ومحتواه كامل`);
}
await page.goto(BASE + '/pages/faq');
const accordions = await page.locator('.faq details').count();
expect(accordions >= 12, `الأسئلة الشائعة فيها ${accordions} سؤالًا في أكورديون`);
await page.locator('.faq summary').first().click();
expect(await page.locator('.faq details').first().getAttribute('open') !== null, 'النقر يفتح إجابة السؤال');
await shot(page, 'page-faq');
await page.goto(BASE + '/pages/shipping');
expect((await page.locator('.doc table tr').count()) >= 6, 'صفحة الشحن فيها جدول المراحل والتكاليف');
expect(await has(page, 'مجاني للطلبات فوق'), 'صفحة الشحن تذكر حد التوصيل المجاني من الإعدادات');
await shot(page, 'page-shipping');
await page.goto(BASE + '/pages/contact');
expect((await page.locator('.svc-grid a').count()) >= 8, 'صفحة خدمة الزبائن فيها شبكة الخدمات');
await shot(page, 'page-contact');
// روابط التذييل تصل فعلًا
await page.goto(BASE + '/');
const ftrLinks = await page.locator('.ftr-col a[href^="/pages/"]').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('href')))]);
const ftrBroken = [];
for (const href of ftrLinks) { const rr = await page.goto(BASE + href); if (rr.status() !== 200) ftrBroken.push(`${href}:${rr.status()}`); }
expect(ftrBroken.length === 0, `كل روابط التذييل تعمل (${ftrLinks.length} رابطًا${ftrBroken.length ? ' — مكسور: ' + ftrBroken.join(', ') : ''})`);

// ---------- صفحة القسم: الفلاتر الجانبية وشريط الترتيب ----------
await page.goto(BASE + '/logout');
await page.goto(BASE + '/c/dresses'); await page.waitForLoadState('networkidle');
expect(await page.locator('.crumbs').textContent().then(t => t.includes('الرئيسية')), 'فتات الخبز يظهر فوق القسم');
expect(await page.locator('.filters h3').isVisible(), 'لوحة التصفية الجانبية ظاهرة');
const groups = await page.locator('.filters .fgroup').count();
expect(groups >= 3, `لوحة التصفية فيها ${groups} مجموعات (قسم/مقاس/لون/سعر/عروض)`);
expect((await page.locator('.filters .fgroup a').filter({ hasText: 'فساتين' }).count()) > 0, 'قائمة الأقسام داخل الفلاتر');
// شريط الترقيم أيضًا صنفه sortbar ورقمه الحالي chip.on — نقصد شريط الترتيب الأول وحده
expect(await page.locator('.sortbar').first().locator('.chip.on').first().textContent().then(t => t.includes('رواجًا')), 'شريط الترتيب يبدأ بالأكثر رواجًا');
const before = await page.locator('.card').count();
// فلتر السعر بالنطاقات الجاهزة
await page.click('.filters .fgroup a:has-text("أقل من")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('max='), 'النقر على نطاق سعري يطبّقه في الرابط');
const capped = await page.$$eval('.card .p', els => els.map(e => parseFloat(e.textContent.split('د.ل')[0].replace(/[^\d.]/g, ''))));
expect(capped.length === 0 || capped.every(v => v <= 50), `كل النتائج ضمن النطاق السعري (${capped.length} منتج)`);
expect(await has(page, 'السعر:'), 'رقاقة الفلتر المطبّق تظهر فوق النتائج');
await page.click('.filters a:has-text("مسح كل الفلاتر")'); await page.waitForLoadState('networkidle');
expect((await page.locator('.card').count()) === before, `مسح الفلاتر يعيد كل النتائج (${before})`);
await shot(page, 'category-filters');
// فلتر اللون بالنقطة الملونة
const colorLinks = await page.locator('.fcolors a').count();
if (colorLinks) {
  const cname = (await page.locator('.fcolors a').first().textContent()).trim();
  await page.locator('.fcolors a').first().click(); await page.waitForLoadState('networkidle');
  expect(page.url().includes('color='), `فلتر اللون «${cname}» يعمل`);
  expect(await has(page, 'اللون:'), 'رقاقة اللون المطبّق تظهر');
  await page.goto(BASE + '/c/dresses');
}
expect(colorLinks > 0, `فلتر الألوان يعرض ${colorLinks} لونًا بنقاط ملونة`);
// قيمة مقاس لم تُترجم بعد يجب ألا تظهر في فلتر المقاسات ولا على صفحة المنتج
const sizeFacets = await page.locator('.fsizes a').allTextContents();
expect(!sizeFacets.some(t => /[一-鿿]/.test(t)), `لا مقاس صيني في الفلتر (${sizeFacets.filter(t => /[一-鿿]/.test(t)).join('، ') || 'نظيف'})`);
const colorFacets = await page.locator('.fcolors a, .fcolor a').allTextContents();
expect(!colorFacets.some(t => /[一-鿿]/.test(t)), 'لا لون صيني في الفلتر');
// الترتيب بالسعر
await page.click('.sortbar a:has-text("السعر: من الأقل")'); await page.waitForLoadState('networkidle');
// السعر المشطوب داخل نفس العنصر: نحذفه قبل القراءة وإلا التصق الرقمان («84 د.ل105 د.ل» ⟵ 84105)
const asc = (await page.$$eval('.card .p', els => els.map(e => { const c = e.cloneNode(true); c.querySelectorAll('s').forEach(n => n.remove()); return c.textContent; }))).map(num);
expect(asc.every((v, i) => i === 0 || v >= asc[i - 1]), 'الترتيب بالسعر تصاعديًا صحيح');
// وفي وضع الشحن البحري يجب أن يتبع الترتيب السعر البحري المعروض لا الجوي المخفي
await page.goto(BASE + '/p/' + productSlug);
await page.locator('.pship label').nth(1).click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/c/dresses?sort=price_asc');
const ascSea = (await page.$$eval('.card .p', els => els.map(e => { const c = e.cloneNode(true); c.querySelectorAll('s').forEach(n => n.remove()); return c.textContent; }))).map(num);
expect(ascSea.every((v, i) => i === 0 || v >= ascSea[i - 1]), `الترتيب بالسعر صحيح في وضع البحري أيضًا (${ascSea.slice(0, 4).join(' ، ')})`);
await page.goto(BASE + '/p/' + productSlug);
await page.locator('.pship label').nth(0).click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/c/dresses?sort=price_asc');

// ---------- هيكل المتجر: الرأس والقائمة الكبيرة والتذييل وبطاقة المنتج ----------
await page.goto(BASE + '/logout'); await page.goto(BASE + '/');
expect(await page.locator('.hdr-strip a', { hasText: 'معلومات الشحن' }).isVisible(), 'الشريط العلوي يعرض معلومات الشحن');
expect(await page.locator('.hdr-main .logo').isVisible() && await page.locator('.hdr-main .search input').isVisible(), 'الشعار وحقل البحث في الشريط الرئيسي');
expect(await page.locator('.hdr-main .logo b').textContent() === 'هدهدي', 'الشعار يحمل الاسم العربي «هدهدي»');
expect(await page.locator('.hdr-main .logo i').textContent() === 'HUDHUDE', 'وتحته الاسم اللاتيني «HUDHUDE» (كالنطاق hudhude.com)');
expect(await page.locator('.hdr-main .logo u').textContent() === 'بوابتك إلى الصين', 'وتحتهما «بوابتك إلى الصين»');
expect((await page.title()).includes('هدهدي HUDHUDE'), 'عنوان الصفحة يحمل الاسمين');
// الهدهد نفسه: صورة تُحمَّل فعلًا (لا مربع مكسور)، وحركتها تعمل داخلها، ولون الموقع صار القرفة
const hh = await page.locator('.hdr-main .logo img').evaluate(i => ({ w: i.naturalWidth, h: i.getBoundingClientRect().height, src: i.getAttribute('src') }));
expect(hh.src === '/hudhud-logo.svg' && hh.w > 0 && hh.h >= 40, `صورة الهدهد في الترويسة محمّلة (${hh.src} · ${Math.round(hh.h)}px)`);
const hhSvg = await (await ctx.request.get(BASE + '/hudhud-logo.svg')).text();
expect(/@keyframes fan/.test(hhSvg) && /@keyframes peck/.test(hhSvg) && /prefers-reduced-motion/.test(hhSvg), 'ملف الشعار فيه حركة العُرف والنقر ويحترم «تقليل الحركة»');
const fav = await page.locator('link[rel=icon]').getAttribute('href');
expect(fav === '/favicon.svg' && (await (await ctx.request.get(BASE + fav)).text()).includes('aria-label="هدهدي HUDHUDE"'), 'أيقونة التبويب صارت الهدهد');
expect((await ctx.request.get(BASE + '/apple-touch-icon.png')).status() === 200, 'أيقونة شاشة الجوال موجودة');
const brandCol = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase());
expect(brandCol === '#b05a20', `لون الموقع صار القرفة (${brandCol})`);
// www.hudhude.com يحوّل إلى hudhude.com بنفس المسار (Host مزوّر: الخادم المحلي لا يعرف النطاق)
const nodeHttp = await import('node:http');
const wwwLoc = await new Promise((res) => {
  const u = new URL(BASE + '/c/dresses?sort=new');
  nodeHttp.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { host: 'www.hudhude.com' } }, r => res(`${r.statusCode} ${r.headers.location}`)).on('error', e => res(e.message)).end();
});
expect(wwwLoc === '301 https://hudhude.com/c/dresses?sort=new', `www.hudhude.com يحوّل إلى hudhude.com بنفس المسار (${wwwLoc})`);
const oldZip = await ctx.request.get(BASE + '/talin-extension.zip', { maxRedirects: 0 });
expect(oldZip.status() === 301 && (oldZip.headers().location || '').endsWith('/hudhud-extension.zip'), `رابط الإضافة القديم يحوّل للجديد (${oldZip.status()})`);
expect((await page.locator('.hdr-icons > a').count()) >= 3, 'أيقونات الحساب والسلة والمفضلة في الرأس');
expect(await page.locator('#allCats').isVisible(), 'زر «كل الأقسام» موجود');
expect(await page.locator('#megaMenu').isHidden(), 'القائمة الكبيرة مغلقة في البداية');
await page.click('#allCats');
expect(await page.locator('#megaMenu').isVisible(), 'النقر يفتح القائمة الكبيرة');
expect((await page.locator('#megaMenu .mega-side button').count()) >= 10, 'القائمة الكبيرة تسرد كل الأقسام');
const firstMega = (await page.locator('#megaMenu .mega-side button').nth(2).textContent()).replace('›', '').trim();
await page.click('#megaMenu .mega-side button >> nth=2');
expect(await page.locator('#megaMenu .mega-panel.on h4').textContent().then(t => t.includes(firstMega)), `تمرير المؤشر يبدّل لوحة القسم (${firstMega})`);
await shot(page, 'home-mega');
await page.keyboard.press('Escape');
expect(await page.locator('#megaMenu').isHidden(), 'Escape يغلق القائمة الكبيرة');
// أسهم شريط الأقسام
const sx = await page.evaluate(() => document.getElementById('catsRow').scrollLeft);
await page.click('[data-nav="1"]'); await page.waitForTimeout(600);
const sx2 = await page.evaluate(() => document.getElementById('catsRow').scrollLeft);
expect(Math.abs(sx2 - sx) > 50, `سهم شريط الأقسام يمرّره (${sx} → ${sx2})`);
// التذييل
expect(await has(page, 'المساعدة والدعم') && await has(page, 'خدمة الزبائن'), 'التذييل فيه أعمدة الروابط');
expect(await has(page, 'نقبل الدفع بـ'), 'التذييل يعرض وسائل الدفع');
expect(await page.locator('.ftr-news form input').isVisible(), 'التذييل فيه اشتراك النشرة');
await page.goto(BASE + '/c/dresses');
expect((await page.locator('.card .add').count()) > 0, 'كل بطاقة فيها زر «+» للإضافة السريعة');
expect((await page.locator('.card .ship').count()) > 0, 'البطاقة تعرض مدة الوصول');
const swatches = await page.locator('.card .swatch').count();
expect(swatches > 0, `البطاقة تعرض عدد الألوان (${swatches} بطاقة)`);
await shot(page, 'category-cards');
// الإضافة السريعة: منتج بمتغيرات يفتح صفحته، وبلا متغيرات يضاف مباشرة
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/c/dresses');
await page.locator('.card .add').first().click();
await page.waitForLoadState('networkidle');
expect(page.url().includes('/p/') || (await page.locator('.hdr-icons a[href="/cart"] b').count()) > 0, 'زر «+» إما يضيف للسلة أو يفتح المنتج لاختيار اللون والمقاس');
await shot(page, 'quick-add');

// ---------- الشحن البحري: أرخص وأبطأ ----------
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/c/dresses');
expect((await page.locator('.card .ship.sea').count()) > 0, 'البطاقة تعرض سعر الشحن البحري بجانب الجوي');
const airCard = num(await page.locator('.card .p').first().textContent());
const seaCard = num(await page.locator('.card .ship.sea').first().textContent());
expect(seaCard < airCard, `السعر البحري أرخص من الجوي على البطاقة (${seaCard} < ${airCard})`);
// أفرغي السلة ثم أضيفي منتجًا بلا متغيرات لضبط المقارنة
await page.goto(BASE + '/cart');
for (const b of await page.locator('form[action="/cart/update"] button:has-text("حذف")').all()) { await b.click(); await page.waitForLoadState('networkidle'); }
await openProductWithVariants('dresses');
const chipsSea = await page.locator('.chips[data-opt] .chip:not(.off)').count();
if (chipsSea) { for (const g of await page.locator('.chips[data-opt]').all()) await g.locator('.chip:not(.off)').first().click(); }
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/cart');
expect(await page.locator('.shipsel').isVisible(), 'السلة تعرض اختيار طريقة الشحن');
expect(await has(page, 'شحن جوي') && await has(page, 'شحن بحري'), 'الخياران معروضان بالاسم');
expect(await has(page, 'وفّري'), 'يظهر للزبونة كم توفّر بالبحري');
const totalAir = num(await page.locator('.summary .row.tot span').last().textContent());
await shot(page, 'cart-ship-air');
// التبديل إلى البحري يخفض الإجمالي
await page.check('.shipsel input[value=sea]'); await page.waitForLoadState('networkidle');
expect(await page.locator('.shipsel label.on').textContent().then(t => t.includes('بحري')), 'اختيار البحري يُحفظ ويظهر محدّدًا');
const totalSea = num(await page.locator('.summary .row.tot span').last().textContent());
expect(totalSea < totalAir, `إجمالي السلة بالبحري أقل (${totalSea} < ${totalAir})`);
expect(await has(page, '30 — 45'), 'مدة الوصول البحرية معروضة في الملخص');
await shot(page, 'cart-ship-sea');
// الطلب يحفظ الطريقة ويعرضها في التتبع
await page.goto(BASE + '/checkout');
expect(await page.locator('.shipsel label.on').textContent().then(t => t.includes('بحري')), 'صفحة الدفع تتذكر اختيار البحري');
await page.check('input[value=mypay_sadad]');
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
const seaOrder = page.url().match(/DL-\d{4}-\d{6}/);
if (page.url().includes('/pay/mock/')) { await page.click('button:has-text("تأكيد الدفع")'); await page.waitForLoadState('networkidle'); }
expect(await has(page, 'شحن بحري'), 'صفحة الطلب تعرض أنه شحن بحري');
expect(await has(page, '30 — 45'), 'صفحة الطلب تعرض مدة الوصول البحرية');
await shot(page, 'order-sea');
// لوحة الإدارة: إعدادات البحري تعمل
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
expect(await has(page, 'الشحن البحري'), 'لوحة التسعير فيها قسم الشحن البحري');
expect(await page.locator('input[name=ship_usd_per_cbm_sea]').isVisible(), 'حقل سعر المتر المكعب بحرًا موجود');
const seaShipBefore = num(await page.locator('.card-box', { hasText: 'بالشحن البحري' }).locator('.breakdown div', { hasText: 'شحن دولي' }).first().textContent());
// المثال (300غ في 3000سم³) يُحاسب بالحجم لأن الوزن الحجمي أكبر، فسعر المتر المكعب هو المؤثّر
await page.fill('input[name=ship_usd_per_cbm_sea]', '240');
await page.click('form button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
const seaShipAfter = num(await page.locator('.card-box', { hasText: 'بالشحن البحري' }).locator('.breakdown div', { hasText: 'شحن دولي' }).first().textContent());
expect(seaShipAfter > seaShipBefore, `رفع سعر المتر المكعب بحرًا يرفع أجرة الشحن البحري (${seaShipBefore} → ${seaShipAfter})`);
const seaSell = num(await page.locator('.card-box', { hasText: 'بالشحن البحري' }).locator('.breakdown div.t').first().textContent());
const airSell = num(await page.locator('.card-box', { hasText: 'منتج بـ 25' }).locator('.breakdown div.t').first().textContent());
expect(seaSell < airSell, `سعر البيع بحرًا يبقى أقل من الجوي حتى بعد الرفع (${seaSell} < ${airSell})`);
await page.fill('input[name=ship_usd_per_cbm_sea]', '120');
await page.click('form button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
await shot(page, 'admin-pricing-sea');

// ---------- المال: التسعير بالحجم، الربح، والمستحق لشركة الشحن ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
expect(await has(page, 'سعر المتر المكعب من شركة الشحن'), 'صفحة التسعير فيها سعر المتر المكعب');
expect(await has(page, 'طريقة حساب الشحن'), 'اختيار طريقة حساب الشحن موجود');
expect(await has(page, 'الوزن المحاسبي'), 'المثال يعرض الوزن المحاسبي');
expect(await has(page, 'ربحنا من القطعة'), 'المثال يعرض ربحنا من القطعة');
const shipBefore = parseFloat((await page.locator('.breakdown div', { hasText: 'شحن دولي' }).first().textContent()).replace(/[^\d.]/g, ''));
await page.fill('input[name=ship_usd_per_cbm]', '520');
await page.click('form button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'تم الحفظ'), 'حفظ إعدادات الشحن بالمتر المكعب');
const bulkyShip = parseFloat((await page.locator('.card-box', { hasText: 'صندوق كبير' }).locator('.breakdown div', { hasText: 'شحن دولي' }).first().textContent()).replace(/[^\d.]/g, ''));
expect(bulkyShip > shipBefore, `رفع سعر المتر المكعب رفع أجرة شحن الصندوق الكبير (${shipBefore} → ${bulkyShip})`);
await shot(page, 'admin-pricing-cbm');
// الطلبات القديمة بلا تكلفة محفوظة: نحسبها ثم نتأكد أن الهامش صار واقعيًا
await page.goto(BASE + '/admin/pricing');
await page.click('button:has-text("احسب التكلفة الناقصة")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'حُسبت تكلفة'), 'زر حساب تكلفة الطلبات القديمة يعمل');
await page.goto(BASE + '/admin/reports');
expect(await has(page, 'صافي الربح'), 'التقارير تعرض صافي الربح');
expect(await has(page, 'المستحق لشركات الشحن'), 'التقارير تعرض المستحق لشركات الشحن');
expect(await has(page, 'شاهين للشحن'), 'شاهين للشحن يظهر في جدول المستحقات');
expect(await has(page, 'الأعلى ربحًا'), 'جدول الأعلى ربحًا موجود');
const owedTxt = await page.locator('.card-box', { hasText: 'المستحق لشركات الشحن' }).textContent();
expect(/\d/.test(owedTxt), 'جدول المستحقات يعرض أرقامًا');
const profitTxt = await page.locator('.kpi', { hasText: 'صافي الربح' }).textContent();
expect(parseFloat(profitTxt.replace(/[^\d.]/g, '')) > 0, `صافي الربح محسوب من الطلبات الحقيقية: ${profitTxt.trim().split('\n')[0]}`);
const marginPct = parseInt((profitTxt.match(/هامش\s*(\d+)/) ?? [0, '0'])[1]);
expect(marginPct > 5 && marginPct < 70, `الهامش واقعي بعد حساب التكلفة: ${marginPct}%`);
// فاتورة الشريك تفصل الجوي عن البحري، فالجدول يفصلهما أيضًا
const owedHead = await page.locator('.card-box', { hasText: 'المستحق لشركات الشحن' }).locator('th').allTextContents();
expect(owedHead.some(h => h.includes('جوي')) && owedHead.some(h => h.includes('بحري')), 'جدول المستحقات يفصل الشحن الجوي عن البحري');
const owedRow = await page.locator('.card-box', { hasText: 'المستحق لشركات الشحن' }).locator('tr', { hasText: 'شاهين' }).locator('td').allTextContents();
expect(Math.abs(num(owedRow[4]) + num(owedRow[5]) - num(owedRow[6])) < 0.05, `جوي ${owedRow[4]} + بحري ${owedRow[5]} = إجمالي الشحن ${owedRow[6]}`);
const costTxt = await page.locator('.kpi', { hasText: 'تكلفتنا' }).textContent();
expect(parseFloat(costTxt.replace(/[^\d.]/g, '')) > 0, 'تكلفتنا محسوبة وليست صفرًا');
await shot(page, 'admin-reports-profit');

// ---------- أجرة التوصيل حسب المدينة: سبها تكلّف أكثر من طرابلس ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
expect(await has(page, 'أجرة التوصيل لكل مدينة'), 'حقل أجرة التوصيل لكل مدينة موجود');
await page.fill('textarea[name=delivery_city_rates]', 'طرابلس = 10\nسبها = 45');
await page.locator('form:has(textarea[name=delivery_city_rates]) button:has-text("حفظ")').click(); await page.waitForLoadState('networkidle');
expect((await page.locator('textarea[name=delivery_city_rates]').inputValue()).includes('سبها'), 'الأجرة المحفوظة تبقى');
// الزبونة: نضيف منتجًا رخيصًا (دون حد الشحن المجاني) ونقارن الأجرتين
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/cart');
if ((await page.locator('.cart-row').count()) === 0) {
  await page.goto(BASE + '/p/' + productSlug);
  if (await page.locator('.chips[data-opt=color] .chip:not(.off)').count()) await page.locator('.chips[data-opt=color] .chip:not(.off)').first().click();
  if (await page.locator('.chips[data-opt=size] .chip:not(.off)').count()) await page.locator('.chips[data-opt=size] .chip:not(.off)').first().click();
  await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
}
expect((await page.locator('.cart-row').count()) >= 1, 'السلة فيها منتج قبل فحص أجرة المدينة');
await page.goto(BASE + '/checkout?city=' + encodeURIComponent('طرابلس'));
const dTrip = num(await page.locator('.summary .row', { hasText: 'التوصيل' }).first().textContent());
await page.goto(BASE + '/checkout?city=' + encodeURIComponent('سبها'));
const dSabha = num(await page.locator('.summary .row', { hasText: 'التوصيل' }).first().textContent());
expect(dSabha > dTrip, `التوصيل إلى سبها أغلى من طرابلس (${dSabha} > ${dTrip})`);
expect(await has(page, 'أجرة التوصيل إلى'), 'صفحة الدفع تُظهر أجرة مدينة الزبونة صراحةً');
await shot(page, 'checkout-city-fee');
// نعيد الإعداد فارغًا حتى لا يؤثر على بقية الفحوصات
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
await page.fill('textarea[name=delivery_city_rates]', '');
await page.locator('form:has(textarea[name=delivery_city_rates]) button:has-text("حفظ")').click(); await page.waitForLoadState('networkidle');

// ---------- رصيد المزوّد نفد: النظام يقولها للمالك بوضوح بدل أن يمضي في الخطأ ----------
// خادم وهمي يرد بنفس ما ردّت به TMAPI فعلًا على الموقع الحي
const walletSrv = createServer((_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"code":5000,"msg":"insufficient wallet balance"}'); });
await new Promise(r => walletSrv.listen(8801, r));
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/source');
const savedBase = await page.locator('input[name=src_base_url]').inputValue();
// المزوّد لا يُنشأ بلا مفتاح (getProvider يعيد null) فلا يُسجَّل أي خطأ ويبقى التحذير قديمًا:
// الفحص يضبط مفتاحًا وهميًا بنفسه بدل الاتكال على إعداد قد يتركه فحص آخر فارغًا
await page.selectOption('select[name=src_provider]', 'tmapi');
await page.fill('input[name=src_key]', 'e2e-wallet-key');
await page.fill('input[name=src_base_url]', 'http://127.0.0.1:8801');
await page.fill('input[name=test_id]', '999888777666');
await page.click('button:has-text("اختبار: جلب منتج")'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/source');
const wb = page.locator('.card-box:has(h3:text("صحة الكتالوج")) .flash').first();
expect(await wb.count() > 0, 'لوحة الكتالوج تحذّر حين يرفض المزوّد الطلبات');
const wbText = (await wb.textContent()).trim();
expect(wbText.includes('insufficient wallet balance') && wbText.includes('TMAPI'), `التحذير ينقل نص المزوّد ويقول ما العمل: ${wbText.slice(0, 80)}`);
await shot(page, 'admin-wallet-empty');
await page.fill('input[name=src_base_url]', savedBase);
await page.locator('form[action="/admin/source"] button:has-text("حفظ")').click(); await page.waitForLoadState('networkidle');
walletSrv.close();

// ---------- المنتج المحذوف من 1688 لا يُسأل عنه مرتين: هنا كان يضيع رصيد المزوّد ----------
// مقيس على الموقع الحي: 3459 استدعاء تفصيل لـ 618 منتجًا فقط، منتج واحد 190 مرة، و13 ألف منتج
// لم يُسأل عنه قط. السبب سببان: نص خطأ «Item not found» لم يطابق الشرط، واستعلام الإثراء بلا ذاكرة.
// الاختبار يصنع عيّنته بنفسه: منتجات طازجة ناقصة الوزن و`last_checked_at` فارغ، فتكون مؤهَّلة
// للإثراء مهما كانت حالة القاعدة. (بلا هذا كانت مهلة الـ72 ساعة تستبعد كل ما فحصته تشغيلة سابقة.)
const goneIds = [0, 1, 2].map(i => '66' + String(Date.now() + i).slice(-10));
await page.evaluate(async ([b, ids]) => {
  await fetch(b + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' },
    body: JSON.stringify({ page_url: 'ext:gone-fixture', items: ids.map((o, i) => ({
      offerId: o, url: `https://detail.1688.com/offer/${o}.html`, title: `عيّنة إثراء ${o} رقم ${i}`,
      priceCny: 30 + i, images: ['https://cbu01.alicdn.com/img/ibank/g.jpg'], minQty: 1, inStock: true })) }) });
}, [BASE, goneIds]);
const asked = [];
const goneSrv = createServer((q, res) => {
  const id = (q.url.match(/item_id=(\d+)/) || [])[1];
  if (id) asked.push(id);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"code":404,"msg":"Item not found"}');
});
await new Promise(r => goneSrv.listen(8802, r));
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/source');
const realBase = await page.locator('input[name=src_base_url]').inputValue();
const realProv = await page.locator('select[name=src_provider]').inputValue();
const realKey = await page.locator('input[name=src_key]').inputValue();
// الاختبار يضبط كل ما يحتاجه صراحةً ولا يتّكل على إعداد تركه فحص سابق:
// السقف الشهري تحديدًا يتركه فحص لاحق على 1 فيوقف الإثراء قبل أن يبدأ
await page.selectOption('select[name=src_provider]', 'tmapi');
await page.fill('input[name=src_base_url]', 'http://127.0.0.1:8802');
await page.fill('input[name=src_key]', 'e2e-fake-key');
await page.fill('input[name=src_month_limit]', '0');
await page.locator('form[action="/admin/source"] button:has-text("حفظ")').click(); await page.waitForLoadState('networkidle');
expect(!(await page.locator('button:has-text("أثرِ 10 منتجات الآن")').isDisabled()), 'زر الإثراء يعمل حين يكون المزوّد مضبوطًا');
// قبل الضغط: نحفظ ما كان مسودةً. الإثراء يبدأ بالمسودات، والإعادة أدناه كانت تجعل كل ما لمسه «نشطًا» —
// فنشرت مسودتين بعنوان صيني (عدّاد «عنوان صيني ظاهر» = 2) وصار كل منتج مشابه بعدهما «توأمًا» يُتجاهل.
const draftsBefore = new Set();
for (let pg = 1; pg <= 10; pg++) {
  await page.goto(BASE + `/admin/products?status=draft&page=${pg}`);
  const ids = (await page.locator('a.src-link').allTextContents()).map(x => x.trim());
  ids.forEach(x => draftsBefore.add(x));
  if (ids.length < 100) break;
}
await page.goto(BASE + '/admin/source');
await page.click('button:has-text("أثرِ 10 منتجات الآن")'); await page.waitForLoadState('networkidle');
const firstRound = [...asked];
expect(firstRound.length > 0, `الإثراء سأل المزوّد عن ${firstRound.length} منتجًا`);
// كل ما ردّ عليه المزوّد «غير موجود» يخرج من المتجر ومن دورة الإثراء
await page.goto(BASE + '/admin/products?q=' + firstRound[0]);
const goneStatus = (await page.locator(`tr:has-text("${firstRound[0]}") .status`).first().textContent()).trim();
expect(goneStatus === 'unavailable', `المنتج المحذوف من 1688 يُعلَّم غير متوفر لا يبقى نشطًا (${goneStatus})`);
await shot(page, 'admin-gone-product');
// الضغطة الثانية يجب أن تنتقل إلى منتجات أخرى، لا أن تعيد سؤال نفس المنتجات وتدفع ثمنها مرتين
asked.length = 0;
await page.goto(BASE + '/admin/source');
await page.click('button:has-text("أثرِ 10 منتجات الآن")'); await page.waitForLoadState('networkidle');
const repeats = asked.filter(id => firstRound.includes(id));
expect(repeats.length === 0, `الدفعة الثانية لا تعيد سؤال المزوّد عن نفس المنتجات (تكرار: ${repeats.length})`);
// الفحص يُقاعد منتجات حقيقية بردّ مزوّد وهمي، فيجب أن يُعيدها كما وجدها وإلا أفرغ الكتالوج
// تشغيلةً بعد تشغيلة (حدث فعلًا: 100 «غير متوفر» مقابل 33 نشطًا، فعاد البحث بلا نتائج).
const retired = [...new Set([...firstRound, ...asked])];
for (const id of retired) {
  await page.goto(BASE + '/admin/products?q=' + id);
  const href = await page.locator(`tr:has-text("${id}") a[href^="/admin/products/"]`).first().getAttribute('href').catch(() => null);
  if (!href) continue;
  await page.goto(BASE + href);
  await page.selectOption('select[name=status]', draftsBefore.has(String(id)) ? 'draft' : 'active');   // كما كان، لا «نشط» دائمًا
  await page.selectOption('select[name=in_stock]', '1');
  await page.locator('form:has(input[name=title_ar]) button:has-text("حفظ")').click();
  await page.waitForLoadState('networkidle');
}
const stillGone = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/source/stats', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: '{}' });
  return (await r.json()).totals;
}, BASE);
expect(stillGone.active > 0, `الفحص أعاد المنتجات التي قاعدها (${stillGone.active} نشط)`);
// عدّادات النص المكسور: يجب أن تكون موجودة في الإحصاءات ليراها صاحب المشروع، وأن تؤول
// إلى صفر كما يؤول chineseVisible. غيابها يعني أننا لا نرى العيب أصلًا.
for (const k of ['mashedTitles', 'englishTitles', 'mashedVariants', 'chineseVisible', 'brokenTitles'])
  expect(typeof stillGone[k] === 'number', `الإحصاءات تعدّ «${k}» (${stillGone[k]})`);
await page.goto(BASE + '/admin/source');
await page.selectOption('select[name=src_provider]', realProv || 'none');
await page.fill('input[name=src_base_url]', realBase);
await page.fill('input[name=src_key]', realKey);
await page.fill('input[name=src_month_limit]', '0');
await page.locator('form[action="/admin/source"] button:has-text("حفظ")').click(); await page.waitForLoadState('networkidle');
goneSrv.close();

// ---------- ماي باي الحقيقية: خادم يحاكي ردودهم بالضبط ويوقّع الويبهوك بـHMAC حقيقي ----------
// كل الأشكال منقولة حرفيًا من إضافة ماي باي الرسمية (libyan-payments-for-mypay 1.0.7):
// /authentication/token ⟵ {client_id,secret_id} ⟶ data.access_token
// /payment/create + Bearer ⟵ {amount,currency,full_name,email,phone,return_url,cancel_url,webhook_url,custom}
//                                              ⟶ data.payment_url + data.token
// الويبهوك: X-MyPay-Signature = hash_hmac('sha256', raw_body, secret) بصيغة hex
const MP_SECRET = 'e2e-mypay-webhook-secret';
const mpSeen = { token: 0, create: null, auth: null };
const mpSrv = createServer((q, res) => {
  let body = '';
  q.on('data', d => { body += d; });
  q.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (q.url.includes('/authentication/token')) {
      mpSeen.token++; mpSeen.auth = JSON.parse(body || '{}');
      return res.end(JSON.stringify({ data: { access_token: 'e2e-access-token' } }));
    }
    if (q.url.includes('/payment/create')) {
      mpSeen.create = { body: JSON.parse(body || '{}'), auth: q.headers.authorization };
      return res.end(JSON.stringify({ data: { payment_url: BASE + '/pay/mock/e2e-real', token: 'mp-trx-9911' } }));
    }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise(r => mpSrv.listen(8803, r));
// الكتلة تُعيد الوضع إلى المحاكاة مهما حدث: انهيارها وهي في وضع live يترك القاعدة مشيرة
// إلى خادم وهمي مغلق، فتسقط فحوص الدفع في التشغيلة التالية لسبب لا علاقة له بها.
const mpRestore = async () => {
  try {
    await login(page, '0910000000', 'admin123');
    await page.goto(BASE + '/admin/payments');
    await page.selectOption('select[name=mypay_mode]', 'mock');
    await page.fill('input[name=mypay_base_url]', 'https://mypay.ly');
    await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
    await page.waitForLoadState('networkidle');
  } catch {}
  try { mpSrv.close(); } catch {}
};
process.once('uncaughtException', async (e) => { await mpRestore(); console.error(e); process.exit(1); });
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/payments');
await page.selectOption('select[name=mypay_mode]', 'live');
// رد ماي باي يأتي بالعربية مُرمَّزة \uXXXX: يجب أن يُفكّ ليقرأه صاحب المشروع، وأن يُذكر
// العنوان المستعمل فعلًا لأن الاختبار يأخذ قيم النموذج لا المحفوظ — هنا يظهر خطأ البيئة فورًا
const mpErrSrv = createServer((_q, res) => {
  res.writeHead(400, { 'content-type': 'application/json' });
  res.end('{"code":400,"message":"\\u0628\\u064a\\u0627\\u0646\\u0627\\u062a \\u0627\\u0644\\u0627\\u0639\\u062a\\u0645\\u0627\\u062f \\u063a\\u064a\\u0631 \\u0635\\u0627\\u0644\\u062d\\u0629"}');
});
await new Promise(r => mpErrSrv.listen(8804, r));
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8804');
await page.locator('button:has-text("اختبار الاتصال")').click();
await page.waitForLoadState('networkidle');
expect(await has(page, 'بيانات الاعتماد غير صالحة'), 'رد ماي باي العربي يُفكّ ترميزه ويُقرأ');
expect(await has(page, '127.0.0.1:8804'), 'نتيجة الاختبار تذكر العنوان المستعمل فعلًا');
mpErrSrv.close();
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8803');
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8803');
await page.fill('input[name=mypay_client_id]', 'e2e-client-id');
await page.fill('input[name=mypay_secret_id]', 'e2e-secret-id');
await page.fill('input[name=mypay_webhook_secret]', MP_SECRET);
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
expect(await has(page, '/pay/sandbox/api/v1'), 'اللوحة تعرض عنوان الساندبوكس الحقيقي المركَّب');
// «اختبار الاتصال» في وضع المحاكاة لا يلمس ماي باي: يجب أن يقولها صراحةً لا أن يظهر نجاحًا أخضر
await page.selectOption('select[name=mypay_mode]', 'mock');
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
await page.locator('button:has-text("اختبار الاتصال")').click();
await page.waitForLoadState('networkidle');
expect(await has(page, 'لم يُختبر شيء'), 'اختبار الاتصال في وضع المحاكاة يقول إنه لم يختبر البوابة');
expect((await page.locator('.flash.ok').count()) === 0, 'لا رسالة نجاح خضراء مضلِّلة في وضع المحاكاة');
await page.selectOption('select[name=mypay_mode]', 'live');
// النطاق القديم api.mypay.ly محفوظ في قواعد قائمة ولا وجود له عندهم: يجب أن يُصحَّح تلقائيًا
await page.fill('input[name=mypay_base_url]', 'https://api.mypay.ly');
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
const fixedBase = (await page.locator('p:has-text("العنوان الفعلي المستعمل الآن") b.mono').first().textContent()).trim();
expect(fixedBase === 'https://mypay.ly/pay/sandbox/api/v1', `النطاق القديم api.mypay.ly يُصحَّح تلقائيًا (${fixedBase})`);
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8803');
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');

// زبونة تشتري فعلًا وتُحوَّل إلى «بوابة ماي باي» — نفس مسار الزبونة الحقيقي
// كلمة مرورها صارت secret456 بعد فحص تغيير كلمة المرور أعلاه — لا secret123
await login(page, PHONE, 'secret456');
expect(!page.url().includes('/login'), 'الزبونة دخلت قبل شراء تجربة ماي باي');
// نفس الخطوات التي تنجح في كتلة الشراء الأولى بالضبط، لا صياغة جديدة
await page.goto(BASE + '/c/bags');
await page.click('.card >> nth=1'); await page.waitForLoadState('networkidle');
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
expect((await page.locator('.cart-row').count()) >= 1, `الزبونة أضافت قطعة للسلة قبل الدفع (${await page.locator('.cart-row').count()})`);
await page.goto(BASE + '/checkout'); await page.waitForLoadState('networkidle');
await page.selectOption('select[name=city]', 'طرابلس').catch(() => {});
await page.fill('textarea[name=address]', 'شارع الجمهورية، عمارة 2').catch(() => {});
await page.locator('.pm-list input[value^=mypay_]').first().check();
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
expect(mpSeen.token === 1, `الموقع طلب توكنًا من ماي باي أولًا (${mpSeen.token})`);
expect(mpSeen.auth?.client_id === 'e2e-client-id' && mpSeen.auth?.secret_id === 'e2e-secret-id',
  `التوكن يُطلب بـ client_id و secret_id كما تتطلب ماي باي (${JSON.stringify(mpSeen.auth)})`);
expect(mpSeen.create?.auth === 'Bearer e2e-access-token', `إنشاء الدفع يحمل التوكن (${mpSeen.create?.auth})`);
const cb = mpSeen.create?.body ?? {};
expect(cb.full_name && cb.phone && cb.amount > 0 && cb.currency === 'LYD',
  `جسم الطلب بأسماء حقول ماي باي (full_name=${cb.full_name} amount=${cb.amount} ${cb.currency})`);
expect(!!cb.custom, `مرجعنا يُرسل في custom ليعود في الويبهوك (${cb.custom})`);
expect(/\/api\/mypay\/webhook$/.test(cb.webhook_url ?? ''), `عنوان الويبهوك يُرسل معه (${cb.webhook_url})`);

// إشعار موقَّع توقيعًا صحيحًا ⟵ الطلب يصير مدفوعًا
const mpPay = JSON.stringify({ custom: cb.custom, status: 'success', trx_ref: 'mp-trx-9911', gateway: 'sadad', amount: cb.amount });
const mpSig = createHmac('sha256', MP_SECRET).update(mpPay).digest('hex');
const mpRes = await page.evaluate(async ([b, body, sig]) => {
  const r = await fetch(b + '/api/mypay/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mypay-signature': sig }, body });
  return { code: r.status, text: (await r.text()).slice(0, 120) };
}, [BASE, mpPay, mpSig]);
expect(mpRes.code === 200, `الإشعار الموقَّع يُقبل (HTTP ${mpRes.code} — ${mpRes.text})`);
const mpOrder = String(cb.custom).match(/DL-\d{4}-\d{6}/)?.[0];
await page.goto(BASE + '/orders/' + mpOrder);
expect(await has(page, 'مدفوع'), `الطلب ${mpOrder} صار مدفوعًا بعد إشعار ماي باي الموقَّع`);
await shot(page, 'mypay-live-paid');
// توقيع مزوّر ⟵ رفض
const mpBadSig = await page.evaluate(async ([b, body]) => {
  const r = await fetch(b + '/api/mypay/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mypay-signature': 'deadbeef' }, body });
  return r.status;
}, [BASE, mpPay]);
expect(mpBadSig === 401, `الإشعار بتوقيع مزوّر يُرفض (${mpBadSig})`);
// الرفض يجب أن يقول سببه: سرّ غير متطابق هو أخطر حالة (المال يُخصم والطلب يبقى غير مدفوع)
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/payments');
expect(await has(page, 'التوقيع لا يطابق السرّ المحفوظ'), 'سجل البوابة يسمّي سبب رفض الإشعار لا يكتفي بـ«غير صالح»');

// ---- بوابة ميتة: يجب ألا تصمت الصفحة، ويجب أن يبقى أثر في السجل ----
// في 2026/09/22 ضغط صاحب المشروع «ادفع» فوجد سلة فارغة: لا رسالة نجاح ولا فشل،
// والدفعة بقيت 'created' بلا سطر واحد في السجل لأن التسجيل كان *بعد* الاتصال.
await page.goto(BASE + '/admin/payments');
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8809');   // لا شيء يستمع على هذا المنفذ
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/c/bags');
await page.click('.card >> nth=1'); await page.waitForLoadState('networkidle');
await page.click('#addForm button[type=submit]'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/checkout'); await page.waitForLoadState('networkidle');
await page.selectOption('select[name=city]', 'طرابلس').catch(() => {});
await page.fill('textarea[name=address]', 'شارع الجمهورية، عمارة 2').catch(() => {});
await page.locator('.pm-list input[value^=mypay_]').first().check();
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
expect(await has(page, 'تعذر بدء الدفع'), 'بوابة لا تستجيب تُظهر صفحة خطأ للزبونة لا صمتًا');
expect(await has(page, 'لم يُخصم منكِ شيء'), 'صفحة الخطأ تطمئن الزبونة أن لا خصم وتذكر رقم الطلب');
await shot(page, 'pay-start-failed');
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/payments');
// العنوان المركَّب كاملًا لا يظهر إلا في سطر السجل (خانة الإعدادات تعرض الجذر فقط)
expect(await has(page, '127.0.0.1:8809/pay/sandbox/api/v1/payment/create'), 'المحاولة الفاشلة تركت سطرًا في سجل البوابة بعنوانها المركَّب');
expect(await has(page, 'تعذّر الحصول على توكن'), 'سطر السجل يسمّي سبب الفشل لا يكتفي بالصمت');
expect(await page.locator('.plog summary .status.red').count() > 0, 'سطر المحاولة الفاشلة مُعلَّم بالأحمر');
await page.fill('input[name=mypay_base_url]', 'http://127.0.0.1:8803');
await page.locator('form:has(select[name=mypay_mode]) button:has-text("حفظ")').first().click();
await page.waitForLoadState('networkidle');
// الطلب الذي أنشأه هذا الفحص يبقى «مدفوعًا» في طابور شاهين، وتراكمه عبر التشغيلات
// يدفع طلب الفحص الأصلي خارج الصفحة الأولى فيسقط فحص لا علاقة له بنا. ننهيه كما ينهيه الأدمن.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/orders?q=' + mpOrder);
const mpRow = await page.locator(`tr:has-text("${mpOrder}") a[href^="/admin/orders/"]`).first().getAttribute('href').catch(() => null);
if (mpRow) {
  await page.goto(BASE + mpRow);
  await page.selectOption('select[name=status]', 'delivered').catch(() => {});
  await page.locator('form:has(select[name=status]) button:has-text("حفظ")').first().click().catch(() => {});
  await page.waitForLoadState('networkidle');
}
await mpRestore();   // نعيد وضع المحاكاة والعنوان الحقيقي حتى لا تتأثر بقية الفحوص

// ---------- لوحة صحة الكتالوج: الأرقام التي يقودها المالك بنفسه ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/source');
const hk = page.locator('.card-box:has(h3:text("صحة الكتالوج")) .kpi');
expect((await hk.count()) === 8, `لوحة صحة الكتالوج تعرض ثمانية أرقام (${await hk.count()})`);
const cnLive = num(await hk.nth(1).locator('b').textContent());
expect(cnLive === 0, `لا عنوان صيني ظاهر للزبونة (${cnLive})`);
expect(num(await hk.nth(0).locator('b').textContent()) > 0, 'عدد المنتجات المعروضة يظهر في اللوحة');
expect((await page.locator('button:has-text("أثرِ 10 منتجات الآن")').count()) === 1, 'زر الإثراء موجود في اللوحة');
expect((await page.locator('button:has-text("ترجم 20 عنوانًا الآن")').count()) === 1, 'زر الترجمة موجود في اللوحة');
expect(await has(page, 'سقف استدعاءات المزوّد في الشهر'), 'حقل السقف الشهري لاستدعاءات المزوّد موجود');
// الميزانية بالكريدت: المالك يجب أن يرى ثمن الضغطة قبل أن يضغط، لا عدد استدعاءات مجرّدًا
expect(await has(page, '20 كريدت لكل استدعاء'), 'اللوحة تقول سعر الاستدعاء صراحةً');
expect(await has(page, 'ضغطة «أثرِ 10 منتجات» تكلّف'), 'اللوحة تقول كم تكلّف ضغطة الإثراء');
expect(await has(page, 'كريدت متبقٍ') || await has(page, 'انتهت الميزانية'), 'اللوحة تعرض المتبقي من ميزانية الشهر');
// اللوحة فيها أكثر من فقرة: ننتقي فقرة الوتيرة بنصّها لا بموضعها
const pace = (await page.locator('.card-box:has(h3:text("صحة الكتالوج")) p', { hasText: 'كل ساعة' }).first().textContent()).replace(/\s+/g, ' ');
const perHour = parseInt((pace.match(/يأخذ (\d+) منتجًا كل ساعة/) || [])[1] || '0');
// الحصة 10000 استدعاء شهريًا: أي وتيرة تتجاوز 14 في الساعة تلتهمها قبل نهاية الشهر
expect(perHour >= 1 && perHour <= 14, `وتيرة الإثراء التلقائي توزّع الميزانية على الشهر (${perHour}/ساعة)`);
await shot(page, 'admin-catalog-health');
// السقف يوقف الاستيراد فعلًا: نضبطه على 1 ونحاول تشغيل مهمة
await page.goto(BASE + '/admin/source');
await page.fill('input[name=src_month_limit]', '1');
await page.click('form[action="/admin/source"] button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
await page.click('form[action="/admin/source/run"] button'); await page.waitForLoadState('networkidle');
expect(await has(page, 'السقف الشهري') || await has(page, 'شُغّلت 0'), 'بلوغ السقف يمنع تشغيل مهام المزوّد');
await page.goto(BASE + '/admin/source');
await page.fill('input[name=src_month_limit]', '0');
await page.click('form[action="/admin/source"] button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
expect((await page.locator('input[name=src_month_limit]').inputValue()) === '0', 'إلغاء السقف يعيد التشغيل');

// ---------- الحشمة: لا ملابس نوم ولا داخلية على الرئيسية ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/categories');
expect(await has(page, 'في الرئيسية'), 'لوحة الأقسام فيها مفتاح «في الرئيسية»');
const lingerieRow = page.locator('tr', { hasText: 'lingerie' });
expect(!(await lingerieRow.locator('input[name=show_home]').isChecked()), 'قسم الملابس الداخلية والنوم مُخرَج من الرئيسية');
await shot(page, 'admin-categories-modesty');
await page.goto(BASE + '/logout');
await page.goto(BASE + '/');
const homeText = await page.locator('.card').allTextContents();
const naughty = /بيجام|ملابس نوم|قميص نوم|لانجي?ري|حمالة صدر|سوتيان|كيلوت|بيكيني|مايوه|مفتوح الخلف|شفاف/;
const leaked = homeText.filter(t => naughty.test(t));
expect(leaked.length === 0, `لا ملابس نوم أو داخلية على الرئيسية (تسرّب ${leaked.length}: ${leaked.slice(0, 2).join(' | ')})`);
const homeCats = await page.locator('.home-floor h3, .floor h3, section h3').allTextContents();
expect(!homeCats.some(t => t.includes('ملابس داخلية ونوم')), 'لا طابق للملابس الداخلية والنوم على الرئيسية');
expect(await has(page, 'ملابس داخلية ونوم'), 'القسم يبقى في قائمة الأقسام تدخله الزبونة بنفسها');
await shot(page, 'home-modest');
// القسم نفسه يعمل عند الدخول إليه
const rl = await page.goto(BASE + '/c/lingerie');
expect(rl.status() === 200, 'صفحة قسم الملابس الداخلية والنوم تفتح لمن دخلتها');
expect((await page.locator('.card').count()) > 0, 'القسم الخاص يعرض منتجاته داخله');
await shot(page, 'category-lingerie');
// صفحة العروض عامة أيضًا
await page.goto(BASE + '/sale');
const saleText = await page.locator('.card').allTextContents();
expect(saleText.filter(t => naughty.test(t)).length === 0, 'صفحة العروض بلا ملابس نوم أو داخلية');
await login(page, PHONE, 'secret456');   // نعود بحساب الزبونة لفحوصات الدردشة

// ---------- الدردشة المباشرة وصندوق الرسائل ----------
await page.goto(BASE + '/');
expect(await page.locator('#chatFab').isVisible(), 'زر الدردشة المباشرة ظاهر في كل الصفحات');
await page.click('#chatFab');
expect(await page.locator('#chatPanel').isVisible(), 'لوحة الدردشة تُفتح بالنقر');
const chatMsg = 'مرحبًا، متى يصل طلبي؟ ' + String(Date.now()).slice(-5);
await page.fill('#chatInput', chatMsg);
await page.click('#chatForm button[type=submit]');
await page.waitForFunction(t => document.querySelector('#chatBody')?.textContent.includes(t), chatMsg, { timeout: 10000 });
expect(true, 'رسالة الزبونة تظهر في الدردشة فور إرسالها');
const chatCode = (await page.locator('.ch-h').textContent()).match(/TK-\d{4}-\d+/)?.[0];
expect(!!chatCode, `الدردشة أنشأت تذكرة برقم ${chatCode}`);
await shot(page, 'chat-customer');
// الدردشة عن طلب محدد من صفحة الطلب
await page.goto(BASE + '/orders/' + orderCode);
expect(await page.locator('[data-chat-order]').count() === 1, 'زر مراسلة الفريق موجود في صفحة الطلب');
await page.click('[data-chat-order]');
expect(await page.locator('#chatPanel').isVisible(), 'زر الطلب يفتح الدردشة مربوطة بالطلب');
const orderMsg = 'استفسار عن الطلب ' + orderCode;
await page.fill('#chatInput', orderMsg); await page.click('#chatForm button[type=submit]');
await page.waitForFunction(t => document.querySelector('#chatBody')?.textContent.includes(t), orderMsg, { timeout: 10000 });
const orderChatCode = (await page.locator('.ch-h').textContent()).match(/TK-\d{4}-\d+/)?.[0];
expect(!!orderChatCode && orderChatCode !== chatCode, 'محادثة الطلب منفصلة عن الدردشة العامة');
await shot(page, 'chat-order');
// الموظف يرى المحادثتين ويرد
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/tickets');
expect(await has(page, chatCode), 'محادثة الدردشة تظهر في تذاكر الإدارة');
expect(await has(page, orderChatCode), 'محادثة الطلب تظهر في تذاكر الإدارة');
await page.click(`a:has-text("${chatCode}")`); await page.waitForLoadState('networkidle');
expect(await has(page, chatMsg), 'نص رسالة الزبونة يصل للموظف كاملًا');
const staffReply = 'أهلًا بك، طلبك في الطريق ويصل خلال يومين.';
await page.fill('form[action$="/reply"] textarea', staffReply); await page.click('button:has-text("إرسال الرد")'); await page.waitForLoadState('networkidle');
await shot(page, 'chat-admin-reply');
// الزبونة ترى الرد داخل نافذة الدردشة نفسها
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/');
await page.click('#chatFab');
await page.waitForFunction(t => document.querySelector('#chatBody')?.textContent.includes(t), staffReply, { timeout: 15000 });
expect(true, 'رد الفريق يظهر للزبونة داخل الدردشة');
expect(await page.locator('#chatBody .ch-msg.staff').count() >= 1, 'رد الفريق يظهر بتنسيق رسالة موظف');
await shot(page, 'chat-staff-reply');
await page.goto(BASE + '/account/tickets/' + chatCode);
expect(await has(page, staffReply), 'المحادثة نفسها محفوظة في صندوق الرسائل داخل الحساب');

// ---------- منتج وصل قبل أن تُترجم ترجمته: يُحجز مسودة ولا يراه الزبون ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
const cnOffer = '68' + String(Date.now()).slice(-10);
const cnTitle = '跨境外贸女装连衣裙夏季新款 ' + String(Date.now()).slice(-5);
const dressOpt = await page.locator('form[action$="/import/json"] select[name=category_id] option').evaluateAll(
  os => (os.find(o => o.textContent.includes('فساتين')) || {}).value);
await page.selectOption('form[action$="/import/json"] select[name=category_id]', dressOpt);
const arOffer = '69' + String(Date.now()).slice(-10);
const fullOffer = '67' + String(Date.now()).slice(-10);
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: cnOffer, url: `https://detail.1688.com/offer/${cnOffer}.html`, title: cnTitle,
  priceCny: 42, images: ['https://cbu01.alicdn.com/img/ibank/test.jpg'], minQty: 1, inStock: true,
}, {
  // عنوان بكلمات فريدة لكل تشغيل: كاشف المكرر يرفض نسخة ثانية من قطعة تشبه ما في القسم، وهو سلوك صحيح
  offerId: arOffer, url: `https://detail.1688.com/offer/${arOffer}.html`, title: `قطعة اختبار ${arOffer}`,
  priceCny: 55, images: ['https://cbu01.alicdn.com/img/ibank/ar.jpg'], minQty: 1, inStock: true,
  // متغيّر بصورة من مخدّم المورّد: يجب ألّا يصل رابطها الخام إلى مصدر الصفحة
  variants: [{ color: 'أحمر', size: 'M', image: 'https://cbu01.alicdn.com/img/ibank/O1CN-variant-test.jpg', inStock: true }],
}, {
  // منتج مكتمل (صور ومقاسات ووزن): يجب أن يأتي بعد الناقص في طابور الإضافة المجانية
  offerId: fullOffer, url: `https://detail.1688.com/offer/${fullOffer}.html`, title: `قطعة مكتملة ${fullOffer}`,
  priceCny: 60, images: ['https://cbu01.alicdn.com/img/ibank/f1.jpg', 'https://cbu01.alicdn.com/img/ibank/f2.jpg', 'https://cbu01.alicdn.com/img/ibank/f3.jpg'],
  minQty: 1, inStock: true, weightG: 500,
  variants: [{ color: 'أزرق', size: 'L', inStock: true }],
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
expect(page.url().includes('imported=3'), 'الأدمن يستورد ثلاثة منتجات من لصق JSON');
// ---------- طابور الإضافة المجانية: الناقص أولًا ----------
// الإضافة تقرأ صفحة 1688 من متصفح المالك بلا أي تكلفة، فيجب أن تُنفق وقتها على ما ينقصه
// صور/مقاسات/وزن لا على منتج مكتمل. هذا ما يُنجز ركام الإثراء بلا انتظار حصة المزوّد.
const qres = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/import/queue', { headers: { 'x-import-token': 'dev-import-token' } });
  return r.json();
}, BASE);
const qids = qres.ids || [];
expect(qids.length > 0, `طابور الإضافة يعيد منتجات للفحص (${qids.length})`);
const iThin = qids.indexOf(arOffer), iFull = qids.indexOf(fullOffer);
expect(iThin >= 0, 'المنتج الناقص موجود في طابور الإضافة');
expect(iFull < 0 || iThin < iFull, `الناقص يسبق المكتمل في الطابور (ناقص ${iThin} · مكتمل ${iFull})`);
// ---------- الاستئناف: منتج تعذّر إثراؤه يُترك ويُنتقل لما بعده، ولا يُعاد إلى رأس الطابور ----------
// بلا هذا يبقى المنتج الذي لا تعطي صفحته وزنًا على الرأس أبدًا، فتدور الإضافة عليه 40 ساعة
// ولا تصل إلى بقية الكتالوج — نفس الفخّ الذي أحرق حصة المزوّد.
const tryEnrich = async (off) => page.evaluate(async ([b, o]) => {
  const r = await fetch(b + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' },
    body: JSON.stringify({ page_url: 'ext:test', items: [{ offerId: o, url: `https://detail.1688.com/offer/${o}.html`, title: `قطعة اختبار ${o}`, priceCny: 55, images: ['https://cbu01.alicdn.com/img/ibank/ar.jpg'], minQty: 1, inStock: true }] }) });
  return r.json();
}, [BASE, off]);
const queueNow = async () => (await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/import/queue', { headers: { 'x-import-token': 'dev-import-token' } });
  return (await r.json()).ids || [];
}, BASE));
const qPosBefore = (await queueNow()).indexOf(arOffer);
for (let i = 0; i < 3; i++) await tryEnrich(arOffer);   // ثلاث محاولات لا تُكمل النقص
const qPosAfter = (await queueNow()).indexOf(arOffer);
expect(qPosAfter < 0 || qPosAfter > qPosBefore, `المنتج المتعذّر يتأخر في الطابور بدل أن يدور عليه (${qPosBefore} ⟵ ${qPosAfter})`);
// ويظهر لصاحب المشروع ليُثريه بالكريدت
await page.goto(BASE + '/admin/products?stuck=1');
expect(await has(page, arOffer), 'المنتج المتعذّر يظهر في قائمة «تعذّر إثراؤه» بلوحة الأدمن');
expect(await has(page, 'أثريها بالكريدت'), 'اللوحة تشرح لصاحب المشروع ما العمل بهذه المنتجات');
await shot(page, 'admin-stuck-enrich');
// منتج بلا تقييم حقيقي لا يُعرض بنجوم مُختلقة
await page.goto(BASE + '/admin/products?q=' + arOffer);
const arHref = await page.locator(`tr:has-text("${arOffer}") a[href^="/p/"]`).first().getAttribute('href');
await page.goto(BASE + arHref);
expect(await has(page, 'لا تقييمات بعد'), 'المنتج بلا تقييمات يقول ذلك صراحةً بدل نجوم مُختلقة');
// جولة الموقع الحي كشفت أن رابط صورة المتغيّر كان يُكتب خامًا في `variantsJson`،
// فيظهر مخدّم المورّد ورقم حسابه لمن يفتح مصدر الصفحة. الصور تمرّ بالوسيط كلها.
const arSrc = await page.content();
expect(!/alicdn\.com|1688\.com|taobao\.com/.test(arSrc), 'صفحة المنتج لا تكتب رابط المورّد الخام في مصدرها');
expect(/variantsJson/.test(arSrc) ? /"image_url":"\/img\//.test(arSrc) : true, 'صورة المتغيّر تُكتب كرابط وسيط لا كرابط مورّد');
expect((await page.locator('.pd .meta .star').count()) === 0, 'لا نجوم على منتج لم يقيّمه أحد');
await page.goto(BASE + '/c/dresses');
const starless = await page.locator('.card .meta').filter({ hasText: 'وصل حديثًا' }).count();
expect(starless >= 1, 'بطاقة المنتج الجديد تقول «وصل حديثًا» بدل تقييم مُختلق');
await page.goto(BASE + '/admin/products?status=draft');
expect(await has(page, cnOffer), 'المنتج غير المترجم يُحجز في حالة مسودة داخل لوحة الأدمن');
await shot(page, 'admin-untranslated-draft');
const draftSlug = await page.locator(`tr:has-text("${cnOffer}") a[href^="/p/"]`).first().getAttribute('href').catch(() => null);
await page.goto(BASE + '/logout');
for (const path of ['/', '/c/dresses', '/new', '/search?q=%D9%81%D8%B3%D8%AA%D8%A7%D9%86']) {
  await page.goto(BASE + path);
  const cjk = ((await page.locator('body').textContent()).match(/[一-鿿]/g) || []).join('');
  expect(!cjk, `${path} يبقى بلا نص صيني بعد الاستيراد${cjk ? ` («${cjk.slice(0, 20)}»)` : ''}`);
}
if (draftSlug) {
  const rd = await page.goto(BASE + draftSlug);
  expect(rd.status() === 404, 'صفحة المنتج غير المترجم لا تُفتح للزبونة');
} else {
  expect(true, 'المنتج غير المترجم بلا رابط عام في المتجر');
}
await shot(page, 'home-no-chinese');

// ---------- مسودة صار عنوانها عربيًا بطريق آخر: يجب أن تُنشر لا أن تبقى محجوزة للأبد ----------
// (على الموقع الحي بقي منتج جاهز تمامًا — عنوان عربي، 6 صور، وزن، سعران — محجوزًا مسودةً
//  لأن النشر كان معلّقًا على أن تُغيّر دفعة الترجمة شيئًا في نفس التمريرة.)
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/products?status=draft&q=' + cnOffer);
const heldHref = await page.locator(`tr:has-text("${cnOffer}") a[href^="/admin/products/"]`).first().getAttribute('href');
await page.goto(BASE + heldHref);
// 1) نعطيها عنوانًا عربيًا من لوحة الأدمن: نموذج التحرير يحفظ الحالة كما هي، فتبقى مسودةً
//    وإن صار عنوانها سليمًا — وهذه هي الحالة العالقة بالضبط
await page.fill('input[name=title_ar]', `حامل اختبار عربي ${cnOffer}`);
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
expect(await page.locator('select[name=status]').inputValue() === 'draft', 'المسودة تبقى محجوزة رغم أن عنوانها صار عربيًا');
await shot(page, 'admin-stuck-draft');
// 2) زر الترجمة يُطلقها بلا أي استدعاء نموذج (النسخة المحلية بلا Workers AI)
await page.goto(BASE + '/admin/products');
await page.click('button:has-text("ترجمة العناوين الصينية")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + heldHref);
expect(await page.locator('select[name=status]').inputValue() === 'active', 'المسودة العربية تُنشر تلقائيًا ولا تبقى مخزونًا خفيًا');
const freedSlug = await page.locator('a:has-text("معاينة")').first().getAttribute('href');
await page.goto(BASE + '/logout');
const fr = await page.goto(BASE + freedSlug);
expect(fr.status() === 200, 'صفحة المنتج المُطلَق تُفتح للزبونة');
expect(await has(page, `حامل اختبار عربي ${cnOffer}`), 'الزبونة ترى عنوانه العربي في صفحته');
// ---------- عنوان مكسور: كلمة عربية ملتصقة ببقية لاتينية («زippers») ----------
// 137 منتجًا حيًا كانت تحمل هذا النص المكسور أمام الزبونة (22/09/26). الكنس بلا نموذج.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + heldHref);
await page.fill('input[name=title_ar]', `${cnOffer} كيس شفاف للهاتف والسماعات مع زippers`);
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
const sweep = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/source/translate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: JSON.stringify({ sweepFrom: 0 }) });
  return r.json();
}, BASE);
expect(sweep.swept >= 1, `الكنس أصلح عنوانًا مكسورًا واحدًا على الأقل (${sweep.swept})`);
await page.goto(BASE + heldHref);
const swept = await page.locator('input[name=title_ar]').inputValue();
expect(!/[\u0600-\u06FF][A-Za-z]|[A-Za-z][\u0600-\u06FF]/.test(swept), `لم يبقَ خلط أبجديات في العنوان (${swept})`);
expect(swept === `${cnOffer} كيس شفاف للهاتف والسماعات`, `الكلمة المكسورة وحدها حُذفت وحرف العطف اليتيم معها (${swept})`);
await page.goto(BASE + '/logout');
await login(page, '0910000000', 'admin123');
await page.goto(BASE + heldHref);
await page.fill('input[name=title_ar]', `حامل اختبار عربي ${cnOffer}`);
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');

// تنظيف: المنتج يبقى نشطًا وعنوانه الأصلي الصيني محفوظ في title_src، فيصير «توأمًا» لفحص
// المكرر في التشغيل التالي فيُرفض استيراد العيّنة الصينية. نخفيه كما يخفي الأدمن أي قطعة.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + heldHref);
await page.selectOption('select[name=status]', 'hidden');
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
expect(await page.locator('select[name=status]').inputValue() === 'hidden', 'الأدمن يخفي القطعة فتخرج من المتجر');
await page.goto(BASE + '/logout');

// ---------- الترقيم: نقرة على «3» يجب أن تفتح الصفحة الثالثة لا الأولى ----------
// صاحب المشروع: «مهما نقرت صفحة 3 أو 6 أو 9 ترجع إلى صفحة رقم واحد». السبب كان أن
// أرقام الصفحات تستعمل دالة روابط الفلاتر، وهي تحذف `page` عمدًا بعد أن تضعه.
// المسار واحد لكل الأقسام (/c/… و/search و/new و/sale) فالفحص يغطيها جميعًا.
await page.goto(BASE + '/logout');
for (const path of ['/c/all', '/new']) {
  await page.goto(BASE + path); await page.waitForLoadState('networkidle');
  const pageChips = page.locator('.pager .chip, .chip');
  const p3 = page.locator('a.chip', { hasText: /^3$/ }).first();
  if (!(await p3.count())) continue;                       // القسم أقصر من ثلاث صفحات
  const firstOnP1 = await page.locator('.card .t').first().textContent();
  const href3 = await p3.getAttribute('href');
  expect(/[?&]page=3(&|$)/.test(href3 ?? ''), `${path}: رابط الصفحة 3 يحمل page=3 (${href3})`);
  await p3.click(); await page.waitForLoadState('networkidle');
  expect(/[?&]page=3(&|$)/.test(page.url()), `${path}: المتصفح وصل فعلًا إلى page=3 (${page.url()})`);
  expect(await has(page, 'الصفحة 3'), `${path}: الصفحة تقول إنها الثالثة`);
  const firstOnP3 = await page.locator('.card .t').first().textContent();
  expect(firstOnP1 !== firstOnP3, `${path}: بضاعة الصفحة 3 غير بضاعة الأولى`);
  // «عرض المزيد» من الثالثة يذهب للرابعة لا للأولى
  const more = page.locator('a.more-btn').first();
  if (await more.count()) expect(/[?&]page=4(&|$)/.test((await more.getAttribute('href')) ?? ''), `${path}: «عرض المزيد» من الثالثة يذهب للرابعة`);
  // وتغيير الفلتر من الصفحة الثالثة يعود للأولى عمدًا — وإلا وقعت الزبونة في صفحة فارغة
  const sortLink = page.locator('a[href*="sort="]').first();
  if (await sortLink.count()) {
    const h = await sortLink.getAttribute('href');
    expect(!/[?&]page=/.test(h ?? ''), `${path}: تغيير الفرز يُصفّر الصفحة (${h})`);
  }
}
await shot(page, 'pager-page-3');

// ---------- لا منتج يُجبر الزبونة على أكثر من قطعة ----------
// «نحن موقع يبيع بالقطعة، لا يمكن أن نجبر الزبون أن يشتري أكثر من قطعة إلا برغبته»
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/import');
const moq2Offer = '71' + String(Date.now()).slice(-10); const moq2Tag = uniqTag();
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: moq2Offer, url: `https://detail.1688.com/offer/${moq2Offer}.html`, title: `قطعتان ${moq2Tag}`,
  priceCny: 7, images: ['https://cbu01.alicdn.com/img/ibank/two.jpg'], minQty: 2, inStock: true, weightG: 150,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin/products?q=' + moq2Offer);
expect((await page.locator(`tr:has-text("${moq2Offer}")`).first().textContent()).includes('hidden'),
  'حتى الحد الأدنى «قطعتان» يدخل مخفيًا — المتجر بالقطعة');
// والثغرة الثانية: الإثراء يكتشف الحد الأدنى بعد أن يصير المنتج على الرف. نستورد قطعة
// حدّها الأدنى 1 (فتكون نشطة) ثم يأتي الإثراء برقم 3 — يجب أن تُخفى لا أن تبقى تُجبر.
const leakOffer = '72' + String(Date.now()).slice(-10); const leakTag = uniqTag();
const imp = async (body) => page.evaluate(async ([b, d]) => {
  const r = await fetch(b + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: JSON.stringify(d) });
  return r.json();
}, [BASE, body]);
await imp({ category_id: 1, page_url: 'e2e:moq', items: [{ offerId: leakOffer, url: `https://detail.1688.com/offer/${leakOffer}.html`, title: `قطعة ${leakTag}`, priceCny: 6, images: ['https://cbu01.alicdn.com/img/ibank/l.jpg'], minQty: 1, inStock: true, weightG: 100 }] });
await page.goto(BASE + '/admin/products?q=' + leakOffer);
expect((await page.locator(`tr:has-text("${leakOffer}")`).first().textContent()).includes('active'), 'قطعة حدّها الأدنى 1 تدخل نشطة');
await imp({ category_id: 1, page_url: 'e2e:moq2', items: [{ offerId: leakOffer, url: `https://detail.1688.com/offer/${leakOffer}.html`, title: `قطعة ${leakTag}`, priceCny: 6, images: [], variants: [], minQty: 3, inStock: true }] });
await page.goto(BASE + '/admin/products?q=' + leakOffer);
expect((await page.locator(`tr:has-text("${leakOffer}")`).first().textContent()).includes('hidden'),
  'الإثراء الذي يرفع الحد الأدنى إلى 3 يُخفي القطعة فورًا');
// ولا يبقى على الرف منتج واحد يُجبر الزبونة
const forced = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/source/stats', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: '{}' });
  return (await r.json()).totals;
}, BASE);
expect(typeof forced.active === 'number', `الإحصاءات تعمل (${forced.active} نشط)`);

// ---------- ترقيم اللوحة: القوائم كانت تقف عند 200 صفّ بلا رقم صفحة ----------
await page.goto(BASE + '/admin/products');
const admTotal = await page.locator('.pager span').first().textContent().catch(() => '');
if (/من \d+/.test(admTotal)) {
  const adm3 = page.locator('.pager a', { hasText: /^2$/ }).first();
  const h = await adm3.getAttribute('href');
  expect(/[?&]page=2(&|$)/.test(h ?? ''), `لوحة المنتجات: رابط الصفحة 2 يحمل page=2 (${h})`);
  await adm3.click(); await page.waitForLoadState('networkidle');
  expect(/[?&]page=2(&|$)/.test(page.url()), `لوحة المنتجات: وصلنا فعلًا للصفحة 2 (${page.url()})`);
  expect(await has(page, 'الصفحة 2'), 'لوحة المنتجات تقول إنها الصفحة الثانية');
}
// ---------- الإضافة المجانية: الطابور والكرون لا يتنازعان ----------
// الكرون كان يأخذ مهمة الإضافة بمعرّفها فيتجاوز فلتر `runner`، فيُنفق كريدت المزوّد على
// عمل تفعله الإضافة مجانًا ويكتب «error (خادم)» فيظنّ صاحب المشروع أن الإضافة فشلت.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/crawler');
expect(await has(page, 'متبقٍ للإثراء'), 'صفحة الزاحف تعرض كم بقي للإثراء');
expect(await has(page, 'فحصتها الإضافة في 24 ساعة'), 'وتعرض معدّل الإضافة وحدها لا مجموع كل المهام');
// زرّ الزاحف مثبّت في شريط اللوحة: نقرة واحدة من أي صفحة
await page.goto(BASE + '/admin/orders');
const pin = page.locator('.hdr-links a.pin').first();
expect((await pin.getAttribute('href')) === '/admin/crawler', 'زرّ الزاحف مثبّت في شريط اللوحة العلوي');
await pin.click(); await page.waitForLoadState('networkidle');
expect(page.url().endsWith('/admin/crawler'), `النقر عليه يفتح صفحة الزاحف (${page.url()})`);
// صاحب المشروع لا يملك حسابًا صينيًا: يجب أن تقول الصفحة صراحةً إنه لا يحتاجه
expect(await has(page, 'لا تحتاج تسجيل دخول في 1688 إطلاقًا'), 'الصفحة تنفي الحاجة لحساب 1688 صراحةً');
expect(await has(page, 'detail.1688.com/offer'), 'وتسمّي الصفحة التي تقرؤها الإضافة');
// رقم النسخة في الشيفرة يجب أن يطابق ملف الإضافة، وإلا لم يعرف صاحب المشروع أيّ نسخة تعمل
const extManifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const srvVer = readFileSync('src/routes/admin-ops.tsx', 'utf8').match(/EXT_VERSION = '([^']+)'/)?.[1];
expect(extManifest.version === srvVer, `نسخة الإضافة في اللوحة تطابق manifest (${srvVer} = ${extManifest.version})`);
// نسخة قديمة تتصل ⟵ اللوحة تحذّر. نزوّر اتصال v1.4.0 عبر نقطة المهام التي تناديها الإضافة
await page.evaluate(async (b) => {
  await fetch(b + '/api/crawl/jobs?v=1.4.0', { headers: { 'x-import-token': 'dev-import-token' } });
}, BASE);
await page.goto(BASE + '/admin/crawler');
expect(await has(page, 'نسخة إضافة قديمة متصلة: v1.4.0'), 'اللوحة تحذّر حين تتصل نسخة إضافة قديمة');
// وتختفي حين تتصل الحالية — **بلا إعادة تحميل**: صاحب المشروع حدّث الإضافة والصفحة مفتوحة
// فبقي التحذير الأحمر و«v1.5.0» حتى ضغط F5. نُعيد الحالة كما كانت (قاعدة: كل فحص يُعيد ما غيّره)
await page.evaluate(async ([b, v]) => {
  await fetch(b + '/api/crawl/jobs?v=' + v, { headers: { 'x-import-token': 'dev-import-token' } });
}, [BASE, extManifest.version]);
const oldGone = await page.waitForFunction(() => !document.querySelector('#live .live-old'), null, { timeout: 15000 }).then(() => true, () => false);
expect(oldGone, 'تحذير النسخة القديمة يختفي وحده خلال ثوانٍ من اتصال الحالية، والصفحة مفتوحة');
expect(((await page.locator('#live .live-ver').textContent().catch(() => '')) || '').includes('v' + extManifest.version), `وبطاقة التقدّم تذكر النسخة المتصلة الآن (v${extManifest.version})`);
await page.goto(BASE + '/admin/crawler');
expect(!(await has(page, 'نسخة إضافة قديمة متصلة')), 'التحذير يختفي حين تتصل النسخة الحالية');
// وصفحة الكوبونات لم تعد تنكسر (وضعتُ التحذير فيها خطأً فسقطت بـ500)
const cp = await page.goto(BASE + '/admin/coupons');
expect(cp.status() === 200, `صفحة الكوبونات تعمل (${cp.status()})`);
// ---------- مهام البحث للخادم وحده: الإضافة بلا حساب 1688 تُحوَّل إلى صفحة الدخول فتعود «ok — 0» ----------
// (24/09/26: حوّل صاحب المشروع ثماني مهام بحث إلى الإضافة لأن الواجهة سمحت، فعادت كلها صفرًا)
await page.goto(BASE + '/admin/crawler');
await page.fill('form[action="/admin/crawler/new"] input[name=name]', 'بحث فحص');
await page.selectOption('form[action="/admin/crawler/new"] select[name=type]', 'search');
await page.fill('form[action="/admin/crawler/new"] input[name=query]', '连衣裙 测试');
await page.locator('form[action="/admin/crawler/new"] button').click(); await page.waitForLoadState('networkidle');
const sRow = page.locator('tr', { hasText: 'بحث فحص' }).first();
expect(await sRow.locator('select[name=runner]').count() === 0 && (await sRow.textContent()).includes('البحث يتطلب حساب 1688'), 'مهمة البحث لا تعرض خيار «الإضافة» وتقول لماذا');
const sId = (await sRow.locator('form[action^="/admin/crawler/"]').first().getAttribute('action')).split('/').pop();
// حتى لو أُرسل الطلب يدويًا: يُرفض برسالة وتبقى للخادم
const forcedRunner = await page.evaluate(async ([b, id]) => {
  const r = await fetch(b + '/admin/crawler/' + id, { method: 'POST', body: new URLSearchParams({ action: 'runner', runner: 'extension' }), redirect: 'follow' });
  return { url: r.url, html: await r.text() };
}, [BASE, sId]);
expect(forcedRunner.url.includes('err=') && forcedRunner.html.includes('يتطلب حسابًا صينيًا'), 'فرض «الإضافة» على مهمة بحث يُرفض برسالة تشرح السبب');
const jobsForExt = await page.evaluate(async ([b, v]) => (await fetch(b + '/api/crawl/jobs?v=' + v, { headers: { 'x-import-token': 'dev-import-token' } })).json(), [BASE, extManifest.version]);
expect((jobsForExt.jobs || []).every(j => j.type === 'stock'), `الإضافة لا تستلم إلا مهمة فحص المخزون (${(jobsForExt.jobs || []).map(j => j.type).join('،') || 'لا شيء مستحق'})`);
// نعيد الحالة: نحذف مهمة الفحص
await page.goto(BASE + '/admin/crawler');
await page.locator('tr', { hasText: 'بحث فحص' }).first().locator('button[value=delete]').click(); await page.waitForLoadState('networkidle');
expect(await page.locator('tr', { hasText: 'بحث فحص' }).count() === 0, 'مهمة الفحص حُذفت بعد التجربة');
// ---------- شريط تقدّم الإضافة: يتحرّك على الشاشة مع كل منتج، بلا إعادة تحميل ----------
// طلب صاحب المشروع: «ضع شريطًا يظهر التقدّم حتى أعرف أن الإضافة تعمل وتجلب وتثري المنتجات».
// الإضافة كانت صامتة 30 دقيقة لكل دفعة. نلعب دورها خطوةً خطوة ونراقب الصفحة المفتوحة تتغيّر وحدها.
const liveOffer = '73' + String(Date.now()).slice(-10), liveOffer2 = '74' + String(Date.now()).slice(-10); const liveTag = uniqTag();
const extCall = (path, body) => page.evaluate(async ([b, p, d]) => {
  const r = await fetch(b + p, d ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: JSON.stringify(d) } : { headers: { 'x-import-token': 'dev-import-token' } });
  return r.json();
}, [BASE, path, body]);
// عيّنتنا: منتجان كما يصلان من صفحة نتائج البحث — صورة واحدة، بلا مقاسات ولا وزن
await extCall('/api/import', { category_id: 1, page_url: 'test', items: [
  { offerId: liveOffer, title: `عيّنة ${liveTag}`, priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/live1.jpg'], inStock: true },
  { offerId: liveOffer2, title: `عيّنة ${liveTag}ب`, priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/live2.jpg'], inStock: true }] });
const stockJob = ((await extCall('/api/crawl/jobs?v=' + extManifest.version)).all || []).find(j => j.type === 'stock');
await page.goto(BASE + '/admin/crawler');
expect(await page.locator('#live .live-bar').count() === 1, 'صفحة الزاحف فيها شريط تقدّم الإضافة');
expect(await has(page, 'اكتمال بيانات الكتالوج') && await has(page, 'وزن حقيقي من المورّد'), 'وتعرض اكتمال الصور والمقاسات والوزن كلٌّ بشريطه');
const liveText = async () => (await page.locator('#live').textContent().catch(() => '')) || '';
const waitLive = async (re, what) => {
  const ok = await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('live')?.textContent || ''), re.source, { timeout: 15000 }).then(() => true, () => false);
  expect(ok, `${what} (${(await liveText()).replace(/\s+/g, ' ').trim().slice(0, 110)})`);
};
// 1) الإضافة تأخذ الطابور = بداية دفعة
const lq = await extCall('/api/import/queue');
// حجم الدفعة = الأصغر من طول الطابور وحدّ مهمة الإثراء (max_new) — نأخذه من الخادم نفسه
const lTotal = (await extCall('/api/crawl/live')).total;
expect(lTotal > 0 && lTotal <= (lq.ids || []).length, `بداية الدفعة سُجّلت بحجمها (${lTotal} من طابور ${(lq.ids || []).length})`);
await waitLive(new RegExp(`0 من ${lTotal.toLocaleString('en-US')}`), `الشريط يبدأ من الصفر بحجم الدفعة وحده بلا إعادة تحميل`);
expect((await page.locator('#live').getAttribute('data-state')) === 'running', 'وحالته «تعمل الآن»');
expect(await has(page, 'الإضافة تعمل الآن'), 'والعنوان يقولها بالعربية');
// 2) منتج قرأته الإضافة: صفحته أعطت ثلاث صور ومقاسين ووزنًا
const r1 = await extCall('/api/import', { category_id: null, page_url: 'ext:stock', items: [{ offerId: liveOffer, url: `https://detail.1688.com/offer/${liveOffer}.html`, title: `عيّنة ${liveTag}`, priceCny: 30,
  images: ['https://cbu01.alicdn.com/img/ibank/l1.jpg', 'https://cbu01.alicdn.com/img/ibank/l2.jpg', 'https://cbu01.alicdn.com/img/ibank/l3.jpg'],
  variants: [{ color: 'أحمر', size: 'M', inStock: true }, { color: 'أحمر', size: 'L', inStock: true }], weightG: 250, minQty: 1, inStock: true }] });
expect(r1.enriched === 1 && r1.gain?.img === 1 && r1.gain?.vars === 1 && r1.gain?.wt === 1, `الخادم يعدّ ما أُضيف فعلًا (${JSON.stringify(r1.gain)})`);
await waitLive(new RegExp(`1 من ${lTotal.toLocaleString('en-US')}`), 'الشريط يتقدّم إلى 1 وحده والصفحة مفتوحة');
const gainsTxt = (await page.locator('#live .live-gains').textContent()) || '';
expect(/صور\s*\+1/.test(gainsTxt) && /مقاسات وألوان\s*\+1/.test(gainsTxt) && /وزن\s*\+1/.test(gainsTxt), `ويعرض ما أُضيف: صور ومقاسات ووزن (${gainsTxt.replace(/\s+/g, ' ').trim()})`);
expect((await page.locator('#live .live-last a').getAttribute('href') || '').startsWith('/p/'), 'آخر منتج قرأته الإضافة رابطٌ يفتح صفحته في المتجر');
// 3) المرور الثاني على منتج مكتمل لا يُحسب «إثراءً» — كان كل مرور يُعدّ فظهر «مُثرى 100 من 100»
const r1b = await extCall('/api/import', { category_id: null, page_url: 'ext:test', items: [{ offerId: liveOffer, title: `عيّنة ${liveTag}`, priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/l1.jpg', 'https://cbu01.alicdn.com/img/ibank/l2.jpg'], weightG: 300, inStock: true }] });
expect(r1b.enriched === 0 && r1b.gain.img === 0 && r1b.gain.wt === 0, `مرور بلا إضافة لا يُعدّ إثراءً (enriched=${r1b.enriched})`);
// 4) صفحة لم تُظهر سعرًا (نزل المنتج أو لم تُحمَّل) — خطوة في الشريط بلا إضافة
await extCall('/api/import/check', { offerId: liveOffer2, inStock: false, priceCny: null });
await waitLive(new RegExp(`2 من ${lTotal.toLocaleString('en-US')}`), 'الشريط يتقدّم إلى 2 مع الصفحة التي لم تُقرأ');
expect(/لم يُقرأ\s*1/.test((await page.locator('#live .live-gains').textContent()) || ''), 'ويعدّها «لم يُقرأ» لا إثراءً');
await shot(page, 'crawler-live-running');
// 5) تقرير آخر الدفعة: الشريط يقول «اكتملت» وسجلّ التشغيل يحمل ما أُضيف فعلًا لا عدّاد الإضافة
if (stockJob) {
  await extCall('/api/crawl/report', { job_id: stockJob.id, started_at: new Date().toISOString(), status: 'ok', pages: 0, found: 0, imported: 0, updated: 1, enriched: 2, checked: 2 });
  await waitLive(/اكتملت الدفعة الأخيرة/, 'بعد تقرير الإضافة يقول الشريط «اكتملت الدفعة الأخيرة»');
  await page.reload();
  const row = (await page.locator('.tbl tr', { hasText: 'فحص' }).filter({ hasText: '🖼1' }).first().textContent().catch(() => '')) || '';
  expect(/🖼1\s*📏1\s*⚖️1/.test(row), `سجلّ التشغيل يحمل ما أُضيف فعلًا (${row.replace(/\s+/g, ' ').trim().slice(0, 90)})`);
  expect(await has(page, 'أضافته الإضافة فعلًا في 24 ساعة'), 'وبطاقة «أضافته فعلًا في 24 ساعة» ظاهرة');
  await shot(page, 'crawler-live-done');
} else expect(false, 'لا توجد مهمة فحص مخزون محليًا لتجربة التقرير');
// نقطة الحالة للإضافة محمية بالرمز
// (من خارج المتصفح: جلسة الأدمن في الصفحة تفتحها كما يجب)
const liveNoTok = (await fetch(BASE + '/api/crawl/live')).status;
expect(liveNoTok === 401, `حالة الإضافة لا تُقرأ بلا رمز (${liveNoTok})`);
// 6) صفحة لم تُحمَّل أو لم تُجب (الإضافة 1.5.3+): «لم يُقرأ» لا «غير متوفر».
// قبلها كانت القراءة الناقصة تعطي «بلا سعر» فيُعلَّم منتج متوفر غير متوفر.
await extCall('/api/import/queue');
const sk = await extCall('/api/import/check', { offerId: liveOffer, skipped: true });
const lvSk = await extCall('/api/crawl/live');
expect(sk.skipped === true && lvSk.done === 1 && lvSk.gone === 1, `الصفحة المتخطّاة تُعدّ «لم يُقرأ» في الشريط (done=${lvSk.done} gone=${lvSk.gone})`);
if (lvSk.last?.slug) {
  await page.goto(BASE + '/p/' + lvSk.last.slug);
  expect(!(await has(page, 'غير متوفر حاليًا عند المورد')), 'والمنتج بقي متوفرًا في المتجر');
}
// 7) دفعة ماتت بلا تقرير (أُغلق كروم أو توقف عامل الإضافة): الدفعة التالية تسجّلها بما أضافته
await extCall('/api/import/queue');
await page.goto(BASE + '/admin/crawler');
expect(await has(page, 'انقطعت الدفعة بعد 1'), 'الدفعة المنقطعة تظهر في سجل التشغيل بدل أن تختفي');
// الطابور الذي تقرأه الإضافة يعطي أرقام منتجات حقيقية ويقدّم الناقص
const queue = await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/import/queue', { headers: { 'x-import-token': 'dev-import-token' } });
  return r.json();
}, BASE);
expect(Array.isArray(queue.ids), 'طابور الإضافة يعيد قائمة أرقام');
expect(queue.ids.every(x => /^[0-9]{9,}$/.test(String(x))), `كل رقم في الطابور رقم منتج 1688 صالح (${queue.ids.slice(0, 2).join(',')})`);
// ---------- اكتشاف مجاني: روابط منتجات أخرى في صفحة المنتج (الإضافة 1.7.0) ----------
// سؤال صاحب المشروع: «ألا يمكننا أن نجلب بالإضافة مجانًا؟». البحث يطلب حسابًا، وصفحة المنتج لا.
// عيّنتنا: رقمان جديدان وُجدا في صفحة liveOffer، ومعهما رقم منتج قائم وآخر فاسد ورقم الصفحة نفسها.
const d1 = '81' + String(Date.now()).slice(-10), d2 = '82' + String(Date.now()).slice(-10);
const dsc = await extCall('/api/crawl/discover', { from: liveOffer, ids: [d1, d2, liveOffer2, 'abc', liveOffer, d1] });
expect(dsc.found === 3 && dsc.added === 2, `الخادم يحفظ الجديد وحده: لا المنتج القائم ولا الفاسد ولا الصفحة نفسها ولا المكرّر (وُجد ${dsc.found} · حُفظ ${dsc.added})`);
expect((await extCall('/api/crawl/discover', { from: liveOffer, ids: [d1, d2] })).added === 0, 'الرابط نفسه لا يُحفظ مرتين');
const qOld = await extCall('/api/import/queue?v=1.6.1');
expect(!(qOld.fresh || []).length, 'الإضافة القديمة (1.6.1) لا تستلم منتجات جديدة — لا تعرف ماذا تفعل بها فيبقى الشريط ناقصًا');
const qNew = await extCall('/api/import/queue?v=' + extManifest.version);
const fr1 = (qNew.fresh || []).find(f => f.id === d1);
expect(!!fr1 && (qNew.fresh || []).some(f => f.id === d2), `الإضافة ${extManifest.version} تستلم الرابطين المكتشفين (${(qNew.fresh || []).length} في الدفعة)`);
expect(fr1?.category_id === 1, `وبقسم الصفحة التي وُجدا فيها (قسم ${fr1?.category_id})`);
const lvD = await extCall('/api/crawl/live');
expect(lvD.total >= (qNew.fresh || []).length && lvD.total <= (qNew.ids || []).length + (qNew.fresh || []).length, `حجم الدفعة يشمل المنتجات الجديدة (${lvD.total})`);
// الإضافة فتحت صفحة d1 فقرأتها واستوردتها، وصفحة d2 لم تُحمَّل مرتين
const rD = await extCall('/api/import', { category_id: fr1?.category_id ?? 1, page_url: 'ext:discover', items: [{ offerId: d1, url: `https://detail.1688.com/offer/${d1}.html`, title: `مكتشف ${liveTag}`, priceCny: 22,
  images: ['https://cbu01.alicdn.com/img/ibank/d1a.jpg', 'https://cbu01.alicdn.com/img/ibank/d1b.jpg'], variants: [{ color: 'أزرق', inStock: true }], weightG: 180, minQty: 1, inStock: true }] });
expect(rD.imported === 1, `المنتج المكتشف دخل المتجر (جديد ${rD.imported})`);
await extCall('/api/crawl/discover', { from: d1, ids: [] });   // صفحة بلا روابط: تُعدّ صفحة مقروءة بلا روابط
await extCall('/api/crawl/discover/fail', { offerId: d2 }); await extCall('/api/crawl/discover/fail', { offerId: d2 });
const lvD2 = await extCall('/api/crawl/live');
expect(lvD2.disc?.added === 1 && lvD2.disc?.pages === 1 && lvD2.disc?.linked === 0, `الشريط يعدّ المنتج الجديد والصفحة بلا روابط (${JSON.stringify(lvD2.disc)})`);
const qAfter = await extCall('/api/import/queue?v=' + extManifest.version);
expect(!(qAfter.fresh || []).some(f => f.id === d1 || f.id === d2), 'المستورد والمتعذّر مرتين يخرجان من الطابور');
await page.goto(BASE + '/admin/products?q=' + d1);
expect(await has(page, `مكتشف ${liveTag}`), 'المنتج المكتشف يظهر في لوحة المنتجات');
// على الشاشة: بطاقة الاكتشاف في صفحة الزاحف، وضبط العدد في الدفعة من الزر
await extCall('/api/crawl/discover', { from: liveOffer, ids: [d2.replace(/^82/, '83')] });
await page.goto(BASE + '/admin/crawler');
expect(await page.locator('#discover h3', { hasText: 'اكتشاف منتجات جديدة مجانًا' }).isVisible(), 'صفحة الزاحف فيها بطاقة «اكتشاف منتجات جديدة مجانًا»');
const discTxt = ((await page.locator('#discover .disc-q').textContent()) || '').replace(/\s+/g, ' ');
expect(/أُضيف [1-9]/.test(discTxt) && /تعذّرت قراءته [1-9]/.test(discTxt), `وتعرض الطابور وما انتهى إليه (${discTxt.trim()})`);
expect(/اكتشاف مجاني/.test((await page.locator('#live .live-disc').textContent().catch(() => '')) || ''), 'وشريط التقدّم يذكر الروابط المكتشفة في الدفعة');
const perBefore = await page.locator('#discover input[name=per]').inputValue();
await page.fill('#discover input[name=per]', '0'); await page.click('#discover button'); await page.waitForLoadState('networkidle');
expect((await page.locator('#discover input[name=per]').inputValue()) === '0', 'زر الحفظ يضبط العدد في كل دفعة (0 = إيقاف)');
const qOff = await extCall('/api/import/queue?v=' + extManifest.version);
expect(!(qOff.fresh || []).length, 'وبـ0 لا تستلم الإضافة منتجات جديدة');
await page.fill('#discover input[name=per]', perBefore); await page.click('#discover button'); await page.waitForLoadState('networkidle');
expect((await page.locator('#discover input[name=per]').inputValue()) === perBefore, `أُعيد العدد كما كان (${perBefore})`);
await extCall('/api/crawl/discover/fail', { offerId: d2.replace(/^82/, '83') }); await extCall('/api/crawl/discover/fail', { offerId: d2.replace(/^82/, '83') });
await shot(page, 'crawler-discover');
if (stockJob) await extCall('/api/crawl/report', { job_id: stockJob.id, started_at: new Date().toISOString(), status: 'ok', checked: 0 });
await page.goto(BASE + '/logout');

// ---------- أرقام إنجليزية في كل الموقع ----------
// طلب صاحب المشروع (٢٤/٠٩/٢٦): «اجعل كل الأرقام في الموقع إنجليزية 1 2 3 لا ١ ٢ ٣، كالتي تظهر في مدة أيام الشحن».
// نكتب مدة الشحن في لوحة التسعير بلوحة مفاتيح عربية كما يفعل صاحب المشروع، ثم نمرّ على الصفحات كالزبونة.
const AR_D = /[\u0660-\u0669\u06F0-\u06F9\u066B\u066C]/;
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
const airBefore = await page.locator('input[name=air_days]').inputValue();
expect(!AR_D.test(airBefore), `خانة مدة الشحن الجوي بأرقام إنجليزية (${airBefore})`);
try {
  await page.fill('input[name=air_days]', '١٠ — ١٥ يومًا');
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=air_days]').inputValue()) === '10 — 15 يومًا', `ما يُكتب بأرقام عربية يُحفظ بأرقام إنجليزية (${await page.locator('input[name=air_days]').inputValue()})`);
  await page.goto(BASE + '/p/' + productSlug);
  expect(await has(page, '10 — 15 يومًا'), 'صفحة المنتج تعرض مدة الشحن الجديدة بأرقام إنجليزية');
  for (const pth of ['/', '/c/all', '/search?q=' + encodeURIComponent('فستان'), '/p/' + productSlug, '/cart', '/pages/shipping', '/pages/returns', '/pages/points', '/pages/sizes', '/pages/faq', '/pages/terms', '/admin/crawler']) {
    await page.goto(BASE + pth); await page.waitForLoadState('domcontentloaded');
    const txt = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('input,textarea')].map(e => e.value).join(' '));
    const bad = (txt.match(new RegExp('.{0,12}' + AR_D.source + '.{0,12}')) || [''])[0];
    expect(!bad, `${pth}: لا رقم عربي واحد على الشاشة${bad ? ` («${bad}»)` : ''}`);
  }
  await page.goto(BASE + '/c/dresses');
  const pTxt = ((await page.locator('.grid .card .p').first().textContent()) || '').trim();
  expect(/^[\d,]+(\.\d\d)?\s*د\.ل/.test(pTxt.replace(/\s+/g, ' ')), `سعر البطاقة بأرقام إنجليزية وفاصلة آلاف إنجليزية (${pTxt})`);
} finally {
  // قاعدة المشروع: أعد ما غيّرته ولو سقط فحص في المنتصف
  await page.goto(BASE + '/admin/pricing');
  await page.fill('input[name=air_days]', airBefore);
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=air_days]').inputValue()) === airBefore, `أُعيدت مدة الشحن كما كانت (${airBefore})`);
}
// ---------- روابط التواصل الحقيقية (٢٤/٠٩/٢٦) ----------
// جولة دراسة المنافس على موقعنا كشفت أن التذييل يحمل wa.me/218000000000 وfacebook.com الفارغ، وأن
// الرئيسية وصفحة الطلب تعرضان واتساب البذرة 218910000000 — رقم لا يملكه أحد، ورسالة زبونة إليه تضيع.
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
const waBefore = await page.locator('input[name=whatsapp_number]').inputValue();
const fbBefore = await page.locator('input[name=facebook_url]').inputValue();
try {
  await page.fill('input[name=whatsapp_number]', ''); await page.fill('input[name=facebook_url]', '');
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect(await page.locator('.wa-missing').isVisible(), 'اللوحة تنبّه: لا رقم واتساب حقيقي مضبوط');
  await page.goto(BASE + '/');
  expect(!(await has(page, '218910000000')) && !(await has(page, '218000000000')), 'الرئيسية لا تعرض رقم واتساب وهميًا');
  expect(await page.locator('.ftr-social a[aria-label=واتساب]').getAttribute('href') === '/pages/go/whatsapp', 'أيقونة واتساب في التذييل تمرّ بالخادم');
  await page.locator('.ftr-social a[aria-label=واتساب]').evaluate(a => a.removeAttribute('target'));
  await page.click('.ftr-social a[aria-label=واتساب]'); await page.waitForLoadState('domcontentloaded');
  expect(page.url().endsWith('/pages/contact'), `بلا رقم مضبوط تفتح صفحة خدمة الزبائن لا رقمًا وهميًا (${page.url().replace(BASE, '')})`);
  expect(!(await has(page, '91 000 0000')), 'صفحة خدمة الزبائن بلا الرقم الوهمي');
  // صاحب المشروع يكتب رقمه بمسافات وعلامة + كما يكتبه الناس
  await page.goto(BASE + '/admin/pricing');
  await page.fill('input[name=whatsapp_number]', '+218 92 345 6789'); await page.fill('input[name=facebook_url]', 'https://facebook.com/hudhude.ly');
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=whatsapp_number]').inputValue()) === '218923456789', `الرقم يُحفظ ويُعرض أرقامًا فقط (${await page.locator('input[name=whatsapp_number]').inputValue()})`);
  await page.goto(BASE + '/');
  expect(await has(page, '+218923456789'), 'الرئيسية تعرض رقم الواتساب الحقيقي');
  const goWa = await page.request.get(BASE + '/pages/go/whatsapp', { maxRedirects: 0 });
  expect(goWa.status() === 302 && goWa.headers().location === 'https://wa.me/218923456789', `أيقونة واتساب تفتح wa.me بالرقم الحقيقي (${goWa.headers().location})`);
  const goFb = await page.request.get(BASE + '/pages/go/facebook', { maxRedirects: 0 });
  expect(goFb.headers().location === 'https://facebook.com/hudhude.ly', `أيقونة فيسبوك تفتح صفحة المتجر (${goFb.headers().location})`);
  const goIg = await page.request.get(BASE + '/pages/go/instagram', { maxRedirects: 0 });
  expect(goIg.headers().location === '/pages/contact', 'إنستغرام غير مضبوط ⟵ صفحة خدمة الزبائن');
  await page.goto(BASE + '/pages/contact');
  expect(await page.locator('a[href="https://wa.me/218923456789"]').count() > 0, 'صفحة خدمة الزبائن تعرض الرقم الحقيقي رابطًا');
  await page.goto(BASE + '/pages/shipping');
  expect(!(await has(page, '8 — 14')) && !(await has(page, '25 — 40')), 'صفحة الشحن لا تناقض المدة الإجمالية بأرقام أخرى');
} finally {
  await page.goto(BASE + '/admin/pricing');
  await page.fill('input[name=whatsapp_number]', waBefore); await page.fill('input[name=facebook_url]', fbBefore);
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=whatsapp_number]').inputValue()) === waBefore, `أُعيد رقم الواتساب كما كان («${waBefore}»)`);
}
await page.goto(BASE + '/logout');

// ---------- «اطلبي برابط» (٢٤/٠٩/٢٦) ----------
// المنافس الوحيد في ليبيا (بزناس) يقوم كله على لصق رابط أمازون أو علي بابا. نلعب دور زبونة تلصق رابطًا،
// ودور الإضافة التي تستورده، ودور الفريق الذي يسعّر رابطًا من غير 1688 — ونرى الإشعار يصل.
await page.goto(BASE + '/logout');
await page.goto(BASE + '/request');
expect(await page.locator('.lr-login a[href*="/login"]').isVisible(), 'الزائرة ترى زر «سجّلي الدخول لإرسال رابط» لا نموذجًا يضيع');
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/');
await page.locator('.hdr-strip a[href="/request"]').click(); await page.waitForLoadState('networkidle');
expect(page.url().endsWith('/request') && await page.locator('textarea[name=url]').isVisible(), 'رابط «اطلبي برابط» في أعلى كل صفحة يفتح النموذج');
const sendLink = async (text, note = '') => {
  await page.goto(BASE + '/request');
  await page.fill('textarea[name=url]', text); if (note) await page.fill('input[name=note]', note);
  await page.click('.lr-form button[type=submit]'); await page.waitForLoadState('networkidle');
};
await sendLink('شوفي هذا الفستان حلو');
expect(await has(page, 'لم نجد رابطًا'), 'نص بلا رابط يُرفض برسالة واضحة');
// رابط 1688 جديد ملصوق مع نص المشاركة كما يلصقه الناس
const rqOffer = '84' + String(Date.now()).slice(-10); const rqTag = uniqTag();
await sendLink(`【1688】快来看看 https://detail.1688.com/offer/${rqOffer}.html?spm=abc 复制打开`, 'مقاس M أسود');
expect(await has(page, 'وصلنا طلبك'), 'طلب رابط 1688 جديد يُستقبل');
expect((await page.locator('.lr-row').first().textContent()).includes('قيد التجهيز') && (await page.locator('.lr-row').first().textContent()).includes('مقاس M أسود'),
  'ويظهر في «طلباتي بالرابط» قيد التجهيز مع ملاحظتها');
await sendLink(`https://detail.1688.com/offer/${rqOffer}.html`);
expect(await has(page, 'أرسلتِ هذا الرابط من قبل'), 'الرابط نفسه لا يُرسل مرتين');
// الإضافة: الرابط يتصدّر طابور الاكتشاف
const rqQ = await extCall('/api/import/queue?v=' + extManifest.version);
expect((rqQ.fresh || [])[0]?.id === rqOffer, `رابط الزبونة يتصدّر طابور الإضافة (${(rqQ.fresh || []).slice(0, 3).map(f => f.id).join('،')})`);
// الإضافة فتحت صفحته واستوردته
const rqImp = await extCall('/api/import', { category_id: 1, page_url: 'ext:discover', items: [{ offerId: rqOffer, url: `https://detail.1688.com/offer/${rqOffer}.html`,
  title: `مطلوب ${rqTag}`, priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/rq1.jpg', 'https://cbu01.alicdn.com/img/ibank/rq2.jpg'], minQty: 1, inStock: true }] });
expect(rqImp.imported === 1, `المنتج المطلوب دخل المتجر (جديد ${rqImp.imported})`);
await page.goto(BASE + '/request');
const rqRow = (await page.locator('.lr-row').first().textContent()) || '';
expect(rqRow.includes('جاهز للشراء') && await page.locator('.lr-row .lr-go').first().isVisible(), `طلبها صار «جاهز للشراء» برابط المنتج (${rqRow.replace(/\s+/g, ' ').trim().slice(0, 80)})`);
await page.locator('.lr-row .lr-go').first().click(); await page.waitForLoadState('networkidle');
expect(await has(page, `مطلوب ${rqTag}`) && await page.locator('#addForm').count() === 1, 'والرابط يفتح صفحة المنتج بزر الإضافة للسلة');
// المنتج صار عندنا: لصق رابطه مرة أخرى يفتح صفحته فورًا بلا انتظار
await sendLink(`https://detail.1688.com/offer/${rqOffer}.html?spm=a26352`);
expect(page.url().includes('/p/') && await has(page, `مطلوب ${rqTag}`), `رابط منتج موجود عندنا يفتح صفحته فورًا (${page.url().replace(BASE, '')})`);
await page.goto(BASE + '/account/notifications');
expect(await has(page, 'منتجك صار في هدهدي'), 'ووصلها إشعار «منتجك صار في هدهدي»');
// رابط من غير 1688: الفريق يربطه بمنتج أو يعتذر
await sendLink('https://item.taobao.com/item.htm?id=712345678901', 'قطعتان');
await sendLink('https://www.amazon.com/dp/B0TEST1234');
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/requests');
const rqTb = page.locator('.lr-admin tr', { hasText: '712345678901' }).first();
expect(await rqTb.isVisible() && (await rqTb.textContent()).includes('تاوباو'), 'طلب تاوباو يظهر للفريق في «طلبات بالرابط» بمصدره');
const rqSlug = await page.evaluate(async ([b, o]) => { const r = await fetch(b + '/admin/products?q=' + o); const t = await r.text(); return (t.match(/href="\/p\/([^"]+)"/) || [])[1]; }, [BASE, rqOffer]);
await rqTb.locator('input[name=ref]').fill('/p/' + rqSlug);
await rqTb.locator('button', { hasText: 'ربط وإشعار' }).click(); await page.waitForLoadState('networkidle');
expect(await has(page, 'وصل الزبونة إشعار'), `الفريق ربط طلب تاوباو بمنتج على الرف (${rqSlug})`);
const rqAm = page.locator('.lr-admin tr', { hasText: 'B0TEST1234' }).first();
await rqAm.locator('input[name=why]').fill('المنتج لا يُشحن إلى ليبيا');
await rqAm.locator('button', { hasText: 'اعتذار' }).click(); await page.waitForLoadState('networkidle');
expect(page.url().includes('status=rejected') && await has(page, 'المنتج لا يُشحن إلى ليبيا'), 'والاعتذار يُحفظ بسببه');
await login(page, PHONE, 'secret456');
await page.goto(BASE + '/request');
const rqAll = ((await page.locator('.lr-list').textContent()) || '').replace(/\s+/g, ' ');
expect(/المنتج لا يُشحن إلى ليبيا/.test(rqAll) && (rqAll.match(/جاهز للشراء/g) || []).length >= 2, 'الزبونة ترى سبب الاعتذار وطلبيها الجاهزين');
await shot(page, 'request-by-link');
// ---------- قيم الألوان والمقاسات الإنجليزية (٢٤/٠٩/٢٦): ١٬٤٩٧ منتجًا على الرف الحي كان منتقيها «Navy blue» و«Female XL» ----------
// وشظايا جدول المواصفات («non-returnable]»، «Capacity») ظهرت ألوانًا. نستورد كما تصل من 1688 ونفتح الصفحة كالزبونة.
const enOffer = '86' + String(Date.now()).slice(-10), enTag = uniqTag();
const enImp = await extCall('/api/import', { category_id: 1, page_url: 'ext:stock', items: [{ offerId: enOffer, url: `https://detail.1688.com/offer/${enOffer}.html`,
  title: `ألوان ${enTag}`, priceCny: 30, images: ['https://cbu01.alicdn.com/img/ibank/en1.jpg', 'https://cbu01.alicdn.com/img/ibank/en2.jpg'], minQty: 1, inStock: true, weightG: 300,
  variants: [{ color: 'Navy blue', size: 'Female XL', inStock: true }, { color: 'Wine red', size: 'M [recommendation 40-50kg ]', inStock: true },
    { color: 'non-returnable]', size: 'Female XL', inStock: true }, { color: 'K06 black-green', size: 'Capacity', inStock: true }] }] });
expect(enImp.imported === 1, `عيّنة الألوان الإنجليزية دخلت (جديد ${enImp.imported})`);
const openEn = async () => {
  await page.goto(BASE + '/search?q=' + encodeURIComponent(enTag)); await page.locator('.card .t').first().click(); await page.waitForLoadState('networkidle');
  return { colors: await page.locator('.chips[data-opt=color] .chip').allTextContents(), sizes: await page.locator('.chips[data-opt=size] .chip').allTextContents() };
};
const enChips = await openEn();
const enAll = [...enChips.colors, ...enChips.sizes].join('، ');
expect(enChips.colors.includes('كحلي') && enChips.colors.includes('نبيتي') && enChips.colors.includes('K06 أسود وأخضر'), `الألوان بالعربية في منتقي اللون (${enChips.colors.join('، ')})`);
expect(enChips.sizes.includes('XL نسائي') && enChips.sizes.includes('M (40-50 كغ)'), `المقاسات بالعربية مع رموزها (${enChips.sizes.join('، ')})`);
expect(!/[A-Za-z]{3,}/.test(enAll.replace(/K06/g, '')) && !/non-returnable|Capacity/i.test(enAll), `لا شظايا ولا كلمة إنجليزية في المنتقي (${enAll})`);
// «نبيتي» لا يتوفر إلا بمقاس M والمختار تلقائيًا XL: كان النقر عليه لا يفعل شيئًا بلا أي رسالة.
// الآن يُختار وينتقل المقاس وحده إلى ما يتوفر معه، كما في شي إن
expect(((await page.locator('#sizeLbl').textContent()) || '') === 'XL نسائي', 'المقاس المختار تلقائيًا XL نسائي');
await page.locator('.chips[data-opt=color] .chip', { hasText: 'نبيتي' }).click();
const enPick = { c: (await page.locator('#colorLbl').textContent()) || '', s: (await page.locator('#sizeLbl').textContent()) || '', id: await page.locator('#variantId').inputValue() };
expect(enPick.c === 'نبيتي' && enPick.s === 'M (40-50 كغ)' && !!enPick.id, `النقر على لون غير متوفر بالمقاس المختار يختاره وينقل المقاس (${enPick.c} · ${enPick.s} · متغيّر ${enPick.id})`);
// ما دخل الرف قبل الإصلاح: نزرع القيم الإنجليزية القديمة في القاعدة المحلية وحدها (كما هي على الحي) ونشغّل دفعة الإصلاح
if (/localhost|127\.0\.0\.1/.test(BASE)) {
  const { execFileSync } = await import('node:child_process');
  const d1 = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'dlal-db', '--local', '-c', 'wrangler.local.toml', '--command', sql], { stdio: 'pipe' });
  const enPid = `(SELECT id FROM products WHERE source_offer_id='${enOffer}')`;
  d1(`UPDATE variants SET color='Navy blue' WHERE product_id=${enPid} AND color='كحلي'; UPDATE variants SET size='Female XL' WHERE product_id=${enPid} AND size='XL نسائي';
      INSERT INTO variants(product_id,color,size,in_stock) VALUES(${enPid},'non-returnable]','L',1),(${enPid},'Main picture','L',1);
      DELETE FROM attr_seen WHERE src IN ('Navy blue','Female XL');
      INSERT INTO variants(product_id,color,size,in_stock) VALUES(${enPid},'قميص قصير','L',1),(${enPid},'2012 شورت قصير','L',1),(${enPid},'أحمر','XL【European size in stock】',1),(${enPid},'بورجوازي أحمر','L',1);
      INSERT OR REPLACE INTO translations(src,dst,kind) VALUES('Bordeaux Red','بورجوازي أحمر','attr');
      INSERT OR REPLACE INTO translations(src,dst,kind) VALUES('double short-coffee','شورت قصير','attr');
      INSERT OR REPLACE INTO translations(src,dst,kind) VALUES('2011 double short-coffee','قميص قصير','attr')`);
  const legacy = await openEn();
  expect(legacy.colors.includes('Navy blue'), `العيّنة القديمة ظاهرة بالإنجليزية قبل الإصلاح (${legacy.colors.join('، ')})`);
  const enStats0 = await page.evaluate(async (b) => (await (await fetch(b + '/api/source/stats', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: '{}' })).json()).totals, BASE);
  expect(enStats0.englishVariants >= 2, `الإحصاء يعدّ الأسطر الإنجليزية على الرف (${enStats0.englishVariants})`);
  const enFix = await page.evaluate(async (b) => (await fetch(b + '/api/source/translate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-import-token': 'dev-import-token' }, body: '{}' })).json(), BASE);
  expect(enFix.enFixed >= 2 && enFix.enDropped >= 1 && enFix.enLeft < enStats0.englishVariants, `دفعة الإصلاح بلا نموذج: ترجمت ${enFix.enFixed} قيمة وحذفت ${enFix.enDropped} شظيّة، بقي ${enFix.enLeft} من ${enStats0.englishVariants}`);
  const fixedEn = await openEn();
  const fixedAll = [...fixedEn.colors, ...fixedEn.sizes].join('، ');
  expect(fixedEn.colors.includes('كحلي') && fixedEn.sizes.includes('XL نسائي') && !/Navy|Female|non-returnable|Main picture/i.test(fixedAll), `بعد الإصلاح الصفحة نفسها بالعربية (${fixedAll})`);
  // أول تشغيل حي: النموذج أسقط رقم التصميم («2011 double short-coffee» ⟵ «قميص قصير»). الفاشل يعود إلى أصله
  expect(fixedEn.colors.includes('عنابي') && !fixedEn.colors.includes('بورجوازي أحمر'), `القاموس يغلب ترجمة النموذج على الرف: «Bordeaux Red» ⟵ «عنابي» لا «بورجوازي أحمر» (${fixedEn.colors.join('، ')})`);
  expect(fixedEn.sizes.includes('XL') && !fixedEn.sizes.some(x => /European/.test(x)), `القاموس بلا حرف عربي يُقبل: «XL【European size in stock】» ⟵ «XL» (${fixedEn.sizes.join('، ')})`);
  expect(!fixedEn.colors.some(x => /قميص قصير|شورت قصير/.test(x)) && fixedEn.colors.includes('2011 double short-coffee') && fixedEn.colors.includes('2012 double short-coffee'), `الترجمة الفاشلة أُعيدت إلى أصلها لتُترجم من جديد (${fixedEn.colors.join('، ')})`);
  d1(`DELETE FROM variants WHERE product_id=${enPid} AND color IN ('2011 double short-coffee','2012 double short-coffee')`);
  await shot(page, 'variants-arabic');
}
if (stockJob) await extCall('/api/crawl/report', { job_id: stockJob.id, started_at: new Date().toISOString(), status: 'ok', checked: 0 });
await page.goto(BASE + '/logout');

// ---------- أدوات الإعلان على ميتا: كتالوج المنتجات والبكسل (٢٤/٠٩/٢٦) ----------
// صاحب المشروع: «كيف يمكنك أن تدير صفحات فيسبوك لتكون الميديا باير خاصتي؟». الإعلان الديناميكي يحتاج كتالوجًا
// تقرؤه ميتا وبكسلًا يعدّ المشاهدة والسلة والشراء. نفحص الملف كما تقرؤه ميتا، والبكسل كما يرسله المتصفح.
const feedRes = await page.request.get(BASE + '/feeds/meta.csv?fresh=1');   // بلا المخزَّن: نفحص حالة الرف الآن
const feed = await feedRes.text();
const feedRows = feed.split('\n');
expect(feedRes.status() === 200 && (feedRes.headers()['content-type'] || '').includes('text/csv'), `الكتالوج يُخدم ملف CSV (${feedRes.status()})`);
expect(feedRows[0] === 'id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,product_type', 'أعمدته بأسماء مدير التجارة');
expect(feedRows.length > 20, `ويحمل منتجات الرف (${feedRows.length - 1} منتجًا)`);
const feedBad = feedRows.slice(1).filter(r => !/"\d+\.\d\d LYD"/.test(r) || !/"https?:\/\/[^"]+\/p\/[^"]+\?utm_source=facebook&utm_medium=catalog"/.test(r) || !/"https?:\/\/[^"]+","/.test(r));
expect(feedBad.length === 0, `كل سطر: سعر «49.00 LYD» ورابط المنتج مطلق بوسم الحملة وصورة برابط مطلق (${feedBad.length} مخالفًا${feedBad[0] ? ': ' + feedBad[0].slice(0, 90) : ''})`);
expect(!/[一-鿿]/.test(feed), 'لا حرف صيني في الكتالوج');
expect(!feed.includes(`${packHref}?utm_source`), `إعلان مصنع التغليف المخفي ليس في الكتالوج (${packHref})`);
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/pricing');
const pxBefore = await page.locator('input[name=meta_pixel_id]').inputValue();
const vfBefore = await page.locator('input[name=meta_domain_verify]').inputValue();
expect(await has(page, '/feeds/meta.csv'), 'لوحة التسعير تعرض رابط الكتالوج لنسخه');
await page.route('**/connect.facebook.net/**', r => r.abort());   // لا نرسل شيئًا لميتا من الفحص؛ نقرأ طابور البكسل نفسه
try {
  await page.goto(BASE + '/');
  expect(!(await has(page, 'fbq(')), 'بلا معرّف مضبوط لا بكسل في الصفحة');
  await page.goto(BASE + '/admin/pricing');
  await page.fill('input[name=meta_pixel_id]', 'abc-not-a-pixel');
  await page.fill('input[name=meta_domain_verify]', '<meta name="facebook-domain-verification" content="e2everify0123456789abc" />');
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=meta_pixel_id]').inputValue()) === '', 'معرّف بكسل غير رقمي يُرفض ولا يُحقن');
  expect((await page.locator('input[name=meta_domain_verify]').inputValue()) === 'e2everify0123456789abc', 'وسم التحقق الكامل يُحفظ رمزه وحده');
  await page.fill('input[name=meta_pixel_id]', '1234567890123456');
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect(!(await has(page, "fbq('init'")), 'البكسل لا يُحقن في لوحة الإدارة');
  await page.goto(BASE + '/');
  const homeHtml = await page.content();
  expect(homeHtml.includes("fbq('init','1234567890123456')") && homeHtml.includes('<meta name="facebook-domain-verification" content="e2everify0123456789abc">'), 'الرئيسية تحمل البكسل ووسم إثبات النطاق');
  const pxq = () => page.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map(a => [a[0], a[1], a[2] || null]) : []));
  expect((await pxq()).some(a => a[0] === 'track' && a[1] === 'PageView'), 'حدث PageView أُرسل');
  await page.goto(BASE + '/p/' + productSlug);
  const vc = (await pxq()).find(a => a[1] === 'ViewContent');
  expect(vc && vc[2].currency === 'LYD' && vc[2].content_ids.length === 1 && vc[2].value > 0, `صفحة المنتج ترسل ViewContent بمعرّفه وسعره بالدينار (${JSON.stringify(vc?.[2])})`);
  await page.evaluate(() => { const f = document.getElementById('addForm'); f.addEventListener('submit', e => e.preventDefault()); f.requestSubmit(); });
  const atc = (await pxq()).find(a => a[1] === 'AddToCart');
  expect(atc && atc[2].content_ids[0] === vc?.[2].content_ids[0], 'زر الإضافة للسلة يرسل AddToCart للمنتج نفسه');
  // الشراء: صفحة طلب مدفوع للزبونة ترسل Purchase مرة واحدة
  await login(page, PHONE, 'secret456');
  await page.goto(BASE + '/account/orders');
  const oLinks = await page.locator('a[href^="/orders/DL-"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))]);
  let bought = null;
  for (const h of oLinks.slice(0, 8)) { await page.goto(BASE + h); if (await page.locator('[data-px-purchase]').count()) { bought = (await pxq()).find(a => a[1] === 'Purchase'); break; } }
  expect(bought && bought[2].value > 0 && bought[2].currency === 'LYD', `صفحة الطلب المدفوع ترسل Purchase بقيمته (${JSON.stringify(bought?.[2])})`);
  await page.reload();
  expect(!(await pxq()).some(a => a[1] === 'Purchase'), 'وعند العودة لها لا يُعدّ الشراء مرة ثانية');
} finally {
  await page.unroute('**/connect.facebook.net/**');
  await login(page, '0910000000', 'admin123');
  await page.goto(BASE + '/admin/pricing');
  await page.fill('input[name=meta_pixel_id]', pxBefore); await page.fill('input[name=meta_domain_verify]', vfBefore);
  await page.locator('form:has(input[name=air_days]) button', { hasText: 'حفظ' }).first().click(); await page.waitForLoadState('networkidle');
  expect((await page.locator('input[name=meta_pixel_id]').inputValue()) === pxBefore, `أُعيد معرّف البكسل كما كان («${pxBefore}»)`);
  await page.goto(BASE + '/logout');
}

// ---------- جوال ----------
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
// ---------- صفحة القسم في الجوال كما في شي إن: البضاعة أولًا، والفلاتر في لوحة تُفتح بالنقر ----------
// صاحب المشروع: «يعرض كل الفلاتر فوق ثم بعدها تأتي البضاعة وهذا خطأ». نلمس الشاشة كما تلمسها الزبونة.
// عرض التخطيط الحقيقي يُقارن بـ390: في وضع الجوال يتّسع innerWidth مع المحتوى فلا يكشف فيضًا
// (هكذا مرّ صف ترويسة أعرض من الشاشة وسّع الصفحة إلى 436 ودفع ☰ خارجها).
for (const pth of ['/', '/c/dresses', '/search?q=' + encodeURIComponent('فستان'), '/p/' + productSlug]) {
  await mp.goto(BASE + pth); await mp.waitForLoadState('networkidle');
  const lw = await mp.evaluate(() => document.documentElement.scrollWidth);
  expect(lw <= 391, `الجوال: ${pth} بعرض الشاشة تمامًا (${lw}px من 390)`);
}
await mp.goto(BASE + '/c/dresses'); await mp.waitForLoadState('networkidle');
expect(!(await mp.locator('.shop > .filters').isVisible()), 'الجوال: قائمة الفلاتر الطويلة لا تظهر فوق البضاعة');
expect(await mp.locator('.m-bar .m-sort').isVisible(), 'الجوال: شريط الفرز ظاهر (موصى به · الأكثر مبيعًا · السعر · تصفية)');
const firstCardTop = await mp.locator('.grid .card').first().evaluate(e => e.getBoundingClientRect().top);
expect(firstCardTop < 600, `الجوال: أول منتج يظهر في الشاشة الأولى (على بعد ${Math.round(firstCardTop)}px من 844)`);
expect((await mp.locator('.m-cats a').count()) >= 4 && await mp.locator('.m-cats a.on').count() === 1, 'الجوال: صف الأقسام الدائرية والقسم الحالي مميّز');
// الفرز: القائمة المنسدلة ثم السعر صعودًا ونزولًا
await mp.click('.ms-rec summary');
expect(await mp.locator('.ms-menu a', { hasText: 'الأحدث' }).isVisible(), 'الجوال: «موصى به» تفتح قائمة الفرز');
await mp.locator('.ms-menu a', { hasText: 'الأحدث' }).click(); await mp.waitForLoadState('networkidle');
expect(/[?&]sort=new/.test(mp.url()) && (await mp.locator('.ms-rec summary').textContent()).includes('الأحدث'), `الجوال: الفرز بالأحدث طُبّق (${mp.url().split('?')[1]})`);
// السعر الحالي وحده: بلا السعر المشطوب ولا الكسر الصغير، و«1,234» بفاصل آلاف en-US
const mPrices = async () => mp.$$eval('.grid .card .p', els => els.slice(0, 6).map(e => { const c = e.cloneNode(true); c.querySelectorAll('s,em').forEach(x => x.remove()); return parseInt(c.textContent.replace(/[^\d]/g, ''), 10) || 0; }));
await mp.click('.m-sort .ms-price'); await mp.waitForLoadState('networkidle');
const up = await mPrices();
expect(/sort=price_asc/.test(mp.url()) && up.every((v, i) => i === 0 || v >= up[i - 1]), `الجوال: «السعر» يرتّب صعودًا (${up.join('، ')})`);
await mp.click('.m-sort .ms-price'); await mp.waitForLoadState('networkidle');
const down = await mPrices();
expect(/sort=price_desc/.test(mp.url()) && down.every((v, i) => i === 0 || v <= down[i - 1]), `الجوال: ونقرة ثانية تعكسه نزولًا (${down.join('، ')})`);
// لوحة التصفية: تُفتح بالنقر، نختار مقاسًا، ونعرض النتائج
await mp.click('.ms-filter');
expect(await mp.locator('#fsheet').isVisible(), 'الجوال: «تصفية» تفتح لوحة الفلاتر');
expect((await mp.locator('.fs-tabs button').count()) >= 3, 'الجوال: اللوحة فيها عمود المجموعات (القسم، اللون، المقاس، السعر، العروض)');
await mp.click('.fs-tabs [data-tab=size]');
const mSize = (await mp.locator('[data-pane=size] label span').nth(1).textContent()).trim();
await mp.locator('[data-pane=size] label').nth(1).click();
await mp.click('.fs-done'); await mp.waitForLoadState('networkidle');
const fu = new URL(mp.url());
expect(fu.searchParams.get('size') === mSize && !/[?&](color|min|max|cat)=(&|$)/.test(mp.url()), `الجوال: «عرض النتائج» طبّق المقاس ${mSize} برابط نظيف (${fu.search})`);
expect(await mp.locator('#fsheet').isHidden(), 'الجوال: اللوحة أُغلقت بعد التطبيق');
expect((await mp.locator('.m-chips a.on').first().textContent()).includes(mSize) && (await mp.locator('.ms-filter b').textContent()) === '1', 'الجوال: شريحة «المقاس» ظاهرة وعدّاد «تصفية» = 1');
// القسم من داخل اللوحة: يحوّل الخادم إلى مسار القسم ويُبقي باقي الفلاتر
await mp.click('.ms-filter');
await mp.locator('[data-pane=cat] label', { hasText: 'أحذية' }).click();
await mp.click('.fs-done'); await mp.waitForLoadState('networkidle');
expect(new URL(mp.url()).pathname === '/c/shoes' && !mp.url().includes('cat='), `الجوال: اختيار القسم من اللوحة نقل إلى /c/shoes (${mp.url().replace(BASE, '')})`);
// «عليها خصم»: كل ما يُعرض عليه سعر مشطوب
await mp.goto(BASE + '/c/dresses'); await mp.waitForLoadState('networkidle');
await mp.locator('.m-chips a', { hasText: 'عليها خصم' }).click(); await mp.waitForLoadState('networkidle');
const dealCards = await mp.locator('.grid .card').count(), struck = await mp.locator('.grid .card .p s').count();
expect(/deal=1/.test(mp.url()) && dealCards > 0 && struck === dealCards, `الجوال: «عليها خصم» يعرض المخفّض وحده (${struck} من ${dealCards})`);
await mp.click('.ms-filter'); await mp.locator('.fs-clear').click(); await mp.waitForLoadState('networkidle');
expect(!/deal=|size=|color=/.test(mp.url()), 'الجوال: «مسح» يزيل كل الفلاتر');
// درج الأقسام ☰ ومثله «الأقسام» في الشريط السفلي
await mp.click('.burger');
await mp.waitForSelector('.dr-row');
expect((await mp.locator('.dr-row').count()) >= 6, `الجوال: ☰ يفتح درج الأقسام (${await mp.locator('.dr-row').count()} صفًّا)`);
await mp.locator('.dr-row', { hasText: 'حقائب' }).click(); await mp.waitForLoadState('networkidle');
expect(mp.url().endsWith('/c/bags'), `الجوال: صفّ في الدرج يفتح قسمه (${mp.url().replace(BASE, '')})`);
await mp.locator('.bottom-nav a', { hasText: 'الأقسام' }).click();
expect(await mp.locator('#drawer').isVisible() && mp.url().endsWith('/c/bags'), 'الجوال: «الأقسام» في الشريط السفلي تفتح الدرج بدل مغادرة الصفحة');
await mp.locator('.dr [data-drawer-close]').click();
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-list-shein.png` });

await mp.goto(BASE + '/'); await mp.waitForLoadState('networkidle');
expect(await mp.locator('.bottom-nav').isVisible(), 'شريط التنقل السفلي يظهر في الجوال');
// بطاقتان في الصف كما في متاجر الموضة، لا بطاقة عملاقة واحدة
const cols = await mp.evaluate(() => getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length);
expect(cols === 2, `شبكة المنتجات في الجوال عمودان (${cols})`);
const cw = await mp.locator('.grid .card').first().evaluate(el => el.getBoundingClientRect().width);
expect(cw > 140 && cw < 200, `عرض البطاقة في الجوال معقول (${Math.round(cw)}px)`);
// لا نص يخرج من حدود بطاقته (شرائح الشحن كانت تمتد خارج البطاقة الضيقة)
const spill = await mp.$$eval('.card .body', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).length);
expect(spill === 0, `لا محتوى يتجاوز عرض بطاقته في الجوال (${spill} بطاقة)`);
// شريط التنقل المثبّت لا يغطي آخر التذييل
await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mp.waitForTimeout(300);
const gap = await mp.evaluate(() => {
  const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
  const last = document.querySelector('.ftr').lastElementChild.getBoundingClientRect();
  return Math.round(nav.top - last.bottom);
});
expect(gap >= 0, `شريط التنقل السفلي لا يغطي آخر التذييل (فرق ${gap}px)`);
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-home.png` });
await mp.goto(BASE + '/p/' + productSlug); await mp.waitForLoadState('networkidle');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-product.png` });
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'لا تمرير أفقي في الجوال');
await mp.goto(BASE + '/login'); await mp.fill('input[name=phone]', PHONE); await mp.fill('input[name=password]', 'secret456'); await mp.click('button:has-text("دخول")'); await mp.waitForLoadState('networkidle');
await mp.goto(BASE + '/account'); await mp.waitForLoadState('networkidle');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'حسابي بلا تمرير أفقي في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-account.png` });

// ---------- شراء كامل من الجوال (الجهاز الذي تشتري منه أغلب الزبائن) ----------
await mp.goto(BASE + '/c/dresses'); await mp.waitForLoadState('networkidle');
await mp.locator('.card .t').first().click(); await mp.waitForLoadState('networkidle');
expect(mp.url().includes('/p/'), 'النقر على بطاقة في الجوال يفتح المنتج');
const mHasColor = await mp.locator('.chips[data-opt=color] .chip:not(.off)').count();
if (mHasColor) await mp.locator('.chips[data-opt=color] .chip:not(.off)').first().click();
const mHasSize = await mp.locator('.chips[data-opt=size] .chip:not(.off)').count();
if (mHasSize) await mp.locator('.chips[data-opt=size] .chip:not(.off)').first().click();
await mp.click('#addForm button[type=submit]'); await mp.waitForLoadState('networkidle');
expect((await mp.locator('.cart-row').count()) >= 1, 'الإضافة للسلة تعمل من الجوال');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'السلة بلا تمرير أفقي في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-cart.png` });
await mp.goto(BASE + '/checkout'); await mp.waitForLoadState('networkidle');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= 391), 'صفحة الدفع بلا تمرير أفقي في الجوال');
const payBtn = mp.locator('button:has-text("تأكيد الطلب")');
expect(await payBtn.isVisible(), 'زر تأكيد الطلب ظاهر في الجوال');
const btnBox = await payBtn.boundingBox();
expect(btnBox.height >= 40, `زر التأكيد كبير بما يكفي للإصبع (${Math.round(btnBox.height)}px)`);
await mp.check('input[value=mypay_sadad]');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-checkout.png` });
await payBtn.click(); await mp.waitForLoadState('networkidle');
if (mp.url().includes('/pay/mock/')) { await mp.click('button:has-text("تأكيد الدفع")'); await mp.waitForLoadState('networkidle'); }
const mOrder = mp.url().match(/DL-\d{4}-\d{6}/);
expect(!!mOrder, `الطلب اكتمل من الجوال (${mp.url().split('/').pop()})`);
expect(await has(mp, 'مدفوع') || await has(mp, 'قيد المعالجة') || await has(mp, 'تم استلام'), 'صفحة الطلب تؤكد الدفع للزبونة');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-order.png` });

// 404
const r404 = await page.goto(BASE + '/p/not-exist'); expect(r404.status() === 404, 'صفحة غير موجودة تعيد 404');

await browser.close();
console.log('\n===== النتيجة =====');
console.log(`نجح: ${passed} · فشل: ${problems.length} · إجمالي: ${passed + problems.length}`);
console.log(problems.length ? problems.join('\n') : 'كل الفحوصات نجحت ✓');
process.exit(problems.length ? 1 : 0);
