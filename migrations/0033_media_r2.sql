-- R2 فُعّل (٢٤/٠٩/٢٦): الصورة الجديدة تُحفظ في الحاوية hudhude-media ومفتاحها هنا، والعمود data يبقى NULL.
-- ما حُفظ في D1 قبل ذلك ينقله الكرون إلى R2 دفعةً دفعة (moveMediaToR2) ثم يُفرغ data.
ALTER TABLE order_media ADD COLUMN r2_key TEXT;
