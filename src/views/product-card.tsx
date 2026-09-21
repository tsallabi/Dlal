import type { FC } from 'hono/jsx';
import type { ProductRow } from '../lib/db';
import { fmt, imgUrl } from '../lib/db';

// السعر بصيغة متاجر الموضة: الرقم الصحيح كبير والكسر صغير
const Price: FC<{ v: number; deal?: boolean }> = ({ v, deal }) => {
  const int = Math.floor(v);
  const frac = Math.round((v - int) * 100);
  return <>{int.toLocaleString('ar-LY')}{frac ? <em>٫{String(frac).padStart(2, '0')}</em> : null}<em> د.ل</em></>;
};

export const ProductCard: FC<{ p: ProductRow; fav?: boolean }> = ({ p, fav }) => {
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd
    ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
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
        {p.sales > 200 && <span class="best-pill">الأكثر مبيعًا في {p.cat_name ?? 'القسم'} ›</span>}
        <div class="meta"><span class="star">★ {p.rating.toFixed(1)}</span><span>({p.sales > 0 ? `${p.sales}+` : 'جديد'})</span></div>
        <span class="ship">جوي · يصل خلال ١٢ — ١٨ يومًا</span>
        {p.price_sea_lyd && p.price_sea_lyd < p.price_lyd
          ? <span class="ship sea">🚢 بحري {fmt(p.price_sea_lyd)} · ٣٠ — ٤٥ يومًا</span>
          : null}
        <div class="buy">
          <div class={`p ${off ? 'deal' : ''}`}><Price v={p.price_lyd} />{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}</div>
          <button class="add" type="button" data-add={p.id} aria-label="أضيفي إلى السلة" title="أضيفي إلى السلة">+</button>
        </div>
      </div>
    </a>
  );
};

export const Grid: FC<{ items: ProductRow[]; favs?: Set<number> }> = ({ items, favs }) =>
  items.length ? (
    <div class="grid">{items.map(p => <ProductCard p={p} fav={favs?.has(p.id)} />)}</div>
  ) : (
    <div class="empty"><div class="big">🛍️</div>لا توجد منتجات هنا بعد</div>
  );
