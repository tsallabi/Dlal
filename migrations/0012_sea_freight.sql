-- شحن بحري: أرخص من الجوي لكن أبطأ (٣٠ — ٤٥ يومًا). سعران لكل منتج، وطريقة لكل طلب.
ALTER TABLE products ADD COLUMN price_sea_lyd REAL;
ALTER TABLE orders ADD COLUMN ship_method TEXT NOT NULL DEFAULT 'air';
ALTER TABLE order_items ADD COLUMN ship_method TEXT;

INSERT OR IGNORE INTO settings(key,value) VALUES('sea_enabled','1');
INSERT OR IGNORE INTO settings(key,value) VALUES('ship_usd_per_kg_sea','2.3');
INSERT OR IGNORE INTO settings(key,value) VALUES('ship_usd_per_cbm_sea','120');
INSERT OR IGNORE INTO settings(key,value) VALUES('air_days','١٢ — ١٨ يومًا');
INSERT OR IGNORE INTO settings(key,value) VALUES('sea_days','٣٠ — ٤٥ يومًا');

CREATE INDEX IF NOT EXISTS idx_orders_ship_method ON orders(ship_method);
