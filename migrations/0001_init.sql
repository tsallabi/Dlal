-- دلال — مخطط قاعدة البيانات (Cloudflare D1 / SQLite)

-- ---------- المستخدمون ----------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,          -- رقم الهاتف هو المعرف الأساسي في ليبيا
  name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','partner')),
  partner_id INTEGER,                  -- لموظفي شركاء الشحن
  city TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- شركاء الشحن (شاهين وغيرها) ----------
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CN',
  warehouse_address TEXT,              -- عنوان مخزن التجميع في الصين
  contact TEXT,
  ship_rate_per_kg REAL NOT NULL DEFAULT 0,   -- سعر الشحن للكيلو بالدولار
  share_percent INTEGER NOT NULL DEFAULT 100, -- نسبة توزيع الطلبات الجديدة
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإعدادات (سعر الصرف، الربح...) ----------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الأقسام ----------
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id),
  est_weight_g INTEGER NOT NULL DEFAULT 300,  -- الوزن التقديري للفئة
  markup_percent INTEGER,                     -- نسبة ربح خاصة بالفئة (اختياري)
  sort INTEGER NOT NULL DEFAULT 0,
  icon TEXT
);

-- ---------- المنتجات ----------
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT '1688',        -- 1688 | manual | api
  source_offer_id TEXT,                       -- offerId في 1688 — مخفي عن الزبون
  source_url TEXT,                            -- مخفي عن الزبون
  slug TEXT UNIQUE NOT NULL,
  title_ar TEXT NOT NULL,
  title_src TEXT,                             -- العنوان الأصلي بالصينية
  description_ar TEXT,
  category_id INTEGER REFERENCES categories(id),
  source_price_cny REAL NOT NULL,             -- سعر المصدر باليوان
  price_lyd REAL NOT NULL,                    -- سعر البيع بالدينار (محسوب)
  compare_price_lyd REAL,                     -- سعر قبل الخصم للعرض
  weight_g INTEGER,                           -- الوزن الفعلي إن عُرف
  min_qty INTEGER NOT NULL DEFAULT 1,
  in_stock INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','hidden','unavailable')),
  views INTEGER NOT NULL DEFAULT 0,
  sales INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 4.7,
  supplier_name TEXT,
  last_checked_at TEXT,                       -- آخر فحص للتوفر والسعر
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_offer ON products(source, source_offer_id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id, status);
CREATE INDEX IF NOT EXISTS idx_products_status_sales ON products(status, sales DESC);
CREATE INDEX IF NOT EXISTS idx_products_checked ON products(last_checked_at);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                          -- رابط R2 أو رابط خارجي مؤقت
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, sort);

-- المتغيرات (مقاس/لون) — كل صف SKU
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_sku_id TEXT,
  color TEXT,
  size TEXT,
  price_delta_lyd REAL NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1,
  image_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);

-- ---------- السلة ----------
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES variants(id),
  qty INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, product_id, variant_id)
);

-- ---------- الطلبات ----------
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                  -- رقم الطلب للزبون  DL-2026-000123
  user_id INTEGER NOT NULL REFERENCES users(id),
  partner_id INTEGER REFERENCES partners(id), -- الشريك المكلف بالشراء والشحن
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment',   -- بانتظار الدفع
    'paid',              -- مدفوع — بانتظار الشراء
    'purchasing',        -- قيد الشراء
    'purchased',         -- تم الشراء من المورد
    'at_warehouse',      -- وصل مخزن الصين
    'consolidated',      -- ضُم إلى شحنة
    'shipped',           -- شُحن إلى ليبيا
    'arrived',           -- وصل ليبيا
    'customs',           -- في الجمارك
    'ready',             -- جاهز للتسليم
    'delivered',         -- سُلّم
    'cancelled',
    'refunded'
  )),
  payment_method TEXT,                        -- sadad | moamalat | mobicash | cod_deposit
  payment_ref TEXT,
  subtotal_lyd REAL NOT NULL,
  shipping_lyd REAL NOT NULL DEFAULT 0,
  total_lyd REAL NOT NULL,
  fx_rate_used REAL NOT NULL,                 -- سعر الصرف وقت الطلب
  ship_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_city TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  note TEXT,
  shipment_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_partner_status ON orders(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES variants(id),
  title_ar TEXT NOT NULL,
  color TEXT, size TEXT,
  qty INTEGER NOT NULL,
  unit_price_lyd REAL NOT NULL,
  -- بيانات الشراء الفعلي — يملؤها موظف الشريك
  source_offer_id TEXT,
  source_url TEXT,
  purchase_status TEXT NOT NULL DEFAULT 'pending' CHECK (purchase_status IN ('pending','purchased','unavailable','substituted')),
  supplier_order_no TEXT,
  actual_cost_cny REAL,
  actual_weight_g INTEGER,
  proof_image_url TEXT,
  partner_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

-- سجل مراحل الطلب (يظهر للزبون كتتبع)
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id, created_at);

-- ---------- الشحنات المجمعة ----------
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  code TEXT UNIQUE NOT NULL,                  -- SH-2026-0007
  method TEXT NOT NULL DEFAULT 'air' CHECK (method IN ('air','sea')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','shipped','arrived','customs','released')),
  tracking_no TEXT,
  total_weight_kg REAL,
  shipped_at TEXT, arrived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإشعارات ----------
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

-- ---------- المفضلة ----------
CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  PRIMARY KEY (user_id, product_id)
);

-- ---------- سجل الاستيراد ----------
CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  by_user_id INTEGER,
  source TEXT NOT NULL,
  page_url TEXT,
  imported INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإعدادات الافتراضية ----------
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('fx_cny_lyd','0.95'),          -- 1 يوان = 0.95 دينار (يحدده الأدمن يوميًا)
 ('fx_usd_lyd','6.90'),
 ('markup_percent','35'),        -- نسبة الربح الافتراضية
 ('safety_percent','7'),         -- هامش أمان لتغير السعر
 ('ship_usd_per_kg','9'),        -- شحن جوي للكيلو
 ('customs_percent','5'),
 ('domestic_cn_ship_cny','6'),   -- شحن داخل الصين لمخزن الشريك
 ('free_ship_over_lyd','500'),
 ('delivery_lyd','15');
