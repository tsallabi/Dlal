// حالة دفعة الإثراء الجارية في إضافة المتصفح — تغذّي شريط التقدّم في /admin/crawler ونافذة الإضافة.
import { hasCJK } from './translate';
// المصدر صفّ crawler_live الذي يُحدَّث مع كل منتج تقرؤه الإضافة (انظر liveStep في routes/api.ts).

// SQLite يكتب «YYYY-MM-DD HH:MM:SS» بتوقيت غرينتش بلا علامة المنطقة؛ والإضافة تكتب ISO
const ts = (s?: string | null) => (s ? new Date(/[TZ]/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() : NaN);
const secsAgo = (s?: string | null, now = Date.now()) => { const t = ts(s); return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null; };

// نبضة كل ١٥–٢٥ ثانية أثناء الدفعة (إيقاع بشري بين الصفحات). ثلاث دقائق بلا نبضة = توقفت.
export const STALL_S = 180;

export type LiveState = {
  state: 'running' | 'stalled' | 'finished' | 'idle';
  status: string;
  total: number; done: number; pct: number;
  gain: { img: number; vars: number; wt: number }; gone: number;
  // اكتشاف مجاني (1.7.0+): صفحات قُرئت، كم منها حمل روابط منتجات أخرى، كم رابطًا جديدًا، كم منتجًا أُضيف
  disc: { pages: number; linked: number; links: number; added: number };
  last: { title: string; slug: string | null; offer: string } | null;
  lastAgoS: number | null; startedAgoS: number | null; finishedAgoS: number | null;
  etaMin: number | null;
  online: boolean; seenAgoS: number | null; version: string;
  next: string;
};

export async function liveState(db: D1Database): Promise<LiveState> {
  const now = Date.now();
  const [l, job, seen, ver] = await Promise.all([
    db.prepare('SELECT * FROM crawler_live WHERE id=1').first<any>(),
    db.prepare("SELECT active,run_now,last_run_at,interval_hours,cooldown_until FROM crawl_jobs WHERE type='stock' AND runner IN ('any','extension') ORDER BY active DESC,id LIMIT 1").first<any>(),
    db.prepare("SELECT value FROM settings WHERE key='crawler_last_seen'").first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key='crawler_version'").first<{ value: string }>(),
  ]);
  const total = l?.total ?? 0, done = l?.done ?? 0;
  const lastAgoS = secsAgo(l?.last_at, now), startedAgoS = secsAgo(l?.started_at, now), finishedAgoS = secsAgo(l?.finished_at, now);
  const seenAgoS = secsAgo(seen?.value, now);
  // الإضافة تسأل الخادم كل ١٥ دقيقة؛ وأثناء الدفعة لا تسأل عن المهام بل تمرّ بالطابور والاستيراد
  const online = (seenAgoS !== null && seenAgoS < 40 * 60) || (lastAgoS !== null && lastAgoS < STALL_S);
  let state: LiveState['state'] = 'idle';
  if (l?.status === 'running') state = lastAgoS !== null && lastAgoS < STALL_S ? 'running' : 'stalled';
  else if (l?.started_at) state = 'finished';

  let last: LiveState['last'] = null;
  if (l?.last_offer) {
    const p = await db.prepare("SELECT title_ar,slug,status FROM products WHERE source='1688' AND source_offer_id=?").bind(l.last_offer).first<any>();
    // مسودة لم تكتمل ترجمتها عنوانها صيني: صاحب المشروع لا يقرؤه، فنقول ذلك بدل عرضه
    const t = p?.title_ar && !hasCJK(p.title_ar) ? p.title_ar : `منتج رقم ${l.last_offer} (عنوانه قيد الترجمة)`;
    // الرابط لما على الرف فقط: المسودة والمخفي لا يفتحان في المتجر
    last = { title: t, slug: p?.status === 'active' ? p.slug : null, offer: l.last_offer };
  }
  // المتبقي بمعدّل هذه الدفعة نفسها (الإيقاع البشري يختلف من جهاز لآخر)
  const spent = startedAgoS !== null && lastAgoS !== null ? startedAgoS - lastAgoS : 0;
  const etaMin = state === 'running' && done > 0 && total > done ? Math.max(1, Math.round(((spent / done) * (total - done)) / 60)) : null;

  // متى الدفعة التالية؟ نفس شرط الاستحقاق في /api/crawl/jobs
  let next = '';
  if (!job) next = 'لا توجد مهمة «فحص المخزون والأسعار» للإضافة.';
  else if (!job.active) next = 'مهمة «فحص المخزون والأسعار» موقوفة — اضغط «تفعيل» في جدول المهام.';
  else if (job.cooldown_until && ts(job.cooldown_until) > now) next = `موقوفة بعد كابتشا — تُستأنف بعد ~${Math.ceil((ts(job.cooldown_until) - now) / 60000)} دقيقة.`;
  else if (job.run_now) next = 'مطلوبة الآن — تبدأ خلال ١٥ دقيقة على الأكثر (الإضافة تسأل الخادم كل ١٥ دقيقة).';
  else {
    const due = ts(job.last_run_at) + (job.interval_hours || 1) * 3600000;
    const m = Number.isFinite(due) ? Math.ceil((due - now) / 60000) : 0;
    next = m > 0 ? `الدفعة التالية بعد ~${m} دقيقة، ثم تبدأها الإضافة في أول فحص لها (كل ١٥ دقيقة).` : 'مستحقة الآن — تبدأ خلال ١٥ دقيقة على الأكثر.';
  }
  return {
    state, status: l?.status ?? 'idle', total, done, pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
    gain: { img: l?.gain_img ?? 0, vars: l?.gain_var ?? 0, wt: l?.gain_wt ?? 0 }, gone: l?.gone ?? 0,
    disc: { pages: l?.pages_read ?? 0, linked: l?.pages_linked ?? 0, links: l?.links_new ?? 0, added: l?.gain_new ?? 0 },
    last, lastAgoS, startedAgoS, finishedAgoS, etaMin, online, seenAgoS, version: ver?.value ?? '', next,
  };
}

// «قبل ٤٠ ثانية» / «قبل ٧ دقائق» — عربية بسيطة بلا مكتبة
export function agoAr(s: number | null) {
  if (s === null) return '—';
  if (s < 60) return `قبل ${s} ثانية`;
  const m = Math.round(s / 60); if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60); if (h < 48) return `قبل ${h} ساعة`;
  return `قبل ${Math.round(h / 24)} يوم`;
}
