-- شريط تقدّم الإضافة: كانت الإضافة لا تكلّم الخادم إلا في آخر الدفعة (١٠٠ منتج ≈ ٣٠ دقيقة)،
-- فلا يعرف صاحب المشروع أهي تعمل أم متوقفة. صفّ واحد يُحدَّث مع كل منتج تقرؤه.
CREATE TABLE IF NOT EXISTS crawler_live (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  gain_img INTEGER NOT NULL DEFAULT 0,
  gain_var INTEGER NOT NULL DEFAULT 0,
  gain_wt INTEGER NOT NULL DEFAULT 0,
  gone INTEGER NOT NULL DEFAULT 0,
  last_offer TEXT,
  last_at TEXT
);
INSERT OR IGNORE INTO crawler_live(id) VALUES (1);

-- ما أُضيف فعلًا في كل دفعة (لا «مُثرى ١٠٠» الذي كان يعدّ كل مرور ولو لم يُضف شيئًا)
ALTER TABLE crawl_runs ADD COLUMN gain_img INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawl_runs ADD COLUMN gain_var INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawl_runs ADD COLUMN gain_wt INTEGER NOT NULL DEFAULT 0;
