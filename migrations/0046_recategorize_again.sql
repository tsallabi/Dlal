-- القواعد الأولى في 0045 نقلت سجادات اليوغا وأحبال القفز إلى «ملابس رياضية» (كلمة «يوغا» وحدها) وبلوزات «配裙子» إلى
-- «بناطيل وتنانير». القواعد صُحّحت وصار للمرور رجعة (FALLBACK): نعيد المؤشّر إلى الصفر ليمرّ على الرف من أوله.
UPDATE settings SET value='0' WHERE key='cat_sweep_id';
DELETE FROM settings WHERE key='cat_sweep_done_at';
