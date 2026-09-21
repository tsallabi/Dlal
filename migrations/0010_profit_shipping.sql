-- حساب الربح والمستحق لشركة الشحن: حجم المنتج، تكلفة الطلب الحقيقية لحظة البيع
ALTER TABLE products ADD COLUMN volume_cm3 REAL;          -- حجم الطرد من المصدر (طول×عرض×ارتفاع)

-- لقطة التكلفة وقت الطلب حتى لا يتغيّر تقرير الأرباح إذا غيّرنا التسعير لاحقًا
ALTER TABLE order_items ADD COLUMN unit_cost_lyd REAL;    -- تكلفتنا الحقيقية للقطعة (بضاعة + شحن داخلي + دولي + جمارك)
ALTER TABLE order_items ADD COLUMN unit_ship_lyd REAL;    -- حصة القطعة من الشحن الدولي — وهي المستحقة لشركة الشحن
ALTER TABLE order_items ADD COLUMN unit_goods_lyd REAL;   -- ثمن البضاعة عند المورد بالدينار

-- إعدادات الشحن بالحجم: شركات الشحن تحاسب بالمتر المكعب أو بالوزن، أيهما أكبر
INSERT OR IGNORE INTO settings(key,value) VALUES('ship_mode','max');
INSERT OR IGNORE INTO settings(key,value) VALUES('ship_usd_per_cbm','260');
INSERT OR IGNORE INTO settings(key,value) VALUES('volumetric_divisor','6000');
INSERT OR IGNORE INTO settings(key,value) VALUES('payment_fee_percent','2');
INSERT OR IGNORE INTO settings(key,value) VALUES('default_volume_cm3','3000');
