// تجربة حقيقية على الشاشة (Playwright) — الإصدار 2
// زبونة (كوبون + ماي باي) → أدمن → موظف شاهين → تسليم → نقاط وتقييم وتذكرة → مراجعة الأدمن → الأدوار والصلاحيات → دفع فاشل وإلغاء → جوال
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || './shots';
mkdirSync(OUT, { recursive: true });
const problems = [];
const PHONE = '09' + String(Date.now()).slice(-8);
let n = 0;
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: false }); };
const expect = (cond, msg) => { if (!cond) { problems.push(msg); console.log('❌', msg); } else console.log('✅', msg); };
const has = async (page, t) => (await page.content()).includes(t);
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

// ---------- الزبونة: تصفح ----------
await page.goto(BASE + '/');
expect((await page.locator('.card').count()) >= 20, 'الرئيسية تعرض شبكة منتجات');
expect((await page.locator('.cat-tiles a').count()) >= 10, 'الرئيسية تعرض بلاطات الأقسام');
await shot(page, 'home');
await page.click('.cats a:has-text("فساتين")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('/c/dresses'), 'الضغط على قسم فساتين يفتح صفحة القسم');
await Promise.all([page.waitForURL(/size=M/), page.selectOption('select[name=size]', 'M')]);
expect(page.url().includes('size=M'), 'فلتر المقاس يعمل');
await page.click('.tabs a:has-text("السعر ↑")'); await page.waitForLoadState('networkidle');
const prices = await page.$$eval('.card .p', els => els.map(e => parseFloat((e.firstChild?.textContent || '').replace(/[^\d.]/g, ''))));
expect(prices.every((v, i) => i === 0 || v >= prices[i - 1]), 'الترتيب بالسعر تصاعدي صحيح');
await page.fill('.search input', 'حقيبة'); await page.press('.search input', 'Enter'); await page.waitForLoadState('networkidle');
expect((await page.locator('.card').count()) >= 3, 'البحث عن "حقيبة" يعيد نتائج');
await page.goto(BASE + '/c/dresses'); await page.click('.card >> nth=0'); await page.waitForLoadState('networkidle');
expect(await page.locator('.pd h1').isVisible(), 'صفحة المنتج تفتح');
expect(await has(page, 'التقييمات ('), 'صفحة المنتج تعرض قسم التقييمات');
expect(!(await has(page, 'detail.1688.com')), 'رابط المصدر مخفي عن الزبونة');
const productSlug = page.url().split('/p/')[1];
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
expect((await page.locator('.acct-side a').count()) >= 10, 'قائمة حسابي كاملة (طلبات، تذاكر، تقييمات، كوبونات، نقاط، عناوين…)');
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
  ['/admin/import', 'admin-import', 'استورد إلى دلال'], ['/admin/products', 'admin-products', 'offerId'], ['/admin/categories', 'admin-categories', 'الوزن التقديري'],
  ['/admin/stock', 'admin-stock', 'فحص المخزون'], ['/admin/pricing', 'admin-pricing', 'سعر الصرف'], ['/admin/partners', 'admin-partners', 'شاهين'], ['/admin/staff', 'admin-staff', 'مصفوفة الصلاحيات'], ['/admin/customers', 'admin-customers', 'منى'],
  ['/admin/reports', 'admin-reports', 'المبيعات اليومية'], ['/admin/activity', 'admin-activity', 'سجل النشاط'], ['/admin/tickets', 'admin-tickets', 'التذاكر'], ['/admin/reviews', 'admin-reviews', 'بانتظار المراجعة'],
]) { await page.goto(BASE + path); expect(await has(page, check), `صفحة ${path} تعمل`); await shot(page, name); }
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
expect(await has(page, 'فستان تجريبي مستورد'), 'استيراد JSON أضاف المنتج');
const r = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: 1, page_url: 'test', items: [{ offerId: '999000111', priceCny: 45, inStock: true }] } });
expect((await r.json()).updated === 1, 'API الاستيراد يحدّث منتجًا موجودًا بدل تكراره');

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

// ---------- جوال ----------
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
await mp.goto(BASE + '/'); await mp.waitForLoadState('networkidle');
expect(await mp.locator('.bottom-nav').isVisible(), 'شريط التنقل السفلي يظهر في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-home.png` });
await mp.goto(BASE + '/p/' + productSlug); await mp.waitForLoadState('networkidle');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-product.png` });
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'لا تمرير أفقي في الجوال');
await mp.goto(BASE + '/login'); await mp.fill('input[name=phone]', PHONE); await mp.fill('input[name=password]', 'secret456'); await mp.click('button:has-text("دخول")'); await mp.waitForLoadState('networkidle');
await mp.goto(BASE + '/account'); await mp.waitForLoadState('networkidle');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'حسابي بلا تمرير أفقي في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-account.png` });

// 404
const r404 = await page.goto(BASE + '/p/not-exist'); expect(r404.status() === 404, 'صفحة غير موجودة تعيد 404');

await browser.close();
console.log('\n===== النتيجة =====');
console.log(problems.length ? problems.join('\n') : 'كل الفحوصات نجحت ✓');
process.exit(problems.length ? 1 : 0);
