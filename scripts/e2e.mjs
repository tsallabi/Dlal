// تجربة حقيقية على الشاشة (Playwright) — الإصدار 2
// زبونة (كوبون + ماي باي) → أدمن → موظف شاهين → تسليم → نقاط وتقييم وتذكرة → مراجعة الأدمن → الأدوار والصلاحيات → دفع فاشل وإلغاء → جوال
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
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
// ar-LY يكتب العشور بفاصلة، و«د.ل» فيها نقطة تُربك أي تنظيف أعمى: نأخذ أول رقم فقط
const num = (t) => {
  const m = String(t).match(/[\d.,٫،]*\d/);            // أول رقم فقط — «د.ل» فيها نقطة تُربك التنظيف الأعمى
  if (!m) return NaN;
  return parseFloat(m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(/[,٫،]/g, '.'));   // ar-LY: النقطة للآلاف والفاصلة للعشور
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
expect(await page.locator('.hdr-main .logo u').textContent() === 'بوابة الصين', 'الشعار يحمل «بوابة الصين» تحت الاسمين');
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
  ['/admin/import', 'admin-import', 'استورد إلى تالين'], ['/admin/products', 'admin-products', 'offerId'], ['/admin/categories', 'admin-categories', 'الوزن التقديري'],
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
expect(await has(page, '/talin-extension.zip'), 'رابط تنزيل الإضافة موجود في لوحة الزاحف');
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
expect(await has(page, 'فستان تجريبي مستورد'), 'استيراد JSON أضاف المنتج');
const r = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: 1, page_url: 'test', items: [{ offerId: '999000111', priceCny: 45, inStock: true }] } });
expect((await r.json()).updated === 1, 'API الاستيراد يحدّث منتجًا موجودًا بدل تكراره');
// إعادة فحص منتج من مهمة بلا قسم يجب ألا تغيّر سعره (يُسعَّر بقسمه هو)
await page.goto(BASE + '/admin/products');
const priceBefore = await page.locator('table.tbl tr:has-text("فستان تجريبي مستورد") td').nth(4).textContent();
const again = await ctx.request.post(BASE + '/api/import', { headers: { 'x-import-token': 'dev-import-token' }, data: { category_id: null, page_url: 'ext:stock', items: [{ offerId: '999000111', url: 'https://detail.1688.com/offer/999000111.html', title: 'فستان تجريبي مستورد', priceCny: 45, images: [], variants: [], inStock: true }] } });
expect(again.ok(), 'إعادة الفحص بلا قسم تنجح');
await page.goto(BASE + '/admin/products');
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
  ['/pages/how', 'كيف تعمل تالين؟', 'شحن جوي إلى ليبيا'],
  ['/pages/how-to-order', 'كيف أطلب من تالين؟', 'أكّدي الطلب وادفعي'],
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
const capped = await page.$$eval('.card .p', els => els.map(e => parseFloat(e.textContent.replace(/[^\d٫.]/g, '').replace('٫', '.'))));
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
expect(await page.locator('.hdr-main .logo b').textContent() === 'تالين', 'الشعار يحمل الاسم العربي «تالين»');
expect(await page.locator('.hdr-main .logo i').textContent() === 'TALIN', 'وتحته الاسم اللاتيني «TALIN»');
expect((await page.title()).includes('تالين TALIN'), 'عنوان الصفحة يحمل الاسمين');
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
expect(await has(page, '٣٠ — ٤٥'), 'مدة الوصول البحرية معروضة في الملخص');
await shot(page, 'cart-ship-sea');
// الطلب يحفظ الطريقة ويعرضها في التتبع
await page.goto(BASE + '/checkout');
expect(await page.locator('.shipsel label.on').textContent().then(t => t.includes('بحري')), 'صفحة الدفع تتذكر اختيار البحري');
await page.check('input[value=mypay_sadad]');
await page.click('button:has-text("تأكيد الطلب")'); await page.waitForLoadState('networkidle');
const seaOrder = page.url().match(/DL-\d{4}-\d{6}/);
if (page.url().includes('/pay/mock/')) { await page.click('button:has-text("تأكيد الدفع")'); await page.waitForLoadState('networkidle'); }
expect(await has(page, 'شحن بحري'), 'صفحة الطلب تعرض أنه شحن بحري');
expect(await has(page, '٣٠ — ٤٥'), 'صفحة الطلب تعرض مدة الوصول البحرية');
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

// ---------- لوحة صحة الكتالوج: الأرقام التي يقودها المالك بنفسه ----------
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/source');
const hk = page.locator('.card-box:has(h3:text("صحة الكتالوج")) .kpi');
expect((await hk.count()) === 7, `لوحة صحة الكتالوج تعرض سبعة أرقام (${await hk.count()})`);
const cnLive = num(await hk.nth(1).locator('b').textContent());
expect(cnLive === 0, `لا عنوان صيني ظاهر للزبونة (${cnLive})`);
expect(num(await hk.nth(0).locator('b').textContent()) > 0, 'عدد المنتجات المعروضة يظهر في اللوحة');
expect((await page.locator('button:has-text("أثرِ ١٠ منتجات الآن")').count()) === 1, 'زر الإثراء موجود في اللوحة');
expect((await page.locator('button:has-text("ترجم ٢٠ عنوانًا الآن")').count()) === 1, 'زر الترجمة موجود في اللوحة');
expect(await has(page, 'سقف استدعاءات المزوّد في الشهر'), 'حقل السقف الشهري لاستدعاءات المزوّد موجود');
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
await page.fill('form[action$="/import/json"] textarea[name=json]', JSON.stringify([{
  offerId: cnOffer, url: `https://detail.1688.com/offer/${cnOffer}.html`, title: cnTitle,
  priceCny: 42, images: ['https://cbu01.alicdn.com/img/ibank/test.jpg'], minQty: 1, inStock: true,
}, {
  // عنوان بكلمات فريدة لكل تشغيل: كاشف المكرر يرفض نسخة ثانية من قطعة تشبه ما في القسم، وهو سلوك صحيح
  offerId: arOffer, url: `https://detail.1688.com/offer/${arOffer}.html`, title: `قطعة اختبار ${arOffer}`,
  priceCny: 55, images: ['https://cbu01.alicdn.com/img/ibank/ar.jpg'], minQty: 1, inStock: true,
}]));
await page.click('form[action$="/import/json"] button:has-text("استيراد")');
await page.waitForLoadState('networkidle');
expect(page.url().includes('imported=2'), 'الأدمن يستورد منتجين من لصق JSON');
// منتج بلا تقييم حقيقي لا يُعرض بنجوم مُختلقة
await page.goto(BASE + '/admin/products?q=' + arOffer);
const arHref = await page.locator(`tr:has-text("${arOffer}") a[href^="/p/"]`).first().getAttribute('href');
await page.goto(BASE + arHref);
expect(await has(page, 'لا تقييمات بعد'), 'المنتج بلا تقييمات يقول ذلك صراحةً بدل نجوم مُختلقة');
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
// (على الموقع الحي بقي منتج جاهز تمامًا — عنوان عربي، ٦ صور، وزن، سعران — محجوزًا مسودةً
//  لأن النشر كان معلّقًا على أن تُغيّر دفعة الترجمة شيئًا في نفس التمريرة.)
await login(page, '0910000000', 'admin123');
await page.goto(BASE + '/admin/products?status=draft&q=' + cnOffer);
const heldHref = await page.locator(`tr:has-text("${cnOffer}") a[href^="/admin/products/"]`).first().getAttribute('href');
await page.goto(BASE + heldHref);
// ١) نعطيها عنوانًا عربيًا من لوحة الأدمن: نموذج التحرير يحفظ الحالة كما هي، فتبقى مسودةً
//    وإن صار عنوانها سليمًا — وهذه هي الحالة العالقة بالضبط
await page.fill('input[name=title_ar]', `حامل اختبار عربي ${cnOffer}`);
await page.click('form:has(input[name=title_ar]) button:has-text("حفظ")');
await page.waitForLoadState('networkidle');
expect(await page.locator('select[name=status]').inputValue() === 'draft', 'المسودة تبقى محجوزة رغم أن عنوانها صار عربيًا');
await shot(page, 'admin-stuck-draft');
// ٢) زر الترجمة يُطلقها بلا أي استدعاء نموذج (النسخة المحلية بلا Workers AI)
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

// ---------- جوال ----------
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'ar' });
const mp = await m.newPage();
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
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'لا تمرير أفقي في الجوال');
await mp.goto(BASE + '/login'); await mp.fill('input[name=phone]', PHONE); await mp.fill('input[name=password]', 'secret456'); await mp.click('button:has-text("دخول")'); await mp.waitForLoadState('networkidle');
await mp.goto(BASE + '/account'); await mp.waitForLoadState('networkidle');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'حسابي بلا تمرير أفقي في الجوال');
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
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'السلة بلا تمرير أفقي في الجوال');
await mp.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-mobile-cart.png` });
await mp.goto(BASE + '/checkout'); await mp.waitForLoadState('networkidle');
expect(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'صفحة الدفع بلا تمرير أفقي في الجوال');
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
