-- أقسام شي إن وتيمو الأساسية التي لم تكن عندنا (طلب صاحب المشروع ٢٦/٠٩/٢٦: «اجلب السلع التي يتوفر شبيهها في شي إن وتيمو»).
-- كانت البناطيل والتنانير تدخل «فساتين»، والجاكيتات «بلوزات»، وملابس الرجال حيث وُجد رابطها. الترتيب بعد القسم الأقرب.
INSERT OR IGNORE INTO categories(slug,name_ar,icon,est_weight_g,sort,show_home) VALUES
 ('bottoms','بناطيل وتنانير','👖',350,2,1),
 ('outerwear','جاكيتات ومعاطف','🧥',600,18,1),
 ('sportswear','ملابس رياضية','🏃',300,10,1),
 ('men','ملابس رجالية','👔',400,14,1);

-- مهمة «بلوزات 8» تبحث «外套女» (جاكيتات نسائية) وتُدخلها بلوزات: صار قسمها الجاكيتات
UPDATE crawl_jobs SET category_id=(SELECT id FROM categories WHERE slug='outerwear') WHERE query='外套女' AND type='search';

-- كلمات بحث شي إن للأقسام الجديدة (الخادم عبر المزوّد؛ تعمل حين يكون في المحفظة رصيد، وإلا تسجّل الخطأ وتنتظر)
INSERT OR IGNORE INTO crawl_jobs(name,type,query,category_id,max_pages,enrich,max_new,interval_hours,active,runner) VALUES
('بناطيل 1','search','牛仔裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 2','search','阔腿裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 3','search','半身裙',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 4','search','打底裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 5','search','休闲裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 6','search','西装裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 7','search','百褶裙',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('بناطيل 8','search','短裤女',(SELECT id FROM categories WHERE slug='bottoms'),4,0,40,72,1,'server'),
('جاكيتات 1','search','夹克女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 2','search','风衣女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 3','search','羽绒服女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 4','search','针织开衫女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 5','search','西装外套女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 6','search','皮衣女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 7','search','棉服女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('جاكيتات 8','search','大衣女',(SELECT id FROM categories WHERE slug='outerwear'),4,0,40,72,1,'server'),
('رجالي 1','search','男士T恤',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 2','search','男士衬衫',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 3','search','男士休闲裤',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 4','search','男士牛仔裤',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 5','search','男士夹克',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 6','search','男士卫衣',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 7','search','男士polo衫',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رجالي 8','search','男士短裤',(SELECT id FROM categories WHERE slug='men'),4,0,40,72,1,'server'),
('رياضية 1','search','瑜伽服女',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 2','search','运动套装女',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 3','search','健身服女',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 4','search','运动裤女',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 5','search','速干T恤',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 6','search','运动背心女',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 7','search','瑜伽裤',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server'),
('رياضية 8','search','运动套装男',(SELECT id FROM categories WHERE slug='sportswear'),4,0,40,72,1,'server');

-- الجلب المجاني: الأزياء والجمال أولًا في طابور الاستيراد وفي ترتيب الإثراء (توصيات صفحة فستان فساتين)
INSERT OR IGNORE INTO settings(key,value) VALUES('discover_focus','1');
-- مؤشّر المرور التصنيفي على الرف (categorySweep في الكرون): يبدأ من الصفر
INSERT OR IGNORE INTO settings(key,value) VALUES('cat_sweep_id','0');
