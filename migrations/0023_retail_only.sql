-- «نحن موقع يبيع بالقطعة، لا يمكن أن نجبر الزبون أن يشتري أكثر من قطعة إلا برغبته»
-- (صاحب المشروع، ٢٢/٠٩/٢٦). كل منتج حدّه الأدنى أكثر من قطعة يخرج من الرف.
-- تُخفى ولا تُمحى: الإخفاء يحقّق المطلوب كاملًا (لا زبونة تُجبر على أكثر من قطعة)
-- ويبقى التراجع ممكنًا إن تبيّن أن الحد الأدنى وصل خطأً من المورّد.
UPDATE products SET status='hidden', updated_at=datetime('now')
 WHERE status='active' AND min_qty > 1;

-- الحدّ الفاصل يصير ٢: أي استيراد جديد حدّه الأدنى قطعتان فأكثر يدخل مخفيًا ولا يصل الرف
INSERT INTO settings(key,value,updated_at) VALUES('retail_max_moq','2',datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value='2',updated_at=datetime('now');
