-- عرض محتشم: ليبيا بلد محافظ. الصفحة الرئيسية تعرض الأقسام العامة فقط،
-- وملابس النوم والداخلية تبقى في قسمها لا تُرى إلا لمن دخلته بنفسها.
ALTER TABLE categories ADD COLUMN show_home INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN home_ok INTEGER NOT NULL DEFAULT 1;

-- قسم الملابس الداخلية والنوم: يبقى في قائمة الأقسام، ويختفي من طوابق الرئيسية
UPDATE categories SET show_home=0 WHERE slug IN ('lingerie');

-- ترتيب الرئيسية: المحتشم والعام أولًا (عبايات، فساتين، أحذية، إكسسوارات، مكياج، عدّة، صيد، رياضة…)
UPDATE categories SET sort=1  WHERE slug='abayas';
UPDATE categories SET sort=2  WHERE slug='dresses';
UPDATE categories SET sort=3  WHERE slug='shoes';
UPDATE categories SET sort=4  WHERE slug='bags';
UPDATE categories SET sort=5  WHERE slug='accessories';
UPDATE categories SET sort=6  WHERE slug='beauty';
UPDATE categories SET sort=7  WHERE slug='hijab';
UPDATE categories SET sort=8  WHERE slug='tools';
UPDATE categories SET sort=9  WHERE slug='outdoor';
UPDATE categories SET sort=10 WHERE slug='sports';
UPDATE categories SET sort=11 WHERE slug='car';
UPDATE categories SET sort=12 WHERE slug='building';
UPDATE categories SET sort=13 WHERE slug='farm';
UPDATE categories SET sort=14 WHERE slug='men-acc';
UPDATE categories SET sort=15 WHERE slug='electronics';
UPDATE categories SET sort=16 WHERE slug='home';
UPDATE categories SET sort=17 WHERE slug='kids';
UPDATE categories SET sort=18 WHERE slug='tops';
UPDATE categories SET sort=99 WHERE slug='lingerie';

-- إصلاح التصنيف الخاطئ: ملابس النوم والداخلية وصلت إلى «عبايات وجلابيات» وغيرها
UPDATE products SET category_id=(SELECT id FROM categories WHERE slug='lingerie'), home_ok=0
WHERE category_id <> (SELECT id FROM categories WHERE slug='lingerie') AND (
     title_ar LIKE '%بيجام%' OR title_ar LIKE '%بجام%'
  OR title_ar LIKE '%ملابس نوم%' OR title_ar LIKE '%ملابس النوم%' OR title_ar LIKE '%لباس نوم%'
  OR title_ar LIKE '%قميص نوم%' OR title_ar LIKE '%ثوب نوم%' OR title_ar LIKE '%فستان نوم%' OR title_ar LIKE '%تنورة نوم%'
  OR title_ar LIKE '%روب نوم%' OR title_ar LIKE '%روب حمام%' OR title_ar LIKE '%رداء نوم%'
  OR title_ar LIKE '%لانجيري%' OR title_ar LIKE '%لانجري%' OR title_ar LIKE '%ملابس داخلية%' OR title_ar LIKE '%ملابس تحتية%'
  OR title_ar LIKE '%حمالة صدر%' OR title_ar LIKE '%حمّالة صدر%' OR title_ar LIKE '%سوتيان%' OR title_ar LIKE '%صدرية داخلية%'
  OR title_ar LIKE '%كيلوت%' OR title_ar LIKE '%سروال داخلي%' OR title_ar LIKE '%شورت داخلي%'
  OR title_ar LIKE '%بيكيني%' OR title_ar LIKE '%مايوه%' OR title_ar LIKE '%ملابس سباحة%' OR title_ar LIKE '%لباس سباحة%'
);

-- منتجات تبقى في قسمها لكن لا تظهر على الرئيسية (وصف مكشوف)
UPDATE products SET home_ok=0 WHERE
     title_ar LIKE '%مفتوح الخلف%' OR title_ar LIKE '%عاري الظهر%' OR title_ar LIKE '%مكشوف الظهر%'
  OR title_ar LIKE '%بدون حمالات%' OR title_ar LIKE '%بدون أكتاف%' OR title_ar LIKE '%مثير%'
  OR title_ar LIKE '%إيروتيك%'
  OR (title_ar LIKE '%شفاف%' AND title_ar NOT LIKE '%حافظة%' AND title_ar NOT LIKE '%غطاء%' AND title_ar NOT LIKE '%علبة%' AND title_ar NOT LIKE '%لاصق%' AND title_ar NOT LIKE '%كيس%');

-- كل ما في قسم الملابس الداخلية والنوم لا يظهر على الرئيسية
UPDATE products SET home_ok=0 WHERE category_id=(SELECT id FROM categories WHERE slug='lingerie');
CREATE INDEX IF NOT EXISTS idx_products_home ON products(home_ok, status);
