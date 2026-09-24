-- «ادخل باسمه» (٢٤/٠٩/٢٦): صاحب المشروع يجرّب الموقع بحساب أي موظف أو زبونة ليرى ما ينقصه.
-- جلسة الانتحال تحمل من فتحها (imp_by) وجلسته الأصلية (back_sid) ليعود إليها بزرّ واحد.
ALTER TABLE sessions ADD COLUMN imp_by INTEGER;
ALTER TABLE sessions ADD COLUMN back_sid TEXT;
