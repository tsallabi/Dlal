// تجربة حقيقية على الشاشة: زبونة → أدمن → موظف شاهين → تسليم. لقطات في scratch/shots
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || './shots';
mkdirSync(OUT, { recursive: true });
const problems = [];
const PHONE = '09' + String(Date.now()).slice(-8);
let n = 0;
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: false }); };
const expect = (cond, msg) => { if (!cond) { problems.push(msg); console.log('❌', msg); } else console.log('✅', msg); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar' });
const page = await ctx.newPage();
page.on('pageerror', e => problems.push('JS error: ' + e.message));
page.on('response', r => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });

// ---------- الزبونة ----------
await page.goto(BASE + '/');
expect((await page.locator('.card').count()) >= 20, 'الرئيسية تعرض شبكة منتجات');
await shot(page, 'home');

await page.click('.cats a:has-text("فساتين")');
await page.waitForLoadState('networkidle');
expect(page.url().includes('/c/dresses'), 'الضغط على قسم فساتين يفتح صفحة القسم');
expect((await page.locator('.card').count()) >= 5, 'صفحة القسم تعرض منتجات');
await shot(page, 'category');

await Promise.all([page.waitForURL(/size=M/), page.selectOption('select[name=size]', 'M')]);
expect(page.url().includes('size=M'), 'فلتر المقاس يعمل');
await page.click('.tabs a:has-text("السعر ↑")');
await page.waitForLoadState('networkidle');
const prices = await page.$$eval('.card .p', els => els.map(e => parseFloat(e.textContent.replace(/[^\d.]/g, ''))));
expect(prices.every((v, i) => i === 0 || v >= prices[i - 1]), 'الترتيب بالسعر تصاعدي صحيح');
await shot(page, 'category-filtered');

await page.fill('.search input', 'حقيبة');
await page.press('.search input', 'Enter');
await page.waitForLoadState('networkidle');
expect((await page.locator('.card').count()) >= 3, 'البحث عن "حقيبة" يعيد نتائج');
await shot(page, 'search');

await page.goto(BASE + '/c/dresses');
await page.click('.card >> nth=0');
await page.waitForLoadState('networkidle');
expect(await page.locator('.pd h1').isVisible(), 'صفحة المنتج تفتح');
expect((await page.locator('#variantsJson').count()) === 1, 'بيانات المتغيرات موجودة');
expect((await page.content()).includes('detail.1688.com') === false, 'رابط المصدر مخفي عن الزبونة');
await page.click('.gallery .thumbs img >> nth=1');
await shot(page, 'product');

// اختيار لون ومقاس وإضافة للسلة (يتطلب دخول)
await page.click('.chips[data-opt=color] .chip:not(.off) >> nth=0');
await page.click('.chips[data-opt=size] .chip:not(.off) >> nth=0');
await page.click('[data-q="1"]');
expect((await page.inputValue('input[name=qty]')) === '2', 'زر + يزيد الكمية');
await page.click('#addForm button[type=submit]');
await page.waitForLoadState('networkidle');
expect(page.url().includes('/login'), 'إضافة للسلة بدون دخول تحوّل لصفحة الدخول');
await shot(page, 'login');

// تسجيل حساب جديد
await page.click('a:has-text("أنشئي حسابًا")');
await page.fill('input[name=name]', 'منى التجريبية');
await page.fill('input[name=phone]', PHONE);
await page.fill('input[name=password]', 'secret123');
await page.click('button:has-text("إنشاء الحساب")');
await page.waitForLoadState('networkidle');
expect(page.url().includes('/p/'), 'بعد التسجيل يعود لصفحة المنتج');
await page.click('.chips[data-opt=color] .chip:not(.off) >> nth=0');
await page.click('.chips[data-opt=size] .chip:not(.off) >> nth=0');
await page.click('#addForm button[type=submit]');
await page.waitForLoadState('networkidle');
expect(page.url().includes('/cart'), 'أضيف للسلة وانتقل للسلة');
expect((await page.locator('.cart-row').count()) === 1, 'السلة فيها منتج واحد');
expect(/·\s*(S|M|L|XL|2XL)/.test(await page.locator('.cart-row .v').first().textContent()), 'اللون والمقاس المختاران محفوظان في السلة');
await shot(page, 'cart');

// مفضلة
await page.goto(BASE + '/c/bags');
await page.click('.card .fav >> nth=0');
await page.waitForTimeout(500);
await page.goto(BASE + '/wishlist');
expect((await page.locator('.card').count()) === 1, 'المفضلة تحفظ المنتج');
await shot(page, 'wishlist');

// منتج ثانٍ بلا مقاس
await page.goto(BASE + '/c/bags');
await page.click('.card >> nth=1');
await page.click('#addForm button[type=submit]');
await page.waitForLoadState('networkidle');
expect((await page.locator('.cart-row').count()) === 2, 'السلة فيها منتجان');

// الدفع
await page.click('a:has-text("إتمام الطلب")');
await page.waitForLoadState('networkidle');
expect(page.url().includes('/checkout'), 'صفحة إتمام الطلب');
await page.selectOption('select[name=city]', 'بنغازي');
await page.fill('textarea[name=address]', 'شارع جمال عبد الناصر، عمارة 5');
await page.check('input[value=moamalat]');
await shot(page, 'checkout');
await page.click('button:has-text("تأكيد الطلب")');
await page.waitForLoadState('networkidle');
const orderCode = (page.url().match(/DL-\d{4}-\d{6}/) || [])[0];
expect(!!orderCode, 'أُنشئ طلب برقم ' + orderCode);
expect((await page.content()).includes('تعليمات الدفع'), 'صفحة الطلب تعرض تعليمات الدفع');
await shot(page, 'order-created');
await page.goto(BASE + '/account');
expect((await page.content()).includes(orderCode), 'حسابي يعرض الطلب');
await shot(page, 'account');
await page.goto(BASE + '/logout');

// ---------- الأدمن ----------
await page.goto(BASE + '/login');
await page.fill('input[name=phone]', '0910000000'); await page.fill('input[name=password]', 'admin123');
await page.click('button:has-text("دخول")'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/admin');
expect((await page.locator('.kpi').count()) >= 6, 'لوحة الأدمن تعرض المؤشرات');
await shot(page, 'admin-home');
await page.click('.side a:has-text("الطلبات")'); await page.waitForLoadState('networkidle');
expect((await page.content()).includes(orderCode), 'قائمة الطلبات تحوي الطلب الجديد');
await shot(page, 'admin-orders');
await page.click(`a:has-text("${orderCode}")`); await page.waitForLoadState('networkidle');
expect((await page.content()).includes('detail.1688.com'), 'الأدمن يرى رابط المصدر');
await page.fill('input[name=payment_ref]', 'MOAMALAT-778899');
await page.click('button:has-text("تأكيد الدفع وإرسال للشراء")'); await page.waitForLoadState('networkidle');
expect((await page.content()).includes('مدفوع — بانتظار الشراء'), 'تأكيد الدفع حوّل الحالة إلى مدفوع');
await shot(page, 'admin-order-paid');

for (const [path, name, check] of [
  ['/admin/import', 'admin-import', 'استورد إلى دلال'], ['/admin/products', 'admin-products', 'offerId'], ['/admin/categories', 'admin-categories', 'الوزن التقديري'],
  ['/admin/stock', 'admin-stock', 'فحص المخزون'], ['/admin/pricing', 'admin-pricing', 'سعر الصرف'], ['/admin/partners', 'admin-partners', 'شاهين'], ['/admin/staff', 'admin-staff', 'إضافة موظف'], ['/admin/customers', 'admin-customers', 'منى'],
]) {
  await page.goto(BASE + path); expect((await page.content()).includes(check), `صفحة ${path} تعمل`); await shot(page, name);
}
// تغيير سعر الصرف وإعادة التسعير
await page.goto(BASE + '/admin/pricing');
await page.fill('input[name=fx_cny_lyd]', '1.05');
await page.click('form.card-box button:has-text("حفظ")'); await page.waitForLoadState('networkidle');
expect((await page.inputValue('input[name=fx_cny_lyd]')) === '1.05', 'حفظ سعر الصرف الجديد');
await page.click('button:has-text("إعادة التسعير الآن")'); await page.waitForLoadState('networkidle');
expect(page.url().includes('ok=1'), 'إعادة تسعير الكتالوج تمت');
// استيراد JSON
await page.goto(BASE + '/admin/import');
await page.fill('textarea[name=json]', JSON.stringify([{ offerId: '999000111', url: 'https://detail.1688.com/offer/999000111.html', title: '测试连衣裙', titleAr: 'فستان تجريبي مستورد', priceCny: 39.9, images: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600'], variants: [{ color: 'أحمر', size: 'M' }, { color: 'أحمر', size: 'L' }], minQty: 1, inStock: true }]));
await page.click('button:has-text("استيراد")'); await page.waitForLoadState('networkidle');
expect((await page.content()).includes('فستان تجريبي مستورد'), 'استيراد JSON أضاف المنتج');
await shot(page, 'admin-imported');
// API استيراد بالرمز (كما يفعل السكربت)
const r = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: 1, page_url: 'test', items: [{ offerId: '999000111', priceCny: 45, inStock: true }] } });
const j = await r.json();
expect(j.updated === 1, 'API الاستيراد يحدّث منتجًا موجودًا بدل تكراره');
await page.goto(BASE + '/logout');

// ---------- موظف شاهين ----------
await page.goto(BASE + '/login');
await page.fill('input[name=phone]', '0920000000'); await page.fill('input[name=password]', 'partner123');
await page.click('button:has-text("دخول")'); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/partner');
expect((await page.content()).includes(orderCode), 'الطلب المدفوع يظهر في قائمة انتظار الشراء لشاهين');
expect((await page.content()).includes('فتح في 1688'), 'موظف الشريك يرى رابط 1688');
await shot(page, 'partner-queue');
// شراء البند الأول
const card = page.locator('.card-box', { hasText: orderCode });
const forms = card.locator('form[action*="/purchased"]');
const cnt = await forms.count();
await forms.nth(0).locator('input[name=supplier_order_no]').fill('1688-20260919-001');
await forms.nth(0).locator('input[name=actual_cost_cny]').fill('42.5');
await forms.nth(0).locator('button:has-text("تم الشراء")').click(); await page.waitForLoadState('networkidle');
expect(page.url().includes('/partner/purchasing'), 'بعد الشراء ينتقل لصفحة قيد الشراء');
expect((await page.content()).includes('1688-20260919-001'), 'رقم طلب 1688 محفوظ');
await shot(page, 'partner-purchasing');
if (cnt > 1) {
  const c2 = page.locator('.card-box', { hasText: orderCode });
  await c2.locator('input[name=supplier_order_no]').first().fill('1688-20260919-002');
  await c2.locator('input[name=actual_cost_cny]').first().fill('30');
  await c2.locator('button:has-text("تم الشراء")').first().click(); await page.waitForLoadState('networkidle');
}
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("اكتمل الشراء")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("وصلت البضاعة للمخزن")').click(); await page.waitForLoadState('networkidle');
expect(page.url().includes('/partner/warehouse'), 'انتقل إلى المخزن');
// وزن + صورة فحص
const wc = page.locator('.card-box', { hasText: orderCode });
await wc.locator('input[name=actual_weight_g]').first().fill('420');
await wc.locator('input[name=proof_image_url]').first().fill('https://example.com/proof.jpg');
await wc.locator('button:has-text("حفظ")').first().click(); await page.waitForLoadState('networkidle');
// فتح شحنة وضم
await page.click('button:has-text("فتح شحنة جديدة")'); await page.waitForLoadState('networkidle');
await page.locator('.card-box', { hasText: orderCode }).locator('button:has-text("ضمّ إلى الشحنة")').click(); await page.waitForLoadState('networkidle');
await shot(page, 'partner-warehouse');
await page.goto(BASE + '/partner/shipments');
const sh = page.locator('.card-box').first();
await sh.locator('input[name=tracking_no]').fill('CA987654321CN');
await sh.locator('input[name=total_weight_kg]').fill('12.4');
await sh.locator('button:has-text("شُحنت إلى ليبيا")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("وصلت ليبيا")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("دخلت الجمارك")').click(); await page.waitForLoadState('networkidle');
await page.locator('.card-box').first().locator('button:has-text("خرجت من الجمارك")').click(); await page.waitForLoadState('networkidle');
await shot(page, 'partner-shipments');
await page.goto(BASE + '/partner/delivery');
expect((await page.content()).includes(orderCode), 'الطلب وصل لصفحة التسليم بعد خروج الشحنة من الجمارك');
await shot(page, 'partner-delivery');
await page.locator('tr', { hasText: orderCode }).locator('button:has-text("تم التسليم")').click(); await page.waitForLoadState('networkidle');
await page.goto(BASE + '/logout');

// ---------- الزبونة ترى النتيجة ----------
await page.goto(BASE + '/login');
await page.fill('input[name=phone]', PHONE); await page.fill('input[name=password]', 'secret123');
await page.click('button:has-text("دخول")'); await page.waitForLoadState('networkidle');
await page.goto(BASE + `/orders/${orderCode}`);
expect((await page.content()).includes('تم التسليم'), 'الزبونة ترى الطلب "تم التسليم"');
expect((await page.locator('.track .st.done').count()) >= 6, 'مسار التتبع مكتمل');
expect((await page.content()).includes('صورة الفحص'), 'الزبونة ترى رابط صورة الفحص');
await shot(page, 'customer-order-delivered');
await page.goto(BASE + '/account');
expect((await page.content()).includes('تم تسليم طلبك'), 'إشعار التسليم وصل للزبونة');
await shot(page, 'customer-notifications');

// جوال
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
await mp.goto(BASE + '/'); await mp.waitForLoadState('networkidle');
expect(await mp.locator('.bottom-nav').isVisible(), 'شريط التنقل السفلي يظهر في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-home.png` });
await mp.goto(BASE + '/c/dresses'); await mp.click('.card >> nth=0'); await mp.waitForLoadState('networkidle');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-product.png` });
const sw = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
expect(sw, 'لا تمرير أفقي في الجوال');

// 404
const r404 = await page.goto(BASE + '/p/not-exist');
expect(r404.status() === 404, 'صفحة غير موجودة تعيد 404');

await browser.close();
console.log('\n===== النتيجة =====');
console.log(problems.length ? problems.join('\n') : 'كل الفحوصات نجحت ✓');
process.exit(problems.length ? 1 : 0);
