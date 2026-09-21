-- فروع الدفع نقدًا (سطر لكل فرع) + أقسام تهم الرجال
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('branches', 'الفرناج — شارع المخازن سابقًا، طرابلس
بنغازي — شارع مصرف الجمهورية، طبالينو');

INSERT OR IGNORE INTO categories(slug,name_ar,icon,est_weight_g,sort) VALUES
 ('tools','عدّة وأدوات','🧰',1200,13),
 ('outdoor','صيد وتخييم','🎣',1500,14),
 ('car','إكسسوارات وتزيين السيارات','🚗',900,15),
 ('building','أدوات البناء','🧱',2000,16);
