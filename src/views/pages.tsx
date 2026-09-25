import type { FC } from 'hono/jsx';
import { Ic } from './icons';

// روابط تنقل موحّدة بين صفحات المساعدة — تظهر في أعلى كل صفحة
export const HELP_NAV: [string, string, string][] = [
  ['/how', 'كيف نعمل', 'bird'],
  ['/pages/how-to-order', 'كيف أطلب', 'cart'],
  ['/pages/shipping', 'معلومات الشحن', 'truck'],
  ['/pages/returns', 'الإرجاع والاسترداد', 'ret'],
  ['/pages/payment', 'الدفع والرسوم', 'card'],
  ['/pages/points', 'نقاط المكافآت', 'gift'],
  ['/pages/sizes', 'دليل المقاسات', 'ruler'],
  ['/pages/faq', 'الأسئلة الشائعة', 'help'],
  ['/pages/contact', 'تواصل معنا', 'chat'],
  ['/pages/branches', 'فروعنا', 'store'],
];

// أيقونة رأس الصفحة للصفحات خارج شريط المساعدة (الخصوصية والشروط)
const HERO_IC: Record<string, string> = { '/pages/privacy': 'lock', '/pages/terms': 'doc' };

// قالب صفحات المساعدة بأسلوب «كيف يعمل هدهد»: رأس دافئ بأيقونة، أقراص تنقّل بأيقوناتها، والمحتوى في بطاقة
export const Doc: FC<{ title: string; sub?: string; active?: string; children: any }> = ({ title, sub, active, children }) => {
  const ic = HELP_NAV.find(([h]) => h === active)?.[2] ?? (active && HERO_IC[active]) ?? 'help';
  return (
    <div class="doc">
      <header class="doc-hero">
        <span class="doc-ic"><Ic n={ic} s={28} /></span>
        <span class="hm-tag">مركز المساعدة — هدهد</span>
        <h1>{title}</h1>
        {sub && <p class="sub">{sub}</p>}
      </header>
      <nav class="doc-nav">{HELP_NAV.map(([href, l, i]) => <a href={href} class={href === active ? 'on' : ''}><Ic n={i} s={16} />{l}</a>)}</nav>
      <div class="doc-body">{children}</div>
    </div>
  );
};

export const Step: FC<{ n: number; title: string; children: any }> = ({ n, title, children }) => (
  <div class="step"><div class="num">{n}</div><div><h3>{title}</h3>{children}</div></div>
);

export const Faq: FC<{ items: [string, any][] }> = ({ items }) => (
  <div class="faq">{items.map(([q, a]) => <details><summary>{q}</summary><div class="a">{a}</div></details>)}</div>
);
