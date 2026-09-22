// مزوّدو بيانات 1688 من طرف ثالث (يسحبون من الصين ويقدمون API) — يعمل الاستيراد من الخادم بلا متصفح
// المدعومان: OTAPI (otapi.net) و TMAPI (tmapi.top). كل رد خام يُعاد مع النتيجة ليُعرض في لوحة الإدارة.
import type { Settings } from './pricing';
import { normWeightG } from './source';

export type NormItem = { offerId: string; url: string; title: string; titleEn?: string; priceCny: number; images: string[]; sales?: number; minQty: number; inStock: boolean; supplier?: string; weightG?: number; volumeCm3?: number; variants: { skuId?: string; color?: string; size?: string; colorEn?: string; sizeEn?: string; priceCny?: number; inStock?: boolean; image?: string }[] };
export type ProviderResult<T> = { ok: boolean; data: T; raw: string; url: string; status: number; error?: string };
export interface Provider { name: string; search(keyword: string, page: number): Promise<ProviderResult<NormItem[]>>; item(offerId: string): Promise<ProviderResult<NormItem | null>>; }

const g = (o: any, ...paths: string[]): any => { for (const p of paths) { let v = o; for (const k of p.split('.')) { if (v == null) break; v = v[k]; } if (v != null && v !== '') return v; } return undefined; };
const num = (v: any) => { const m = String(v ?? '').match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
const arr = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const idOf = (v: any) => String(v ?? '').replace(/^abb-/, '').replace(/\D/g, '');
const fixImg = (u: any) => (typeof u === 'string' ? u : g(u, 'Url', 'url', 'imgUrl', 'large', 'medium') ?? '').toString().replace(/^\/\//, 'https://');

async function call(url: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers } });
  const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text: text.slice(0, 60000), json };
}

// ---------- OTAPI ----------
// JSON: https://otapi.net/service-json/{Method}?instanceKey=..&language=..&...   معرف منتج 1688 عندهم: abb-{id}
class Otapi implements Provider {
  name = 'otapi';
  constructor(private base: string, private key: string, private lang: string) {}
  private u(method: string, q: Record<string, string>) { const p = new URLSearchParams({ instanceKey: this.key, language: this.lang, ...q }); return `${this.base.replace(/\/+$/, '')}/service-json/${method}?${p}`; }
  private norm(it: any): NormItem {
    const id = idOf(g(it, 'Id', 'id'));
    const attrs = arr(g(it, 'Attributes'));
    const pname = (pid: any) => attrs.find(a => String(a.Pid) === String(pid))?.PropertyName ?? '';
    const vname = (pid: any, vid: any) => attrs.find(a => String(a.Pid) === String(pid) && String(a.Vid) === String(vid));
    const variants = arr(g(it, 'ConfigurationItems')).map((c: any) => {
      let color: string | undefined, size: string | undefined, colorEn: string | undefined, sizeEn: string | undefined, image: string | undefined;
      arr(c.Configurators).forEach((cf: any) => { const a = vname(cf.Pid, cf.Vid); const pn = `${pname(cf.Pid)} ${a?.OriginalPropertyName ?? ''} ${cf.Pid ?? ''}`.toLowerCase(); const orig = a?.OriginalValue ?? cf.Vid; const en = a?.Value; const val = orig ?? en;
        if (/size|尺|码|规格/i.test(pn) || /^(xs|s|m|l|xl|xxl|xxxl|\d+)$/i.test(String(val))) { size = val; sizeEn = en; } else { color = val; colorEn = en; } if (a?.ImageUrl) image = fixImg(a.ImageUrl); });
      return { skuId: String(c.Id ?? ''), color, size, colorEn, sizeEn, priceCny: num(g(c, 'Price.OriginalPrice', 'Price.Price', 'Price')), inStock: num(c.Quantity) > 0, image };
    });
    // لا توجد ConfigurationItems؟ نبني المتغيرات من خصائص IsConfigurator (لون × مقاس)
    if (!variants.length) {
      const cfg = attrs.filter(a => a.IsConfigurator);
      const isSize = (a: any) => /size|尺|码|规格/i.test(`${a.PropertyName ?? ''} ${a.OriginalPropertyName ?? ''} ${a.Pid ?? ''}`) || /^(xs|s|m|l|xl|xxl|xxxl|\d+)$/i.test(String(a.OriginalValue ?? a.Value ?? ''));
      const sizes = cfg.filter(isSize), colors = cfg.filter(a => !isSize(a));
      const mk = (c?: any, sz?: any) => ({ skuId: '', color: c ? String(c.OriginalValue ?? c.Value) : undefined, colorEn: c?.Value, size: sz ? String(sz.OriginalValue ?? sz.Value) : undefined, sizeEn: sz?.Value, priceCny: 0, inStock: true, image: c?.ImageUrl ? fixImg(c.ImageUrl) : sz?.ImageUrl ? fixImg(sz.ImageUrl) : undefined });
      if (colors.length && sizes.length) colors.forEach(c => sizes.forEach(sz => variants.push(mk(c, sz))));
      else (colors.length ? colors : sizes).forEach(a => variants.push(isSize(a) ? mk(undefined, a) : mk(a)));
    }
    return {
      offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: String(g(it, 'OriginalTitle', 'Title') ?? ''), titleEn: g(it, 'Title'),
      priceCny: num(g(it, 'Price.OriginalPrice', 'Price.Price', 'Price', 'PriceOriginal')),
      images: arr(g(it, 'Pictures')).map(fixImg).filter(Boolean).slice(0, 8).concat(g(it, 'MainPictureUrl') ? [fixImg(g(it, 'MainPictureUrl'))] : []).filter((u, i, a) => a.indexOf(u) === i),
      sales: num(g(it, 'SalesInLast30Days', 'Sales', 'BasketCount')), minQty: Math.max(1, num(g(it, 'FirstLotQuantity', 'MinQuantity')) || 1),
      inStock: num(g(it, 'MasterQuantity')) > 0 || variants.some(v => v.inStock) || !g(it, 'MasterQuantity'), supplier: [g(it, 'VendorName', 'VendorDisplayName')].map(v => (v && !/^b2b-/.test(String(v)) ? String(v) : undefined))[0], variants,
    };
  }
  async search(keyword: string, page: number) {
    const xml = `<SearchItemsParameters><Provider>Alibaba1688</Provider><SearchMethod>Catalog</SearchMethod><ItemTitle>${keyword.replace(/[<&>]/g, '')}</ItemTitle></SearchItemsParameters>`;
    const url = this.u('SearchItemsFrame', { xmlParameters: xml, framePosition: String((page - 1) * 20), frameSize: '20' });
    try { const r = await call(url); const ok = !!r.json && r.json.ErrorCode === 'Ok'; const items = arr(g(r.json, 'Result.Items.Items.Content', 'Result.Items.Content', 'Result.SearchItems.Items.Content', 'Result.SearchItems.Content', 'OtapiItemInfoSubList.Content', 'Result.Items', 'Items.Content', 'Content')).map(x => this.norm(x)).filter(x => x.offerId && x.priceCny);
      return { ok: !!ok, data: items, raw: r.text, url, status: r.status, error: ok ? undefined : g(r.json, 'ErrorDescription', 'ErrorCode') ?? `HTTP ${r.status}` }; }
    catch (e: any) { return { ok: false, data: [], raw: '', url, status: 0, error: e.message }; }
  }
  async item(offerId: string) {
    const url = this.u('GetItemFullInfo', { itemId: `abb-${offerId}` });
    try { const r = await call(url); const it = g(r.json, 'OtapiItemFullInfo', 'Result.Item', 'Item'); const ok = !!it && typeof it === 'object' && !!g(it, 'Id') && (r.json.ErrorCode === 'Ok' || r.status === 200) && !it.HasError;
      return { ok, data: ok ? this.norm(it) : null, raw: r.text, url, status: r.status, error: ok ? undefined : g(r.json, 'ErrorDescription', 'ErrorCode') ?? `HTTP ${r.status}` }; }
    catch (e: any) { return { ok: false, data: null, raw: '', url, status: 0, error: e.message }; }
  }
}

// ---------- TMAPI ----------
// https://api.tmapi.top/1688/item_detail?apiToken=..&item_id=..   و   /1688/search/items?apiToken=..&keyword=..&page=..
class Tmapi implements Provider {
  name = 'tmapi';
  constructor(private base: string, private key: string, private lang: string) {}
  private u(path: string, q: Record<string, string>) { const p = new URLSearchParams(q); return `${this.base.replace(/\/+$/, '')}${path}?${p}`; }
  private h() { return { apikey: this.key }; }
  private norm(it: any): NormItem {
    const id = idOf(g(it, 'item_id', 'itemId', 'num_iid', 'id', 'offerId'));
    const price = num(g(it, 'price_info.price', 'price_info.sale_price', 'sale_price', 'price', 'priceRange.0.0', 'price_range.0.price'));
    // صور الألوان من sku_props: props_ids "0:1;1:2" → pid 0 vid 1
    const propImg = new Map<string, string>(); const propName = new Map<string, string>();
    arr(g(it, 'sku_props')).forEach((p: any) => arr(p.values).forEach((v: any) => { const k = `${p.pid}:${v.vid}`; if (v.imageUrl) propImg.set(k, fixImg(v.imageUrl)); propName.set(k, `${p.prop_name}:${v.name}`); }));
    const variants = arr(g(it, 'skus', 'sku_list', 'sku.sku_list')).map((s: any) => {
      const props = String(g(s, 'props_names', 'properties_name', 'name', 'sku_name') ?? '');
      const parts = props.split(/[;；]/).map(p => p.split(/[:：]/).pop()?.trim() ?? '').filter(Boolean);
      const sizeIdx = parts.findIndex(p => /^(xs|s|m|l|xl|xxl|xxxl|\d{2,3}|均码|f)$/i.test(p) || /尺码|尺寸|码/.test(props.split(/[;；]/).find(x => x.includes(p)) ?? ''));
      const size = sizeIdx >= 0 ? parts[sizeIdx] : undefined; const color = parts.find((_, i) => i !== sizeIdx);
      const ids = String(g(s, 'props_ids') ?? '').split(';'); const img = ids.map(k => propImg.get(k)).find(Boolean);
      return { skuId: String(g(s, 'skuid', 'sku_id', 'skuId') ?? ''), color, size, priceCny: num(g(s, 'sale_price', 'price')), inStock: num(g(s, 'stock', 'quantity')) > 0, image: fixImg(g(s, 'image', 'img', 'pic')) || img || undefined };
    });
    return {
      offerId: id, url: `https://detail.1688.com/offer/${id}.html`, title: String(g(it, 'title', 'subject', 'name') ?? ''), titleEn: g(it, 'title_en', 'title_translated'),
      priceCny: price, images: arr(g(it, 'main_imgs', 'images', 'item_imgs', 'pic_urls')).map(fixImg).filter(Boolean).slice(0, 8).concat(g(it, 'img', 'pic_url', 'main_pic') ? [fixImg(g(it, 'img', 'pic_url', 'main_pic'))] : []).filter((u, i, a) => a.indexOf(u) === i),
      sales: num(g(it, 'sale_info.sale_quantity_90days', 'sale_count', 'sale_info.sales', 'sales', 'sold')), minQty: Math.max(1, num(g(it, 'min_order_quantity', 'tiered_price_info.begin_num', 'sku_price_range.begin_num', 'sale_info.min_order', 'moq')) || 1),
      // نتيجة البحث لا تحمل حقل المخزون أصلًا: غيابه ليس نفادًا (كان يعلّم كل ما يأتي من البحث «نفد» فيختفي من المتجر)
      inStock: g(it, 'is_sold_out') === true ? false : variants.length ? variants.some(v => v.inStock) : g(it, 'stock', 'quantity') === undefined ? true : num(g(it, 'stock', 'quantity')) > 0,
      supplier: g(it, 'seller_info.shop_name', 'shop_info.shop_name', 'seller_name', 'company_name'),
      // الوزن: skus[].package_info.weight بالكيلوغرام، أو delivery_info.unit_weight
      weightG: normWeightG(arr(g(it, 'skus')).map((k: any) => num(g(k, 'package_info.weight'))).find((w: number) => w > 0) ?? num(g(it, 'delivery_info.unit_weight'))),
      // الحجم: من أبعاد الطرد (سم) أو الحقل volume — يُحاسب عليه الشحن الجوي
      volumeCm3: (() => {
        const pk = arr(g(it, 'skus')).map((k: any) => g(k, 'package_info')).find((x: any) => x && (num(x.volume) > 0 || num(x.length) > 0));
        if (!pk) return undefined;
        const v = num(pk.volume) > 0 ? num(pk.volume) : num(pk.length) * num(pk.width) * num(pk.height);
        return v > 0 ? Math.round(v) : undefined;
      })(),
      variants,
    };
  }
  async search(keyword: string, page: number) {
    const url = this.u('/1688/search/items', { keyword, page: String(page), ...(this.lang && this.lang !== 'zh' ? { language: this.lang } : {}) });
    try { const r = await call(url, this.h()); const ok = r.status === 200 && (r.json?.code === 200 || r.json?.code === 0) && !!r.json?.data;
      const items = arr(g(r.json, 'data.items', 'data.list', 'data', 'items', 'result')).map(x => this.norm(x)).filter(x => x.offerId && x.priceCny);
      return { ok, data: items, raw: r.text, url, status: r.status, error: ok ? undefined : g(r.json, 'msg', 'message', 'error') ?? `HTTP ${r.status}` }; }
    catch (e: any) { return { ok: false, data: [], raw: '', url, status: 0, error: e.message }; }
  }
  async item(offerId: string) {
    const url = this.u('/1688/item_detail', { item_id: offerId, language: this.lang || 'zh' });
    try { const r = await call(url, this.h()); const it = g(r.json, 'data.item', 'data', 'item', 'result'); const ok = r.status === 200 && r.json?.code === 200 && !!it && typeof it === 'object' && !!g(it, 'item_id', 'title');
      return { ok, data: ok ? this.norm(it) : null, raw: r.text, url, status: r.status, error: ok ? undefined : g(r.json, 'msg', 'message', 'error') ?? `HTTP ${r.status}` }; }
    catch (e: any) { return { ok: false, data: null, raw: '', url, status: 0, error: e.message }; }
  }
}

export function getProvider(s: Settings): Provider | null {
  const key = s.src_key || ''; if (!key) return null;
  if (s.src_provider === 'otapi') return new Otapi(s.src_base_url || 'https://otapi.net', key, s.src_lang || 'zh');
  if (s.src_provider === 'tmapi') return new Tmapi(s.src_base_url || 'https://api.tmapi.top', key, s.src_lang || 'zh');
  return null;
}
export const PROVIDERS: Record<string, { ar: string; base: string; keyLabel: string; site: string }> = {
  otapi: { ar: 'OTAPI — OpenTrade Commerce', base: 'https://otapi.net', keyLabel: 'instanceKey', site: 'https://otcommerce.com/1688-com/' },
  tmapi: { ar: 'TMAPI — tmapi.top', base: 'https://api.tmapi.top', keyLabel: 'apiToken', site: 'https://tmapi.top' },
};
