-- دلال — الإصدار 2: أدوار وصلاحيات، ماي باي، كوبونات، نقاط، تقييمات، عناوين، تذاكر/إرجاع، تقارير، سجل نشاط

-- ---------- المستخدمون: دور وظيفي دقيق + نقاط + تفعيل ----------
ALTER TABLE users ADD COLUMN staff_role TEXT;            -- owner|admin|ops|support|finance|catalog (للموظفين فقط، role='admin')
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
UPDATE users SET staff_role='owner' WHERE role='admin' AND staff_role IS NULL;

-- ---------- دفتر العناوين ----------
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id);

-- ---------- الكوبونات ----------
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed','free_ship')),
  value REAL NOT NULL DEFAULT 0,
  min_order_lyd REAL NOT NULL DEFAULT 0,
  max_discount_lyd REAL,
  starts_at TEXT,
  ends_at TEXT,
  usage_limit INTEGER,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coupon_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  discount_lyd REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cuse_user ON coupon_uses(coupon_id, user_id);

-- ---------- النقاط ----------
CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id, id DESC);

-- ---------- التقييمات ----------
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  size_fit TEXT CHECK (size_fit IN ('small','true','large')),
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);
ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;

-- ---------- التذاكر: إرجاع / مشكلة / سؤال / إلغاء ----------
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                  -- TK-2026-000012
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER REFERENCES orders(id),
  type TEXT NOT NULL CHECK (type IN ('return','issue','question','cancel')),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  resolution TEXT CHECK (resolution IN ('refund','replacement','points','none')),
  refund_lyd REAL,
  points_awarded INTEGER,
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  by_user_id INTEGER REFERENCES users(id),
  is_staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tmsg ON ticket_messages(ticket_id, id);

-- ---------- المدفوعات (ماي باي وغيرها) ----------
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,                     -- mypay | manual | cod
  gateway TEXT,                               -- moamalat | sadad | edfali | mobicash | ...
  amount_lyd REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LYD',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','failed','cancelled','refunded')),
  trx_ref TEXT UNIQUE NOT NULL,               -- مرجعنا المرسل للبوابة
  provider_ref TEXT,                          -- transaction_id من البوابة
  token TEXT,
  checkout_url TEXT,
  raw TEXT,                                   -- آخر رد JSON من البوابة
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_order ON payments(order_id, id DESC);
CREATE TABLE IF NOT EXISTS payment_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER,
  direction TEXT NOT NULL CHECK (direction IN ('out','in')),
  url TEXT,
  status_code INTEGER,
  request TEXT,
  response TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plog ON payment_log(payment_id, id);

-- ---------- الطلبات: خصم/نقاط/دفع ----------
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN discount_lyd REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_lyd REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN paid_at TEXT;
ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;

-- ---------- سجل النشاط ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_act ON activity_log(id DESC);

-- ---------- المشاهدات الأخيرة ----------
CREATE TABLE IF NOT EXISTS recently_viewed (
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

-- ---------- إعدادات جديدة ----------
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('mypay_mode','mock'),                         -- mock (محاكاة محلية) | live (البوابة الحقيقية)
 ('mypay_base_url','https://api.mypay.ly'),     -- يُضبط من لوحة الإدارة حسب وثائق docs.mypay.ly
 ('mypay_api_key',''),
 ('mypay_webhook_secret',''),
 ('mypay_gateways','moamalat,sadad,edfali,mobicash'),
 ('points_per_lyd','1'),                        -- نقطة لكل دينار من قيمة الطلب المُسلَّم
 ('points_value_per_100','1'),                  -- 100 نقطة = 1 دينار
 ('points_max_percent','50'),                   -- أقصى نسبة من قيمة الطلب تُدفع بالنقاط
 ('review_points','5'),
 ('review_photo_points','10'),
 ('whatsapp_number','218910000000');

-- ---------- حسابات تجريبية للأدوار ----------
INSERT OR IGNORE INTO users(id,phone,name,password_hash,role,staff_role) VALUES
 (4,'0940000000','هدى — عمليات','seedsalt0000000000000000000000ab$4ace1654993dc2ff73f083d85ca51c766a4c529e266b9a584b73302168151d75','admin','ops'),
 (5,'0950000000','ريم — دعم الزبائن','seedsalt0000000000000000000000ab$4ace1654993dc2ff73f083d85ca51c766a4c529e266b9a584b73302168151d75','admin','support'),
 (6,'0960000000','خالد — مالية','seedsalt0000000000000000000000ab$4ace1654993dc2ff73f083d85ca51c766a4c529e266b9a584b73302168151d75','admin','finance'),
 (7,'0970000000','نور — الكتالوج','seedsalt0000000000000000000000ab$4ace1654993dc2ff73f083d85ca51c766a4c529e266b9a584b73302168151d75','admin','catalog');

-- ---------- كوبونات تجريبية ----------
INSERT OR IGNORE INTO coupons(code,type,value,min_order_lyd,max_discount_lyd,per_user_limit,note) VALUES
 ('WELCOME10','percent',10,50,60,1,'خصم ترحيبي 10% حتى 60 د.ل'),
 ('FREESHIP','free_ship',0,0,NULL,3,'توصيل مجاني'),
 ('DLAL25','fixed',25,200,NULL,1,'خصم 25 د.ل للطلبات فوق 200');
