-- الاستيراد كان يكتب last_checked_at=الآن لكل منتج يصل من نتيجة بحث، رغم أنه لم يُفحص تفصيليًا قط.
-- أثره على المال: دورة الإثراء ترى المنتج «مفحوصًا حديثًا» فتتخطاه، فبقي ١٣ ألف منتج بلا صور ولا
-- مقاسات ولا وزن بينما كان الرصيد يُنفق على إعادة سؤال نفس الـ٦١٨ منتجًا.
-- نُصفّر الحقل لمن لا يحمل أي أثر إثراء (بلا وزن وبلا متغيرات وبصورة واحدة أو صفر) فيدخل الدور بحق.
UPDATE products SET last_checked_at=NULL
WHERE source='1688' AND last_checked_at IS NOT NULL
  AND weight_g IS NULL
  AND (SELECT COUNT(*) FROM variants v WHERE v.product_id=products.id) = 0
  AND (SELECT COUNT(*) FROM product_images i WHERE i.product_id=products.id) <= 1;
