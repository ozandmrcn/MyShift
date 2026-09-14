import { useState, useEffect, useRef } from 'react'
import { useLiveShiftEngine, timeToSeconds, formatRemaining } from '../hooks/useLiveShiftEngine'
import { useShiftStore, type BreakType, type BreakSubtype } from '../stores/useShiftStore'
import { MotivationContext, MotivationLine, MotivationState, HIGHLIGHT } from '../utils/motivationEngine'
import { generateComment } from '../utils/commentEngine'
import { useT, type TKey } from '../i18n/useT'
import { getWeekdayShort } from '../utils/dateConstants'
import TypewriterText from './TypewriterText'
import Timeline from './Timeline'
import WeatherWidget from './WeatherWidget'

export function getColors(color: string) {
  const map: Record<string, { bg: string; text: string; border: string; glow: string; raw: string }> = {
    blue: {
      bg: 'accent-soft accent-soft-hover',
      text: 'accent-text',
      border: 'accent-border-soft',
      glow: 'accent-glow-lg',
      raw: 'accent-solid'
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
function getBreakGroups(t: (key: TKey, vars?: Record<string, string | number>) => string) {
  return [
    {
      type: 'short' as BreakType,
      label: t('todaySummaryUI.typeShort'),
      icon: '🫖',
      items: [
        { subtype: 'cay' as BreakSubtype, label: t('todaySummaryUI.subtypeCay'), icon: '🍵' },
        { subtype: 'kahve' as BreakSubtype, label: t('todaySummaryUI.subtypeKahve'), icon: '☕' },
        { subtype: 'ihtiyac' as BreakSubtype, label: t('todaySummaryUI.subtypeIhtiyac'), icon: '🚻' }
      ]
    },
    {
      type: 'meal' as BreakType,
      label: t('todaySummaryUI.typeMeal'),
      icon: '🍽️',
      items: [
        { subtype: 'kahvalti' as BreakSubtype, label: t('todaySummaryUI.subtypeKahvalti'), icon: '🍳' },
        { subtype: 'ogle' as BreakSubtype, label: t('todaySummaryUI.subtypeOgle'), icon: '🍲' },
        { subtype: 'aksam' as BreakSubtype, label: t('todaySummaryUI.subtypeAksam'), icon: '🍛' }
      ]
    }
  ]
}

function getSubtypeLabels(t: (key: TKey, vars?: Record<string, string | number>) => string): Record<BreakSubtype, { label: string; icon: string }> {
  return {
    cay: { label: t('todaySummaryUI.subtypeCay'), icon: '🍵' },
    kahve: { label: t('todaySummaryUI.subtypeKahve'), icon: '☕' },
    ihtiyac: { label: t('todaySummaryUI.subtypeIhtiyac'), icon: '🚻' },
    kahvalti: { label: t('todaySummaryUI.subtypeKahvalti'), icon: '🍳' },
    ogle: { label: t('todaySummaryUI.subtypeOgle'), icon: '🍲' },
    aksam: { label: t('todaySummaryUI.subtypeAksam'), icon: '🍛' }
  }
}

// HH:MM from a timestamp — for "Son Mola saat kaçta" on the break card
function msToClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function BreakCard() {
  const { t } = useT()
  const settings = useShiftStore((s) => s.settings)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const breakUsage = useShiftStore((s) => s.breakUsage)
  const breakLog = useShiftStore((s) => s.breakLog)
  const startBreak = useShiftStore((s) => s.startBreak)
  const stopBreak = useShiftStore((s) => s.stopBreak)
  const resetBreaks = useShiftStore((s) => s.resetBreaks)
  const payPaused = useShiftStore((s) => s.payPaused)

  const breakGroups = getBreakGroups(t)
  const subtypeLabels = getSubtypeLabels(t)

  // Two-stage inline confirm so a tiny reset button never wipes data by accident
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (!confirmReset) return
    const timer = window.setTimeout(() => setConfirmReset(false), 2500)
    return () => window.clearTimeout(timer)
  }, [confirmReset])

  // Live elapsed for the running break (ticks once a second)
  const [liveSeconds, setLiveSeconds] = useState(0)
  useEffect(() => {
    if (!runningBreak) { setLiveSeconds(0); return }
    const tick = () => setLiveSeconds(Math.max(0, Math.floor((Date.now() - runningBreak.startedAt) / 1000)))
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [runningBreak])

  const usedOf = (type: BreakType): number => {
    const subs = breakGroups.find(g => g.type === type)!.items.map(i => i.subtype)
    return subs.reduce((a, s) => a + (breakUsage[s] ?? 0), 0)
  }

  return (
    <div className="fluent-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">🧘 {t('dashboardUI.breakCardTitle')}</span>
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
          title={t('dashboardUI.resetBreakTitle')}
        >
          {confirmReset ? t('dashboardUI.confirmReset') : t('dashboardUI.resetBtn')}
        </button>
      </div>

      {runningBreak && (
        <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${
          runningBreak.overBudget ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl flex-shrink-0">{subtypeLabels[runningBreak.subtype].icon}</span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${runningBreak.overBudget ? 'text-rose-300' : 'text-emerald-300'}`}>
                {subtypeLabels[runningBreak.subtype].label}
                {runningBreak.overBudget && ` · ${t('dashboardUI.budgetFull')}`}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {runningBreak.overBudget ? t('dashboardUI.breakOverBudget') : t('dashboardUI.breakInBudget')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="font-mono font-semibold text-slate-200 text-lg">{formatRemaining(liveSeconds)}</span>
            <button
              onClick={stopBreak}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-lg font-semibold border border-white/5 transition-colors whitespace-nowrap"
            >
              {t('dashboardUI.endBreak')}
            </button>
          </div>
        </div>
      )}

      {breakLog.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 bg-white/3 border border-white/5 rounded-lg px-3 py-2">
          <span className="text-slate-400 font-medium">{t('dashboardUI.lastBreak')}:</span>
          <span>{subtypeLabels[breakLog[breakLog.length - 1].subtype].icon} {subtypeLabels[breakLog[breakLog.length - 1].subtype].label}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono">{msToClock(breakLog[breakLog.length - 1].startedAt)}</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono font-semibold text-slate-300">{formatRemaining(breakLog[breakLog.length - 1].durationSec)}</span>
          {breakLog[breakLog.length - 1].overBudget && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">{t('dashboardUI.overtimeBadge')}</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {breakGroups.map((g) => {
          const budget = g.type === 'short' ? settings.payShortBreakMin : settings.payMealBreakMin
          const used = usedOf(g.type)
          const over = used >= budget
          const left = Math.max(0, budget - used)
          return (
            <div key={g.type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-slate-400">{g.icon} {g.label}</span>
                <span className={`text-[11px] font-mono ${over ? 'text-rose-400' : 'text-slate-500'}`}>
                  {used}/{budget} {t('times.minShort')}
                  <span className="ml-1 text-slate-600">· {t('dashboardUI.payRemainingLabel')} {left}</span>
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
                      disabled={payPaused}
                      onClick={() => startBreak(g.type, it.subtype, over)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all hover:scale-[1.03] ${
                        payPaused
                          ? 'opacity-40 cursor-not-allowed bg-slate-800/40 border-white/5 text-slate-500'
                          : over
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
                <p className="text-[9px] text-rose-400/80 mt-1.5">{t('dashboardUI.budgetExceeded')}</p>
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
  const { t, language } = useT()
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
    breakSeconds,
    breakRunning,
    resetIdle,
    effectiveTime,
    effectiveSecs,
    timeOffset,
    activeShiftSecs,
    isPaused,
    durationMode,
    durationTargetSecs,
    payWorkSecs,
    pendingActivity,
    pendingAfter,
    awaitingConfirmation,
    isChronoWork = false,
    isChronoBreak = false,
    chronoWorkSecs = 0,
    chronoBreakSecs = 0,
    chronoStartedAt: _chronoStartedAt
  } = useLiveShiftEngine()

  const { completeShift, extendActiveShift, uncompleteShift, setTimeOffset, stopPayback, finishPayback, confirmActivity, dailyLogs, togglePayPause, setDayShift, pauseDay, resumeDay } = useShiftStore()
  const mode = useShiftStore((s) => s.settings.mode)
  const updateSettings = useShiftStore((s) => s.updateSettings)
  const settings = useShiftStore((s) => s.settings)
  const payPaused = useShiftStore((s) => s.payPaused)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const stopBreak = useShiftStore((s) => s.stopBreak)
  const breakUsage = useShiftStore((s) => s.breakUsage)
  const chronoStartWork = useShiftStore((s) => s.chronoStartWork)
  const chronoStartBreak = useShiftStore((s) => s.chronoStartBreak)
  const chronoStop = useShiftStore((s) => s.chronoStop)
  const chronoWorkAccumMs = useShiftStore((s) => s.chronoWorkAccumMs)

  const colors = currentActivity ? getColors(currentActivity.color) : null

  const [confirmReset, setConfirmReset] = useState(false)

  // "Orada mısın?" last-start prompt + pause/resume warning modals
  const [greetShown, setGreetShown] = useState(false)
  const [confirmPause, setConfirmPause] = useState(false)
  const [confirmResume, setConfirmResume] = useState(false)

  // The prompt must appear fresh each new day
  useEffect(() => { setGreetShown(false) }, [currentDateStr])

  // Idle (aşım) state. In Pay mode an over-budget break (bütçesi dolmuşken
  // başlatılan mola) NOT a real break — it counts as aşım while it runs.
  // Chrono mode does NOT have aşım — "idle" just means "not started / paused".
  const overBudgetBreak = mode === 'pay' && !!runningBreak && runningBreak.overBudget
  const isIdle = mode === 'chrono'
    ? false
    : (!!activeTemplate && activeTemplate.activities.length > 0
      && ((!currentActivity && !isBeforeShift && !isShiftFinished) || overBudgetBreak))

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

  // Clock (effective vs wall): everything below uses the effective schedule clock so
  // late-start shifts / pauses stay consistent; only the "are you here?" heuristics
  // need the raw wall time.
  const realSecs = effectiveSecs
  const realClockSecs = timeToSeconds(currentTimeSecs)
  // For Pay mode: use settings times instead of template
  const payShiftStartSecs = mode === 'pay' ? timeToSeconds(`${settings.payShiftStart}:00`) : 0
  const payShiftEndSecs = mode === 'pay' ? timeToSeconds(`${settings.payShiftEnd}:00`) : 0
  const effectiveShiftEndSecs = mode === 'pay' ? payShiftEndSecs : (sortedActivities.length ? timeToSeconds(sortedActivities[sortedActivities.length - 1].endTime) : 0)
  const effectiveShiftStartSecs = mode === 'pay' ? payShiftStartSecs : (sortedActivities.length ? timeToSeconds(sortedActivities[0].startTime) : 0)

  // MyShift "geç başladın mı?" — asked inline in the activity area (never a modal),
  // straight from the moment the shift's first activity is due. Until the user
  // answers, a "Kaydır / Kaydırma" prompt lets a late start move today's whole
  // schedule forward so the first activity begins now.
  const firstPlannedAct = sortedActivities[0]
  const greetVisible = mode === 'myshift'
    && !!firstPlannedAct && activeShiftSecs === 0 && !isPaused && !isShiftFinished && !greetShown
    && realClockSecs >= effectiveShiftStartSecs

  let status = { text: '—', cls: 'text-slate-400' }
  if (mode === 'chrono') {
    if (isChronoWork) status = { text: t('dashboardUI.statusWorking'), cls: 'text-amber-400' }
    else if (isChronoBreak) status = { text: t('dashboardUI.statusOnBreak'), cls: 'text-emerald-400' }
    else status = { text: t('dashboardUI.statusWaiting'), cls: 'text-slate-400' }
  } else {
    if (isShiftFinished) status = { text: t('dashboardUI.statusCompleted'), cls: 'text-emerald-400' }
    else if (isBeforeShift) status = { text: t('dashboardUI.statusNotStarted'), cls: 'text-slate-400' }
    else if (paybackRunning) status = { text: t('dashboardUI.statusPayback'), cls: 'text-amber-400' }
    else if (isPaused) status = { text: t('dashboardUI.statusPaused'), cls: 'text-indigo-400' }
    else if (breakRunning && !overBudgetBreak) status = { text: t('dashboardUI.statusOnBreak'), cls: 'text-emerald-400' }
    else if (isIdle) status = { text: t('dashboardUI.statusOvertime'), cls: 'text-amber-400' }
    else if (currentActivity) status = { text: t('dashboardUI.statusOngoing'), cls: 'accent-text' }
    else status = { text: '—', cls: 'text-slate-400' }
  }

  // Stats — mode-aware
  const stats = mode === 'pay' ? [
    { key: 'start', label: t('dashboardUI.statShiftStart'), value: settings.payShiftStart, icon: '🌅', accent: false },
    { key: 'end', label: t('dashboardUI.statShiftEnd'), value: settings.payShiftEnd, icon: '🌇', accent: false },
    { key: 'planned', label: settings.payTargetMode === 'duration' ? t('dashboardUI.statTargetDuration') : t('dashboardUI.statPlannedDuration'), value: settings.payTargetMode === 'duration' ? `${settings.payDurationMin} ${t('times.minShort')}` : formatRemaining((payShiftEndSecs - payShiftStartSecs)), icon: '📋', accent: false },
    { key: 'worked', label: t('dashboardUI.statWorkedDuration'), value: formatRemaining(workedSeconds), icon: '💪', accent: false },
    { key: 'idle', label: t('dashboardUI.statOvertimeTotal'), value: idleLogSeconds > 0 ? formatRemaining(idleLogSeconds, false, 'sa', 'dk', true) : '—', icon: '📈', accent: idleLogSeconds > 0 },
    { key: 'remaining', label: t('dashboardUI.statRemaining'), value: durationMode ? formatRemaining(Math.max(0, durationTargetSecs - payWorkSecs), false, 'sa', 'dk', true) : (realSecs >= effectiveShiftEndSecs ? '—' : formatRemaining(Math.max(0, effectiveShiftEndSecs - realSecs), false, 'sa', 'dk', true)), icon: '⏱', accent: false }
  ] : mode === 'chrono' ? [
    { key: 'worked', label: t('dashboardUI.statTotalWork'), value: formatRemaining(chronoWorkSecs), icon: '💪', accent: false },
    { key: 'break', label: t('dashboardUI.chronoTotalBreak'), value: formatRemaining(chronoBreakSecs), icon: '☕', accent: false },
    { key: 'sessions', label: t('dashboardUI.statWorkStatus'), value: isChronoWork ? t('dashboardUI.chronoActive') : isChronoBreak ? t('dashboardUI.chronoBreak') : t('dashboardUI.chronoPaused'), icon: '⏱', accent: false }
  ] : [
    { key: 'start', label: t('dashboardUI.statShiftStart'), value: shiftStartTime, icon: '🌅', accent: false },
    { key: 'end', label: t('dashboardUI.statShiftEnd'), value: shiftEndTime, icon: '🌇', accent: false },
    { key: 'planned', label: t('dashboardUI.statPlannedDuration'), value: formatRemaining(plannedMinutes * 60), icon: '📋', accent: false },
    { key: 'worked', label: t('dashboardUI.statWorkedDuration'), value: formatRemaining(workedSeconds), icon: '💪', accent: false },
    { key: 'idle', label: t('dashboardUI.statOvertimeTotal'), value: idleLogSeconds > 0 ? formatRemaining(idleLogSeconds, false, 'sa', 'dk', true) : '—', icon: '📈', accent: idleLogSeconds > 0 },
    { key: 'remaining', label: t('dashboardUI.statRemaining'), value: realSecs >= effectiveShiftEndSecs ? '—' : formatRemaining(Math.max(0, effectiveShiftEndSecs - realSecs), false, 'sa', 'dk', true), icon: '⏱', accent: false }
  ]

  // Weekly heatmap — last 7 days from dailyLogs
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  })
  const DAY_SHORT = getWeekdayShort(language)

  const handleCompleteShift = () => { completeShift(currentDateStr) }
  const handleUncompleteShift = () => { uncompleteShift(currentDateStr) }
  const handleExtendShift = () => { if (activeTemplate) extendActiveShift(activeTemplate.id, 30) }
  const handleGoToNextActivity = () => {
    if (!nextActivity) return
    const targetSecs = timeToSeconds(nextActivity.startTime)
    // Land effective time exactly on the target — the effective clock runs at
    // realTime + timeOffset − shift(−pause), so the offset must undo the shift.
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs) + activeShiftSecs)
  }
  const handleResetIdle = () => { setConfirmReset(false); resetIdle() }
  const handleCompleteCurrentActivity = () => {
    if (!currentActivity) return
    if (isCurrentLast) { completeShift(currentDateStr); return }
    const targetSecs = timeToSeconds(currentActivity.endTime)
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs) + activeShiftSecs)
  }
  const handleConfirmPending = () => {
    if (pendingActivity) confirmActivity(pendingActivity.id)
  }

  // Late start / "Orada mısın?" — shift today's schedule forward so the first
  // activity effectively begins right now (template and planned duration untouched).
  const handleGreetYes = () => {
    setGreetShown(true)
    if (realClockSecs > effectiveShiftStartSecs) setDayShift(realClockSecs - effectiveShiftStartSecs)
  }
  const handleGreetNotYet = () => setGreetShown(true)

  // Pause / resume — both are gated behind a warning dialog.
  const handlePause = () => { setConfirmPause(false); pauseDay() }
  const handleResume = () => { setConfirmResume(false); resumeDay() }

  // ── Motivation engine (context-aware "AI" one-liner) ────────────────────────
  // State classification mirrors the old getMotivationMessage priority order.
  const state: MotivationState =
    mode === 'chrono'
      ? (isChronoWork ? 'active' : isChronoBreak ? 'gap' : chronoWorkAccumMs > 0 ? 'gap' : 'no-shift')
      : !activeTemplate || activeTemplate.activities.length === 0
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
    activityName: currentActivity?.name ?? (mode === 'chrono' && isChronoWork ? t('dashboardUI.chronoWorkCounter') : undefined),
    activityIcon: currentActivity?.icon ?? (mode === 'chrono' && isChronoWork ? '⏱️' : undefined),
    nextLabel: nextActivity ? `${nextActivity.icon} ${nextActivity.name}` : (mode === 'chrono' && isChronoBreak ? `☕ ${t('dashboardUI.endBreak')}` : ''),
    isLastActivity: isCurrentLast,
    shiftProgress,
    shiftName: activeTemplate?.name ?? (mode === 'chrono' ? t('dashboardUI.shiftChrono') : undefined),
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
    generateComment(t, ctx, { lastText: lastLineRef.current, recent: recentLinesRef.current }).then((line) => {
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
        generateComment(t, ctx, { ambient: true, lastText: lastLineRef.current, recent: recentLinesRef.current }).then((line) => {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-y-auto pr-1">

      {/* Left Columns - Live Stats */}
      <div className="lg:col-span-2 flex flex-col gap-6">

        {/* Clock & Active Shift Summary */}
        <div className="fluent-card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-0 flex-shrink-0" style={{ minWidth: '260px' }}>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t('dashboardUI.systemClock')}</span>
            <h2 className={`text-4xl lg:text-5xl font-light text-white tracking-tight mt-1 tabular-nums whitespace-nowrap clock-font-${settings.clockFont}`}>
              {currentTime}
              <span className="text-lg lg:text-xl font-light text-slate-500 ml-1">{currentTimeSecs.substring(5)}</span>
            </h2>
            <p className="text-xs mt-2 min-h-[16px]">
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
                title={t('dashboardUI.timeOverrideTitle')}
              >
                ↺ Geri alındı — <span className="font-mono font-bold">{effectiveTime}</span> · {t('dashboardUI.timeOverrideLive')}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => setConfirmResume(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300 font-medium hover:bg-indigo-500/20 transition-colors"
              >
                ⏸ {t('dashboardUI.statusPaused')} · {t('dashboardUI.btnResume')}
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left sm:text-right">
            <div className="flex items-center gap-2 sm:justify-end">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                mode === 'pay'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : mode === 'chrono'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'accent-soft accent-border-soft accent-text-soft'
              }`}>
                {mode === 'pay' ? t('dashboardUI.modePay') : mode === 'chrono' ? t('dashboardUI.modeChrono') : t('dashboardUI.modeMyShift')}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-2 sm:justify-end">
              {(['myshift', 'pay', 'chrono'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => updateSettings({ mode: m })}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                    mode === m
                      ? m === 'pay'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : m === 'chrono'
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'accent-solid-strong border-white/10'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {m === 'myshift' ? '⏰ MyShift' : m === 'pay' ? '💰 Pay' : `⏱ ${t('dashboardUI.shiftChrono')}`}
                </button>
              ))}
            </div>
            <h3 className="text-lg font-medium text-slate-200 mt-1.5 truncate">
              {mode === 'chrono' ? t('dashboardUI.shiftChrono') : mode === 'pay' ? t('dashboardUI.shiftPay') : activeTemplate ? activeTemplate.name : t('dashboardUI.shiftNone')}
            </h3>
            {mode === 'pay' && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {durationMode
                  ? `${t('dashboardUI.payTarget')}: ${settings.payDurationMin} ${t('times.minShort')} • ${t('dashboardUI.payWorked')}: ${formatRemaining(payWorkSecs)}${payPaused ? ` • ⏸ ${t('dashboardUI.payPausedLabel')}` : ''}${breakSeconds > 0 ? ` • ${t('dashboardUI.chronoBreakLabel')}: ${formatRemaining(breakSeconds)}` : ''}`
                  : `${settings.payShiftStart} - ${settings.payShiftEnd} • ${Object.values(breakUsage).reduce((a, b) => a + (b ?? 0), 0)} ${t('dashboardUI.payBreakUsed')}`}
              </p>
            )}
            {mode === 'chrono' && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {isChronoWork
                  ? `${t('dashboardUI.chronoWorking')}: ${formatRemaining(chronoWorkSecs)}`
                  : isChronoBreak
                    ? `${t('dashboardUI.chronoOnBreak')}: ${formatRemaining(chronoBreakSecs)}`
                    : chronoWorkSecs > 0 || chronoBreakSecs > 0
                      ? `${t('dashboardUI.chronoWorkLabel')}: ${formatRemaining(chronoWorkSecs)} • ${t('dashboardUI.chronoBreakLabel')}: ${formatRemaining(chronoBreakSecs)}`
                      : t('dashboardUI.chronoNotStarted')}
              </p>
            )}
            {mode !== 'chrono' && mode !== 'pay' && activeTemplate && activeTemplate.activities.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {durationMode
                  ? `${t('dashboardUI.totalMinutes')} ${Math.round(durationTargetSecs / 60)} ${t('times.minShort')} • ${t('dashboardUI.payWorked')} ${formatRemaining(payWorkSecs)}`
                  : `${activeTemplate.activities.length} ${t('dashboardUI.activityCount')} • ${activeTemplate.activities[0].startTime} - ${activeTemplate.activities[activeTemplate.activities.length - 1].endTime}`}
              </p>
            )}
          </div>
        </div>

        {/* Current Activity / Overtime Box */}
        <div className="flex-1 fluent-card p-6 flex flex-col justify-between min-h-0">
          {/* Top Info */}
          <div>
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              {mode === 'chrono'
                ? (isChronoWork ? t('dashboardUI.headerChronoWork') : isChronoBreak ? t('dashboardUI.headerChronoBreak') : t('dashboardUI.headerChronoWaiting'))
                : paybackRunning ? t('dashboardUI.headerPayback') : t('dashboardUI.headerCurrentActivity')}
            </span>

            {greetVisible && (
              <div className="mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                <span className="text-2xl flex-shrink-0">⏩</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-300">{t('dashboardUI.greetTitle')}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{t('dashboardUI.greetDesc', { start: shiftStartTime, now: currentTime })}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleGreetNotYet}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 font-semibold transition-colors"
                  >
                    {t('dashboardUI.greetNotYet')}
                  </button>
                  <button
                    onClick={handleGreetYes}
                    className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-colors shadow-md shadow-amber-500/20"
                  >
                    ⏩ {t('dashboardUI.greetYes')}
                  </button>
                </div>
              </div>
            )}

            {mode === 'chrono' ? (
              <div className="mt-4">
                {isChronoWork ? (
                  <div className="flex items-start gap-4">
                    <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10 animate-pulse">⏱️</div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-3xl font-semibold text-white tracking-wide">{t('dashboardUI.chronoWorkCounter')}</h1>
                      <p className="text-sm text-slate-400 mt-1">{t('dashboardUI.chronoWorkDesc')}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                        <p>
                          <span className="text-xs text-slate-400">{t('dashboardUI.chronoWorkLabel')}:</span>{' '}
                          <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(chronoWorkSecs)}</span>
                        </p>
                        <p>
                          <span className="text-xs text-slate-400">{t('dashboardUI.chronoBreakLabel')}:</span>{' '}
                          <span className="font-mono font-semibold text-slate-300 text-lg">{formatRemaining(chronoBreakSecs)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : isChronoBreak ? (
                  <div className="flex items-start gap-4">
                    <div className="text-5xl p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10 animate-pulse">☕</div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-3xl font-semibold text-white tracking-wide">{t('dashboardUI.chronoBreakCounter')}</h1>
                      <p className="text-sm text-slate-400 mt-1">{t('dashboardUI.chronoBreakDesc')}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                        <p>
                          <span className="text-xs text-slate-400">{t('dashboardUI.chronoWorkLabel')}:</span>{' '}
                          <span className="font-mono font-semibold text-slate-300 text-lg">{formatRemaining(chronoWorkSecs)}</span>
                        </p>
                        <p>
                          <span className="text-xs text-slate-400">{t('dashboardUI.chronoBreakLabel')}:</span>{' '}
                          <span className="font-mono font-bold text-emerald-300 text-lg">{formatRemaining(chronoBreakSecs)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">⏱️</div>
                    <div>
                      <h1 className="text-2xl font-medium text-slate-300">{t('dashboardUI.chronoReady')}</h1>
                      <p className="text-sm text-slate-400 mt-1">{t('dashboardUI.chronoReadyDesc')}</p>
                      {chronoWorkSecs > 0 || chronoBreakSecs > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                          <p>
                            <span className="text-xs text-slate-400">{t('dashboardUI.chronoTotalWork')}:</span>{' '}
                            <span className="font-mono font-semibold text-slate-300 text-lg">{formatRemaining(chronoWorkSecs)}</span>
                          </p>
                          <p>
                            <span className="text-xs text-slate-400">{t('dashboardUI.chronoTotalBreak')}:</span>{' '}
                            <span className="font-mono font-semibold text-slate-300 text-lg">{formatRemaining(chronoBreakSecs)}</span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  {isChronoWork ? (
                    <>
                      <button
                        onClick={chronoStop}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                      >
                        {t('dashboardUI.btnStop')}
                      </button>
                      <button
                        onClick={chronoStartBreak}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-emerald-500/20"
                      >
                        {t('dashboardUI.btnStartBreak')}
                      </button>
                    </>
                  ) : isChronoBreak ? (
                    <>
                      <button
                        onClick={chronoStop}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                      >
                        {t('dashboardUI.btnStop')}
                      </button>
                      <button
                        onClick={chronoStartWork}
                        className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-amber-500/20"
                      >
                        {t('dashboardUI.btnBackToWork')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={chronoStartWork}
                      className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-amber-500/20"
                    >
                      {t('dashboardUI.btnStartWork')}
                    </button>
                  )}
                </div>
              </div>
            ) : !activeTemplate || activeTemplate.activities.length === 0 ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">🚫</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">
                    {mode === 'pay' ? t('dashboardUI.noShiftPay') : t('dashboardUI.noShiftMyShift')}
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {mode === 'pay'
                      ? t('dashboardUI.noShiftPayDesc', { time: settings.payShiftStart })
                      : t('dashboardUI.noShiftFree')}
                  </p>
                </div>
              </div>
            ) : overBudgetBreak ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/10">⛔</div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-semibold text-rose-300">{t('dashboardUI.overBudgetTitle')}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('dashboardUI.overBudgetDesc')}
                    </p>
                    <p className="mt-2">
                      <span className="text-xs text-slate-400">{t('dashboardUI.totalOvertime')}:</span>{' '}
                      <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds, false, 'sa', 'dk', true)}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={stopBreak}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                  >
                    {t('dashboardUI.endBreak')}
                  </button>
                </div>
              </div>
            ) : isPaused ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-indigo-500/10 border-indigo-500/30 shadow-lg shadow-indigo-500/10">⏸</div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-semibold text-white">{t('dashboardUI.pausedTitle')}</h1>
                    <p className="text-sm text-slate-400 mt-1">{t('dashboardUI.pausedDesc')}</p>
                    {currentActivity && (
                      <p className="mt-2">
                        <span className="text-xs text-slate-400">{t('dashboardUI.myshiftTimeLabel')}:</span>{' '}
                        <span className="font-semibold text-slate-200">{currentActivity.icon} {currentActivity.name}</span>
                        <span className="mx-2 text-slate-600">•</span>
                        <span className="text-xs text-slate-400">{t('dashboardUI.statRemaining')}:</span>{' '}
                        <span className="font-mono font-semibold text-slate-200">{formatRemaining(effectiveShiftEndSecs - realSecs, false, 'sa', 'dk', true)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setConfirmResume(true)}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-emerald-500/20"
                  >
                    {t('dashboardUI.btnResume')}
                  </button>
                </div>
              </div>
            ) : currentActivity ? (
              <div className="mt-4">
                {mode === 'pay' ? (
                  /* ── Pay Mode Card ── */
                  <div className="flex items-start gap-4">
                    <div className={`text-5xl p-4 rounded-2xl border ${breakRunning ? 'bg-emerald-500/10 border-emerald-500/30' : overBudgetBreak ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'} shadow-lg ${breakRunning ? 'shadow-emerald-500/10' : 'shadow-emerald-500/10'}`}>
                      {breakRunning && !overBudgetBreak ? '☕' : overBudgetBreak ? '⛔' : '💼'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-3xl font-semibold text-white tracking-wide">
                        {breakRunning && !overBudgetBreak ? t('dashboardUI.payOnBreak') : overBudgetBreak ? t('dashboardUI.payOverBudgetBreak') : t('dashboardUI.payWorkTime')}
                      </h1>
                      <p className="text-sm text-slate-400 mt-1">
                        {breakRunning && !overBudgetBreak
                          ? t('dashboardUI.payBreakSpending')
                          : overBudgetBreak
                            ? t('dashboardUI.payOverBudgetDesc')
                            : durationMode
                              ? t('dashboardUI.payDurationDesc')
                              : t('dashboardUI.payWindowDesc', { start: settings.payShiftStart, end: settings.payShiftEnd })}
                      </p>
                      {durationMode ? (
                        <div className="mt-3 max-w-lg">
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payTargetLabel')}:</span>{' '}
                              <span className="font-mono font-bold text-slate-200 text-lg">{formatRemaining(durationTargetSecs)}</span>
                            </p>
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payWorked')}:</span>{' '}
                              <span className="font-mono font-semibold text-emerald-300 text-lg">{formatRemaining(payWorkSecs)}</span>
                            </p>
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payRemainingLabel')}:</span>{' '}
                              <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(Math.max(0, durationTargetSecs - payWorkSecs), false, 'sa', 'dk', true)}</span>
                            </p>
                          </div>
                          <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5 mt-3">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                              style={{ width: `${Math.min(100, (payWorkSecs / Math.max(1, durationTargetSecs)) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {t('dashboardUI.payProgressPercent', { percent: Math.min(100, Math.round((payWorkSecs / Math.max(1, durationTargetSecs)) * 100)) })}
                          </p>
                          {!isShiftFinished && !isOvertime && (
                            <button
                              onClick={togglePayPause}
                              className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                                payPaused
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                              }`}
                            >
                              {payPaused ? t('dashboard.payResume') : t('dashboard.payPause')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 max-w-lg">
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payStartLabel')}:</span>{' '}
                              <span className="font-mono font-bold text-slate-200 text-lg">{settings.payShiftStart}</span>
                            </p>
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payEndLabel')}:</span>{' '}
                              <span className="font-mono font-bold text-slate-200 text-lg">{settings.payShiftEnd}</span>
                            </p>
                            <p>
                              <span className="text-xs text-slate-400">{t('dashboardUI.payWorked')}:</span>{' '}
                              <span className="font-mono font-semibold text-emerald-300 text-lg">{formatRemaining(workedSeconds)}</span>
                            </p>
                          </div>
                          {!isOvertime && realSecs < effectiveShiftEndSecs && (
                            <>
                              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5 mt-3">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000"
                                  style={{ width: `${Math.min(100, ((realSecs - effectiveShiftStartSecs) / Math.max(1, effectiveShiftEndSecs - effectiveShiftStartSecs)) * 100)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {t('dashboardUI.payShiftPercent', { percent: Math.min(100, Math.round(((realSecs - effectiveShiftStartSecs) / Math.max(1, effectiveShiftEndSecs - effectiveShiftStartSecs)) * 100)) })}
                              </p>
                            </>
                          )}
                          {isOvertime && (
                            <p className="text-[10px] text-amber-400 mt-2 font-semibold">
                              {t('dashboardUI.payOvertimeWarning')}
                            </p>
                          )}
                        </div>
                      )}
                      {/* Break budget summary for Pay window mode */}
                      {!durationMode && (
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                            ☕ {t('dashboardUI.payShortBreak')}: {Object.entries(breakUsage).filter(([k]) => ['cay', 'kahve', 'ihtiyac'].includes(k)).reduce((a, [, v]) => a + (v ?? 0), 0)} / {settings.payShortBreakMin} {t('times.minShort')}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                            🍽️ {t('dashboardUI.payMealBreak')}: {Object.entries(breakUsage).filter(([k]) => ['kahvalti', 'ogle', 'aksam'].includes(k)).reduce((a, [, v]) => a + (v ?? 0), 0)} / {settings.payMealBreakMin} {t('times.minShort')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── MyShift Mode Card ── */
                  <>
                    <div className="flex items-start gap-4">
                      <div className={`text-5xl p-4 rounded-2xl border ${colors?.bg} ${colors?.border} shadow-lg ${colors?.glow}`}>
                        {currentActivity.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h1 className="text-3xl font-semibold text-white tracking-wide">{currentActivity.name}</h1>
                        <p className="text-sm text-slate-400 mt-1">
                          {t('dashboardUI.myshiftTimeLabel')}: <span className="text-slate-200 font-medium">{currentActivity.startTime} - {currentActivity.endTime}</span> ({currentActivity.duration} {t('times.minShort')})
                        </p>
                        {currentActivity.notes && (
                          <div className="mt-3 p-3 bg-white/5 border border-white/5 rounded-lg max-w-lg">
                            <p className="text-xs text-slate-300 italic">{currentActivity.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={() => setConfirmPause(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-xl font-semibold border border-white/5 transition-colors"
                        title={t('dashboardUI.btnPauseTitle')}
                      >
                        ⏸ {t('dashboardUI.btnPause')}
                      </button>
                      <button
                        onClick={handleCompleteCurrentActivity}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-emerald-500/20"
                        title={t('dashboardUI.btnCompleteTitle')}
                      >
                        ✔ {isCurrentLast ? t('dashboardUI.btnCompleteShift') : t('dashboardUI.btnCompleteActivity')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : isBeforeShift ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">💤</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">{t('dashboardUI.noShiftPay')}</h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {mode === 'pay'
                      ? t('dashboardUI.noShiftPayDesc', { time: settings.payShiftStart })
                      : t('dashboardUI.noShiftFirstActivity')}
                  </p>
                </div>
              </div>
            ) : isShiftFinished ? (
              <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/20">🎉</div>
                  <div>
                    <h1 className="text-2xl font-medium text-emerald-400">{t('dashboardUI.pillCompleted')}</h1>
                    <p className="text-sm text-slate-400 mt-1">{t('dashboardUI.shiftCompleteDesc')}</p>
                  </div>
                </div>
                <button
                  onClick={handleUncompleteShift}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors self-end md:self-auto whitespace-nowrap"
                >
                  {t('dashboardUI.undoButton')}
                </button>
              </div>
            ) : paybackRunning && !(awaitingConfirmation && pendingActivity) ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10 animate-pulse">⏳</div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-semibold text-white tracking-wide">{t('dashboardUI.paybackTitle')}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('dashboardUI.paybackDesc')}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                      <p>
                        <span className="text-xs text-slate-400">{t('dashboardUI.remainingOvertime')}:</span>{' '}
                        <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds, false, 'sa', 'dk', true)}</span>
                      </p>
                      <p>
                        <span className="text-xs text-slate-400">{t('dashboardUI.paidBack')}:</span>{' '}
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
                          {t('dashboardUI.paybackPercentDone', { percent: Math.round(paybackPercent) })}
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
                    {t('dashboardUI.btnStopPayback')}
                  </button>
                  <button
                    onClick={finishPayback}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-amber-500/20"
                  >
                    {t('dashboardUI.btnFinishPayback')}
                  </button>
                </div>
              </div>
            ) : awaitingConfirmation && pendingActivity ? (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10">⏳</div>
                  <div>
                    <h1 className="text-2xl font-semibold text-amber-300">{t('dashboardUI.pendingTitle')}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {pendingAfter?.isBreak
                        ? t('dashboardUI.pendingBreakDesc')
                        : t('dashboardUI.pendingActivityDesc')}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('dashboardUI.pendingNext')}: <span className="text-slate-200 font-medium">{pendingActivity.icon} {pendingActivity.name}</span> — {pendingActivity.startTime}{t('dashboardUI.pendingStartsAt')}
                    </p>
                    <p className="mt-2">
                      <span className="text-xs text-slate-400">{t('dashboardUI.totalOvertime')}:</span>{' '}
                      <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds, false, 'sa', 'dk', true)}</span>
                    </p>
                    <p className="mt-1">
                      <span className="text-xs text-emerald-300/90">{t('dashboardUI.pendingPaybackNote')}:</span>{' '}
                      <span className="font-mono font-semibold text-emerald-300">{formatRemaining(paybackSeconds)}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleConfirmPending}
                    className="inline-flex items-center gap-2 accent-solid-strong hover:accent-solid text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md accent-glow-lg"
                  >
                    {t('dashboardUI.btnConfirmAndGo')} — {pendingActivity.icon} {pendingActivity.name}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-start gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10">⏳</div>
                  <div>
                    <h1 className="text-2xl font-semibold text-amber-300">
                      {isOvertime ? (durationMode ? t('dashboardUI.overtimeDurationTitle') : t('dashboardUI.overtimeShiftTitle')) : t('dashboardUI.overtimeIdleTitle')}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {isOvertime
                        ? durationMode
                          ? t('dashboardUI.overtimeDurationDesc')
                          : t('dashboardUI.overtimeShiftDesc')
                        : t('dashboardUI.overtimeIdleDesc')}
                    </p>
                    {nextActivity && !isOvertime && (
                      <p className="text-sm text-slate-400 mt-1">
                        {t('dashboardUI.nextActivityStarts')}: <span className="text-slate-200 font-medium">{nextActivity.icon} {nextActivity.name}</span> — {nextActivity.startTime}{t('dashboardUI.nextActivityStartsAt')}
                      </p>
                    )}
                    <p className="mt-2">
                      <span className="text-xs text-slate-400">{t('dashboardUI.totalOvertime')}:</span>{' '}
                      <span className="font-mono font-bold text-amber-300 text-lg">{formatRemaining(idleSeconds, false, 'sa', 'dk', true)}</span>
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
                        {t('dashboardUI.btnExtend30')}
                      </button>
                    )}
                    <button
                      onClick={handleCompleteShift}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                    >
                      {t('dashboardUI.btnCompleteOvertime')}
                    </button>
                  </div>
                )}
                {nextActivity && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleGoToNextActivity}
                      title={t('dashboardUI.btnGoToNextTitle')}
                      className="inline-flex items-center gap-2 accent-solid-strong hover:accent-solid text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md accent-glow-lg"
                    >
                      {t('dashboardUI.btnGoToNext')} — {nextActivity.icon} {nextActivity.name} ({nextActivity.startTime})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress & Remaining Time — MyShift only */}
          {mode === 'myshift' && activeTemplate && activeTemplate.activities.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
                    {isIdle ? t('dashboardUI.overtimeDuration') : t('dashboardUI.remainingDuration')}
                  </span>
                  <span className={`text-4xl font-semibold tracking-tight ${
                    isIdle ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]' : colors?.text || 'text-slate-300'
                  }`}>
                    {isShiftFinished ? '00:00:00' : isIdle ? formatRemaining(idleSeconds, false, 'sa', 'dk', true) : remainingTimeStr}
                  </span>
                </div>
                {currentActivity && (
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('dashboardUI.completionPercent', { percent: Math.round(activityProgress) })}
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

        {/* Shift Progress + Next Activity — MyShift only */}
        {mode === 'myshift' && activeTemplate && activeTemplate.activities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="fluent-card p-6 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block">{t('dashboardUI.shiftProgressHeader')}</span>
                <span className="text-3xl font-light text-slate-200 mt-2 block">
                  {t('dashboardUI.shiftProgressDone', { percent: Math.round(shiftProgress) })}
                </span>
              </div>
              <div className="mt-4">
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      isOvertime ? 'bg-rose-500' : 'accent-grad-h'
                    }`}
                    style={{ width: `${shiftProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="fluent-card p-6 flex flex-col justify-between">
              <div>
                <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block">{t('dashboardUI.nextActivityHeader')}</span>
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
                    {isShiftFinished || isOvertime ? t('dashboardUI.noMoreActivities') : t('dashboardUI.endOfShift')}
                  </p>
                )}
              </div>
              <div className="mt-2 text-right">
                {nextActivity && (
                  <span className="text-xs text-slate-500 font-mono">
                    ({nextActivity.startTime}{t('dashboardUI.startsAt')})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Breaks, Timeline/Widget */}
      <div className="flex flex-col gap-6 min-h-0">
        {mode === 'pay' && <BreakCard />}
        {mode === 'myshift' && (
          <div className="fluent-card p-6 flex flex-col flex-1 min-h-0">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-4">{t('dashboardUI.todayTimeline')}</span>
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
              <Timeline />
            </div>
          </div>
        )}
        {mode === 'myshift' && <WeatherWidget />}
        {(mode === 'pay' || mode === 'chrono') && <WeatherWidget compact />}
      </div>

      {/* Bottom Row - Day Summary */}
      {(mode !== 'myshift' || (activeTemplate && sortedActivities.length > 0)) && (
        <div className="lg:col-span-3 fluent-card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t('dashboardUI.daySummary')}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 font-medium hover:bg-amber-500/20 transition-colors"
              >
                {t('dashboardUI.resetOvertime')}
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
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t('dashboardUI.last7Days')}</span>
            <span className="text-[10px] text-slate-600">{t('dashboardUI.collectedData')}</span>
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
              const bgCls = intensity === 0 ? 'bg-slate-800/50' : intensity === 1 ? 'accent-heat-1' : intensity === 2 ? 'accent-heat-2' : intensity === 3 ? 'accent-heat-3' : 'accent-heat-4'

              const d = new Date(dateStr + 'T00:00:00')
              const dayLabel = DAY_SHORT[d.getDay()]

              return (
                <div key={dateStr} className="flex flex-col items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${today ? 'accent-text' : 'text-slate-600'}`}>{dayLabel}</span>
                  <div
                    title={hasData ? `${t('dashboardUI.workedLabel')}: ${Math.floor(worked / 3600)}${t('times.hourShort')} ${Math.floor((worked % 3600) / 60)}${t('times.minShort')}${idle > 0 ? ` · ${t('dashboardUI.overtimeShort')}: ${Math.floor(idle / 3600)}${t('times.hourShort')} ${Math.floor((idle % 3600) / 60)}${t('times.minShort')}` : ''}${brk > 0 ? ` · ${t('dashboardUI.breakShort')}: ${Math.floor(brk / 60)}${t('times.minShort')}` : ''}` : t('dashboardUI.noData')}
                    className={`w-full aspect-square rounded-lg border transition-all duration-200 flex items-center justify-center ${bgCls} ${today ? 'accent-border' : 'border-white/5'} ${completed ? 'ring-1 ring-emerald-500/50' : ''}`}
                  >
                    {completed && <span className="text-[8px] text-emerald-400">✓</span>}
                    {idle > 300 && !completed && hasData && <span className="text-[8px] text-amber-400">!</span>}
                  </div>
                  <span className={`text-[9px] font-mono ${hasData ? 'text-slate-400' : 'text-slate-700'}`}>
                    {hasData ? `${Math.floor(worked / 3600)}${t('times.hourShort')}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 justify-end">
            <span className="text-[9px] text-slate-600">{t('dashboardUI.legendLow')}</span>
            {[0, 1, 2, 3, 4].map(lvl => (
              <div key={lvl} className={`w-3 h-3 rounded-sm ${lvl === 0 ? 'bg-slate-800' : lvl === 1 ? 'accent-heat-1' : lvl === 2 ? 'accent-heat-2' : lvl === 3 ? 'accent-heat-3' : 'accent-heat-4'}`} />
            ))}
            <span className="text-[9px] text-slate-600">{t('dashboardUI.legendHigh')}</span>
            <span className="text-[9px] text-slate-600 ml-2">{t('dashboardUI.legendCompleted')}</span>
            <span className="text-[9px] text-slate-600">{t('dashboardUI.legendOvertime')}</span>
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
              <h3 className="text-lg font-semibold text-white">{t('dashboardUI.resetOvertimeTitle')}</h3>
            </div>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">
              {t('dashboardUI.resetOvertimeDesc')}
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
            <button
              onClick={() => setConfirmReset(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
            >
              {t('dashboardUI.btnCancel')}
            </button>
            <button
              onClick={handleResetIdle}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.03] active:scale-[0.98]"
            >
              {t('dashboardUI.btnConfirmReset')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Pause confirmation — pause freezes effective time and pushes the rest of the
        day forward when resumed */}
    {confirmPause && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={() => setConfirmPause(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-lg shadow-inner shadow-indigo-500/10">⏸</div>
              <h3 className="text-lg font-semibold text-white">{t('dashboardUI.pauseWarningTitle')}</h3>
            </div>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">
              {t('dashboardUI.pauseWarningDesc')}
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
            <button
              onClick={() => setConfirmPause(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
            >
              {t('dashboardUI.btnCancel')}
            </button>
            <button
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.03] active:scale-[0.98]"
            >
              {t('dashboardUI.btnPause')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Resume confirmation — resuming shifts the day forward by the paused time */}
    {confirmResume && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={() => setConfirmResume(false)}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-lg shadow-inner shadow-emerald-500/10">▶️</div>
              <h3 className="text-lg font-semibold text-white">{t('dashboardUI.resumeWarningTitle')}</h3>
            </div>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">
              {t('dashboardUI.resumeWarningDesc')}
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
            <button
              onClick={() => setConfirmResume(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
            >
              {t('dashboardUI.btnCancel')}
            </button>
            <button
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.03] active:scale-[0.98]"
            >
              {t('dashboardUI.btnResume')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
