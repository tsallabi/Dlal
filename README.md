# تالين — TALIN

متجر بتجربة شي إن للسوق الليبي، بضاعته من 1688، وتنفيذ الطلبات (شراء + تجميع + شحن) عبر شركاء شحن في الصين (شاهين وغيرها). مبني على Cloudflare Workers + D1 + R2، بالعربية RTL.

## البنية
```
src/
  index.tsx            التطبيق + Cron Trigger
  types.ts             الأنواع، حالات الطلب، طرق الدفع، المدن
  lib/auth.ts          جلسات + PBKDF2
  lib/pricing.ts       محرك التسعير (سعر الصرف، الشحن بالوزن، الجمارك، الربح)
  lib/source.ts        طبقة مصدر المنتجات (متصفح اليوم / API غدًا)
  lib/api1688.ts       عميل open.1688.com (OAuth + توقيع + product.get + بحث)
  routes/store.tsx     واجهة الزبونة: رئيسية، أقسام، بحث، منتج، سلة، دفع، طلباتي
  routes/auth.tsx      دخول/تسجيل بالهاتف
  routes/admin.tsx     لوحة الأدمن
  routes/api1688-admin.tsx  ربط الـ API الرسمي ومزامنة المخزون
  routes/partner.tsx   لوحة شريك الشحن (متعددة الشركاء)
  routes/api.ts        استقبال الاستيراد من المتصفح + فحص المخزون
public/
  importer.js          سكربت يُحقن في 1688 (bookmarklet): استيراد صفحة / فحص مخزون
  app.js, style.css
migrations/            D1
scripts/seed.mjs       يولّد بيانات تجريبية
scripts/e2e.mjs        تجربة على الشاشة (Playwright) لكل التدفق
```

## الإصدار 2 — ما أُضيف
- **ماي باي (mypay.ly)**: دفع فوري (معاملات/سداد/إدفعلي/موبي كاش) → ويبهوك موقّع HMAC-SHA256 يحوّل الطلب إلى مدفوع تلقائيًا. وضع محاكاة محلي لاختبار المسار كاملًا على الشاشة، ووضع حقيقي بمفتاح API وسر الويبهوك من `/admin/payments`. كل طلب/رد يُسجَّل في `payment_log`.
- **الأدوار والصلاحيات**: مالك، مدير، عمليات، دعم، مالية، كتالوج (`src/lib/perm.ts`) + سجل نشاط.
- **حساب الزبونة**: طلبات بمراحل، إرجاع/تذاكر، تقييمات بنقاط، كوبونات، نقاط ولاء، دفتر عناوين، إشعارات، ملف شخصي.
- **الإدارة**: كوبونات، مراجعة التقييمات، التذاكر بقرارات تعويض، مدفوعات، تقارير، ملف الزبونة، موظفون بمصفوفة صلاحيات.
- التفاصيل والمقارنة مع شي إن: `docs/SHEIN-PARITY.md`.

حسابات الأدوار التجريبية (كلمة المرور `staff123`): عمليات `0940000000` — دعم `0950000000` — مالية `0960000000` — كتالوج `0970000000`.
كوبونات تجريبية: `WELCOME10` (10% حتى 60 د.ل) — `FREESHIP` — `DLAL25`.

## تشغيل محلي
> على ويندوز: انقر مرتين على `start.cmd` ويتكفّل بكل شيء. دليل مفصّل في [`docs/LOCAL-SETUP.md`](docs/LOCAL-SETUP.md).
```bash
npm ci
npm run setup     # ينشئ .dev.vars ويطبّق ترحيلات القاعدة المحلية (ويندوز/ماك/لينكس)
npm run dev       # النسخة المحلية بلا ربط Workers AI
```
حسابات تجريبية: أدمن `0910000000/admin123` — موظف شاهين `0920000000/partner123` — زبونة `0930000000/customer123`

اختبار على الشاشة: `node scripts/e2e.mjs` (يحتاج `npx playwright install chromium`).

## النشر على Cloudflare
```bash
npx wrangler login
npx wrangler d1 create dlal-db            # ضع database_id في wrangler.toml
npx wrangler r2 bucket create dlal-images
npx wrangler d1 migrations apply dlal-db --remote     # احذف 0002_seed.sql قبلها إن لم ترد بيانات تجريبية
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put IMPORT_TOKEN
npx wrangler secret put MYPAY_API_KEY          # أو أدخلها من /admin/payments
npx wrangler secret put MYPAY_WEBHOOK_SECRET
npx wrangler deploy
```
ثم اربط الدومين من لوحة Cloudflare → Workers → Custom Domains.

## تدفق الطلب
`pending_payment → paid → purchasing → purchased → at_warehouse → consolidated → shipped → arrived → customs → ready → delivered`

- الأدمن يؤكد الدفع ويعيّن الشريك.
- موظف الشريك يرى رابط 1688 والمواصفة والكمية، يدخل رقم طلب 1688 والتكلفة، أو يضغط "نفد" فيُخفى المنتج فورًا وتُبلَّغ الزبونة.
- في المخزن يدخل الوزن الفعلي (يحدّث وزن المنتج للتسعير المستقبلي) وصورة الفحص (تراها الزبونة).
- يفتح شحنة، يضم الطلبات، ويحدّث حالة الشحنة فتتحدث كل طلباتها دفعة واحدة.

## ثلاث طرق لجلب المنتجات من 1688 (تعمل معًا)
| الطريقة | متى | أين تُضبط |
|---|---|---|
| زر الاستيراد (bookmarklet) | استيراد يدوي لصفحة تتصفحها الآن | `/admin/import` |
| إضافة المتصفح (الزاحف) | آلي من متصفحك المفتوح المسجّل في 1688، بلا تكلفة | `/admin/crawler` + `extension/` |
| مزوّد API من طرف ثالث (OTAPI / TMAPI) | آلي كليًا من الخادم كل ساعة (كرون) بلا متصفح، باشتراك مدفوع | `/admin/source` |
المهام نفسها (`crawl_jobs`) تنفذها الإضافة أو الخادم حسب المتاح. مهمة المخزون تفحص كل ساعة دفعة من 8 منتجات مستحقة (أقدم من `interval_hours`) وتجلب تفاصيلها الكاملة (صور، ألوان/مقاسات، حد أدنى).
العناوين والألوان والمقاسات الصينية تُترجم عند الاستيراد: قاموس → ذاكرة ترجمة (`translations`) → نموذج لغوي على Workers AI مع فحص جودة (يرفض التكرار وحشو 1688). الفحص الحي للمزوّد بلا تسجيل دخول: workflow «Source API check» (`source-check.yml`) يستدعي `/api/source/test|run|translate` برمز `IMPORT_TOKEN`.

## تفعيل ماي باي الحقيقي
1. من لوحة تاجر ماي باي: أنشئ مفتاح API وسر الويبهوك، وسجّل عنوان الويبهوك `https://dlal.ly/api/mypay/webhook`، وفعّل الوسائل (moamalat, sadad, edfali, mobicash).
2. في `/admin/payments`: الوضع = حقيقي، عنوان API حسب وثائق docs.mypay.ly، المفتاح، السر، ثم "اختبار الاتصال".
3. نفّذ طلبًا صغيرًا حقيقيًا وراقب "سجل الاتصال بالبوابة" في الصفحة نفسها: إن اختلف اسم حقل في رد ماي باي عن المتوقع يظهر الرد كاملًا ويُعدَّل `src/lib/mypay.ts` في دقائق.

## مصدر المنتجات
1. **الآن:** زر "استورد إلى تالين" في شريط المفضلة → يعمل داخل 1688.com بحسابك، يرسل المنتجات إلى `/api/import`.
2. **بعد قبول الشراكة:** `/admin/api1688` → appKey/appSecret → تفويض OAuth → بحث واستيراد ومزامنة (Cron كل ساعة).

الزبونة لا ترى أبدًا رابط المصدر ولا سعره.
