-- متجر تجزئة لا سوق جملة. صاحب المشروع فتح «صندوق هدايا للهواتف والسماعات» فوجد أقل طلب
-- ٢٠٠ قطعة: الإعلان لمصنع علب (YIGAO PACKAGING PRINTING · 源头大厂 专属定制) يبيع العلبة
-- الفارغة، والسماعات في الصورة محتوى توضيحي.
-- ٣٠٦ لوط جملة (أقل طلب ١٠ فأكثر) + ٩٦ إعلان تغليف/طباعة/OEM = ٣٩٠ منتجًا من ١٤٬١٨٥ (٢٫٧٥٪).
-- تُخفى لا تُحذف: الزرّان في /admin/products يعيدانها متى شاء.
-- الكلمات قوية الدلالة فقط؛ 定制 و厂家直销 مستبعدتان لأن الباعة يرشّونهما كدعاية على بضاعة سليمة.
UPDATE products SET status='hidden', updated_at=datetime('now')
 WHERE status='active' AND (
   min_qty >= 10
   OR title_src LIKE '%包装%' OR title_src LIKE '%印刷%' OR title_src LIKE '%纸盒%'
   OR title_src LIKE '%礼品盒%' OR title_src LIKE '%包装袋%' OR title_src LIKE '%包装盒%'
   OR title_src LIKE '%OEM%'  OR title_src LIKE '%贴牌%' OR title_src LIKE '%代工%');

INSERT INTO settings(key,value,updated_at) VALUES('retail_max_moq','10',datetime('now'))
  ON CONFLICT(key) DO NOTHING;
