import { useMemo, useState, useRef, useEffect } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import type { BreakSubtype } from '../stores/useShiftStore'
import { useLiveShiftEngine, computeWorkedSeconds, timeToSeconds, formatRemaining } from '../hooks/useLiveShiftEngine'
import { useT } from '../i18n/useT'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function msToHHMM(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatCard({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="fluent-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`text-xl font-bold font-mono ${accent ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="fluent-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm">{icon}</span>
        <h2 className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function TodaySummary() {
  const { t } = useT()

  const SUBTYPE_LABELS: Record<BreakSubtype, { label: string; icon: string }> = {
    cay: { label: t('todaySummaryUI.subtypeCay'), icon: '🍵' },
    kahve: { label: t('todaySummaryUI.subtypeKahve'), icon: '☕' },
    ihtiyac: { label: t('todaySummaryUI.subtypeIhtiyac'), icon: '🚻' },
    kahvalti: { label: t('todaySummaryUI.subtypeKahvalti'), icon: '🍳' },
    ogle: { label: t('todaySummaryUI.subtypeOgle'), icon: '🍲' },
    aksam: { label: t('todaySummaryUI.subtypeAksam'), icon: '🍛' }
  }

  const TYPE_LABELS: Record<string, string> = { short: t('todaySummaryUI.typeShort'), meal: t('todaySummaryUI.typeMeal') }

  const engine = useLiveShiftEngine()
  const settings = useShiftStore((s) => s.settings)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const breakLog = useShiftStore((s) => s.breakLog)
  const idleLog = useShiftStore((s) => s.idleLog)
  const paybackLog = useShiftStore((s) => s.paybackLog)
  const todayHourly = useShiftStore((s) => s.todayHourly)
  const breakUsage = useShiftStore((s) => s.breakUsage)
  const resetToday = useShiftStore((s) => s.resetToday)
  const [confirmReset, setConfirmReset] = useState(false)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }, [])

  const nowSecs = settings.mode === 'pay' || settings.mode === 'chrono' ? engine.effectiveSecs : timeToSeconds(engine.currentTimeSecs)
  const nowMs = Date.now()
  const { activeTemplate } = engine

  // Shift window
  const shift = useMemo(() => {
    if (settings.mode === 'pay') {
      // Duration mode has no fixed window — work is measured by the accumulator
      if (settings.payTargetMode === 'duration') return null
      const s = timeToSeconds(`${settings.payShiftStart}:00`)
      const e = timeToSeconds(`${settings.payShiftEnd}:00`)
      if (e <= s) return null
      return { start: s, end: e, activities: null }
    }
    const acts = activeTemplate?.activities
    if (!acts || acts.length === 0) return null
    const sorted = [...acts].sort((a, b) => a.startTime.localeCompare(b.startTime))
    return {
      start: timeToSeconds(`${sorted[0].startTime}:00`),
      end: timeToSeconds(`${sorted[sorted.length - 1].endTime}:00`),
      activities: sorted
    }
  }, [settings.mode, settings.payTargetMode, settings.payShiftStart, settings.payShiftEnd, activeTemplate])

  const durationMode = settings.mode === 'pay' && settings.payTargetMode === 'duration'
  const durationTargetSecs = Math.max(0, settings.payDurationMin) * 60
  const durationRemaining = Math.max(0, durationTargetSecs - engine.workedSeconds)
  const durationPct = durationTargetSecs > 0 ? Math.min(100, (engine.workedSeconds / durationTargetSecs) * 100) : 0

  // Break seconds that fall inside [hourStartMs, hourEndMs] (pay mode: breakLog +
  // running in-budget break; over-budget breaks are aşım, never break time).
  const payBreakSecsInHour = (hourStartMs: number, hourEndMs: number): number => {
    const sessions = [
      ...breakLog.filter((b) => !b.overBudget),
      ...(runningBreak && !runningBreak.overBudget ? [{ startedAt: runningBreak.startedAt, endedAt: nowMs, overBudget: false }] : [])
    ]
    let total = 0
    for (const s of sessions) {
      const st = Math.max(s.startedAt, hourStartMs)
      const en = Math.min(s.endedAt, hourEndMs)
      if (en > st) total += (en - st) / 1000
    }
    return total
  }

  // Planned "Mola mı?" break seconds inside [hourStartSecs, clampNow] (myshift mode)
  const plannedBreakSecsInHour = (hourStartSecs: number, clampNow: number): number => {
    let s = 0
    for (const a of shift?.activities ?? []) {
      if (!a.isBreak) continue
      const st = timeToSeconds(`${a.startTime}:00`)
      const en = timeToSeconds(`${a.endTime}:00`)
      const lo = Math.max(st, hourStartSecs)
      const hi = Math.min(en, clampNow)
      if (hi > lo) s += hi - lo
    }
    return s
  }

  // Hourly rows — from midnight to the current hour (entire day, not just shift).
  const hours = useMemo(() => {
    const rows: { key: string; h: number; worked: number; breakSec: number; idle: number; payback: number; current: boolean; inShift: boolean }[] = []
    const currentHour = Math.floor(nowSecs / 3600)
    const shiftStart = shift?.start ?? -1
    const shiftEnd = shift?.end ?? -1

    for (let h = 0; h <= currentHour; h++) {
      const hourStartSecs = h * 3600
      const hourEndSecs = Math.min((h + 1) * 3600, 86400)
      const clampNow = Math.min(nowSecs, hourEndSecs)
      const hourKey = `${pad(h)}:00`
      const hourStartMs = new Date(`${engine.currentDateStr}T${hourKey}:00:00`).getTime()
      const hourEndMs = hourStartMs + 3600000
      const inShift = shiftStart >= 0 && hourEndSecs > shiftStart && hourStartSecs < shiftEnd

      let worked = 0
      let breakSec = 0
      if (inShift && shift) {
        if (settings.mode === 'pay') {
          const shiftOverlap = Math.max(0, Math.min(clampNow, shift.end, hourEndSecs) - Math.max(shift.start, hourStartSecs))
          breakSec = payBreakSecsInHour(hourStartMs, hourEndMs)
          worked = Math.max(0, shiftOverlap - breakSec)
        } else if (shift.activities) {
          worked = computeWorkedSeconds(shift.activities, clampNow) - computeWorkedSeconds(shift.activities, hourStartSecs)
          breakSec = plannedBreakSecsInHour(hourStartSecs, clampNow)
        }
      } else if (settings.mode === 'chrono') {
        // Chrono mode: no shift window, all time is tracked via accumulators
        // Show idle data for each hour
      }

      rows.push({
        key: hourKey,
        h,
        worked,
        breakSec,
        idle: todayHourly[hourKey]?.idleSeconds ?? 0,
        payback: todayHourly[hourKey]?.paybackSeconds ?? 0,
        current: h === currentHour,
        inShift
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, settings.mode, nowSecs, nowMs, breakLog, runningBreak, todayHourly, engine.currentDateStr])

  // Worked-hour reference for mini bars
  const maxHourWorked = useMemo(() => Math.max(1, ...hours.map((r) => r.worked)), [hours])

  // Pay-mode break list (chronological, newest first)
  const payBreaks = useMemo(() => [...breakLog].sort((a, b) => b.startedAt - a.startedAt), [breakLog])

  // Myshift planned break list
  const plannedBreaks = useMemo(() => {
    if (settings.mode === 'pay') return []
    return (shift?.activities ?? []).filter((a) => a.isBreak)
  }, [settings.mode, shift])

  const idleList = useMemo(() => [...idleLog].sort((a, b) => b.startedAt - a.startedAt), [idleLog])
  const paybackList = useMemo(() => [...paybackLog].sort((a, b) => b.startedAt - a.startedAt), [paybackLog])
  const paybackRunning = engine.paybackRunning

  const usedOf = (type: 'short' | 'meal') => {
    const subs = type === 'short' ? ['cay', 'kahve', 'ihtiyac'] : ['kahvalti', 'ogle', 'aksam']
    return subs.reduce((a, s) => a + (breakUsage[s as BreakSubtype] ?? 0), 0)
  }

  const liveRunningBreak = runningBreak
    ? {
        startedAt: runningBreak.startedAt,
        endedAt: nowMs,
        durationSec: Math.max(0, Math.floor((nowMs - runningBreak.startedAt) / 1000)),
        overBudget: runningBreak.overBudget,
        type: runningBreak.type,
        subtype: runningBreak.subtype
      }
    : null

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{t('todaySummary.title')}</h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            {engine.currentDateStr} · {t('todaySummaryUI.hourLabel')} {engine.currentTime}
            {settings.mode === 'pay' ? ` · ${t('dashboardUI.modePay')}` : settings.mode === 'chrono' ? ` · ${t('dashboardUI.modeChrono')}` : activeTemplate ? ` · ${activeTemplate.name}` : ` · ${t('dashboardUI.shiftNone')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {engine.isShiftFinished && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">✓ {t('todaySummaryUI.shiftCompleted')}</span>
          )}
          {engine.isOvertime && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">⏰ {t('todaySummaryUI.overtimeNow')}</span>
          )}
          <button
            onClick={() => {
              if (confirmReset) {
                resetToday()
                setConfirmReset(false)
              } else {
                setConfirmReset(true)
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                confirmTimerRef.current = setTimeout(() => setConfirmReset(false), 2500)
              }
            }}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
              confirmReset
                ? 'bg-rose-600 border-rose-500 text-white hover:bg-rose-500'
                : 'bg-slate-800/80 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
            }`}
            title={t('todaySummaryUI.resetTitle')}
          >
            {confirmReset ? t('todaySummaryUI.resetConfirm') : t('todaySummaryUI.resetBtn')}
          </button>
        </div>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon="💼" label={t('todaySummary.work')} value={formatRemaining(engine.workedSeconds)} />
        {engine.breakSeconds > 0 && (
          <StatCard
            icon="🧘"
            label={t('todaySummary.break')}
            value={formatRemaining(engine.breakSeconds)}
            sub={
              engine.breakCount > 0
                ? settings.mode === 'pay'
                  ? `${engine.breakCount} ${t('todaySummaryUI.breakCountLabel')} · ${t('todaySummaryUI.shortUsed')} ${usedOf('short')}/${settings.payShortBreakMin} ${t('todaySummaryUI.durationsShort')}, ${t('todaySummaryUI.mealUsed')} ${usedOf('meal')}/${settings.payMealBreakMin} ${t('todaySummaryUI.durationsShort')}`
                  : `${engine.breakCount} ${t('todaySummaryUI.breakCountLabel')}`
                : undefined
            }
            accent="text-orange-300"
          />
        )}
        {settings.mode !== 'chrono' && engine.idleLogSeconds > 0 && (
          <StatCard
            icon="😴"
            label={t('todaySummaryUI.overtimeNet')}
            value={formatRemaining(engine.idleSeconds)}
            sub={engine.idleLogSeconds !== engine.idleSeconds ? t('todaySummaryUI.totalOvertime', { time: formatRemaining(engine.idleLogSeconds) }) : undefined}
            accent="text-rose-300"
          />
        )}
        {settings.mode !== 'chrono' && engine.paybackSeconds > 0 && (
          <StatCard
            icon="⚡"
            label={t('todaySummaryUI.paybackLabel')}
            value={formatRemaining(engine.paybackSeconds)}
            sub={paybackRunning ? t('todaySummaryUI.paybackRunningLabel') : undefined}
            accent="text-emerald-300"
          />
        )}
        {settings.mode !== 'chrono' && (
          <StatCard icon="🎯" label={t('todaySummaryUI.shiftLabel')} value={`%${Math.round(engine.shiftProgress)}`} sub={engine.currentActivity ? `${engine.currentActivity.icon} ${engine.currentActivity.name}` : undefined} />
        )}
        {settings.mode === 'chrono' && (
          <StatCard
            icon="⏱️"
            label={t('todaySummaryUI.chronoLabel')}
            value={engine.isChronoWork ? t('dashboardUI.chronoActive') : engine.isChronoBreak ? t('dashboardUI.chronoBreak') : t('dashboardUI.chronoPaused')}
            sub={`${t('todaySummary.work')}: ${formatRemaining(engine.chronoWorkSecs)} · ${t('todaySummary.break')}: ${formatRemaining(engine.chronoBreakSecs)}`}
          />
        )}
        {breakLog.length > 0 && (
          <StatCard
            icon="🔁"
            label={t('todaySummaryUI.breakLogLabel')}
            value={`${breakLog.length} ${t('todaySummaryUI.recordCount')}`}
            sub={runningBreak ? `${SUBTYPE_LABELS[runningBreak.subtype].label} ${t('todaySummaryUI.continuing')}` : undefined}
          />
        )}
      </div>

      {/* Hour-by-hour log */}
      <SectionCard icon="🕐" title={
        durationMode ? t('todaySummaryUI.durationToPay') :
        settings.mode === 'chrono' ? t('todaySummaryUI.hourlyToday') :
        !shift ? t('todaySummaryUI.today') : t('todaySummaryUI.hourlyToday')
      }>
        {durationMode ? (
          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">
                  {t('todaySummaryUI.decreaseNote')}
                </p>
                <p className="text-3xl font-bold font-mono text-slate-100 mt-2">
                  {formatRemaining(durationRemaining)}
                  <span className="text-sm text-slate-500 ml-2 font-sans font-medium">{t('todaySummaryUI.remainedLabel')}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{t('todaySummaryUI.workedLabel')}</p>
                <p className="text-lg font-bold font-mono accent-text-soft">{formatRemaining(engine.workedSeconds)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{t('todaySummaryUI.targetLabel')}</p>
                <p className="text-lg font-bold font-mono text-slate-200">{formatRemaining(durationTargetSecs)}</p>
              </div>
            </div>
            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden mt-5">
              <div
                className={`h-full transition-all duration-1000 ${durationRemaining <= 0 ? 'bg-emerald-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`}
                style={{ width: `${durationPct}%` }}
              />
            </div>
              <p className="text-[10px] text-slate-500 mt-2">
                {t('todaySummaryUI.targetLabel')} {durationPct >= 100 ? t('todaySummaryUI.targetReached') : `${Math.round(durationPct)}${t('todaySummaryUI.targetPercent')}`}
            </p>
          </div>
        ) : !shift && settings.mode !== 'chrono' ? (
          <p className="text-xs text-slate-500">{t('todaySummaryUI.noActiveShift')}</p>
        ) : hours.length === 0 ? (
          <p className="text-xs text-slate-500">{t('todaySummaryUI.shiftNotStarted')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">{t('todaySummaryUI.hourLabel')}</th>
                  <th className="pb-2 pr-3 font-semibold">{t('todaySummary.work')}</th>
                  <th className="pb-2 pr-3 font-semibold">{t('todaySummary.break')}</th>
                  <th className="pb-2 pr-3 font-semibold">{t('todaySummary.overtime')}</th>
                  <th className="pb-2 pr-3 font-semibold">{t('todaySummaryUI.paybackLabel')}</th>
                  <th className="pb-2 font-semibold w-1/3">{t('todaySummaryUI.intensityLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {hours.map((r) => (
                  <tr
                    key={r.key}
                    className={`border-t border-white/5 ${r.current ? 'bg-white/5' : ''} ${r.inShift ? '' : 'opacity-50'}`}
                  >
                    <td className="py-2 pr-3 text-sm font-mono font-semibold text-slate-300">
                      {r.key}
                      {r.current && <span className="ml-1.5 text-[9px] accent-text-soft font-sans uppercase tracking-wide">{t('todaySummaryUI.nowLabel')}</span>}
                    </td>
                    <td className="py-2 pr-3 text-sm font-mono text-slate-200">{r.worked > 0 ? formatRemaining(r.worked) : '—'}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-orange-300">{r.breakSec > 0 ? formatRemaining(r.breakSec) : '—'}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-rose-300">{r.idle > 0 ? formatRemaining(r.idle) : '—'}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-emerald-300">{r.payback > 0 ? formatRemaining(r.payback) : '—'}</td>
                    <td className="py-2">
                      {(r.worked > 0 || r.breakSec > 0) ? (
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                          <div className="h-full accent-heat-3" style={{ width: `${Math.min(100, (r.worked / maxHourWorked) * 100)}%` }} />
                          <div className="h-full bg-orange-400/70" style={{ width: `${Math.min(100, (r.breakSec / maxHourWorked) * 100)}%` }} />
                        </div>
                      ) : <span className="text-[10px] text-slate-700">—</span>}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t border-white/10">
                  <td className="py-2 pr-3 text-xs font-bold text-slate-400 uppercase tracking-wide">{t('todaySummaryUI.totalLabel')}</td>
                  <td className="py-2 pr-3 text-sm font-mono font-bold text-slate-100">{formatRemaining(engine.workedSeconds)}</td>
                  <td className="py-2 pr-3 text-sm font-mono font-bold text-orange-300">{formatRemaining(engine.breakSeconds)}</td>
                  <td className="py-2 pr-3 text-sm font-mono font-bold text-rose-300">{formatRemaining(engine.idleLogSeconds)}</td>
                  <td className="py-2 pr-3 text-sm font-mono font-bold text-emerald-300">{formatRemaining(engine.paybackSeconds)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Break log */}
      <SectionCard icon="🧘" title={t('todaySummaryUI.breakLogTitle')}>
        {settings.mode === 'chrono' ? (
          engine.chronoBreakSecs > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-300">{t('todaySummaryUI.totalBreakTime')}</span>
                <span className="text-sm font-mono font-semibold text-orange-300">{formatRemaining(engine.chronoBreakSecs)}</span>
              </div>
              {runningBreak && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-emerald-300">{t('todaySummaryUI.breakOngoing')}</span>
                  <span className="text-sm font-mono font-semibold text-emerald-300">{formatRemaining(engine.chronoBreakSecs)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t('todaySummaryUI.noBreakRecords')}</p>
          )
        ) : settings.mode === 'pay' ? (
          <>
            {liveRunningBreak && (
              <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${liveRunningBreak.overBudget ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{SUBTYPE_LABELS[liveRunningBreak.subtype].icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${liveRunningBreak.overBudget ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {SUBTYPE_LABELS[liveRunningBreak.subtype].label}
                      <span className="ml-2 text-[9px] uppercase tracking-wide text-slate-500">{t('todaySummaryUI.ongoingLabel')}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      {msToHHMM(liveRunningBreak.startedAt)} – … · {formatRemaining(liveRunningBreak.durationSec)}
                    </p>
                  </div>
                </div>
                {liveRunningBreak.overBudget && <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">{t('dashboardUI.overtimeBadge')}</span>}
              </div>
            )}

            {payBreaks.length === 0 && !runningBreak ? (
              <p className="text-xs text-slate-500">{t('todaySummaryUI.noBreakRecordsDash')}</p>
            ) : (
              <div className="flex flex-col divide-y divide-white/5">
                {payBreaks.map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg">{SUBTYPE_LABELS[b.subtype].icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 font-medium">
                          {SUBTYPE_LABELS[b.subtype].label}
                          <span className="ml-2 text-[10px] text-slate-500 font-sans">({TYPE_LABELS[b.type]})</span>
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {msToHHMM(b.startedAt)} – {msToHHMM(b.endedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-mono font-semibold text-slate-200">{formatRemaining(b.durationSec)}</span>
                      {b.overBudget && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">{t('dashboardUI.overtimeBadge')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          plannedBreaks.length === 0 ? (
            <p className="text-xs text-slate-500">{t('todaySummaryUI.noPlannedBreaks')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {plannedBreaks.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{a.icon}</span>
                    <p className="text-sm text-slate-200 font-medium">{a.name}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-orange-300">
                    {a.startTime} – {a.endTime} · {formatRemaining(a.duration * 60)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </SectionCard>

      {/* Aşım & Payback — not applicable in Chrono mode */}
      {settings.mode !== 'chrono' && (idleList.length > 0 || paybackRunning || paybackList.length > 0) && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(idleList.length > 0 || paybackRunning) && (
        <SectionCard icon="😴" title={t('todaySummaryUI.overtimeLogTitle')}>
          {idleList.length === 0 ? (
            <p className="text-xs text-slate-500">{t('todaySummaryUI.noOvertime')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {idleList.map((s, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400 font-mono">
                    {msToHHMM(s.startedAt)} – {msToHHMM(s.endedAt)}
                  </p>
                  <span className="text-sm font-mono font-semibold text-rose-300">{formatRemaining(s.durationSec)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        )}

        {(paybackRunning || paybackList.length > 0) && (
        <SectionCard icon="⚡" title={t('todaySummaryUI.paybackLogTitle')}>
          {paybackRunning && (
            <div className="mb-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-emerald-300">{t('todaySummaryUI.paybackRunning')}</p>
              <span className="text-sm font-mono font-semibold text-emerald-300">{formatRemaining(engine.paybackSeconds)}</span>
            </div>
          )}
          {paybackList.length > 0 && (
            <div className="flex flex-col divide-y divide-white/5">
              {paybackList.map((s, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400 font-mono">
                    {msToHHMM(s.startedAt)} – {msToHHMM(s.endedAt)}
                  </p>
                  <span className="text-sm font-mono font-semibold text-emerald-300">{formatRemaining(s.durationSec)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
            {t('todaySummaryUI.netOvertime', { time: formatRemaining(engine.idleSeconds) })}
          </p>
        </SectionCard>
        )}
      </div>
      )}
    </div>
  )
}
