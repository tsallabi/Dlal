-- رأس عمود جدول المواصفات حُفظ كقيمة متغيّر: زرّ مقاس اسمه «المقاس» ولون اسمه «اللون».
-- ١٣ منتجًا حيًا في ٢٢/٠٩/٢٦، منها الكيس الذي فتحه صاحب المشروع على الشاشة.
-- الفلترة عند الاستيراد في attrValue (src/lib/source.ts)؛ هذا يصلح ما دخل قبلها.
UPDATE variants SET color=NULL WHERE lower(trim(color)) IN (
  '尺码','尺寸','规格','颜色','色系','型号','款式','材质','数量',
  'size','sizes','color','colour','colors','model','style','spec','specification','quantity',
  'المقاس','مقاس','المقاسات','مقاسات','الحجم','حجم','القياس','قياس',
  'اللون','لون','الألوان','ألوان','النوع','نوع','المواصفات','مواصفات','الكمية','الموديل','موديل');
UPDATE variants SET size=NULL WHERE lower(trim(size)) IN (
  '尺码','尺寸','规格','颜色','色系','型号','款式','材质','数量',
  'size','sizes','color','colour','colors','model','style','spec','specification','quantity',
  'المقاس','مقاس','المقاسات','مقاسات','الحجم','حجم','القياس','قياس',
  'اللون','لون','الألوان','ألوان','النوع','نوع','المواصفات','مواصفات','الكمية','الموديل','موديل');
-- متغيّر بلا لون ولا مقاس لا معنى له — إلا إن كان مرتبطًا بسلة أو طلب قائم فلا يُمسّ
DELETE FROM variants
 WHERE (color IS NULL OR trim(color)='') AND (size IS NULL OR trim(size)='')
   AND id NOT IN (SELECT variant_id FROM cart_items  WHERE variant_id IS NOT NULL)
   AND id NOT IN (SELECT variant_id FROM order_items WHERE variant_id IS NOT NULL);
