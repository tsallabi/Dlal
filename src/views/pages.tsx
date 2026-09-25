import type { FC } from 'hono/jsx';

// روابط تنقل موحّدة بين صفحات المساعدة — تظهر في أعلى كل صفحة
export const HELP_NAV: [string, string][] = [
  ['/how', 'كيف نعمل'],
  ['/pages/how-to-order', 'كيف أطلب'],
  ['/pages/shipping', 'معلومات الشحن'],
  ['/pages/returns', 'الإرجاع والاسترداد'],
  ['/pages/payment', 'الدفع والرسوم'],
  ['/pages/points', 'نقاط المكافآت'],
  ['/pages/sizes', 'دليل المقاسات'],
  ['/pages/faq', 'الأسئلة الشائعة'],
  ['/pages/contact', 'تواصل معنا'],
  ['/pages/branches', 'فروعنا'],
];

export const Doc: FC<{ title: string; sub?: string; active?: string; children: any }> = ({ title, sub, active, children }) => (
  <div class="doc">
    <h1>{title}</h1>
    {sub && <p class="sub">{sub}</p>}
    <nav class="doc-nav">{HELP_NAV.map(([href, l]) => <a href={href} class={href === active ? 'on' : ''}>{l}</a>)}</nav>
    {children}
  </div>
);

export const Step: FC<{ n: number; title: string; children: any }> = ({ n, title, children }) => (
  <div class="step"><div class="num">{n}</div><div><h3>{title}</h3>{children}</div></div>
);

export const Faq: FC<{ items: [string, any][] }> = ({ items }) => (
  <div class="faq">{items.map(([q, a]) => <details><summary>{q}</summary><div class="a">{a}</div></details>)}</div>
);
