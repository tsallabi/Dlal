import type { FC } from 'hono/jsx';
import type { ProductRow } from '../lib/db';
import { fmt, imgUrl } from '../lib/db';
import { KIND_NOTE, type ListingKind } from '../lib/source';

// السعر بصيغة متاجر الموضة: الرقم الصحيح كبير والكسر صغير
const Price: FC<{ v: number; deal?: boolean }> = ({ v, deal }) => {
  const int = Math.floor(v);
  const frac = Math.round((v - int) * 100);
  return <>{int.toLocaleString('ar-LY')}{frac ? <em>٫{String(frac).padStart(2, '0')}</em> : null}<em> د.ل</em></>;
};

export type ShipCtx = { mode: 'air' | 'sea'; air: string; sea: string; seaOn: boolean };
const DEF_SHIP: ShipCtx = { mode: 'air', air: '١٢ — ١٨ يومًا', sea: '٣٠ — ٤٥ يومًا', seaOn: true };

export const ProductCard: FC<{ p: ProductRow; fav?: boolean; ship?: ShipCtx; best?: boolean }> = ({ p, fav, ship, best }) => {
  const sh = ship ?? DEF_SHIP;
  // السعر الظاهر يتبع طريقة الشحن المختارة، والسطر الثاني يعرض البديل بسعره
  const sea = sh.seaOn && p.price_sea_lyd && p.price_sea_lyd < p.price_lyd ? p.price_sea_lyd : null;
  const shown = sh.mode === 'sea' && sea ? sea : p.price_lyd;
  const off = p.compare_price_lyd && p.compare_price_lyd > shown
    ? Math.round((1 - shown / p.compare_price_lyd) * 100) : 0;
  const isNew = !p.sales;
  return (
    <a class="card" href={`/p/${p.slug}`} data-id={p.id}>
      <div class="ph">
        <img src={imgUrl(p.image)} alt={p.title_ar} loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        <div class="badges">
          {off > 0 && <span class="bdg off">−{off}%</span>}
          {p.sales > 100 && <span class="bdg best">الأكثر طلبًا</span>}
          {isNew && <span class="bdg new">جديد</span>}
        </div>
        {(p.colors ?? 0) > 1 && <span class="swatch">{p.colors}+ ألوان</span>}
        <button class={`fav ${fav ? 'on' : ''}`} data-fav={p.id} aria-label="أضف للمفضلة" type="button">{fav ? '♥' : '♡'}</button>
        {!p.in_stock && <div class="unavail">غير متوفر حاليًا</div>}
      </div>
      <div class="body">
        <div class="t">{p.title_ar}</div>
        {best && <span class="best-pill">الأكثر مبيعًا في {p.cat_name ?? 'القسم'} ›</span>}
        {/* شارة تقول ما هو قبل أن تضغط: «حامل عرض» يصل فارغًا و«صناعي» ليس زهرًا طبيعيًا */}
        {p.kind && KIND_NOTE[p.kind as ListingKind] && <span class="kind-tag">{KIND_NOTE[p.kind as ListingKind].tag}</span>}
        {/* لا نجوم بلا تقييم حقيقي: المنتج الجديد يعرض عدد مبيعاته عند المورد أو كلمة «جديد» */}
        <div class="meta">{p.review_count > 0
          ? <><span class="star">★ {p.rating.toFixed(1)}</span><span>({p.review_count} تقييم)</span></>
          : <span>{p.sales > 0 ? `بيع منه ${p.sales}+ قطعة` : 'وصل حديثًا'}</span>}</div>
        {/* كما في شي إن: السعر وزرّ السلة في سطر، ثم مدة الوصول تحته */}
        <div class="buy">
          <div class={`p ${off ? 'deal' : ''}`}><Price v={shown} />{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}</div>
          <button class="add" type="button" data-add={p.id} aria-label="أضيفي إلى السلة" title="أضيفي إلى السلة"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 10.3a1.8 1.8 0 0 0 1.8 1.4h7.6a1.8 1.8 0 0 0 1.8-1.4L20 8H9.5" /><circle cx="9.5" cy="19.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="16.5" cy="19.5" r="1.3" fill="currentColor" stroke="none" /><path d="M14 3.5v5M11.5 6h5" /></svg></button>
        </div>
        <span class="ship"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 9h4.5L21 12.5V16h-8" /><circle cx="6" cy="17.5" r="1.7" fill="#fff" /><circle cx="17" cy="17.5" r="1.7" fill="#fff" /></svg>{sh.mode === 'sea' && sea ? 'بحري' : 'جوي'}<i> · يصل خلال</i> {sh.mode === 'sea' && sea ? sh.sea : sh.air}</span>
        {sea && sh.mode === 'air' ? <span class="ship sea">🚢 بحري {fmt(sea)}<i> · {sh.sea}</i></span> : null}
        {sea && sh.mode === 'sea' ? <span class="ship sea">✈️ جوي {fmt(p.price_lyd)}<i> · {sh.air}</i></span> : null}
      </div>
    </a>
  );
};

export const Grid: FC<{ items: ProductRow[]; favs?: Set<number>; ship?: ShipCtx }> = ({ items, favs, ship }) => {
  // «الأكثر مبيعًا في القسم» تُمنح لصاحب أعلى مبيعات في كل قسم داخل هذه الشبكة فقط — لا لكل بطاقة
  const top = new Map<string, { id: number; sales: number }>();
  items.forEach(p => { const k = p.cat_name ?? '—'; const cur = top.get(k); if (p.sales > 0 && (!cur || p.sales > cur.sales)) top.set(k, { id: p.id, sales: p.sales }); });
  const bestIds = new Set([...top.values()].map(v => v.id));
  return items.length ? (
    <div class="grid">{items.map(p => <ProductCard p={p} fav={favs?.has(p.id)} ship={ship} best={bestIds.has(p.id)} />)}</div>
  ) : (
    <div class="empty"><div class="big">🛍️</div>لا توجد منتجات هنا بعد</div>
  );
};
