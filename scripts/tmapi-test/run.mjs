// فحص محوّل TMAPI بالرد الموثّق في docs، بلا استهلاك أي استدعاء مدفوع.
// يشغّل خادمًا وهميًا يرد بنفس بنية tmapi.top، ثم يمرّ الطلب عبر الخادم الحقيقي (/api/source/test).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:8787';
const TOKEN = process.env.IMPORT_TOKEN || 'dev-import-token';
const PORT = 8799;
const sample = readFileSync(join(here, 'item_detail.json'), 'utf8');

let lastPath = '', lastKey = '';
const srv = createServer((req, res) => {
  lastPath = req.url; lastKey = req.headers.apikey ?? '';
  res.writeHead(200, { 'content-type': 'application/json' });
  // نتيجة بحث حقيقية: بلا أي حقل مخزون — كان غيابه يُعلّم المنتج «نفد» فيختفي من المتجر
  const search = JSON.stringify({ code: 200, msg: 'success', data: { items: [
    { item_id: '700000000001', title: '夏季新款连衣裙', price: '18.50', img: '//cbu01.alicdn.com/img/ibank/a.jpg' },
    { item_id: '700000000002', title: '女士外套', price: '42.00', img: '//cbu01.alicdn.com/img/ibank/b.jpg', is_sold_out: true },
  ] } });
  res.end(req.url.startsWith('/1688/item_detail') ? sample : req.url.startsWith('/1688/search/items') ? search : JSON.stringify({ code: 404, msg: 'not found' }));
});
await new Promise(r => srv.listen(PORT, r));

const problems = []; let passed = 0;
const expect = (cond, msg) => { if (!cond) { problems.push(msg); console.log('❌', msg); } else { passed++; console.log('✅', msg); } };

const r = await fetch(`${BASE}/api/source/test`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-import-token': TOKEN },
  body: JSON.stringify({ id: '859086919394', provider: 'tmapi', base_url: `http://127.0.0.1:${PORT}`, key: 'ak_live_TEST', lang: 'zh' }),
});
const d = await r.json();
const x = d.data ?? {};

expect(d.ok === true, `المحوّل قرأ الرد الموثّق بنجاح (${d.error ?? 'بلا أخطاء'})`);
expect(lastPath.startsWith('/1688/item_detail?item_id=859086919394'), `المسار الصحيح: ${lastPath}`);
expect(lastKey === 'ak_live_TEST', 'المفتاح يُرسل في ترويسة apikey كما توثّق TMAPI');
expect(!/apiToken/.test(lastPath), 'المفتاح لا يُرسل في الرابط (كان خطأ المحوّل القديم)');
expect(x.offerId === '859086919394', `معرّف المنتج: ${x.offerId}`);
expect(x.priceCny === 25.9, `السعر: ¥${x.priceCny}`);
expect((x.images ?? []).length === 3, `الصور: ${(x.images ?? []).length}`);
expect((x.images ?? [])[0]?.includes('cbu01.alicdn.com'), 'روابط الصور من cbu alicdn');
expect((x.variants ?? []).length === 4, `المتغيرات: ${(x.variants ?? []).length}`);
const v = (x.variants ?? [])[0] ?? {};
expect(v.size === 'L', `المقاس مقروء من props_names: ${v.size}`);
expect(!!v.color && /豹纹|نمر|leopard/i.test(v.color), `اللون مقروء: ${v.color}`);
expect(!!v.image?.includes('alicdn'), 'صورة اللون مأخوذة من sku_props');
expect(v.inStock === true, 'المخزون مقروء من stock');
expect(x.weightG === 120, `الوزن 120 غرامًا من package_info.weight (جاء ${x.weightG})`);
expect(x.minQty === 1, `الحد الأدنى: ${x.minQty}`);
expect(x.inStock === true, 'المنتج متوفر (is_sold_out=false)');
expect(!!x.supplier, `المورد: ${x.supplier}`);

// البحث: منتج بلا حقل مخزون يبقى متوفرًا، والمعلَّم is_sold_out وحده هو الذي ينفد
const rs = await fetch(`${BASE}/api/source/test`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-import-token': TOKEN },
  body: JSON.stringify({ kw: '连衣裙', provider: 'tmapi', base_url: `http://127.0.0.1:${PORT}`, key: 'ak_live_TEST', lang: 'zh' }),
});
const ds = await rs.json();
const items = ds.data ?? [];
expect(ds.ok === true && items.length === 2, `البحث أعاد منتجين (${items.length})`);
expect(items[0]?.inStock === true, 'منتج البحث بلا حقل مخزون يبقى متوفرًا');
expect(items[1]?.inStock === false, 'منتج مُعلَّم is_sold_out=true يُعلَّم نافدًا');

srv.close();
console.log(`\nنجح: ${passed} · فشل: ${problems.length}`);
process.exit(problems.length ? 1 : 0);
