export type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  SITE_NAME: string;
  SITE_URL: string;
  DEFAULT_CURRENCY: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  IMPORT_TOKEN: string;
};

export type User = {
  id: number;
  phone: string;
  name: string;
  email: string | null;
  role: 'customer' | 'admin' | 'partner';
  partner_id: number | null;
  city: string | null;
  address: string | null;
};

export type Variables = {
  user: User | null;
  cartCount: number;
};

export type Env = { Bindings: Bindings; Variables: Variables };

export const ORDER_STATUS: Record<string, { ar: string; step: number; color: string }> = {
  pending_payment: { ar: 'بانتظار الدفع', step: 0, color: 'gray' },
  paid:            { ar: 'مدفوع — بانتظار الشراء', step: 1, color: 'blue' },
  purchasing:      { ar: 'قيد الشراء', step: 2, color: 'blue' },
  purchased:       { ar: 'تم الشراء من المورد', step: 3, color: 'indigo' },
  at_warehouse:    { ar: 'وصل مخزن الصين', step: 4, color: 'indigo' },
  consolidated:    { ar: 'ضُم إلى شحنة', step: 5, color: 'purple' },
  shipped:         { ar: 'شُحن إلى ليبيا', step: 6, color: 'purple' },
  arrived:         { ar: 'وصل ليبيا', step: 7, color: 'teal' },
  customs:         { ar: 'في الجمارك', step: 8, color: 'teal' },
  ready:           { ar: 'جاهز للتسليم', step: 9, color: 'green' },
  delivered:       { ar: 'تم التسليم', step: 10, color: 'green' },
  cancelled:       { ar: 'ملغي', step: -1, color: 'red' },
  refunded:        { ar: 'مسترجع', step: -1, color: 'red' },
};

// المراحل التي يديرها شريك الشحن بالترتيب
export const PARTNER_FLOW = ['paid','purchasing','purchased','at_warehouse','consolidated','shipped','arrived','customs','ready','delivered'];

export const PAYMENT_METHODS: Record<string, string> = {
  sadad: 'سداد',
  moamalat: 'معاملات (بطاقة محلية)',
  mobicash: 'موبي كاش',
  cod_deposit: 'عربون + الباقي عند الاستلام',
};

export const CITIES = ['طرابلس','بنغازي','مصراتة','الزاوية','زليتن','الخمس','سبها','البيضاء','طبرق','درنة','أجدابيا','غريان','صبراتة','ترهونة','سرت','مرزق','غات','نالوت','الكفرة','بني وليد'];
