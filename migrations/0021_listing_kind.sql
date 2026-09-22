-- «ماذا أستلم بالضبط؟» — إعلانات سليمة لكن عنوانها وحده مضلِّل: حامل عرض يصل فارغًا
-- والبضاعة في صورته للتوضيح، وزهرة تبدو طبيعية وهي صناعية، وبدلة ساونا تبدو ملابس رياضة.
-- صاحب المشروع طلب صراحةً **التوضيح لا الإخفاء** (٢٢/٠٩/٢٦)، فتبقى على الرف مع سطر يشرحها.
ALTER TABLE products ADD COLUMN kind TEXT;
UPDATE products SET kind = CASE
  WHEN title_src LIKE '%展示架%' OR title_src LIKE '%陈列架%' OR title_src LIKE '%陈列%' OR title_src LIKE '%展架%' OR title_src LIKE '%托架%' OR title_src LIKE '%货架%' THEN 'rack'
  WHEN title_src LIKE '%模特%' OR title_src LIKE '%人台%' THEN 'mannequin'
  WHEN title_src LIKE '%仿真%' OR title_src LIKE '%假花%' OR title_src LIKE '%人造花%' THEN 'fake'
  WHEN title_src LIKE '%汗蒸服%' OR title_src LIKE '%桑拿服%' THEN 'sauna'
  WHEN title_src LIKE '%摄影道具%' OR title_src LIKE '%拍摄道具%' OR title_src LIKE '%拍照道具%' THEN 'prop'
  END
 WHERE title_src IS NOT NULL;
