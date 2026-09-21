# اختبار إضافة المتصفح محليًا (بدون الوصول إلى 1688)
1. شهادة محلية: `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj "/CN=1688.com" -addext "subjectAltName=DNS:*.1688.com"`
2. خادم الصفحات الوهمية (يحتاج صلاحية المنفذ 443): `node scripts/ext-test/server.mjs`
3. الموقع محليًا: `npx wrangler dev` ثم `UPDATE crawl_jobs SET run_now=1`
4. `xvfb-run -a node scripts/ext-test/run.mjs` — يحمّل الإضافة في كروميوم ويربط *.1688.com بالخادم الوهمي ويشغّل المهام ويطبع السجل.

5. اختبار القارئ وحده (أسرع وأدق، بلا تحميل الإضافة): `xvfb-run -a node scripts/ext-test/parse-test.mjs` — يفحص قراءة صفحة المنتج كما تظهر لزائر غير مسجّل (العنوان، السعر، الصور، الوزن، الألوان والمقاسات من جدول المواصفات) وصفحة النتائج.
