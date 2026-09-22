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

// --- قيم المتغيّرات: القاموس يترجم مقاسات الأرقام الصينية بلا نموذج
const dc = d.dict;
expect(dc['8号'] === 'مقاس 8', `«8号» ⟵ ${dc['8号']}`);
expect(dc['9号'] === 'مقاس 9', `«9号» ⟵ ${dc['9号']}`);
expect(dc['10号'] === 'مقاس 10', `«10号» ⟵ ${dc['10号']}`);
expect(dc['2号色'] === 'اللون رقم 2', `«2号色» ⟵ ${dc['2号色']}`);
expect(dc['黑色 M'] === 'أسود M', `«黑色 M» ⟵ ${dc['黑色 M']}`);
expect(dc['均码'] === 'مقاس واحد', `«均码» ⟵ ${dc['均码']}`);
expect(dc['藏青色'] === 'كحلي', `«藏青色» ⟵ ${dc['藏青色']}`);
expect(Object.values(dc).every(v => v !== null && !/[一-鿿]/.test(v)), 'لا تبقى قيمة صينية في ناتج القاموس');

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


// --- كلمة عربية ملتصقة ببقية لاتينية («زippers») — نص مكسور يراه الزبون
const mh = d.mashed, ol = d.okLatin;
for (const [t, v] of Object.entries(mh)) {
  expect(v.mixed === true, `«${t.slice(-18)}» يُكتشف كخلط أبجديات`);
  expect(v.good === false, `«${t.slice(-18)}» لا يُقبل عنوانًا صالحًا`);
}
expect(mh['كيس شفاف للهاتف والسماعات مع زippers'].fixed === 'كيس شفاف للهاتف والسماعات',
  `«زippers» تُحذف كلمةً كاملة ⟵ ${mh['كيس شفاف للهاتف والسماعات مع زippers'].fixed}`);
for (const [t, v] of Object.entries(ol)) {
  expect(v.mixed === false, `«${t}» لاتينية مشروعة لا تُعدّ خلطًا`);
  expect(v.good === true, `«${t}» يبقى عنوانًا مقبولًا`);
}

// --- الشحن الداخلي في الصين يُقسَّم على اللوط لا يُضرب فيه
const { lot1, lot100, lot100Sea } = d.pricing;
expect(lot100.domestic_ship_lyd < lot1.domestic_ship_lyd / 50,
  `لوط ١٠٠ قطعة يحمل جزءًا من الشحن الداخلي (${lot100.domestic_ship_lyd} مقابل ${lot1.domestic_ship_lyd} للقطعة الواحدة)`);
expect(lot100.total_lyd < lot1.total_lyd,
  `سعر القطعة داخل لوط ١٠٠ أقل من سعرها مفردة (${lot100.total_lyd} < ${lot1.total_lyd} د.ل)`);
expect(lot1.total_lyd - lot100.total_lyd >= (lot1.domestic_ship_lyd - lot100.domestic_ship_lyd),
  `الفرق كله من الشحن الداخلي المقسَّم (${(lot1.total_lyd - lot100.total_lyd).toFixed(2)} ≥ ${(lot1.domestic_ship_lyd - lot100.domestic_ship_lyd).toFixed(2)})`);
expect(lot100Sea.total_lyd <= lot100.total_lyd,
  `البحري ليس أغلى من الجوي (${lot100Sea.total_lyd} ≤ ${lot100.total_lyd})`);


// --- وزن المورّد: بعضهم يكتب الغرامات في حقل الكيلو فينفجر سعر الشحن
const wt = d.weights;
expect(wt.kg === 650, `٠٫٦٥ كغ ⟵ ${wt.kg} غ`);
expect(wt.gramsInKgField === 650, `٦٥٠ في حقل الكيلو تُقرأ غرامات لا ٦٥٠ كغ (${wt.gramsInKgField})`);
expect(wt.absurd === null, `٦٥٠٫٠٠٠ وزن مستحيل يُهمل فيُستعمل تقدير القسم (${wt.absurd})`);
expect(wt.zero === null, 'الوزن صفر أو مفقود يُهمل');
expect(wt.specKg === 300, `٠٫٣ في جدول المواصفات كيلوغرامات (${wt.specKg} غ)`);
expect(wt.specG === 800, `٨٠٠ في جدول المواصفات غرامات (${wt.specG} غ)`);

console.log(`\nنجح: ${passed} · فشل: ${problems.length}`);
process.exit(problems.length ? 1 : 0);
