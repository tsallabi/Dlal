# دلال — Dlal

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

## تشغيل محلي
```bash
npm i
npx wrangler d1 migrations apply dlal-db --local
npx wrangler dev
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
npx wrangler deploy
```
ثم اربط الدومين من لوحة Cloudflare → Workers → Custom Domains.

## تدفق الطلب
`pending_payment → paid → purchasing → purchased → at_warehouse → consolidated → shipped → arrived → customs → ready → delivered`

- الأدمن يؤكد الدفع ويعيّن الشريك.
- موظف الشريك يرى رابط 1688 والمواصفة والكمية، يدخل رقم طلب 1688 والتكلفة، أو يضغط "نفد" فيُخفى المنتج فورًا وتُبلَّغ الزبونة.
- في المخزن يدخل الوزن الفعلي (يحدّث وزن المنتج للتسعير المستقبلي) وصورة الفحص (تراها الزبونة).
- يفتح شحنة، يضم الطلبات، ويحدّث حالة الشحنة فتتحدث كل طلباتها دفعة واحدة.

## مصدر المنتجات
1. **الآن:** زر "استورد إلى دلال" في شريط المفضلة → يعمل داخل 1688.com بحسابك، يرسل المنتجات إلى `/api/import`.
2. **بعد قبول الشراكة:** `/admin/api1688` → appKey/appSecret → تفويض OAuth → بحث واستيراد ومزامنة يومية (Cron 03:00 UTC).

الزبونة لا ترى أبدًا رابط المصدر ولا سعره.
