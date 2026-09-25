-- تكملة 0039 (٢٥/٠٩/٢٦): بقي على الرف 38 صنفًا رخيصًا جدًا بوزن 5–20 كغ في أقسام «ثقيلة» (أدوات البناء،
-- العدّة، الرياضة): فرشاة دهان بـ0.26 يوان «20 كغ» = 1,685 د.ل، رأس مفك «10 كغ» = 850 د.ل. قاعدة 0039 كانت
-- تشترط تجاوز عشرة أضعاف وزن القسم (20 كغ لأدوات البناء) فلم تلتقطها. القاعدة الثانية في plausibleWeightG:
-- 5 كغ فأكثر بأقل من نصف يوان للكيلو = مستحيل. والقطعة الأرخص من 5 يوان تُعاد غرامات (صغيرة بطبعها).
UPDATE products SET
  weight_g = (SELECT CASE WHEN products.weight_g <= 50000 AND products.weight_g % 1000 = 0
                               AND (products.weight_g / 1000 >= c.est_weight_g / 5.0 OR products.source_price_cny < 5)
                          THEN products.weight_g / 1000 ELSE NULL END FROM categories c WHERE c.id = products.category_id),
  price_sea_lyd = NULL
WHERE id IN (
  SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id
  WHERE (p.weight_g > MAX(c.est_weight_g * 10, 3000) AND (c.est_weight_g <= 900 OR p.source_price_cny < p.weight_g / 1000.0 * 2))
     OR (p.weight_g >= 5000 AND p.source_price_cny < p.weight_g / 1000.0 * 0.5)
);
