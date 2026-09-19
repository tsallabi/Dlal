// يولّد migrations/0002_seed.sql — أقسام، شركاء، حسابات تجريبية، ومنتجات عينة
// كلمات المرور: admin123 / partner123 / customer123 (يُحسب hash بنفس خوارزمية auth.ts)
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hash(pw) {
  const salt = 'seedsalt0000000000000000000000ab';
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 50000 }, key, 256);
  return `${salt}$${hex(bits)}`;
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const cats = [
  ['dresses', 'فساتين', '👗', 350, 1], ['abayas', 'عبايات وجلابيات', '🧕', 500, 2], ['tops', 'بلوزات وتيشيرتات', '👚', 220, 3], ['bags', 'حقائب', '👜', 600, 4],
  ['shoes', 'أحذية', '👠', 900, 5], ['beauty', 'مكياج وعناية', '💄', 150, 6], ['accessories', 'إكسسوارات ومجوهرات', '💍', 60, 7], ['kids', 'أطفال', '🧸', 250, 8],
  ['home', 'منزل ومطبخ', '🏠', 700, 9], ['lingerie', 'ملابس داخلية ونوم', '🩱', 150, 10], ['hijab', 'حجاب وشالات', '🧣', 120, 11], ['electronics', 'إلكترونيات وإكسسوارات هاتف', '📱', 200, 12],
];

// صور عينة من Unsplash (للعرض فقط) — الاستيراد الحقيقي يجلب صور 1688
const IMG = (id, w = 600) => `https://images.unsplash.com/${id}?w=${w}&q=70&auto=format&fit=crop`;
const pool = {
  dresses: ['photo-1595777457583-95e059d581b8', 'photo-1572804013309-59a88b7e92f1', 'photo-1496747611176-843222e1e57c', 'photo-1539008835657-9e8e9680c956', 'photo-1515372039744-b8f02a3ae446', 'photo-1583496661160-fb5886a0aaaa'],
  abayas: ['photo-1590650153855-d9e808231d41', 'photo-1614252235316-8c857d38b5f4', 'photo-1583391733956-3750e0ff4e8b', 'photo-1604176354204-9268737828e4'],
  tops: ['photo-1564257631407-4deb1f99d992', 'photo-1618354691373-d851c5c3a990', 'photo-1503342217505-b0a15ec3261c', 'photo-1521572163474-6864f9cf17ab'],
  bags: ['photo-1584917865442-de89df76afd3', 'photo-1548036328-c9fa89d128fa', 'photo-1590874103328-eac38a683ce7', 'photo-1566150905458-1bf1fc113f0d'],
  shoes: ['photo-1543163521-1bf539c55dd2', 'photo-1560343090-f0409e92791a', 'photo-1595950653106-6c9ebd614d3a', 'photo-1603487742131-4160ec999306'],
  beauty: ['photo-1596462502278-27bfdc403348', 'photo-1512496015851-a90fb38ba796', 'photo-1522335789203-aabd1fc54bc9', 'photo-1571781926291-c477ebfd024b'],
  accessories: ['photo-1515562141207-7a88fb7ce338', 'photo-1599643478518-a784e5dc4c8f', 'photo-1611652022419-a9419f74343d', 'photo-1573408301185-9146fe634ad0'],
  kids: ['photo-1519689680058-324335c77eba', 'photo-1503919545889-aef636e10ad4', 'photo-1622290291468-a28f7a7dc6a8', 'photo-1471286174890-9c112ffca5b4'],
  home: ['photo-1556911220-bff31c812dba', 'photo-1584568694244-14fbdf83bd30', 'photo-1513694203232-719a280e022f', 'photo-1600585154340-be6161a56a0c'],
  lingerie: ['photo-1520006403909-838d6b92c22e', 'photo-1521577352947-9bb58764b69a'],
  hijab: ['photo-1611243705491-71487cac5ab6', 'photo-1601924994987-69e26d50dc26', 'photo-1614251056216-f748f76cd228'],
  electronics: ['photo-1585060544812-6b45742d762f', 'photo-1601784551446-20c9e07cdbdb', 'photo-1609081219090-a6d81d3085bf', 'photo-1572569511254-d8f925fe2cbb'],
};
const names = {
  dresses: ['فستان صيفي مزهر بأكمام منفوشة', 'فستان سهرة طويل ساتان', 'فستان ميدي بياقة مربعة', 'فستان كاجوال قطن بحزام', 'فستان مخمل شتوي', 'فستان دانتيل رومانسي', 'فستان شيفون بطبقات', 'فستان بليسيه أنيق'],
  abayas: ['عباية سوداء مطرزة بالذهبي', 'عباية كريب ملونة بأزرار', 'جلابية مغربية مطرزة', 'عباية كيمونو مفتوحة', 'عباية رمضانية فاخرة', 'جلابية قطن للبيت'],
  tops: ['بلوزة شيفون بأكمام واسعة', 'تيشيرت قطن أوفرسايز', 'بلوزة ساتان بربطة عنق', 'كارديجان محبوك', 'بلوزة بأكتاف مكشوفة', 'توب كروشيه صيفي'],
  bags: ['حقيبة كتف جلد صناعي', 'حقيبة يد صغيرة بسلسلة', 'حقيبة ظهر أنيقة', 'حقيبة كروس مبطنة', 'حقيبة توت كبيرة', 'محفظة نسائية طويلة'],
  shoes: ['حذاء كعب عالي كلاسيك', 'صندل صيفي بأحزمة', 'حذاء رياضي أبيض', 'حذاء فلات جلد', 'بوت شتوي بكعب', 'شبشب منزلي فرو'],
  beauty: ['طقم فرش مكياج 12 قطعة', 'باليت ظلال عيون 18 لون', 'أحمر شفاه مات ثابت', 'ماسك شعر بالكيراتين', 'جهاز تنظيف الوجه', 'عطر نسائي 50 مل'],
  accessories: ['طقم أقراط ذهبي', 'سلسلة عنق بتعليقة قلب', 'أسورة ستانلس', 'ساعة نسائية أنيقة', 'نظارة شمس كبيرة', 'طقم خواتم 5 قطع'],
  kids: ['فستان بنات أميرة', 'طقم أولاد قطن', 'بيجامة أطفال كرتون', 'حذاء أطفال مضيء', 'حقيبة مدرسية للبنات', 'طقم مولود 5 قطع'],
  home: ['طقم ملاءات سرير 6 قطع', 'منظم مطبخ متعدد الطبقات', 'ستارة غرفة نوم مخملية', 'طقم أكواب زجاج 6', 'سجادة صلاة مبطنة', 'مبخرة كهربائية'],
  lingerie: ['بيجامة ساتان قطعتين', 'روب نوم دانتيل', 'طقم ملابس داخلية قطن 5', 'قميص نوم مريح'],
  hijab: ['حجاب شيفون كريب', 'شال قطن سادة', 'بونيه داخلي قطن', 'حجاب جيرسي عملي', 'طرحة مطرزة'],
  electronics: ['سماعات بلوتوث لاسلكية', 'جراب هاتف بحلقة', 'ساعة ذكية نسائية', 'شاحن سريع 20 واط', 'حامل هاتف للسيارة', 'مصباح سيلفي حلقي'],
};
const colors = ['أسود', 'أبيض', 'وردي', 'بيج', 'أزرق', 'أخضر زيتي', 'عنابي', 'كحلي'];
const sizesCloth = ['S', 'M', 'L', 'XL', '2XL'];
const sizesShoe = ['36', '37', '38', '39', '40'];
const suppliers = ['义乌市欣悦服饰', '广州衣尚服装厂', '东莞市美佳鞋业', '深圳华强电子', '杭州丝语纺织', '广州白云美妆'];

let rnd = 42; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const fx = 0.95, usd = 6.9;
function price(cny, w, m = 35) { const g = cny * fx; const base = g + 6 * fx + (w / 1000) * 9 * usd + g * 0.05 + g * 0.07; const t = base * (1 + m / 100); return t < 20 ? Math.ceil(t * 2) / 2 : t < 100 ? Math.ceil(t) : Math.ceil(t / 5) * 5; }

const out = [];
out.push('-- seed: أقسام');
cats.forEach(([slug, n, icon, w, s]) => out.push(`INSERT OR IGNORE INTO categories(slug,name_ar,icon,est_weight_g,sort) VALUES(${q(slug)},${q(n)},${q(icon)},${w},${s});`));
out.push('-- شركاء');
out.push(`INSERT OR IGNORE INTO partners(id,name,country,warehouse_address,contact,ship_rate_per_kg,share_percent,active) VALUES(1,'شاهين للشحن','CN','广州市白云区 石井镇 XX仓库 3号门 — Shaheen Logistics','WeChat: shaheen_ly',9,100,1);`);
out.push(`INSERT OR IGNORE INTO partners(id,name,country,warehouse_address,contact,ship_rate_per_kg,share_percent,active) VALUES(2,'شريك احتياطي (إيوو)','CN','义乌市 国际商贸城 仓库','—',9.5,0,0);`);
const [ha, hp, hc] = await Promise.all([hash('admin123'), hash('partner123'), hash('customer123')]);
out.push('-- حسابات تجريبية');
out.push(`INSERT OR IGNORE INTO users(id,phone,name,password_hash,role) VALUES(1,'0910000000','طارق (أدمن)',${q(ha)},'admin');`);
out.push(`INSERT OR IGNORE INTO users(id,phone,name,password_hash,role,partner_id) VALUES(2,'0920000000','لي وي — موظف شاهين',${q(hp)},'partner',1);`);
out.push(`INSERT OR IGNORE INTO users(id,phone,name,password_hash,role,city,address) VALUES(3,'0930000000','سارة الزبونة',${q(hc)},'customer','طرابلس','حي الأندلس، شارع الجرابة');`);
out.push('-- منتجات عينة');
let pid = 1;
for (const [slug, , , w] of cats) {
  const imgs = pool[slug]; const nm = names[slug];
  const catId = `(SELECT id FROM categories WHERE slug=${q(slug)})`;
  nm.forEach((title, i) => {
    const cny = Math.round((8 + R() * 90) * 10) / 10;
    const p = price(cny, w);
    const cmp = R() < 0.45 ? Math.ceil(p * (1.2 + R() * 0.3) / 5) * 5 : 'NULL';
    const sales = Math.floor(R() * 400); const views = sales * 8 + Math.floor(R() * 500);
    const offer = String(700000000000 + Math.floor(R() * 99999999999));
    const inStock = R() < 0.93 ? 1 : 0;
    out.push(`INSERT INTO products(id,source,source_offer_id,source_url,slug,title_ar,title_src,description_ar,category_id,source_price_cny,price_lyd,compare_price_lyd,min_qty,in_stock,status,views,sales,rating,supplier_name,last_checked_at) VALUES(${pid},'1688',${q(offer)},${q(`https://detail.1688.com/offer/${offer}.html`)},${q(`${slug}-${pid}`)},${q(title)},${q('厂家直销 ' + title)},${q(`${title} — خامة ممتازة، مناسبة للاستخدام اليومي. يُشحن من مخزننا في الصين خلال 15–25 يومًا.\nالمقاسات آسيوية، راجعي دليل المقاسات.`)},${catId},${cny},${p},${cmp},1,${inStock},'active',${views},${sales},${(4.3 + R() * 0.7).toFixed(1)},${q(suppliers[Math.floor(R() * suppliers.length)])},datetime('now','-${Math.floor(R() * 10)} day'));`);
    const im = [imgs[i % imgs.length], imgs[(i + 1) % imgs.length], imgs[(i + 2) % imgs.length]];
    im.forEach((id, k) => out.push(`INSERT INTO product_images(product_id,url,sort) VALUES(${pid},${q(IMG(id))},${k});`));
    const cl = colors.slice(0, 2 + Math.floor(R() * 3));
    const sz = ['dresses', 'abayas', 'tops', 'kids', 'lingerie'].includes(slug) ? sizesCloth : slug === 'shoes' ? sizesShoe : [];
    if (sz.length) cl.forEach(c => sz.forEach(s => out.push(`INSERT INTO variants(product_id,color,size,in_stock) VALUES(${pid},${q(c)},${q(s)},${R() < 0.9 ? 1 : 0});`)));
    else cl.forEach(c => out.push(`INSERT INTO variants(product_id,color,in_stock) VALUES(${pid},${q(c)},1);`));
    pid++;
  });
}
// طلبات عينة في مراحل مختلفة للزبونة سارة
out.push('-- طلبات عينة');
const mk = (id, status, items, pm = 'sadad', daysAgo = 3) => {
  const sub = items.reduce((a, [, , qty, up]) => a + qty * up, 0);
  out.push(`INSERT INTO orders(id,code,user_id,partner_id,status,payment_method,payment_ref,subtotal_lyd,shipping_lyd,total_lyd,fx_rate_used,ship_name,ship_phone,ship_city,ship_address,created_at,updated_at) VALUES(${id},'DL-2026-${String(id).padStart(6, '0')}',3,1,'${status}','${pm}',${status === 'pending_payment' ? 'NULL' : "'REF-" + id + "'"},${sub},${sub >= 500 ? 0 : 15},${sub + (sub >= 500 ? 0 : 15)},0.95,'سارة الزبونة','0930000000','طرابلس','حي الأندلس، شارع الجرابة',datetime('now','-${daysAgo} day'),datetime('now','-${Math.max(0, daysAgo - 2)} day'));`);
  items.forEach(([p, v, qty, up, ps]) => out.push(`INSERT INTO order_items(order_id,product_id,variant_id,title_ar,color,size,qty,unit_price_lyd,source_offer_id,source_url,purchase_status,supplier_order_no,actual_cost_cny) SELECT ${id},${p},(SELECT id FROM variants WHERE product_id=${p} LIMIT 1),title_ar,${q(v[0])},${v[1] ? q(v[1]) : 'NULL'},${qty},${up},source_offer_id,source_url,'${ps || 'pending'}',${ps === 'purchased' ? "'1688-ORD-" + p + "'" : 'NULL'},${ps === 'purchased' ? 'source_price_cny' : 'NULL'} FROM products WHERE id=${p};`));
  const flow = ['pending_payment', 'paid', 'purchasing', 'purchased', 'at_warehouse', 'consolidated', 'shipped', 'arrived', 'customs', 'ready', 'delivered'];
  flow.slice(0, flow.indexOf(status) + 1).forEach((s, k) => out.push(`INSERT INTO order_events(order_id,status,note,created_at) VALUES(${id},'${s}',NULL,datetime('now','-${daysAgo} day','+${k * 6} hour'));`));
};
mk(1, 'pending_payment', [[1, ['أسود', 'M'], 1, 95], [15, ['وردي'], 1, 60]], 'sadad', 0);
mk(2, 'paid', [[2, ['عنابي', 'L'], 1, 130], [20, ['أسود'], 2, 45]], 'moamalat', 1);
mk(3, 'purchasing', [[9, ['أسود', 'XL'], 1, 150, 'purchased'], [33, ['بيج'], 1, 70]], 'sadad', 2);
mk(4, 'at_warehouse', [[27, ['أبيض', '38'], 1, 85, 'purchased']], 'mobicash', 6);
mk(5, 'shipped', [[40, ['وردي'], 3, 25, 'purchased'], [45, ['أسود'], 1, 40, 'purchased']], 'sadad', 12);
mk(6, 'delivered', [[5, ['أزرق', 'S'], 1, 80, 'purchased']], 'cod_deposit', 30);
out.push(`INSERT INTO shipments(id,partner_id,code,method,status,tracking_no,total_weight_kg,shipped_at) VALUES(1,1,'SH-2026-0001','air','shipped','CA123456789CN',38.5,datetime('now','-5 day'));`);
out.push(`UPDATE orders SET shipment_id=1 WHERE id=5;`);
out.push(`INSERT INTO notifications(user_id,title,body,link) VALUES(3,'شُحن طلبك DL-2026-000005 ✈️','طلبك في طريقه إلى ليبيا.','/orders/DL-2026-000005');`);
writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), out.join('\n') + '\n');
console.log('seed written:', pid - 1, 'products');
