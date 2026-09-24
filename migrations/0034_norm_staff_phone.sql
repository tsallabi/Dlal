-- الهاتف بصيغة واحدة (٢٤/٠٩/٢٦): صفحة الموظفين حفظت 218913509213 كما كُتب، والدخول يبحث عن 0913509213
-- فرُفض موظف شاهين بكلمة مرور صحيحة. نوحّد ما حُفظ بـ218/00218 ما لم يكن الرقم الموحّد مستعملًا لحساب آخر.
UPDATE users SET phone = '0' || substr(phone, 4)
 WHERE phone GLOB '218[0-9]*' AND length(phone) = 12
   AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.phone = '0' || substr(users.phone, 4));
UPDATE users SET phone = '0' || substr(phone, 6)
 WHERE phone GLOB '00218[0-9]*' AND length(phone) = 14
   AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.phone = '0' || substr(users.phone, 6));
