-- نظام شركاء الشحن (٢٤/٠٩/٢٦): طلب صاحب المشروع
-- «اربط شركات الشحن بـAPI فيذهب الطلب إليهم مباشرة بعد تأكيد الدفع، ولوحة للشريك يغيّر فيها الحالة
--  ويرفع الصور في كل مرحلة وينشئ فاتورة لكل مرحلة، ويعدّل أسعاره بنفسه، ولنا دينار على كل بند
--  و35% على سعر البضاعة لا تظهر له».

-- ربط API: الطلب المدفوع يُرسل POST إلى api_url موقّعًا بـapi_secret (HMAC-SHA256)،
-- والشريك يحدّث حالاتنا عبر واجهتنا برمز api_token.
ALTER TABLE partners ADD COLUMN api_url TEXT;
ALTER TABLE partners ADD COLUMN api_secret TEXT;
ALTER TABLE partners ADD COLUMN api_token TEXT;
ALTER TABLE partners ADD COLUMN api_enabled INTEGER NOT NULL DEFAULT 0;

-- أسعار الشريك كما يضعها هو بالدينار (يُضاف عليها رسم المنصة partner_fee_margin_lyd لكل بند)
ALTER TABLE partners ADD COLUMN fee_commission_pct REAL NOT NULL DEFAULT 0;  -- عمولة الشراء: % من سعر البضاعة
ALTER TABLE partners ADD COLUMN fee_domestic_lyd REAL NOT NULL DEFAULT 0;    -- النقل الداخلي في الصين: للقطعة
ALTER TABLE partners ADD COLUMN fee_air_kg_lyd REAL NOT NULL DEFAULT 0;      -- الشحن الجوي: للكيلو
ALTER TABLE partners ADD COLUMN fee_sea_kg_lyd REAL NOT NULL DEFAULT 0;      -- الشحن البحري: للكيلو
ALTER TABLE partners ADD COLUMN fee_delivery_lyd REAL NOT NULL DEFAULT 0;    -- التوصيل داخل ليبيا: للطلب
ALTER TABLE partners ADD COLUMN rates_updated_at TEXT;

-- ما يستحقه الشريك عن الطلب، لقطة وقت الدفع (أسعاره يومها لا يومنا)
ALTER TABLE orders ADD COLUMN partner_fees_json TEXT;

-- صندوق الإرسال إلى API الشريك: السطر يُكتب **قبل** الاتصال (درس ماي باي)، ويُحدَّث بالرد.
-- ما فشل يعيده الكرون بمهلة متزايدة حتى ٨ محاولات.
CREATE TABLE IF NOT EXISTS partner_dispatch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  event TEXT NOT NULL DEFAULT 'order.paid',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','test')),
  attempts INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  response TEXT,
  error TEXT,
  next_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON partner_dispatch(status, next_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_order ON partner_dispatch(order_id);

-- صور مراحل الطلب: تُصغَّر في المتصفح (~٢٠٠ ك.ب) وتُحفظ هنا لأن R2 غير مفعّل في الحساب.
-- public=1 يُظهرها للزبونة في صفحة طلبها (افتراضيًا لا: قد تحمل فاتورة المورد وسعره باليوان).
CREATE TABLE IF NOT EXISTS order_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'image/jpeg',
  data BLOB,
  url TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  public INTEGER NOT NULL DEFAULT 0,
  by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_order ON order_media(order_id, stage);

-- فواتير الشريك لكل مرحلة (شراء، نقل داخلي، شحن، توصيل…): بنود وإجمالي وصفحة طباعة
CREATE TABLE IF NOT EXISTS partner_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  stage TEXT NOT NULL,
  number TEXT,
  lines TEXT NOT NULL DEFAULT '[]',
  total_lyd REAL NOT NULL DEFAULT 0,
  note TEXT,
  by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON partner_invoices(order_id);

-- رسم المنصة على كل بند ينفّذه الشريك، ونسبة ربحنا على البضاعة (لا تظهر للشريك)،
-- والشريك الذي تُسعَّر به البضاعة على الرف (0 = التسعير العام الحالي، لا يتغيّر شيء حتى يُختار)
INSERT OR IGNORE INTO settings(key,value) VALUES('partner_fee_margin_lyd','1');
INSERT OR IGNORE INTO settings(key,value) VALUES('partner_goods_margin_pct','35');
INSERT OR IGNORE INTO settings(key,value) VALUES('pricing_partner_id','0');
