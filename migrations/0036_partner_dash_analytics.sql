-- (١) لوحة الشريك (٢٤/٠٩/٢٦): الشريك يضيف موظفين لشركته، ويبقون معطّلين حتى يقبلهم صاحب المشروع
ALTER TABLE users ADD COLUMN pending_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN added_by INTEGER;

-- دفتر الحساب مع الشريك: ما دفعناه له (payout) وما سلّمه لنا من تحصيل عند الاستلام (collect).
-- المستحقات نفسها محسوبة من لقطة كل طلب (orders.partner_fees_json)؛ هنا الحركات النقدية وحدها.
CREATE TABLE IF NOT EXISTS partner_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  kind TEXT NOT NULL CHECK (kind IN ('payout','collect')),
  amount_lyd REAL NOT NULL,
  note TEXT,
  by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_partner ON partner_ledger(partner_id);

-- (٢) حركة الزوار: صفحة، سلة، بدء دفع، شراء، بحث، خطأ. vid كوكي زائر مجهول يُربط بالحساب بعد الدخول.
-- الدولة والمدينة من Cloudflare (request.cf). تُحذف بعد 90 يومًا (الكرون).
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vid TEXT NOT NULL,
  user_id INTEGER,
  kind TEXT NOT NULL,            -- view · product · category · search · cart · checkout · purchase · error
  path TEXT,
  ref TEXT,                      -- رقم المنتج، قسم، كلمة البحث، رسالة الخطأ
  n INTEGER,                     -- عدد نتائج البحث، أو قيمة الطلب
  country TEXT,
  city TEXT,
  device TEXT,                   -- m جوال · d حاسوب
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_time ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_visits_vid ON visits(vid, created_at);
CREATE INDEX IF NOT EXISTS idx_visits_kind ON visits(kind, created_at);
