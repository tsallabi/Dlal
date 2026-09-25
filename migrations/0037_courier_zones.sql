-- التوصيل داخل ليبيا (٢٥/٠٩/٢٦): الشريك يسلّم الطرد لشركة توصيل محلية (أميال) ويتابعه حتى يصل الزبونة،
-- ويسعّر التوصيل لكل مدينة ومناطقها حسب بُعدها عن مركز المدينة بالكيلومتر.

-- مناطق التوصيل: «وسط المدينة 0-5 كم = 10 د.ل»، «ضواحي 5-15 كم = 15 د.ل»… يضعها الشريك في «أسعاري»
CREATE TABLE IF NOT EXISTS partner_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  city TEXT NOT NULL,
  zone TEXT NOT NULL,
  km_from REAL NOT NULL DEFAULT 0,
  km_to REAL NOT NULL DEFAULT 5,
  price_lyd REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zones_partner_city ON partner_zones(partner_id, city, km_from);

-- المنطقة التي اختارتها الزبونة، وتسليم الطرد لشركة التوصيل. حالة الطلب تبقى «جاهز للتسليم» حتى يصل:
-- جدول الطلبات مقيّد بقائمة حالات (CHECK) وإعادة بنائه على القاعدة الحية أخطر من عمود جديد.
ALTER TABLE orders ADD COLUMN ship_zone_id INTEGER;
ALTER TABLE orders ADD COLUMN ship_zone TEXT;
ALTER TABLE orders ADD COLUMN courier TEXT;              -- اسم شركة التوصيل (أميال)
ALTER TABLE orders ADD COLUMN courier_ref TEXT;          -- رقم الشحنة/التتبع عندهم
ALTER TABLE orders ADD COLUMN courier_status TEXT;       -- with_courier · delivered · failed
ALTER TABLE orders ADD COLUMN courier_at TEXT;           -- وقت التسليم لشركة التوصيل
ALTER TABLE orders ADD COLUMN courier_note TEXT;

-- ربط الشريك بشركة التوصيل: الاسم، رابط التتبع ({code} يُستبدل برقم الشحنة)، وواجهتها البرمجية إن وُجدت
ALTER TABLE partners ADD COLUMN courier_name TEXT NOT NULL DEFAULT 'أميال';
ALTER TABLE partners ADD COLUMN courier_track_url TEXT;
ALTER TABLE partners ADD COLUMN courier_api_url TEXT;
ALTER TABLE partners ADD COLUMN courier_api_key TEXT;
ALTER TABLE partners ADD COLUMN courier_api_enabled INTEGER NOT NULL DEFAULT 0;
