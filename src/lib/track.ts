// حركة الزوار (طلب صاحب المشروع ٢٤/٠٩/٢٦): الصفحات، الاهتمامات، المدن والدول، المشاكل، ومسار الشراء
// (شاهد ⟵ أضاف للسلة ⟵ بدأ الدفع ⟵ دفع) حتى نتابع من ترك سلته بتذكير أو إعلان.
// الكتابة بعد إرسال الرد (waitUntil) فلا تُبطئ الصفحة، وتُحذف السطور بعد 90 يومًا.
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../types';

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|HeadlessChrome|curl|wget|python|node-fetch|axios|Go-http|monitor|uptime/i;

// يُستدعى قبل بناء الصفحة (وسيط المستخدم في index.tsx): ضبط الكوكي بعد قراءة جسم الرد يُسقط الصفحة بـ500
// («This ReadableStream is disturbed») — كان هذا أول تشغيل محلي
export function visitorId(c: Context<Env>): string {
  let v = getCookie(c, 'vid');
  if (!v || !/^[a-z0-9]{12,32}$/.test(v)) {
    v = [...crypto.getRandomValues(new Uint8Array(10))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    setCookie(c, 'vid', v, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'Lax', httpOnly: true, secure: c.req.url.startsWith('https') });
  }
  return v;
}

// الروبوتات وفحوصنا الآلية (الجولة والفحص بعد النشر) لا تُحسب زوّارًا. e2e يضع hh_track=1 ليُحسب عمدًا
// ماسحات الثغرات تطلب /.env و/.git/config و/.aws/credentials و*.php بلا كوكي من مراكز بيانات:
// أول ليلة على الحي كانت 17 من 38 «مشكلة» منها — ليست زوارًا ولا أعطالًا في موقعنا
export const PROBE = /(^|\/)\.[a-z]|\.(php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|save|orig|ya?ml|config|swp|log|tar|gz|rar|7z)$|^\/(wp-|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor\/|setup|admin\.|boaform|actuator|owa|ecp|autodiscover|hnap1|console|solr|telescope|_ignition|debug)/i;

export function trackable(c: Context<Env>) {
  if (PROBE.test(new URL(c.req.url).pathname)) return false;
  if (getCookie(c, 'hh_track') === '1') return true;
  return !BOT.test(c.req.header('user-agent') ?? '');
}

export function track(c: Context<Env>, kind: string, ref?: string | null, n?: number | null, path?: string) {
  if (!trackable(c)) return;
  const cf = (c.req.raw as any).cf ?? {};
  const ua = c.req.header('user-agent') ?? '';
  const u = c.get('user');
  if (u && u.role !== 'customer' && !u.imp_by) return;   // الموظفون والشركاء ليسوا زبائن
  // المسار كما يقرؤه الإنسان: /p/فستان لا /p/%D9%81… (كان فحص «الصفحة المفقودة» لا يجدها)
  let p0 = path ?? new URL(c.req.url).pathname; try { p0 = decodeURIComponent(p0); } catch { /* ترميز مكسور: يبقى كما هو */ }
  const vid = c.get('vid') ?? getCookie(c, 'vid');
  if (!vid) return;
  const stmt = c.env.DB.prepare('INSERT INTO visits(vid,user_id,kind,path,ref,n,country,city,device) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(vid, u?.id ?? null, kind, p0.slice(0, 200), ref ? String(ref).slice(0, 200) : null, n ?? null,
      cf.country ?? null, cf.city ?? null, /Mobi|Android|iPhone|iPad/i.test(ua) ? 'm' : 'd').run().catch(() => {});
  try { c.executionCtx.waitUntil(stmt); } catch { /* خارج Workers (اختبار) */ }
}

// نوع الصفحة من مسارها: منتج، قسم، بحث، سلة، دفع، شراء
export function pageKind(url: URL): { kind: string; ref?: string } {
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/p\/([^/]+)$/))) return { kind: 'product', ref: decodeURIComponent(m[1]) };
  if ((m = p.match(/^\/c\/([^/]+)$/))) return { kind: 'category', ref: decodeURIComponent(m[1]) };
  if (p === '/search') return { kind: 'search', ref: (url.searchParams.get('q') ?? '').trim().slice(0, 100) };
  if (p === '/cart') return { kind: 'cart_view' };
  if (p === '/checkout') return { kind: 'checkout' };
  if ((m = p.match(/^\/orders\/(DL-[\d-]+)$/)) && url.searchParams.get('paid') === '1') return { kind: 'purchase', ref: m[1] };
  return { kind: 'view' };
}
const SKIP = /^\/(admin|partner|api|img|feeds|t|m|logout|impersonate|pay\/mock)(\/|$)|\.(js|css|svg|png|jpe?g|webp|ico|zip|txt|xml|csv)$/;
export const trackPath = (p: string) => !SKIP.test(p);

// أسماء الدول بالعربية، ومدن ليبيا الشائعة (Cloudflare يعطيها بالإنجليزية)
const CITY_AR: Record<string, string> = { Tripoli: 'طرابلس', Benghazi: 'بنغازي', Misrata: 'مصراتة', Misurata: 'مصراتة', Zawiya: 'الزاوية', 'Az Zawiyah': 'الزاوية', Sabha: 'سبها', Sebha: 'سبها', Zliten: 'زليتن', Khoms: 'الخمس', 'Al Khums': 'الخمس', Bayda: 'البيضاء', 'Al Bayda': 'البيضاء', Tobruk: 'طبرق', Derna: 'درنة', Ajdabiya: 'أجدابيا', Sirte: 'سرت', Gharyan: 'غريان', Zuwara: 'زوارة', Tarhuna: 'ترهونة', Marj: 'المرج', 'Al Marj': 'المرج', Bani_Walid: 'بني وليد', 'Bani Walid': 'بني وليد', Sabratha: 'صبراتة', Surman: 'صرمان', Ubari: 'أوباري', Ghat: 'غات', Kufra: 'الكفرة', Nalut: 'نالوت', Yafran: 'يفرن' };
export const cityAr = (c?: string | null) => (c ? CITY_AR[c] ?? c : 'غير معروفة');
let dn: Intl.DisplayNames | null = null;
export function countryAr(code?: string | null) {
  if (!code) return 'غير معروفة';
  try { dn = dn ?? new Intl.DisplayNames(['ar'], { type: 'region' }); return dn.of(code) ?? code; } catch { return code; }
}
