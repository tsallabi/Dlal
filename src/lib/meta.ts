// أدوات إعلانات ميتا (فيسبوك وإنستغرام) — ما يحتاجه أي «ميديا باير» ليعمل على الموقع:
// ١) بكسل ميتا: يُحقن في كل صفحة للزبونة (لا اللوحة) متى ضُبط معرّفه في /admin/pricing، ويعدّ
//    المشاهدة والإضافة للسلة وبدء الدفع والشراء (الأحداث في public/app.js من سمات data-px-*).
// ٢) إثبات ملكية النطاق hudhude.com لميتا (وسم facebook-domain-verification) — شرط لتشغيل الإعلانات عليه.
// ٣) كتالوج المنتجات /feeds/meta.csv لمدير التجارة: إعلانات ديناميكية ومتجر فيسبوك وإنستغرام.
let cache: { at: number; pixel: string; verify: string } | null = null;
const TTL = 60_000;

export function bustMetaCache() { cache = null; }

export async function metaSettings(db: D1Database) {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const { results } = await db.prepare("SELECT key,value FROM settings WHERE key IN ('meta_pixel_id','meta_domain_verify')").all<{ key: string; value: string }>();
  const m = Object.fromEntries(results.map(r => [r.key, r.value]));
  cache = { at: Date.now(), pixel: validPixel(m.meta_pixel_id), verify: validVerify(m.meta_domain_verify) };
  return cache;
}

// معرّف البكسل أرقام (١٥–١٦ عادةً)؛ ووسم التحقق حروف وأرقام — لا يُحقن غيرهما في الصفحة أبدًا
export const validPixel = (v?: string | null) => (/^\d{10,20}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');
export const validVerify = (v?: string | null) => {
  const s = String(v ?? '').trim().replace(/^.*content="([^"]+)".*$/s, '$1');   // يقبل الوسم كاملًا كما تعطيه ميتا
  return /^[a-z0-9]{10,64}$/i.test(s) ? s : '';
};

export function metaHead(m: { pixel: string; verify: string }) {
  let h = '';
  if (m.verify) h += `<meta name="facebook-domain-verification" content="${m.verify}" />`;
  if (m.pixel) h += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${m.pixel}');fbq('track','PageView');</script>`;
  return h;
}

// CSV كما يقبله مدير التجارة: الحقل بين علامتي تنصيص، والتنصيص داخله مضاعف
export const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
