import type { FC } from 'hono/jsx';
import type { ProductRow } from '../lib/db';
import { fmt, imgUrl } from '../lib/db';

export const ProductCard: FC<{ p: ProductRow; fav?: boolean }> = ({ p, fav }) => {
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd
    ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
  return (
    <a class="card" href={`/p/${p.slug}`} data-id={p.id}>
      <div class="ph">
        <img src={imgUrl(p.image)} alt={p.title_ar} loading="lazy" decoding="async" referrerpolicy="no-referrer" />
        {off > 0 && <span class="tag">خصم {off}%</span>}
        {off === 0 && p.sales > 50 && <span class="tag" style="background:#141414">الأكثر مبيعًا</span>}
        <button class={`fav ${fav ? 'on' : ''}`} data-fav={p.id} aria-label="أضف للمفضلة" type="button">{fav ? '♥' : '♡'}</button>
        {!p.in_stock && <div class="unavail">غير متوفر حاليًا</div>}
      </div>
      <div class="body">
        <div class="t">{p.title_ar}</div>
        <div class="p">{fmt(p.price_lyd)}{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}</div>
        <div class="meta">
          <span class="star">★ {p.rating.toFixed(1)}</span>
          <span class="dot">·</span>
          <span>{p.sales > 0 ? `${p.sales}+ بيعت` : 'وصل حديثًا'}</span>
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
