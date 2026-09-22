// فحص منطق البصمة والحشمة والشحن عبر الخادم الحقيقي (نقطة /api/logic-check)
const BASE = process.env.BASE || 'http://localhost:8787';
const TOKEN = process.env.IMPORT_TOKEN || 'dev-import-token';
const problems = []; let passed = 0;
const expect = (c, m) => { if (!c) { problems.push(m); console.log('❌', m); } else { passed++; console.log('✅', m); } };

const r = await fetch(`${BASE}/api/logic-check`, { headers: { 'x-import-token': TOKEN } });
const d = await r.json();

// --- الحشمة
expect(d.modesty['بيجامة نسائية شتاء'].intimate, 'بيجامة ⟵ ملابس نوم');
expect(d.modesty['跨境速卖通女式长款睡衣家居服'].intimate, 'العنوان الصيني 睡衣 ⟵ ملابس نوم');
expect(!d.modesty['عباية سوداء بتطريز ذهبي'].intimate, 'العباية ليست ملابس نوم');
expect(d.modesty['عباية سوداء بتطريز ذهبي'].homeOk, 'العباية تظهر على الرئيسية');
expect(!d.modesty['فستان مفتوح الخلف'].homeOk, 'فستان مفتوح الخلف لا يظهر على الرئيسية');
expect(d.modesty['حافظة هاتف شفافة'].homeOk, '«شفاف» في حافظة الهاتف لا يُخفيها');

// --- البصمة
expect(d.dedupe.same, 'عرضان لنفس الساعة من موردين ⟵ منتج واحد');
expect(!d.dedupe.different, 'ساعة وحقيبة ⟵ منتجان مختلفان');
expect(!d.dedupe.noiseOnly, 'عنوانان بكلمات تسويقية فقط لا يُعتبران متطابقين');

// --- كلمة صينية عالقة داخل ترجمة عربية سليمة: تُحذف الكلمة لا العنوان
const st = d.strays;
expect(st['م耙 حديدي لحراثة التربة ومجالسة الحدائق'] === 'حديدي لحراثة التربة ومجالسة الحدائق',
  `«م耙 حديدي…» ⟵ ${st['م耙 حديدي لحراثة التربة ومجالسة الحدائق']}`);
expect(st['عباءة طويلة بتصميم豹 مع زينة بذرة اللؤلؤ'] === 'عباءة طويلة مع زينة بذرة اللؤلؤ',
  `«بتصميم豹» تُحذف كلمةً كاملة ⟵ ${st['عباءة طويلة بتصميم豹 مع زينة بذرة اللؤلؤ']}`);
expect(!/[一-鿿]/.test(st['مجموعة مجوهرات蝴蝶吊坠耳环 و项链 و خاتم'] ?? ''), 'لا يبقى حرف صيني في الناتج');
expect(st['调色盘 调色棒 化妆'] === null, 'عنوان صيني بالكامل يُرفض ولا يُنتَج منه كلام ناقص');

// --- الشحن والربح
const { light, bulky, byKg } = d.pricing;
expect(light.ship_basis === 'وزن', `قطعة صغيرة ثقيلة تُحاسب بالوزن (${light.ship_basis})`);
expect(bulky.ship_basis === 'حجم', `قطعة كبيرة خفيفة تُحاسب بالحجم (${bulky.ship_basis})`);
expect(bulky.intl_ship_lyd > light.intl_ship_lyd, `الصندوق الكبير أغلى شحنًا: ${bulky.intl_ship_lyd} > ${light.intl_ship_lyd}`);
expect(byKg.ship_basis === 'وزن', 'وضع «بالوزن فقط» يتجاهل الحجم');
expect(Math.abs(light.total_lyd - (light.cost_lyd + light.profit_lyd)) < 1.01, `سعر البيع = التكلفة + الربح (${light.total_lyd} ≈ ${light.cost_lyd}+${light.profit_lyd})`);
expect(light.profit_lyd > 0, `الربح موجب: ${light.profit_lyd} د.ل`);

console.log(`\nنجح: ${passed} · فشل: ${problems.length}`);
process.exit(problems.length ? 1 : 0);
