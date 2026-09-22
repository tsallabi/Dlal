-- 1) نتيجة البحث من TMAPI لا تحمل حقل مخزون، فكان الاستيراد يعلّم كل منتج «نفد» ويُخفيه من المتجر.
--    نُعيد المنتجات التي لم تُفحص تفاصيلها قط (بلا مقاسات وبصورة واحدة وبلا وزن) إلى «متوفر»؛
--    مهمة المخزون تُصحّح ما نفد فعلًا عند أول فحص تفاصيل.
UPDATE products SET in_stock=1
WHERE in_stock=0 AND source='1688' AND weight_g IS NULL
  AND (SELECT COUNT(*) FROM variants v WHERE v.product_id=products.id) = 0
  AND (SELECT COUNT(*) FROM product_images i WHERE i.product_id=products.id) <= 1;

-- 2) عنوان يرفض أن يُترجم كان يُعاد إلى الصف الأول في كل دفعة فيبتلع الاستدعاءات ويمنع غيره.
--    نعدّ المحاولات ونقدّم الأقل محاولةً.
ALTER TABLE products ADD COLUMN tr_tries INTEGER NOT NULL DEFAULT 0;
