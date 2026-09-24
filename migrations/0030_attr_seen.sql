-- قيم متغيّرات إنجليزية (٢٤/٠٩/٢٦): تُعالج قيمةً مميّزة لا سطرًا (٤٬٤١٤ قيمة على ١٩٬٠٥٦ سطرًا)، وتُذكر هنا
-- القيمة التي لا تحتاج شيئًا («XXL») أو عجز النموذج عنها ثلاثًا — وإلا عادت كل دفعة إلى القيم نفسها
-- في أول «LIMIT» فسدّت الطابور، كما حدث في الإثراء المدفوع وفي كنس العناوين.
CREATE TABLE IF NOT EXISTS attr_seen (
  src TEXT PRIMARY KEY,
  tries INTEGER NOT NULL DEFAULT 0,   -- 99 = لا تحتاج ترجمة
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
