import { useState, useEffect, useRef } from 'react'
import { useLiveShiftEngine, timeToSeconds, formatRemaining } from '../hooks/useLiveShiftEngine'
import { useShiftStore, type BreakType, type BreakSubtype } from '../stores/useShiftStore'
import { MotivationContext, MotivationLine, MotivationState, HIGHLIGHT } from '../utils/motivationEngine'
import { generateComment } from '../utils/commentEngine'
import TypewriterText from './TypewriterText'
import Timeline from './Timeline'

export function getColors(color: string) {
  const map: Record<string, { bg: string; text: string; border: string; glow: string; raw: string }> = {
    blue: {
      bg: 'bg-blue-500/10 hover:bg-blue-500/15',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      glow: 'shadow-blue-500/10',
      raw: 'bg-blue-500'
    },
    orange: {
      bg: 'bg-orange-500/10 hover:bg-orange-500/15',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      glow: 'shadow-orange-500/10',
      raw: 'bg-orange-500'
    },
    green: {
      bg: 'bg-emerald-500/10 hover:bg-emerald-500/15',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      glow: 'shadow-emerald-500/10',
      raw: 'bg-emerald-500'
    },
    emerald: {
      bg: 'bg-emerald-500/10 hover:bg-emerald-500/15',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      glow: 'shadow-emerald-500/10',
      raw: 'bg-emerald-500'
    },
    purple: {
      bg: 'bg-purple-500/10 hover:bg-purple-500/15',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      glow: 'shadow-purple-500/10',
      raw: 'bg-purple-500'
    },
    red: {
      bg: 'bg-rose-500/10 hover:bg-rose-500/15',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      glow: 'shadow-rose-500/10',
      raw: 'bg-rose-500'
    },
    amber: {
      bg: 'bg-amber-500/10 hover:bg-amber-500/15',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      glow: 'shadow-amber-500/10',
      raw: 'bg-amber-500'
    },
    indigo: {
      bg: 'bg-indigo-500/10 hover:bg-indigo-500/15',
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      glow: 'shadow-indigo-500/10',
      raw: 'bg-indigo-500'
    }
  }
  return map[color] || {
    bg: 'bg-slate-500/10 hover:bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    glow: 'shadow-slate-500/10',
    raw: 'bg-slate-500'
  }
}

// ── Pay modu mola kartı ────────────────────────────────────────────────────────
const BREAK_GROUPS: { type: BreakType; label: string; icon: string; items: { subtype: BreakSubtype; label: string; icon: string }[] }[] = [
  {
    type: 'short',
    label: 'Kısa Mola',
    icon: '🫖',
    items: [
      { subtype: 'cay', label: 'Çay', icon: '🍵' },
      { subtype: 'kahve', label: 'Kahve', icon: '☕' },
      { subtype: 'ihtiyac', label: 'İhtiyaç', icon: '🚻' }
    ]
  },
  {
    type: 'meal',
    label: 'Yemek Molası',
    icon: '🍽️',
    items: [
      { subtype: 'kahvalti', label: 'Kahvaltı', icon: '🍳' },
      { subtype: 'ogle', label: 'Öğle Yemeği', icon: '🍲' },
      { subtype: 'aksam', label: 'Akşam Yemeği', icon: '🍛' }
    ]
  }
]

const SUBTYPE_LABELS: Record<BreakSubtype, { label: string; icon: string }> = {
  cay: { label: 'Çay', icon: '🍵' },
  kahve: { label: 'Kahve', icon: '☕' },
  ihtiyac: { label: 'İhtiyaç Molası', icon: '🚻' },
  kahvalti: { label: 'Kahvaltı', icon: '🍳' },
  ogle: { label: 'Öğle Yemeği', icon: '🍲' },
  aksam: { label: 'Akşam Yemeği', icon: '🍛' }
}

function BreakCard() {
  const settings = useShiftStore((s) => s.settings)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const breakUsage = useShiftStore((s) => s.breakUsage)
  const startBreak = useShiftStore((s) => s.startBreak)
  const stopBreak = useShiftStore((s) => s.stopBreak)
  const resetBreaks = useShiftStore((s) => s.resetBreaks)

  // Two-stage inline confirm so a tiny reset button never wipes data by accident
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (!confirmReset) return
    const t = window.setTimeout(() => setConfirmReset(false), 2500)
    return () => window.clearTimeout(t)
  }, [confirmReset])

  // Live elapsed for the running break (ticks once a second)
  const [liveSeconds, setLiveSeconds] = useState(0)
  useEffect(() => {
    if (!runningBreak) { setLiveSeconds(0); return }
    const tick = () => setLiveSeconds(Math.max(0, Math.floor((Date.now() - runningBreak.startedAt) / 1000)))
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [runningBreak])

  const usedOf = (type: BreakType): number => {
    const subs = BREAK_GROUPS.find(g => g.type === type)!.items.map(i => i.subtype)
    return subs.reduce((a, s) => a + (breakUsage[s] ?? 0), 0)
  }

  return (
    <div className="fluent-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">🧘 MOLA</span>
        <button
          onClick={() => {
            if (confirmReset) {
              resetBreaks()
              setConfirmReset(false)
            } else {
              setConfirmReset(true)
            }
          }}
          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border transition-colors ${
            confirmReset
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
          title="Bugünün mola verilerini sıfırla"
        >
          {confirmReset ? 'Emin misin?' : '↺ Sıfırla'}
        </button>
      </div>

      {runningBreak && (
        <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${
          runningBreak.overBudget ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl flex-shrink-0">{SUBTYPE_LABELS[runningBreak.subtype].icon}</span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${runningBreak.overBudget ? 'text-rose-300' : 'text-emerald-300'}`}>
                {SUBTYPE_LABELS[runningBreak.subtype].label}
                {runningBreak.overBudget && ' · Bütçe doldu'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {runningBreak.overBudget ? 'Bu mola aşım olarak sayılıyor' : 'Bütçe içinde geçiyor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="font-mono font-semibold text-slate-200 text-lg">{formatRemaining(liveSeconds)}</span>
            <button
              onClick={stopBreak}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-lg font-semibold border border-white/5 transition-colors whitespace-nowrap"
            >
              Molayı Bitir
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {BREAK_GROUPS.map((g) => {
          const budget = g.type === 'short' ? settings.payShortBreakMin : settings.payMealBreakMin
          const used = usedOf(g.type)
          const over = used >= budget
          const left = Math.max(0, budget - used)
          return (
            <div key={g.type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-400">{g.icon} {g.label}</span>
                <span className={`text-[11px] font-mono ${over ? 'text-rose-400' : 'text-slate-500'}`}>
                  {used}/{budget} dk
                  <span className="ml-1 text-slate-600">· kalan {left}</span>
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5 mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-rose-500' : 'bg-emerald-500/70'}`}
                  style={{ width: `${budget > 0 ? Math.min(100, (used / budget) * 100) : 0}%` }}
                />
              </div>
              {!runningBreak && (
                <div className="flex gap-1.5 flex-wrap">
                  {g.items.map((it) => (
                    <button
                      key={it.subtype}
                      type="button"
                      onClick={() => startBreak(g.type, it.subtype, over)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:scale-[1.03] ${
                        over
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                          : 'bg-slate-800/80 border-white/10 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <span>{it.icon}</span>
                      <span>{it.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {over && (
                <p className="text-[9px] text-rose-400/80 mt-1.5">Bütçe doldu — bu bütçeden sonraki molalar aşım olarak sayılır.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Motivasyon mesajı ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    currentTime,
    currentTimeSecs,
    currentDateStr,
    activeTemplate,
    currentActivity,
    nextActivity,
    remainingTimeStr,
    activityProgress,
    shiftProgress,
    isShiftFinished,
    isBeforeShift,
    isOvertime,
    idleSeconds,
    idleLogSeconds,
    paybackSeconds,
    paybackRunning,
    workedSeconds,
    breakRunning,
    resetIdle,
    effectiveTime,
    timeOffset
  } = useLiveShiftEngine()

  const { completeShift, extendActiveShift, uncompleteShift, setTimeOffset, stopPayback, finishPayback, dailyLogs } = useShiftStore()
  const mode = useShiftStore((s) => s.settings.mode)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const stopBreak = useShiftStore((s) => s.stopBreak)

  const colors = currentActivity ? getColors(currentActivity.color) : null

  const [confirmReset, setConfirmReset] = useState(false)

  // Idle (aşım) state. In Pay mode an over-budget break (bütçesi dolmuşken
  // başlatılan mola) is NOT a real break — it counts as aşım while it runs.
  const overBudgetBreak = mode === 'pay' && !!runningBreak && runningBreak.overBudget
  const isIdle = !!activeTemplate && activeTemplate.activities.length > 0
    && ((!currentActivity && !isBeforeShift && !isShiftFinished) || overBudgetBreak)

  // Payback progress
  const paybackPercent = idleLogSeconds > 0
    ? Math.min(100, (Math.max(0, idleLogSeconds - idleSeconds) / idleLogSeconds) * 100)
    : 0

  // Day summary
  const sortedActivities = activeTemplate
    ? [...activeTemplate.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    : []
  const plannedMinutes = sortedActivities.reduce((s, a) => s + a.duration, 0)
  const shiftStartTime = sortedActivities[0]?.startTime ?? '--:--'
  const shiftEndTime = sortedActivities[sortedActivities.length - 1]?.endTime ?? '--:--'
  const isCurrentLast = !!currentActivity && sortedActivities.length > 0
    && sortedActivities[sortedActivities.length - 1].id === currentActivity.id

  const realSecs = timeToSeconds(currentTimeSecs)
  const shiftEndSecs = sortedActivities.length ? timeToSeconds(sortedActivities[sortedActivities.length - 1].endTime) : 0

  let status = { text: '—', cls: 'text-slate-400' }
  if (isShiftFinished) status = { text: 'Tamamlandı', cls: 'text-emerald-400' }
  else if (isBeforeShift) status = { text: 'Başlamadı', cls: 'text-slate-400' }
  else if (paybackRunning) status = { text: 'Payback', cls: 'text-amber-400' }
  else if (breakRunning && !overBudgetBreak) status = { text: 'Molada', cls: 'text-emerald-400' }
  else if (isIdle) status = { text: 'Aşımda', cls: 'text-amber-400' }
  else if (currentActivity) status = { text: 'Devam Ediyor', cls: 'text-blue-400' }
  else status = { text: '—', cls: 'text-slate-400' }

  const stats = [
    { key: 'start', label: 'Vardiya Başlangıcı', value: shiftStartTime, icon: '🌅', accent: false },
    { key: 'end', label: 'Vardiya Bitişi', value: shiftEndTime, icon: '🌇', accent: false },
    { key: 'planned', label: 'Planlanan Süre', value: formatRemaining(plannedMinutes * 60), icon: '📋', accent: false },
    { key: 'worked', label: 'Çalışılan Süre', value: formatRemaining(workedSeconds), icon: '💪', accent: false },
    { key: 'idle', label: 'Aşım (Günün Toplamı)', value: idleLogSeconds > 0 ? formatRemaining(idleLogSeconds) : '—', icon: '📈', accent: idleLogSeconds > 0 },
    { key: 'remaining', label: 'Kalan Süre', value: realSecs >= shiftEndSecs ? '—' : formatRemaining(Math.max(0, shiftEndSecs - realSecs)), icon: '⏱', accent: false }
  ]

  // Weekly heatmap — last 7 days from dailyLogs
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  })
  const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

  const handleCompleteShift = () => { completeShift(currentDateStr) }
  const handleUncompleteShift = () => { uncompleteShift(currentDateStr) }
  const handleExtendShift = () => { if (activeTemplate) extendActiveShift(activeTemplate.id, 30) }
  const handleGoToNextActivity = () => {
    if (!nextActivity) return
    const targetSecs = timeToSeconds(nextActivity.startTime)
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs))
  }
  const handleResetIdle = () => { setConfirmReset(false); resetIdle() }
  const handleCompleteCurrentActivity = () => {
    if (!currentActivity) return
    if (isCurrentLast) { completeShift(currentDateStr); return }
    const targetSecs = timeToSeconds(currentActivity.endTime)
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs))
  }

  // ── Motivation engine (context-aware "AI" one-liner) ────────────────────────
  // State classification mirrors the old getMotivationMessage priority order.
  const state: MotivationState = !activeTemplate || activeTemplate.activities.length === 0
    ? 'no-shift'
    : isShiftFinished ? 'finished'
    : paybackRunning ? 'payback'
    : isOvertime ? 'overtime'
    : isIdle ? 'gap'
    : isBeforeShift ? 'before'
    : 'active'

  const appUsage = useShiftStore((s) => s.appUsage)

  const buildCtx = (): MotivationContext => ({
    state,
    activityName: currentActivity?.name,
    activityIcon: currentActivity?.icon,
    nextLabel: nextActivity ? `${nextActivity.icon} ${nextActivity.name}` : '',
    isLastActivity: isCurrentLast,
    shiftProgress,
    shiftName: activeTemplate?.name,
    idleSeconds,
    workedSeconds,
    breakSeconds: (isIdle || isOvertime) ? idleSeconds : 0,
    hour: new Date().getHours(),
    currentApp: appUsage.current?.name,
    currentAppTitle: appUsage.current?.title,
    currentAppSeconds: appUsage.current?.seconds,
    topApps: appUsage.today.slice(0, 3)
  })

  const [motivation, setMotivation] = useState<MotivationLine>({ text: '—', color: 'text-slate-400', highlight: null })
  const lastLineRef = useRef<string>('')
  const recentLinesRef = useRef<string[]>([])
  const ctxRef = useRef<MotivationContext | null>(null)
  ctxRef.current = buildCtx()

  const applyLine = (line: MotivationLine) => {
    lastLineRef.current = line.text
    recentLinesRef.current = [...recentLinesRef.current, line.text].slice(-8)
    setMotivation(line)
  }

  // Regenerate the line whenever the shift state / activity actually changes.
  // (Avoids re-rolling on every tick since idleSeconds etc. change each second.)
  const stateKey = `${state}|${currentActivity?.id ?? ''}|${paybackRunning}`
  useEffect(() => {
    let cancelled = false
    const ctx = ctxRef.current ?? buildCtx()
    generateComment(ctx, { lastText: lastLineRef.current, recent: recentLinesRef.current }).then((line) => {
      if (!cancelled) applyLine(line)
    })
    return () => { cancelled = true }
  }, [stateKey])

  // "Fresh comment" scheduling — every 6-12 minutes a new observational one-liner
  // (app usage, break length, progress), restarting the countdown on state change.
  useEffect(() => {
    let timeout: number
    let cancelled = false
    const schedule = () => {
      const delay = (6 + Math.random() * 6) * 60 * 1000
      timeout = window.setTimeout(() => {
        const ctx = ctxRef.current ?? buildCtx()
        generateComment(ctx, { ambient: true, lastText: lastLineRef.current, recent: recentLinesRef.current }).then((line) => {
          if (!cancelled) applyLine(line)
        })
        schedule()
      }, delay)
    }
    schedule()
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [stateKey])

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-6.5rem)] overflow-y-auto pr-1">

      {/* Left Columns - Live Stats */}
      <div className="lg:col-span-2 flex flex-col gap-6">

        {/* Clock & Active Shift Summary */}
        <div className="fluent-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">SİSTEM SAATİ</span>
            <h2 className="text-5xl font-light text-white tracking-tight mt-1">
              {currentTime}
              <span className="text-xl font-light text-slate-500 ml-1">{currentTimeSecs.substring(5)}</span>
            </h2>
            {/* Motivasyon mesajı */}
            <p className="text-xs mt-2">
              <TypewriterText
                text={motivation.text}
                baseColor={motivation.color}
                highlight={motivation.highlight}
                highlightColor={HIGHLIGHT}
              />
            </p>
            {timeOffset !== 0 && (
              <button
                onClick={() => setTimeOffset(0)}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300 font-medium hover:bg-indigo-500/20 transition-colors"
                title="Canlı saate dön"
              >
                ↺ Geri alındı — <span className="font-mono font-bold">{effectiveTime}</span> · Canlıya Dön
              </button>
            )}
          </div>
          <div className="text-left md:text-right">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">AKTİF VARDİYA</span>
            <span className={`ml-2 text-[9px] font-bold px-2 py-0.5 rounded-full border align-middle ${
              mode === 'pay'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
            }`}>
              {mode === 'pay' ? 'PAY MODU' : 'MYSHIFT MODU'}
            </span>
            <h3 className="text-xl font-medium text-slate-200 mt-1">
              {activeTemplate ? activeTemplate.name : 'Vardiya Atanmadı'}
            </h3>
            {activeTemplate && activeTemplate.activities.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTemplate.activities.length} Aktivite • {activeTemplate.activities[0].startTime} - {activeTemplate.activities[activeTemplate.activities.length - 1].endTime}
              </p>
            )}
          </div>
        </div>

        {/* Current Activity / Overtime Box */}
        <div className="flex-1 fluent-card p-6 flex flex-col justify-between min-h-[300px]">
          {/* Top Info */}
          <div>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              {paybackRunning ? 'MEVCUT AKTİVİTE · PAYBACK' : 'MEVCUT AKTİVİTE'}
            </span>

            {!activeTemplate || activeTemplate.activities.length === 0 ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">🚫</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">Bugün İçin Vardiya Yok</h1>
                  <p className="text-sm text-slate-400 mt-1">Şu an serbestsiniz — bu süre aşım sayılmaz. Vardiya planınızı Vardiya Düzenleyici'den etkinleştirebilirsiniz.</p>
                </div>
              </div>
            ) : overBudgetBreak ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/10">⛔</div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-semibold text-rose-300">Bütçe Dışı Mola — Aşım Sayılıyor</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Mola bütçeniz doldu; bu mola çalışma süresinden düşülmez ve aşım olarak kaydedilir.
                    </p>
                    <p className="mt-2">
                      <span className="text-xs text-slate-400">Toplam Aşım:</span>{' '}
                      <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds)}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={stopBreak}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                  >
                    ⏹ Molayı Bitir
                  </button>
                </div>
              </div>
            ) : currentActivity ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className={`text-5xl p-4 rounded-2xl border ${colors?.bg} ${colors?.border} shadow-lg ${colors?.glow}`}>
                    {currentActivity.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-semibold text-white tracking-wide">{currentActivity.name}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Saat: <span className="text-slate-200 font-medium">{currentActivity.startTime} - {currentActivity.endTime}</span> ({currentActivity.duration} dk)
                    </p>
                    {currentActivity.notes && (
                      <div className="mt-3 p-3 bg-white/5 border border-white/5 rounded-lg max-w-lg">
                        <p className="text-xs text-slate-300 italic">{currentActivity.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleCompleteCurrentActivity}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-emerald-500/20"
                    title="Bu aktiviteyi bitir, sıradakine geç"
                  >
                    ✔ {isCurrentLast ? 'Vardiyayı Tamamla' : 'Aktiviteyi Tamamla / Geç'}
                  </button>
                </div>
              </div>
            ) : isBeforeShift ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">💤</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">Vardiya Henüz Başlamadı</h1>
                  <p className="text-sm text-slate-400 mt-1">Günün ilk aktivitesi başlamak üzere bekleniyor.</p>
                </div>
              </div>
            ) : isShiftFinished ? (
              <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/20">🎉</div>
                  <div>
                    <h1 className="text-2xl font-medium text-emerald-400">Bugünün Vardiyası Tamamlandı</h1>
                    <p className="text-sm text-slate-400 mt-1">Harika bir iş çıkardınız! Geri almak isterseniz aşağıdaki butonu kullanın.</p>
                  </div>
                </div>
                <button
                  onClick={handleUncompleteShift}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors self-end md:self-auto whitespace-nowrap"
                >
                  ↩ Geri Al / Devam Et
                </button>
              </div>
            ) : paybackRunning ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10 animate-pulse">⏳</div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-semibold text-white tracking-wide">Payback (Geri Ödeme)</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Aşım sürenizi çalışarak kapatıyorsunuz — payback sürerken aşım sayacı her saniye azalır.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                      <p>
                        <span className="text-xs text-slate-400">Kalan Aşım:</span>{' '}
                        <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds)}</span>
                      </p>
                      <p>
                        <span className="text-xs text-slate-400">Ödenen:</span>{' '}
                        <span className="font-mono font-semibold text-emerald-300 text-lg">{formatRemaining(paybackSeconds)}</span>
                      </p>
                    </div>
                    {idleLogSeconds > 0 && (
                      <div className="mt-3 max-w-md">
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${paybackPercent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Günün aşım logunun %{Math.round(paybackPercent)}'si ödendi
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={stopPayback}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                  >
                    ⏸ Durdur
                  </button>
                  <button
                    onClick={finishPayback}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-amber-500/20"
                  >
                    ✔ Payback'i Bitir / Vardiyayı Tamamla
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10">⏳</div>
                  <div>
                    <h1 className="text-2xl font-semibold text-amber-300">
                      {isOvertime ? 'Aşım: Vardiya Saati Doldu' : 'Aşım (Boşta)'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {isOvertime
                        ? 'Tüm aktiviteler bitti ancak vardiyayı tamamlamadınız. Geçen her dakika aşım olarak sayılıyor.'
                        : 'Şu anda boştasınız. Bir aktiviteye başlayana kadar geçen süre aşım olarak sayılıyor.'}
                    </p>
                    {nextActivity && !isOvertime && (
                      <p className="text-sm text-slate-400 mt-1">
                        Sıradaki: <span className="text-slate-200 font-medium">{nextActivity.icon} {nextActivity.name}</span> — {nextActivity.startTime}'de başlayacak
                      </p>
                    )}
                    <p className="mt-2">
                      <span className="text-xs text-slate-400">Toplam Aşım:</span>{' '}
                      <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds)}</span>
                    </p>
                  </div>
                </div>
                {isOvertime && (
                  <div className="mt-4 flex justify-end gap-2 flex-wrap">
                    {mode === 'myshift' && (
                      <button
                        onClick={handleExtendShift}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                      >
                        ⏱ 30 Dk Uzat
                      </button>
                    )}
                    <button
                      onClick={handleCompleteShift}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                    >
                      ✔ Vardiyayı Tamamla
                    </button>
                  </div>
                )}
                {nextActivity && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleGoToNextActivity}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-blue-500/20"
                    >
                      ▶ Sıradaki Aktiviteye Geç — {nextActivity.icon} {nextActivity.name} ({nextActivity.startTime})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress & Remaining Time */}
          {activeTemplate && activeTemplate.activities.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
                    {isIdle ? 'AŞIM SÜRESİ' : 'KALAN SÜRE'}
                  </span>
                  <span className={`text-4xl font-semibold tracking-tight ${
                    isIdle ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]' : colors?.text || 'text-slate-300'
                  }`}>
                    {isShiftFinished ? '00:00' : isIdle ? formatRemaining(idleSeconds) : remainingTimeStr}
                  </span>
                </div>
                {currentActivity && (
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Tamamlanma: %{Math.round(activityProgress)}
                  </span>
                )}
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
                <div
                  className={`h-full transition-all duration-1000 ease-out rounded-full ${
                    isIdle ? 'bg-amber-500' : colors?.raw || 'bg-slate-500'
                  }`}
                  style={{ width: `${isShiftFinished || isOvertime ? 100 : paybackRunning ? paybackPercent : currentActivity ? activityProgress : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Shift Progress + Next Activity */}
        {activeTemplate && activeTemplate.activities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="fluent-card p-6 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block">VARDİYA İLERLEMESİ</span>
                <span className="text-3xl font-light text-slate-200 mt-2 block">
                  %{Math.round(shiftProgress)} Tamamlandı
                </span>
              </div>
              <div className="mt-4">
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      isOvertime ? 'bg-rose-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                    }`}
                    style={{ width: `${shiftProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="fluent-card p-6 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block">SIRADAKİ AKTİVİTE</span>
                {nextActivity ? (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-3xl p-2 rounded-xl bg-white/5 border border-white/5">{nextActivity.icon}</span>
                    <div>
                      <h4 className="text-lg font-medium text-slate-200">{nextActivity.name}</h4>
                      <p className="text-xs text-slate-400">{nextActivity.startTime} - {nextActivity.endTime}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 mt-4">
                    {isShiftFinished || isOvertime ? 'Başka aktivite kalmadı.' : 'Vardiya Sonu'}
                  </p>
                )}
              </div>
              <div className="mt-2 text-right">
                {nextActivity && (
                  <span className="text-xs text-slate-500 font-mono">
                    ({nextActivity.startTime}'de başlayacak)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Breaks & Today's Timeline */}
      <div className="flex flex-col gap-6">
        {mode === 'pay' && <BreakCard />}
        <div className="fluent-card p-6 flex flex-col min-h-[450px]">
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-4">BUGÜNÜN ZAMAN ÇİZELGESİ</span>
          {/* flex-1 min-h-0 flex flex-col so Timeline's own scroll + undone button works */}
          <div className="flex-1 min-h-0 flex flex-col">
            <Timeline />
          </div>
        </div>
      </div>

      {/* Bottom Row - Day Summary */}
      {activeTemplate && sortedActivities.length > 0 && (
        <div className="lg:col-span-3 fluent-card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">📊 GÜN SONU ÖZETİ</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 font-medium hover:bg-amber-500/20 transition-colors"
              >
                ↺ Aşımı Sıfırla
              </button>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 ${status.cls}`}>
                {status.text}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {stats.map(s => (
              <div key={s.key} className="rounded-xl border border-white/5 bg-white/2 p-4">
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span>{s.icon}</span>
                  {s.label}
                </p>
                <p className={`text-xl font-semibold mt-1.5 font-mono ${s.accent ? 'text-rose-400' : 'text-slate-100'}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Heatmap */}
      {Object.keys(dailyLogs).length > 0 && (
        <div className="lg:col-span-3 fluent-card p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">📅 SON 7 GÜN</span>
            <span className="text-[10px] text-slate-600">Uygulama açıkken toplanan veriler</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((dateStr, i) => {
              const log = dailyLogs[dateStr]
              const worked = log?.workedSeconds ?? 0
              const idle = log?.idleSeconds ?? 0
              const brk = log?.breakSeconds ?? 0
              const completed = log?.completed ?? false
              const hasData = worked > 0 || idle > 0 || brk > 0
              const today = i === 6

              // Intensity: 0 = no data, 1 = <2h, 2 = 2-4h, 3 = 4-6h, 4 = >6h
              const workedH = worked / 3600
              const intensity = !hasData ? 0 : workedH < 2 ? 1 : workedH < 4 ? 2 : workedH < 6 ? 3 : 4
              const bgCls = intensity === 0 ? 'bg-slate-800/50' : intensity === 1 ? 'bg-blue-900/60' : intensity === 2 ? 'bg-blue-700/60' : intensity === 3 ? 'bg-blue-500/70' : 'bg-blue-400/80'

              const d = new Date(dateStr + 'T00:00:00')
              const dayLabel = DAY_SHORT[d.getDay()]

              return (
                <div key={dateStr} className="flex flex-col items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${today ? 'text-blue-400' : 'text-slate-600'}`}>{dayLabel}</span>
                  <div
                    title={hasData ? `Çalışılan: ${Math.floor(worked / 3600)}sa ${Math.floor((worked % 3600) / 60)}dk${idle > 0 ? ` · Aşım: ${Math.floor(idle / 3600)}sa ${Math.floor((idle % 3600) / 60)}dk` : ''}${brk > 0 ? ` · Mola: ${Math.floor(brk / 60)}dk` : ''}` : 'Veri yok'}
                    className={`w-full aspect-square rounded-lg border transition-all duration-200 flex items-center justify-center ${bgCls} ${today ? 'border-blue-500/50' : 'border-white/5'} ${completed ? 'ring-1 ring-emerald-500/50' : ''}`}
                  >
                    {completed && <span className="text-[8px] text-emerald-400">✓</span>}
                    {idle > 300 && !completed && hasData && <span className="text-[8px] text-amber-400">!</span>}
                  </div>
                  <span className={`text-[9px] font-mono ${hasData ? 'text-slate-400' : 'text-slate-700'}`}>
                    {hasData ? `${Math.floor(worked / 3600)}sa` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 justify-end">
            <span className="text-[9px] text-slate-600">Az</span>
            {[0, 1, 2, 3, 4].map(lvl => (
              <div key={lvl} className={`w-3 h-3 rounded-sm ${lvl === 0 ? 'bg-slate-800' : lvl === 1 ? 'bg-blue-900/60' : lvl === 2 ? 'bg-blue-700/60' : lvl === 3 ? 'bg-blue-500/70' : 'bg-blue-400/80'}`} />
            ))}
            <span className="text-[9px] text-slate-600">Çok</span>
            <span className="text-[9px] text-slate-600 ml-2">✓ = Tamamlandı</span>
            <span className="text-[9px] text-slate-600">! = Aşım var</span>
          </div>
        </div>
      )}
    </div>

    {/* Aşım reset confirmation */}
    {confirmReset && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={() => setConfirmReset(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-lg shadow-inner shadow-amber-500/10">⏳</div>
              <h3 className="text-lg font-semibold text-white">Aşımı Sıfırla</h3>
            </div>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">
              Bugünkü anlık aşım sayacı <span className="text-slate-200 font-medium">sıfırlanacak</span>. Aşım sayacı her günün ilk aktivitesi başladığında zaten otomatik sıfırlanır. Yine de sıfırlamak istediğinize emin misiniz?
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
            <button
              onClick={() => setConfirmReset(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
            >
              Vazgeç
            </button>
            <button
              onClick={handleResetIdle}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.03] active:scale-[0.98]"
            >
              ✔ Evet, Sıfırla
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
