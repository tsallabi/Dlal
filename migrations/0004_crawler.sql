-- مهام الزحف التي تنفذها إضافة المتصفح (دلال كراولر) من متصفح الموظف
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'search' CHECK (type IN ('search','url','stock')),  -- بحث بكلمة | رابط قسم/قائمة | فحص مخزون
  query TEXT,                         -- الكلمة أو الرابط
  category_id INTEGER REFERENCES categories(id),
  max_pages INTEGER NOT NULL DEFAULT 3,
  enrich INTEGER NOT NULL DEFAULT 1,  -- فتح صفحة كل منتج جديد لجلب الصور والمقاسات
  max_new INTEGER NOT NULL DEFAULT 40,-- أقصى عدد منتجات جديدة تُثرى في التشغيل الواحد
  interval_hours INTEGER NOT NULL DEFAULT 24,
  active INTEGER NOT NULL DEFAULT 1,
  run_now INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,                -- بعد كابتشا/حجب
  last_run_at TEXT,
  last_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','blocked','error','partial')),
  pages INTEGER NOT NULL DEFAULT 0,
  found INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  enriched INTEGER NOT NULL DEFAULT 0,
  checked INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_job ON crawl_runs(job_id, id DESC);
INSERT OR IGNORE INTO settings(key,value) VALUES ('crawler_last_seen',''),('crawler_version','');
-- مهام افتراضية للبداية
INSERT OR IGNORE INTO crawl_jobs(id,name,type,query,category_id,max_pages,enrich,max_new,interval_hours) VALUES
 (1,'فساتين صيفية','search','连衣裙 女 夏 新款',(SELECT id FROM categories WHERE slug='dresses'),2,1,40,24),
 (2,'حقائب نسائية','search','女包 新款 单肩',(SELECT id FROM categories WHERE slug='bags'),2,1,40,24),
 (3,'فحص المخزون والأسعار','stock',NULL,NULL,1,0,300,12);
