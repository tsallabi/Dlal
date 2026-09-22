-- تسرّب منتج نشط حدّه الأدنى أكثر من قطعة بعد ترحيل 0023: مصدره **الإثراء** لا الاستيراد
-- (الإثراء يكتشف الحد الأدنى الحقيقي بعد أن يكون المنتج على الرف فيرفعه ولا يُخفيه).
-- أُصلح المصدر في importProducts؛ وهذا يُغلق ما تسرّب.
UPDATE products SET status='hidden', updated_at=datetime('now')
 WHERE status='active' AND min_qty > 1;
