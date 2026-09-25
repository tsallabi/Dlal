-- تسعير كل خيار بوزنه (٢٥/٠٩/٢٦، طلب صاحب المشروع): «دمبل 10 كجم و 5 كجم» كان يُسعَّر كله بوزن الأثقل
-- بسعر المورد الأخفّ، فيدفع من يشتري الـ5 كغ ثمن شحن 10. الآن للخيار وزنه وفرق سعره للجوي وللبحري،
-- والمنتج يُعرض بسعر أخفّ خياراته. الخيارات المولّدة من العنوان (auto_w=1) تُحذف وتُعاد إن تغيّر العنوان.
ALTER TABLE variants ADD COLUMN weight_g INTEGER;
ALTER TABLE variants ADD COLUMN w_delta_lyd REAL NOT NULL DEFAULT 0;
ALTER TABLE variants ADD COLUMN w_delta_sea_lyd REAL NOT NULL DEFAULT 0;
ALTER TABLE variants ADD COLUMN auto_w INTEGER NOT NULL DEFAULT 0;
-- NULL = لم تُفحص خياراته بالوزن بعد (أو تغيّر فيه ما يستدعي إعادة الحساب)؛ الكرون وإعادة التسعير يلتقطانه
ALTER TABLE products ADD COLUMN wopt_at TEXT;
