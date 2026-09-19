export type Bindings = {
  DB: D1Database;
  IMAGES?: R2Bucket;              // اختياري حتى يُفعَّل R2
  ASSETS: Fetcher;
  SITE_NAME: string;
  SITE_URL: string;
  DEFAULT_CURRENCY: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  IMPORT_TOKEN: string;
  MYPAY_API_KEY?: string;          // اختياري: يتقدم على قيمة الإعدادات في القاعدة
  MYPAY_WEBHOOK_SECRET?: string;
};

export type StaffRole = 'owner' | 'admin' | 'ops' | 'support' | 'finance' | 'catalog';

export type User = {
  id: number;
  phone: string;
  name: string;
  email: string | null;
  role: 'customer' | 'admin' | 'partner';
  staff_role: StaffRole | null;
  partner_id: number | null;
  city: string | null;
  address: string | null;
  points: number;
  active: number;
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

// طرق الدفع: mypay_* تمر عبر بوابة ماي باي، والباقي يدوي
export const PAYMENT_METHODS: Record<string, { ar: string; icon: string; online: boolean; gateway?: string; desc: string }> = {
  mypay_moamalat: { ar: 'بطاقة مصرفية محلية (معاملات)', icon: '💳', online: true, gateway: 'moamalat', desc: 'ادفعي فورًا ببطاقة أي مصرف ليبي عبر ماي باي' },
  mypay_sadad:    { ar: 'سداد', icon: '📱', online: true, gateway: 'sadad', desc: 'دفع فوري عبر تطبيق سداد' },
  mypay_edfali:   { ar: 'إدفعلي', icon: '📲', online: true, gateway: 'edfali', desc: 'دفع فوري عبر إدفعلي' },
  mypay_mobicash: { ar: 'موبي كاش', icon: '📳', online: true, gateway: 'mobicash', desc: 'دفع فوري عبر موبي كاش' },
  transfer:       { ar: 'تحويل مصرفي / إيصال', icon: '🏦', online: false, desc: 'حوّلي المبلغ وأرسلي الإيصال على واتساب، يُفعَّل الطلب خلال ساعات العمل' },
  cod_deposit:    { ar: 'عربون 30% والباقي عند الاستلام', icon: '🤝', online: false, desc: 'يتواصل معك فريقنا لتأكيد العربون' },
};

export const TICKET_TYPES: Record<string, string> = { return: 'إرجاع / تعويض', issue: 'مشكلة في الطلب', question: 'استفسار', cancel: 'طلب إلغاء' };
export const TICKET_STATUS: Record<string, { ar: string; color: string }> = {
  open: { ar: 'مفتوحة', color: 'blue' }, in_progress: { ar: 'قيد المعالجة', color: 'purple' }, resolved: { ar: 'تم الحل', color: 'green' }, closed: { ar: 'مغلقة', color: 'gray' },
};

export const CITIES = ['طرابلس','بنغازي','مصراتة','الزاوية','زليتن','الخمس','سبها','البيضاء','طبرق','درنة','أجدابيا','غريان','صبراتة','ترهونة','سرت','مرزق','غات','نالوت','الكفرة','بني وليد'];
