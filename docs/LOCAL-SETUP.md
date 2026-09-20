# تشغيل دلال على كمبيوترك

مُجرَّب على نسخة نظيفة من المستودع: استنساخ → تثبيت → ترحيلات → تشغيل → الصفحة الرئيسية تعمل باللغة العربية مع منتجاتها.

## 1. المتطلبات (مرة واحدة)
- **Node.js 22** أو أحدث: <https://nodejs.org> (اختر LTS).
- **Git**: <https://git-scm.com/downloads>.
- **Google Chrome** (لإضافة الزاحف ولاختبارات الشاشة).

للتأكد أن كل شيء مثبّت، افتح موجه الأوامر (PowerShell على ويندوز، Terminal على ماك) واكتب:
```bash
node -v && git --version
```

## 2. إحضار المشروع
```bash
git clone https://github.com/tsallabi/Dlal.git
cd Dlal
npm ci
```

## 3. أسرار التشغيل المحلي
```bash
cp .dev.vars.example .dev.vars      # على ويندوز PowerShell: copy .dev.vars.example .dev.vars
```
هذه قيم محلية فقط، لا علاقة لها بالموقع الحي. لا ترفع `.dev.vars` إلى GitHub (مستثنى أصلًا في `.gitignore`).

## 4. قاعدة البيانات المحلية ثم التشغيل
```bash
npx wrangler d1 migrations apply dlal-db --local -c wrangler.local.toml
npx wrangler dev -c wrangler.local.toml
```
افتح <http://localhost:8787>. النسخة المحلية لها قاعدة بيانات منفصلة تمامًا عن الموقع الحي، فيها بيانات تجريبية للتجربة الآمنة.

حسابات النسخة المحلية فقط: المالك `0910000000` / `admin123`، الشريك `0920000000` / `partner123`، الزبونة `0930000000` / `customer123`.

**ملاحظة**: `wrangler.local.toml` بلا ربط Workers AI عمدًا، لأن الربط يتطلب اتصالًا بحساب Cloudflare. لذلك الترجمة الآلية للعناوين لا تعمل محليًا (القاموس يعمل)، وتعمل كاملة على الموقع الحي.

## 5. اختبار الشاشة الشامل
```bash
npx playwright install chromium     # مرة واحدة
node scripts/e2e.mjs                # الخادم المحلي يجب أن يكون شغّالًا
```
يجب أن ينتهي بـ «كل الفحوصات نجحت ✓». شغّله قبل أي دفع إلى `main`.

## 6. النشر
لا تنشر يدويًا. أي `git push` إلى `main` ينشر تلقائيًا عبر GitHub Actions إلى Cloudflare، ثم يشغّل فحص الموقع الحي.
```bash
git add -A && git commit -m "وصف التغيير" && git push
```
تابع النتيجة على <https://github.com/tsallabi/Dlal/actions>.

## 7. إضافة الزاحف على نفس الجهاز
نزّل <https://dlal.tsallabi.workers.dev/dlal-extension.zip>، فكّ الضغط في مجلد ثابت، ثم `chrome://extensions` ← وضع المطوّر ← تحميل غير مضغوط ← اختر المجلد. من أيقونة الإضافة أدخل عنوان الموقع والرمز (`IMPORT_TOKEN` معروض في `/admin/crawler` بعد الدخول كمالك). سجّل الدخول في 1688 في نفس المتصفح واتركه مفتوحًا.

## 8. المتابعة مع كلود لاحقًا
- **من نفس الجهاز**: ثبّت Claude Code (`npm i -g @anthropic-ai/claude-code`) ثم شغّل `claude` داخل مجلد المشروع. سيقرأ `CLAUDE.md` تلقائيًا ويتابع نفس القواعد.
- **عن بُعد**: افتح <https://claude.ai/code> واختر مستودع `tsallabi/Dlal`. العمل يبقى متزامنًا لأن كل شيء على `main`.
