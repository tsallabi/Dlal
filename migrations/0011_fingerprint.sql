-- بصمة المنتج لمنع تكرار نفس القطعة من موردين مختلفين (نحتفظ بالأرخص)
ALTER TABLE products ADD COLUMN fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_products_fp ON products(fingerprint, source_price_cny);
