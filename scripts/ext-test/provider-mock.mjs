// خادم وهمي يحاكي ردود OTAPI و TMAPI لاختبار الموصّل محليًا: node scripts/ext-test/provider-mock.mjs (المنفذ 8790)
import http from 'node:http';
const ot = (id, title) => ({ Id: `abb-${id}`, Title: `Dress ${id}`, OriginalTitle: title, Price: { OriginalPrice: 45.5, ConvertedPriceList: {} }, MainPictureUrl: `//cbu01.alicdn.com/img/ibank/${id}-main.jpg`, Pictures: [{ Url: `https://cbu01.alicdn.com/img/ibank/${id}-1.jpg` }, { Url: `https://cbu01.alicdn.com/img/ibank/${id}-2.jpg` }], VendorName: '杭州工厂', FirstLotQuantity: 2, MasterQuantity: 500, SalesInLast30Days: 88,
  Attributes: [{ Pid: '1', Vid: '10', PropertyName: 'Color', OriginalPropertyName: '颜色', Value: 'Black', OriginalValue: '黑色', IsConfigurator: true, ImageUrl: `https://cbu01.alicdn.com/img/ibank/${id}-black.jpg` }, { Pid: '2', Vid: '20', PropertyName: 'Size', OriginalPropertyName: '尺码', Value: 'M', OriginalValue: 'M', IsConfigurator: true }, { Pid: '2', Vid: '21', PropertyName: 'Size', Value: 'L', OriginalValue: 'L', IsConfigurator: true }],
  ConfigurationItems: [{ Id: 's1', Price: { OriginalPrice: 45.5 }, Quantity: 30, Configurators: [{ Pid: '1', Vid: '10' }, { Pid: '2', Vid: '20' }] }, { Id: 's2', Price: { OriginalPrice: 46 }, Quantity: 0, Configurators: [{ Pid: '1', Vid: '10' }, { Pid: '2', Vid: '21' }] }] });
const tm = (id, title) => ({ item_id: id, title, price_info: { price: '45.50', sale_price: '45.50' }, main_imgs: [`https://cbu01.alicdn.com/img/ibank/${id}-1.jpg`, `https://cbu01.alicdn.com/img/ibank/${id}-2.jpg`], min_order_quantity: 2, seller_info: { shop_name: '杭州工厂' }, sale_info: { sale_quantity_90days: 300 },
  skus: [{ skuid: 'a', sale_price: '45.50', stock: 30, props_names: '颜色:黑色;尺码:M', image: `https://cbu01.alicdn.com/img/ibank/${id}-black.jpg` }, { skuid: 'b', sale_price: '46.00', stock: 0, props_names: '颜色:黑色;尺码:L' }] });
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); console.log('MOCK', u.pathname, [...u.searchParams.keys()].join(','));
  res.setHeader('content-type', 'application/json');
  if (u.pathname.includes('BatchSearchItemsFrame')) return res.end(JSON.stringify({ ErrorCode: 'Ok', Result: { Items: { Items: { Content: [1, 2, 3].map(i => ot(`77000000${i}`, `夏季连衣裙 ${i}`)) } } } }));
  if (u.pathname.includes('GetItemFullInfo')) return res.end(JSON.stringify({ ErrorCode: 'Ok', Result: { Item: ot(u.searchParams.get('itemId').replace('abb-', ''), '夏季连衣裙 详情') } }));
  if (u.pathname.includes('/1688/search/items')) return res.end(JSON.stringify({ code: 200, data: { items: [1, 2, 3].map(i => tm(`88000000${i}`, `韩版长裙 ${i}`)) } }));
  if (u.pathname.includes('/1688/item_detail')) return res.end(JSON.stringify({ code: 200, data: tm(u.searchParams.get('item_id'), '韩版长裙 详情') }));
  res.statusCode = 404; res.end('{}');
}).listen(8790, '127.0.0.1', () => console.log('provider mock on 8790'));
