-- اكتشاف مجاني: صفحة المنتج على 1688 تفتح لزائر غير مسجّل، وقد تحمل روابط منتجات أخرى
-- (توصيات، منتجات المتجر نفسه). الإضافة تمرّ على ~١٠٠ صفحة في الساعة للإثراء أصلًا، فتلتقط
-- هذه الروابط هنا، ثم تفتح بعضها في الدفعة التالية وتستوردها من صفحتها — بلا حساب ولا كريدت.
CREATE TABLE IF NOT EXISTS discovered_offers (
  offer_id TEXT PRIMARY KEY,
  from_offer TEXT,              -- الصفحة التي وُجد فيها الرابط
  category_id INTEGER,          -- قسم تلك الصفحة: التوصيات من جنسها غالبًا
  found_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new',   -- new · imported · skipped (توأم/مكرر/جملة) · failed
  tries INTEGER NOT NULL DEFAULT 0,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_disc_status ON discovered_offers(status, found_at);

-- في الدفعة الجارية: كم صفحة حملت روابط، وكم رابطًا جديدًا وُجد، وكم منتجًا جديدًا أُضيف.
-- «صفحات بلا روابط» هو الجواب الصادق إن كانت 1688 لا تعرض توصيات لزائر غير مسجّل.
ALTER TABLE crawler_live ADD COLUMN pages_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawler_live ADD COLUMN pages_linked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawler_live ADD COLUMN links_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawler_live ADD COLUMN gain_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawl_runs ADD COLUMN gain_new INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawl_runs ADD COLUMN links_new INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO settings(key,value) VALUES('discover_per_batch','20');
