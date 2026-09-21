# تثبيت Claude Code على ويندوز ومتابعة العمل من جهازك

Claude Code يعمل على ويندوز 11 مباشرة، بلا WSL.

## 1. التثبيت
افتح **PowerShell** (ابحث عنه في قائمة ابدأ) ونفّذ:
```powershell
irm https://claude.ai/install.ps1 | iex
```

إن كنت في **موجه الأوامر (cmd)** — وهو ما يظهر عندك بصيغة `C:\Users\astgf>` — فالأمر السابق لن يعمل. استخدم:
```batch
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

بديل يعمل على الاثنين إن فشل ما سبق (Node 22 مثبّت عندك أصلًا):
```
npm install -g @anthropic-ai/claude-code
```

**بعد التثبيت أغلق النافذة وافتح نافذة جديدة**، وإلا لن يتعرّف النظام على الأمر. ثم تحقق:
```
claude --version
```

## 2. أول تشغيل
في PowerShell، سطر واحد:
```powershell
cd C:\Users\astgf\Dlal; claude
```
أو افتح مجلد `Dlal` في مستكشف الملفات، اكتب `powershell` في شريط العنوان واضغط Enter، ثم اكتب `claude`.
سيفتح المتصفح لتسجيل الدخول بحسابك في claude.ai. إن لم يعد المتصفح تلقائيًا، انسخ الرمز المعروض والصقه في الطرفية.

ملف `CLAUDE.md` في جذر المشروع يُقرأ تلقائيًا عند بدء كل جلسة، فتبقى كل قواعد المشروع سارية بلا إعداد إضافي. للتأكد اكتب `/context` داخل الجلسة وابحث عن «Memory files».

## 3. إن لم يُعرف الأمر `claude` (يحدث غالبًا بعد التثبيت)
المثبّت يضع البرنامج في `%USERPROFILE%\.local\bin\claude.exe` لكنه لا يضيف المسار إلى PATH دائمًا، وينبّهك بذلك في آخر رسائله.
الحل: الصق هذا **السطر الواحد** في PowerShell:
```powershell
[Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH','User') + ';' + "$env:USERPROFILE\.local\bin", 'User')
```
ثم **أغلق النافذة وافتح واحدة جديدة** (التغيير لا يسري على النوافذ المفتوحة)، وتحقق بـ `claude --version`.

## 4. ملاحظات ويندوز
- **الطرفية**: للعرض الصحيح للعربية والرموز استخدم **Windows Terminal** من متجر مايكروسوفت بدل نافذة cmd القديمة.
- **Git for Windows** مثبّت عندك، وهو ما يمنح كلود صدفة bash. إن لم يجده، أضف في `%USERPROFILE%\.claude\settings.json` القيمة `CLAUDE_CODE_GIT_BASH_PATH` بمسار `C:\Program Files\Git\bin\bash.exe`.
- **التحديث**: النسخة المثبّتة بالمثبّت الأصلي تحدّث نفسها. نسخة npm تُحدَّث يدويًا بـ `npm install -g @anthropic-ai/claude-code@latest`.
- إن رفض PowerShell تشغيل سكربتات npm: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

## 5. العمل بالتوازي
العمل من جهازك ومن <https://claude.ai/code> يرى نفس الكود، لأن كل شيء على الفرع `main`. قبل أن تبدأ على جهازك نفّذ `git pull` لتأخذ آخر التعديلات، وبعد أي تعديل `git push`.
