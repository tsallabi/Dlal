-- أوزان مستحيلة (٢٥/٠٩/٢٦): جدول مواصفات 1688 يكتب «الوزن: 40» ويقصد غرامات، والإضافة حتى 1.7.2
-- قرأت كل رقم أقل من 50 كيلوغرامات — فصارت ربطة عنق 40 كغ (3,380 د.ل) ونظارة 30 كغ (2,550 د.ل)
-- وسماعات 36 كغ. 150 منتجًا نشطًا يومها، معظمها من الجلب المجاني.
-- نفس قاعدة plausibleWeightG في src/lib/source.ts: فوق عشرة أضعاف وزن القسم (3 كغ على الأقل)، في قسم
-- خفيف (≤ 900 غ) أو بأقل من يوانين للكيلو. رقم كيلو مضروب في 1000 يُعاد غرامات إن كان معقولًا للقسم،
-- وإلا يُمسح الوزن فيُسعَّر بوزن القسم ويعيد الإثراء قراءته. الخيام والمظلات الثقيلة الحقيقية لا تُمسّ.
-- السعر البحري يُمسح للصفوف المصحّحة فيعيد الكرون تسعيرها (repriceRows 'missing') خلال ساعة.
UPDATE products SET
  weight_g = (SELECT CASE WHEN products.weight_g <= 50000 AND products.weight_g % 1000 = 0 AND products.weight_g / 1000 >= c.est_weight_g / 5.0
                          THEN products.weight_g / 1000 ELSE NULL END FROM categories c WHERE c.id = products.category_id),
  price_sea_lyd = NULL
WHERE id IN (
  SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id
  WHERE p.weight_g > MAX(c.est_weight_g * 10, 3000)
    AND (c.est_weight_g <= 900 OR p.source_price_cny < p.weight_g / 1000.0 * 2)
);
