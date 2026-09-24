-- «اطلبي برابط» (٢٤/٠٩/٢٦): المنافس الوحيد في ليبيا (بزناس) يقوم كله على لصق رابط منتج من أمازون أو علي بابا.
-- عندنا كتالوج جاهز بالدينار، وينقصنا هذا الباب: قطعة رأتها الزبونة في 1688 أو تاوباو أو شي إن وليست على رفّنا.
-- رابط 1688 يدخل طابور الاكتشاف فتستورده الإضافة مجانًا، ولحظة وصوله يصير الطلب «جاهزًا» وتصل الزبونة إشعارة.
-- غيره يسعّره الفريق يدويًا ثم يربطه بمنتج على الرف.
CREATE TABLE IF NOT EXISTS link_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  source TEXT NOT NULL,          -- 1688 · taobao · alibaba · amazon · shein · other
  offer_id TEXT,                 -- رقم عرض 1688 إن وُجد: به يُربط الطلب بالمنتج لحظة استيراده
  note TEXT,                     -- المقاس واللون والكمية كما كتبتها الزبونة
  status TEXT NOT NULL DEFAULT 'new',   -- new · ready · rejected
  product_id INTEGER REFERENCES products(id),
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_linkreq_user ON link_requests(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_linkreq_status ON link_requests(status, id);
CREATE INDEX IF NOT EXISTS idx_linkreq_offer ON link_requests(offer_id);
