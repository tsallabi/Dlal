-- مخاطبة عامة للجميع (قرار صاحب المشروع ٢٥/٠٩/٢٦): «الموقع لكل الناس، لا تقل اضغطي بل اضغط».
-- الكود تغيّر، لكن ما حُفظ قبله في القاعدة ما زال يظهر: إشعارات أُرسلت (صفحة «حسابي» والإشعارات)
-- ووصف منتجات البذرة. نعيد كتابة العبارات التي كان الكود يكتبها بنصّها الجديد نفسه.
UPDATE notifications SET
  title = replace(replace(title, 'طلبتِه', 'طلبته'), 'الزبونات الأخريات', 'الزبائن الآخرين'),
  body = replace(replace(replace(replace(replace(replace(replace(replace(replace(body,
    'أكملي', 'أكمل'), 'ادفعي', 'ادفع'), 'قيّمي', 'قيّم'), 'واكسبي', 'واكسب'), 'جرّبي', 'جرّب'),
    'طلبتِه', 'طلبته'), 'الزبونات الأخريات', 'الزبائن الآخرين'), 'راسلينا', 'راسلنا'), 'اختاري', 'اختر')
WHERE title LIKE '%طلبتِه%' OR body LIKE '%أكملي%' OR body LIKE '%ادفعي%' OR body LIKE '%قيّمي%' OR body LIKE '%واكسبي%'
   OR body LIKE '%جرّبي%' OR body LIKE '%طلبتِه%' OR body LIKE '%الزبونات%' OR body LIKE '%راسلينا%' OR body LIKE '%اختاري%';

UPDATE products SET description_ar = replace(replace(description_ar, 'راجعي دليل المقاسات', 'راجع دليل المقاسات'), 'يصلكِ', 'يصلك')
WHERE description_ar LIKE '%راجعي دليل المقاسات%' OR description_ar LIKE '%يصلكِ%';
