-- أرقام إنجليزية في كل الموقع (طلب صاحب المشروع ٢٤/٠٩/٢٦). مدة الشحن محفوظة في الإعدادات
-- بأرقام عربية منذ ترحيل 0012؛ تُحوَّل هنا لتظهر 0-9 في خانة التحرير في /admin/pricing أيضًا.
UPDATE settings SET value =
  replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(value,
  '٠','0'),'١','1'),'٢','2'),'٣','3'),'٤','4'),'٥','5'),'٦','6'),'٧','7'),'٨','8'),'٩','9')
WHERE key IN ('air_days','sea_days','delivery_city_rates','delivery_days') OR value GLOB '*[٠-٩]*';
