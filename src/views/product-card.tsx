import type { FC } from 'hono/jsx';
import type { ProductRow } from '../lib/db';
import { fmt } from '../lib/db';

export const ProductCard: FC<{ p: ProductRow; fav?: boolean }> = ({ p, fav }) => {
  const off = p.compare_price_lyd && p.compare_price_lyd > p.price_lyd
    ? Math.round((1 - p.price_lyd / p.compare_price_lyd) * 100) : 0;
  return (
    <a class="card" href={`/p/${p.slug}`} data-id={p.id}>
      <div class="ph">
        <img src={p.image ?? '/placeholder.svg'} alt={p.title_ar} loading="lazy" />
        {off > 0 && <span class="tag">-{off}%</span>}
        {p.sales > 50 && off === 0 && <span class="tag" style="background:#1a1a1a">الأكثر مبيعًا</span>}
        <button class={`fav ${fav ? 'on' : ''}`} data-fav={p.id} aria-label="أضف للمفضلة" type="button">{fav ? '♥' : '♡'}</button>
        {!p.in_stock && <div class="unavail">غير متوفر حاليًا</div>}
      </div>
      <div class="t">{p.title_ar}</div>
      <div class="p">{fmt(p.price_lyd)}{off > 0 && <s>{fmt(p.compare_price_lyd!)}</s>}</div>
      <div class="meta">★ {p.rating.toFixed(1)} · {p.sales > 0 ? `${p.sales}+ بيعت` : 'جديد'}</div>
    </a>
  );
};

export const Grid: FC<{ items: ProductRow[]; favs?: Set<number> }> = ({ items, favs }) =>
  items.length ? (
    <div class="grid">{items.map(p => <ProductCard p={p} fav={favs?.has(p.id)} />)}</div>
  ) : (
    <div class="empty"><div class="big">🛍️</div>لا توجد منتجات هنا بعد</div>
  );
