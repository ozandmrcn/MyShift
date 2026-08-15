// ─── MyShift Comment Engine (offline) ────────────────────────────────────────
// The built-in generative engine that powers the one-liner under the clock.
// It never repeats: lines are composed combinatorially from openers + observations
// + closers (and the "used" set), so a single session produces a stream of fresh
// cold, dark, sarcastic Turkish lines. When the user enables an LLM provider,
// this engine acts as the always-available fallback.
//
// Colors are deliberately cold (slate / indigo / sky / cyan / blue / violet);
// occasionally one word in the line is marked for a contrasting cold highlight —
// the offline engine decides it, the AI decides it when an LLM is configured.

export type MotivationState = 'no-shift' | 'before' | 'active' | 'gap' | 'payback' | 'overtime' | 'finished'

export interface MotivationContext {
  state: MotivationState
  activityName?: string
  activityIcon?: string
  nextLabel?: string // "icon name" of the upcoming activity (empty if none)
  isLastActivity: boolean
  shiftProgress: number // 0-100
  shiftName?: string
  idleSeconds: number // net aşım (or overtime) in seconds
  workedSeconds: number
  breakSeconds: number // seconds spent in the current break / aşım session
  hour: number
  currentApp?: string | null
  currentAppTitle?: string | null
  currentAppSeconds?: number
  topApps?: { name: string; seconds: number }[]
}

export interface MotivationLine {
  text: string
  color: string
  highlight: string | null // a substring of `text` rendered in a contrasting cold color
}

const APP_NAMES: Record<string, string> = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', opera: 'Opera', brave: 'Brave', vivaldi: 'Vivaldi',
  code: 'VS Code', cursor: 'Cursor', notepad: 'Notepad', winword: 'Word', word: 'Word',
  excel: 'Excel', powerpoint: 'PowerPoint', outlook: 'Outlook', teams: 'Teams', slack: 'Slack',
  discord: 'Discord', spotify: 'Spotify', youtube: 'YouTube', twitch: 'Twitch', steam: 'Steam',
  'epicgameslauncher': 'Epic Games', telegram: 'Telegram', whatsapp: 'WhatsApp',
  figma: 'Figma', photoshop: 'Photoshop', illustrator: 'Illustrator',
  explorer: 'Dosya Gezgini', 'notepad++': 'Notepad++', paint: 'Paint',
  calculator: 'Hesap Makinesi', powershell: 'PowerShell', 'windows-terminal': 'Windows Terminal',
  taskmgr: 'Görev Yöneticisi', cmd: 'Komut İstemi', lockapp: 'Kilit Ekranı'
}

export function friendlyAppName(raw: string): string {
  const lower = raw.toLowerCase().trim()
  if (APP_NAMES[lower]) return APP_NAMES[lower]
  const cleaned = lower.replace(/[^a-z0-9]/gi, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function fmtDur(totalSec: number): string {
  if (totalSec <= 0) return '0 dk'
  const mins = Math.round(totalSec / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

function pickFrom<T>(pool: T[], avoid: Set<string>, key?: (x: T) => string): T {
  const candidates = pool.filter(item => !avoid.has(key ? key(item) : String(item)))
  const arr = candidates.length ? candidates : pool
  return arr[Math.floor(Math.random() * arr.length)]
}

type Vars = Record<string, string>

function fill(text: string, v: Vars): string {
  return text
    .replace(/\{(\w+)\}/g, (_m, key) => v[key] ?? '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}

function buildVars(ctx: MotivationContext): Vars {
  const act = ctx.activityName ? `${ctx.activityIcon ?? ''} ${ctx.activityName}`.trim() : ''
  return {
    act: act || 'aktivite',
    icon: ctx.activityIcon ?? '',
    next: ctx.nextLabel || 'sıradaki aktivite',
    shift: ctx.shiftName || 'vardiyan',
    pct: `${Math.round(ctx.shiftProgress)}`,
    worked: fmtDur(ctx.workedSeconds),
    break: fmtDur(ctx.breakSeconds),
    idle: fmtDur(ctx.idleSeconds),
    hour: `${ctx.hour}`
  }
}

// ─── Muted, warm-neutral palette ─────────────────────────────────────────────
// No blues (no blue/sky/cyan/indigo). Colors follow the user's mood/state:
//   neutral  → slate          (no shift / finished)
//   waiting  → amber          (before the shift starts)
//   in-flow  → emerald        (actively working)
//   break    → orange         (gap / mola)
//   payback  → rose           (overdue / aşım telafisi)
//   overtime → violet         (overrun / tired & grumpy)
// Every tone is a soft -300 pastel so it stays "kapalı" against the dark UI.

const STATE_COLORS: Record<MotivationState, string> = {
  'no-shift': 'text-slate-400',
  before: 'text-amber-300',
  active: 'text-emerald-300',
  gap: 'text-orange-300',
  payback: 'text-rose-300',
  overtime: 'text-violet-300',
  finished: 'text-slate-400'
}

export function getMoodColor(state: MotivationState): string {
  return STATE_COLORS[state] ?? 'text-slate-400'
}

const AMBIENT_COLORS = ['text-slate-400', 'text-stone-400', 'text-amber-300', 'text-orange-300', 'text-emerald-300', 'text-rose-300', 'text-violet-300']
const HIGHLIGHT_COLOR = 'text-violet-300'

// ─── Combinatorial line pools ────────────────────────────────────────────────

interface SlotPool {
  openers: string[]
  obs: { text: string; when?: (ctx: MotivationContext) => boolean }[]
  closers: string[]
}

const NO_SHIFT: SlotPool = {
  openers: [
    'Bugün için plan yok.',
    'Vardiya atanmadı.',
    'Bugün boş gün.',
    'Takvim bomboş.',
    'Bugün için hiçbir şey ayrılmamış.'
  ],
  obs: [
    { text: ' Bu "özgürlük" seni yine ertelemeye götürecek.' },
    { text: ' Hiçbir şey yapmamak için dolu bir günün var.' },
    { text: ' Boş bir gün, boş bir insan — kusura bakma, açık söylüyorum.' },
    { text: ' Zaman akıyor, sen beklemede.' },
    { text: ' Bu boşluğu doldurmak plan gerektirmiyor, sadece biraz niyet — onu da bekleme.' }
  ],
  closers: [
    '',
    ' Neyse, kendini kandırmak da bir iş.',
    ' Benden söylemesi.',
    ' Ama sen de biliyorsun nasıl geçeceğini.'
  ]
}

const BEFORE: SlotPool = {
  openers: [
    'Vardiya henüz başlamadı.',
    '{shift} kapıda.',
    'Resmi olarak "henüz değil" modundasın.',
    'Günaydın — evet, ben de inanmıyorum.',
    '{shift} başlamak üzere.'
  ],
  obs: [
    { text: ' Rahatla: bu, bugünün son rahat anlarından biri.' },
    { text: ' O dakikalar tek tek eksiliyor, bir daha gelmeyecek.' },
    { text: ' Kahveni iç, pozisyonunu al — geri dönüş olmayacak.' },
    { text: ' Senin hazır olup olmaman da zaten pek fark etmiyor.' },
    { text: ' Bu rahatlığın tadı çıkarılabilecek son an.' }
  ],
  closers: [
    '',
    ' Sonra pişman olacak kadar geç olacak.',
    ' Benden söylemesi.',
    ' O dakikalar geri gelmez, dikkatli kullan.'
  ]
}

const ACTIVE: SlotPool = {
  openers: [
    '{act} zamanı.',
    '{act} sürüyor.',
    '{act} modu aktif.',
    '{act} içindesin.',
    '{act} buna dahil.'
  ],
  obs: [
    { text: ' Şu ana kadar {worked} yazdım; bu sayı artacak, istesen de istemesen de.' },
    { text: ' Zaman durmuyor, sen de duramazsın.' },
    { text: ' Gözün nerede, aklın nerede, internetin nerede — belli değil.' },
    { text: ' Geri dönüş yok.' },
    { text: ' Bu saati geri alamayacaksın.' },
    { text: ' İyi başlangıçlar genelde böyle mahvolur.', when: (c) => c.shiftProgress <= 25 },
    { text: ' Vardiyanın %{pct} geride kaldı.' },
    { text: ' İşin yarısı bitti bile.', when: (c) => c.shiftProgress > 50 },
    { text: ' Son düzlük.', when: (c) => c.isLastActivity },
    { text: ' Son çeyrekteyiz.', when: (c) => c.shiftProgress > 75 },
    { text: ' Vardiyanın %{pct} geride; bugünlük idare eder.', when: (c) => c.shiftProgress > 25 && c.shiftProgress <= 40 }
  ],
  closers: [
    '',
    ' Kendini zorlaman gereken nokta burası.',
    ' Ya da boşa harcadıklarının bedelini sonra öde.',
    ' Bari işi bitir.',
    ' Durursan kalan süre yüzüne bakacak.',
    ' Ödül falan bekleme.',
    ' Tutarlılık diye bir şey biliyor musun, görelim.'
  ]
}

const GAP: SlotPool = {
  openers: [
    'Molaya geldik, boş zamana (tıpkı bundan önceki tüm hayatın gibi)',
    'Ara verdin.',
    'Boş zamandayız.',
    'Mola bölgesindesin.',
    'Sıralar bitti, boşluk kaldı.'
  ],
  obs: [
    { text: ' {break} boş zaman yazdım; buna "dinlenme" demek de masum bir kendini kandırma.' },
    { text: ' Bu ara aşım sayılıyor; sayaç işliyor ve seni izliyor.' },
    { text: ' {next} seni bekleyen bir sayaç var.' },
    { text: ' {break} geçti, haberin olsun.' },
    { text: ' Vardiya durdu ama sayaç çalışıyor.' }
  ],
  closers: [
    '',
    ' Geri dönmezsen bu rakam geçmişine sadık kalır.',
    ' İtiraz edemezsin.',
    ' Döndüğünde aynı isteği göreceğim, şüphem yok.',
    ' Nereye gidersen git, sayaç peşinden gelir.'
  ]
}

const PAYBACK: SlotPool = {
  openers: [
    'Aşımı kapatıyorsun.',
    'Borç ödeme modu aktif.',
    'Payback çalışıyor.',
    'Aşım defterini kapatıyorsun.'
  ],
  obs: [
    { text: ' Kalan aşım: {idle}.' },
    { text: ' Sayaç her saniye azalıyor.' },
    { text: ' Kendini affettirmeye çalışıyorsun, belli oluyor.' },
    { text: ' Bu fedakârlık tek seferlik olur umarım — biliyorsun, olmayacak.' }
  ],
  closers: [
    '',
    ' İyi bir karar — bu aşımın daha da uzaması kimsenin işine yaramazdı.',
    ' Borç ödenmeyi sever; sen severek ödemezsin, yine de ödersin.'
  ]
}

const OVERTIME: SlotPool = {
  openers: [
    'Saat doldu.',
    'Zaman aşımına girdin.',
    'Saat doldu ve hâlâ buradasın.'
  ],
  obs: [
    { text: ' {idle} aşımdasın.' },
    { text: ' Fedakârlık mı, plansızlık mı — ikisi de aynı kapıya çıkar.' },
    { text: ' Vardiyayı tamamlamazsan bu rakam yarın da seninle olacak.' },
    { text: ' "Bitirmem" dersen yarın daha da kötü olur.' }
  ],
  closers: [
    '',
    ' Tamamlama gücü sende — sonra bahanelerden kimse inanmayacak.',
    ' Geç kalmanın bahanesi olmaz.'
  ]
}

const FINISHED: SlotPool = {
  openers: [
    'Bugün bitti.',
    'Vardiya tamamlandı.',
    'Tüm aktiviteler bitti.',
    'Listeyi süpürdün.'
  ],
  obs: [
    { text: ' {worked} emek yazdım.' },
    { text: ' Kimse alkışlamayacak, o yüzden alkışı kendin tut.' },
    { text: ' Yarın yine gelecek, o yüzden bu anın tadını çıkar.' }
  ],
  closers: [
    '',
    ' Dinlenme ruhsatın hazır, kullanırken düşünme.',
    ' Koltuğa kurul — hak ettiğini düşünmekte özgürsün.',
    ' Bari doğru olsun, kimse kontrol etmeyecek zaten.'
  ]
}

const POOLS: Record<MotivationState, SlotPool> = {
  'no-shift': NO_SHIFT,
  before: BEFORE,
  active: ACTIVE,
  gap: GAP,
  payback: PAYBACK,
  overtime: OVERTIME,
  finished: FINISHED
}

// ─── Composition ─────────────────────────────────────────────────────────────

// Session-scoped "used" set: once a state's combos are exhausted it resets, so
// within any realistic session the same sentence essentially never appears twice.
const usedSet = new Set<string>()

function composeLine(pool: SlotPool, ctx: MotivationContext, avoid: Set<string>, v: Vars): string {
  const opener = pickFrom(pool.openers, avoid)
  // ~1 in 5 times emit the opener alone — it reads as a complete dry remark.
  if (Math.random() < 0.2) return fill(opener, v)

  const obsPool = pool.obs.filter(o => !o.when || o.when(ctx))
  const obsList = obsPool.length ? obsPool : pool.obs
  const obs = pickFrom(obsList.map(o => o.text), avoid)

  let line = `${opener}${obs}`
  if (Math.random() < 0.55) {
    const closer = pickFrom(pool.closers, avoid)
    if (closer) line += closer
  }
  return fill(line, v)
}

// ─── Highlight selection ─────────────────────────────────────────────────────

function pickHighlight(text: string, ctx: MotivationContext): string | null {
  // Only sometimes — "bazı kelimeler bazen farklı renk".
  if (Math.random() >= 0.45) return null
  const candidates: string[] = []
  if (ctx.currentApp) {
    const name = friendlyAppName(ctx.currentApp)
    if (text.includes(name)) candidates.push(name)
  }
  if (ctx.activityName && text.includes(ctx.activityName)) candidates.push(ctx.activityName)
  if (candidates.length === 0) {
    const words = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]{5,}/g) || []
    const meaningful = words.filter(w => !['undefined', 'vardiya', 'zaman', 'sıradaki', 'bugünkü', 'biliyorsun'].includes(w.toLowerCase()))
    if (meaningful.length) candidates.push(meaningful[Math.floor(Math.random() * meaningful.length)])
  }
  if (!candidates.length) return null
  const token = candidates[Math.floor(Math.random() * candidates.length)]
  return text.includes(token) ? token : null
}

// ─── Ambient ("fresh comment") pools ─────────────────────────────────────────

function ambientPool(ctx: MotivationContext): { line: string; weight: number }[] {
  const v = buildVars(ctx)
  const app = ctx.currentApp ? friendlyAppName(ctx.currentApp) : ''
  const appSec = ctx.currentAppSeconds ?? 0
  const pool: { line: string; weight: number }[] = []

  if (app && appSec >= 120) {
    const starters = [
      `Şu an ${app} açık ve ${fmtDur(appSec)} oldu.`,
      `${fmtDur(appSec)}dır ${app} içindesin.`,
      `${app} seni meşgul ediyor.`
    ]
    const tails = [
      ' Ben sayıyorum, sen kendini avut.',
      ` {act} seni bekliyor olabilir — beklemeye alışık.`,
      ` {worked} emek verdin; dikkat et, hepsi bu ekrana gömülmesin.`,
      ' Hepsi plan dahilinde miydi, diye soruyorum sadece.'
    ]
    for (const s of starters) for (const t of tails) pool.push({ line: fill(s + t, v), weight: 1 })
  }

  if (ctx.state === 'gap' || ctx.state === 'overtime') {
    if (ctx.breakSeconds > 120) {
      pool.push({ line: fill(`Burası aşım bölgesi: {idle}. {next} dönmek hâlâ serbest — ama karar sende değil gibi.`, v), weight: 1 })
    }
    pool.push({ line: fill(`Vardiya durdu, sayaç çalışıyor. Saat {hour}:00 — nereye gidersen git, sayaç peşinden gelir.`, v), weight: 1 })
    pool.push({ line: fill(`Aşım: {idle}. İzliyorum, toparlan.`, v), weight: 1 })
  }

  if (ctx.state === 'active') {
    pool.push({ line: fill(`Vardiyan %{pct} seviyesinde. Şu an önemli olan tek şey {act}, gerisi boş vaat.`, v), weight: 1 })
    pool.push({ line: fill(`{worked} çalıştın. {act} ile devam — durursan kalan süre yüzüne bakacak.`, v), weight: 1 })
  }

  if (ctx.hour < 11) pool.push({ line: "Sabah bu tazelik... saat 15:00'te aynı yüzü göreceğimizden şüpheliyim.", weight: 1 })
  if (ctx.hour >= 17 && ctx.hour < 20) pool.push({ line: fill(`Günün sonuna geldik, {worked} yazdım bugüne. Fena değil — ama "iyi" demeyeceğim.`, v), weight: 1 })
  if (ctx.hour >= 20) pool.push({ line: fill(`Saat {hour}:00 oldu ve hâlâ buradasın. İnat mı, sevda mı, plansızlık mı — bilemedim.`, v), weight: 1 })

  if (pool.length === 0) {
    pool.push({ line: fill(`Saat {hour}:00, durum: {worked} emek. Bugün kendinden memnun musun? Cevap vermene gerek yok.`, v), weight: 1 })
    pool.push({ line: fill(`Sessizlik içindeyiz. {worked} yazdım, gerisi sana kalmış.`, v), weight: 1 })
  }

  return pool
}

// ─── Public API ──────────────────────────────────────────────────────────────

function buildAvoid(lastText?: string, recent?: string[]): Set<string> {
  const set = new Set<string>()
  if (lastText) set.add(lastText)
  for (const t of recent ?? []) if (t) set.add(t)
  return set
}

export function generateMotivationLine(ctx: MotivationContext, lastText?: string, recent?: string[]): MotivationLine {
  const v = buildVars(ctx)
  const pool = POOLS[ctx.state] ?? NO_SHIFT
  const avoid = buildAvoid(lastText, recent)
  const text = composeLine(pool, ctx, avoid, v)

  // Track used sentences; reset a state's history when it is fully exhausted.
  usedSet.add(text)
  if (usedSet.size > 400) usedSet.clear()

  return { text, color: STATE_COLORS[ctx.state] ?? 'text-slate-400', highlight: pickHighlight(text, ctx) }
}

export function generateAmbientLine(ctx: MotivationContext, lastText?: string, recent?: string[]): MotivationLine {
  const avoid = buildAvoid(lastText, recent)
  const weighted = ambientPool(ctx)
  const candidates = weighted.filter(w => !avoid.has(w.line))
  const chosen = (candidates.length ? candidates : weighted)[Math.floor(Math.random() * (candidates.length ? candidates : weighted).length)]
  const text = chosen.line
  const color = AMBIENT_COLORS[Math.floor(Math.random() * AMBIENT_COLORS.length)]
  return { text, color, highlight: pickHighlight(text, ctx) }
}

export const COLD_COLORS = ['text-slate-400', 'text-stone-400', 'text-amber-300', 'text-orange-300', 'text-emerald-300', 'text-rose-300', 'text-violet-300']
export const HIGHLIGHT = HIGHLIGHT_COLOR
