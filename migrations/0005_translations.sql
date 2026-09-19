-- ذاكرة ترجمة: كل نص صيني يُترجم مرة واحدة ثم يُعاد استخدامه (ألوان، مقاسات، عناوين)
CREATE TABLE IF NOT EXISTS translations (
  src TEXT PRIMARY KEY,
  dst TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
