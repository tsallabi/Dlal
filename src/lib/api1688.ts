/**
 * عميل الـ API الرسمي لمنصة 1688 المفتوحة (open.1688.com)
 * مبني على توثيق apiAuth.htm:
 *   - OAuth: https://auth.1688.com/oauth/authorize?client_id=APPKEY&site=1688&redirect_uri=..&state=..
 *   - Token: POST https://gw.open.1688.com/openapi/http/1/system.oauth2/getToken/APPKEY  (بدون توقيع)
 *            grant_type=authorization_code|refresh_token
 *   - النداءات: https://gw.open.1688.com/openapi/param2/{ver}/{namespace}/{name}/{appKey}
 *            + access_token + _aop_signature = HMAC-SHA1(appSecret, urlPath + sorted(key+value)) HEX UPPER
 * access_token صالح 36000 ثانية، refresh_token صالح 6 أشهر.
 */
import type { SourceProduct } from './source';
import { normWeightG } from './source';

export type Tokens = {
  access_token: string; refresh_token: string; expires_at: number; refresh_expires_at?: number;
  memberId?: string; aliId?: string; resource_owner?: string;
};

const GW = 'https://gw.open.1688.com/openapi';

export function authorizeUrl(appKey: string, redirectUri: string, state = 'dlal') {
  const u = new URL('https://auth.1688.com/oauth/authorize');
  u.searchParams.set('client_id', appKey);
  u.searchParams.set('site', '1688');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  return u.toString();
}

async function tokenCall(appKey: string, appSecret: string, params: Record<string, string>): Promise<Tokens> {
  const body = new URLSearchParams({ client_id: appKey, client_secret: appSecret, ...params });
  const r = await fetch(`${GW}/http/1/system.oauth2/getToken/${appKey}`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('1688 getToken failed: ' + JSON.stringify(j));
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? params.refresh_token,
    expires_at: Date.now() + (parseInt(j.expires_in ?? '36000') - 300) * 1000,
    refresh_expires_at: j.refresh_token_timeout ? parseCnTime(j.refresh_token_timeout) : undefined,
    memberId: j.memberId, aliId: j.aliId, resource_owner: j.resource_owner,
  };
}
const parseCnTime = (s: string) => { const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +m[6]) : undefined; };

export const exchangeCode = (appKey: string, appSecret: string, redirectUri: string, code: string) =>
  tokenCall(appKey, appSecret, { grant_type: 'authorization_code', need_refresh_token: 'true', redirect_uri: redirectUri, code });

export const refreshToken = (appKey: string, appSecret: string, refresh: string) =>
  tokenCall(appKey, appSecret, { grant_type: 'refresh_token', refresh_token: refresh });

async function sign(appSecret: string, urlPath: string, params: Record<string, string>) {
  const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(urlPath + sorted));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export class Client1688 {
  constructor(private appKey: string, private appSecret: string, private tokens: Tokens, private onTokens?: (t: Tokens) => Promise<void>) {}

  private async token() {
    if (Date.now() < this.tokens.expires_at) return this.tokens.access_token;
    this.tokens = await refreshToken(this.appKey, this.appSecret, this.tokens.refresh_token);
    if (this.onTokens) await this.onTokens(this.tokens);
    return this.tokens.access_token;
  }

  /** نداء عام:  call('com.alibaba.product', 'alibaba.product.get', 1, { productID: '123' }) */
  async call<T = any>(namespace: string, name: string, version: number, params: Record<string, any>): Promise<T> {
    const access = await this.token();
    const urlPath = `param2/${version}/${namespace}/${name}/${this.appKey}`;
    const p: Record<string, string> = { access_token: access };
    for (const [k, v] of Object.entries(params)) p[k] = typeof v === 'string' ? v : JSON.stringify(v);
    p._aop_timestamp = String(Date.now());
    p._aop_signature = await sign(this.appSecret, urlPath, p);
    const r = await fetch(`${GW}/${urlPath}`, { method: 'POST', body: new URLSearchParams(p), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const j: any = await r.json();
    if (j.success === false || j.error_code || j.errorCode) throw new Error(`1688 ${name}: ${j.error_message ?? j.errorMessage ?? JSON.stringify(j)}`);
    return j as T;
  }

  /** تفاصيل منتج بالمعرف → SourceProduct */
  async product(offerId: string): Promise<SourceProduct | null> {
    const j = await this.call('com.alibaba.product', 'alibaba.product.get', 1, { productID: offerId, webSite: '1688' });
    const p = j.productInfo; if (!p) return null;
    const attrs: Record<string, string> = {};
    const skus = (p.skuInfos ?? []).map((s: any) => {
      const a: Record<string, string> = {};
      (s.attributes ?? []).forEach((x: any) => { a[x.attributeName] = x.attributeValue; attrs[x.attributeName] = '1'; });
      const names = Object.keys(a);
      return { skuId: String(s.skuId), color: a['颜色'] ?? a[names[0]], size: a['尺码'] ?? a['尺寸'] ?? a[names[1]], priceCny: parseFloat(s.consignPrice ?? s.price ?? 0) || undefined, inStock: (s.amountOnSale ?? 0) > 0, image: s.attributes?.find((x: any) => x.skuImageUrl)?.skuImageUrl };
    });
    const price = parseFloat(p.saleInfo?.consignPrice ?? p.saleInfo?.priceRanges?.[0]?.price ?? 0);
    return {
      source: 'api', offerId, url: `https://detail.1688.com/offer/${offerId}.html`, title: p.subject, priceCny: price,
      minQty: parseInt(p.saleInfo?.minOrderQuantity ?? 1) || 1,
      images: (p.image?.images ?? []).map((u: string) => u.startsWith('http') ? u : `https://cbu01.alicdn.com/${u}`),
      supplier: p.supplierLoginId, variants: skus, inStock: (p.saleInfo?.amountOnSale ?? 1) > 0 && p.status === 'published',
      weightG: normWeightG(parseFloat(p.shippingInfo?.unitWeight ?? '')),
    };
  }

  /** بحث بالكلمات (نسخة عابرة للحدود) */
  async search(keyword: string, page = 1, pageSize = 40): Promise<{ offerId: string; title: string; priceCny: number; image: string }[]> {
    const j = await this.call('com.alibaba.fenxiao.crossborder', 'product.search.keywordQuery', 1, { offerQueryParam: { keyword, beginPage: page, pageSize, country: 'en' } });
    const list = j.result?.result?.data ?? j.result?.data ?? [];
    return list.map((x: any) => ({ offerId: String(x.offerId), title: x.subjectTrans ?? x.subject, priceCny: parseFloat(x.priceInfo?.price ?? 0), image: x.imageUrl }));
  }

  /** بحث بالصورة (base64) */
  async searchByImage(imageBase64: string, page = 1): Promise<{ offerId: string; title: string; priceCny: number; image: string }[]> {
    const j = await this.call('com.alibaba.fenxiao.crossborder', 'product.search.imageQuery', 1, { offerQueryParam: { imageBase64, beginPage: page, pageSize: 40, country: 'en' } });
    const list = j.result?.result?.data ?? [];
    return list.map((x: any) => ({ offerId: String(x.offerId), title: x.subjectTrans ?? x.subject, priceCny: parseFloat(x.priceInfo?.price ?? 0), image: x.imageUrl }));
  }
}
