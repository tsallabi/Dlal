-- من ينفّذ كل مهمة: الخادم (مزوّد API مدفوع) أم إضافة المتصفح (مجانية بلا حساب) أم أيهما
-- البحث يحتاج تسجيل دخول في 1688 فيُسند للخادم؛ فحص المخزون وجلب التفاصيل يعملان بلا حساب فيُسندان للإضافة.
ALTER TABLE crawl_jobs ADD COLUMN runner TEXT NOT NULL DEFAULT 'any';
UPDATE crawl_jobs SET runner='extension' WHERE type='stock';
UPDATE crawl_jobs SET runner='server' WHERE type IN ('search','url');
