// إعداد التشغيل المحلي بأمر واحد يعمل على ويندوز وماك ولينكس: نسخ أسرار التطوير + تطبيق ترحيلات قاعدة البيانات المحلية
// npm run setup
import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devVars = join(root, '.dev.vars');
const example = join(root, '.dev.vars.example');

if (existsSync(devVars)) {
  console.log('✔ .dev.vars موجود — لم يُستبدل.');
} else {
  copyFileSync(example, devVars);
  console.log('✔ أُنشئ .dev.vars من .dev.vars.example (قيم محلية فقط).');
}

console.log('… تطبيق ترحيلات قاعدة البيانات المحلية');
// stdin مُغلق عمدًا: wrangler يتخطى سؤال التأكيد عندما لا يكون المدخل تفاعليًا، فلا يتوقف الإعداد على إجابة
const r = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'dlal-db', '--local', '-c', 'wrangler.local.toml'], {
  cwd: root, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, CI: '1' }, shell: process.platform === 'win32',
});
if (r.status !== 0) { console.error('✖ فشل تطبيق الترحيلات. أرسل نص الخطأ أعلاه.'); process.exit(r.status ?? 1); }

console.log('\n✔ جاهز. شغّل الآن:  npm run dev    ثم افتح http://localhost:8787');
