import type { FC } from 'hono/jsx';

// أيقونات الواجهة: خطّ واحد (1.8) بلون النص نفسه — بدل الإيموجي التي يرسمها كل جهاز بشكل ولون مختلفين،
// وبدل رموز التذييل «f ◎ ✆ ♪» التي بدت نصًّا مكسورًا (طلب صاحب المشروع ٢٥/٠٩/٢٦: «طبّق التصميم على كل الموقع والأيقونات»)
const P: Record<string, any> = {
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  truck: <><path d="M3 6.5h11v9H3z" /><path d="M14 9.5h3.6L21 13v2.5h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  ret: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0Z" /><circle cx="8" cy="8" r="1.5" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  cart: <><path d="M3 5h2.2l2.3 10.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.5L20 8H6.4" /><circle cx="10" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></>,
  chat: <><path d="M4 12a8 8 0 1 1 3 6.2L4 19.5l1-3.4A8 8 0 0 1 4 12Z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M16 13.5h.01" /></>,
  store: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 11.5V20h13v-8.5M10 20v-4.5h4V20" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6Z" /><path d="m9 12 2 2 4-4" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18v-1a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1ZM12 7v13M12 7C10.5 4 7 4 7 6s5 1 5 1ZM12 7c1.5-3 5-3 5-1s-5 1-5 1Z" /></>,
  ruler: <><path d="m3.5 15.5 12-12 5 5-12 12Z" /><path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4M12 17h.01" /></>,
  doc: <><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  star: <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6Z" />,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  send: <><path d="M20.5 3.5 3.5 10.5l7 2.5 2.5 7Z" /><path d="m10.5 13 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plane: <path d="M10.5 13.5 3 11l1.5-1.5 7 1 4.5-5a1.8 1.8 0 0 1 2.5 2.5l-5 4.5 1 7L13 21l-2.5-7.5L7 16.5V19l-1.5 1.5-1-3.5-3.5-1L2.5 15H5Z" />,
  bird: <><path d="M4 13c2.5 0 4-1.5 5-4 1-2.5 3-4 6-4 2 0 3.5 1 4.5 2.5L22 8l-2.2 1c0 5.5-4 9-9.3 9C7 18 4.5 16 4 13Z" /><path d="M15.5 7.5h.01" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  fb: <path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5Z" />,
  ig: <><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.8" /><path d="M16.8 7.2h.01" /></>,
  wa: <><path d="M4 20l1.2-3.8A8 8 0 1 1 8 19Z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1-.5-2-1.5-2.5-2.5l.9-1-1-2Z" /></>,
  tt: <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2.3 4 5 4.2" />,
};

export const Ic: FC<{ n: string; s?: number; class?: string }> = ({ n, s = 20, class: cls }) => (
  <svg class={`si${cls ? ' ' + cls : ''}`} viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{P[n] ?? P.help}</svg>
);
