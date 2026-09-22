-- علامة «يحتاج إعادة ترجمة» يضعها التفتيش. أي كاشف جديد يضعها بدل أن نُعيد كتابة
-- استعلام الطابور في كل مرة. تُمسح لحظة نجاح ترجمة سليمة.
ALTER TABLE products ADD COLUMN needs_tr INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_needs_tr ON products(needs_tr) WHERE needs_tr = 1;
