import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { useLiveShiftEngine, formatRemaining, secondsToHHMM, timeToSeconds } from '../hooks/useLiveShiftEngine'
import { useShiftStore } from '../stores/useShiftStore'

// Format seconds as HH:MM:SS (for the independent payback stopwatch)
function fmtHMS(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Timeline() {
  const {
    activeTemplate,
    activityList,
    currentActivity,
    activitiesStatus,
    isShiftFinished,
    isOvertime,
    idleSeconds,
    paybackSeconds,
    paybackRunning,
    currentDateStr,
    effectiveTime,
    effectiveSecs,
    activeShiftSecs,
    flexMode,
    flexTotalSecs,
    flexUsedSecs,
    flexRemainingSecs,
    flexRemainingMap,
    flexUsedBy,
    planUsedBy,
    flexActiveId,
    flexOverage,
    flexRunning,
    isPaused
  } = useLiveShiftEngine()
  const mode = useShiftStore((s) => s.settings.mode)
  const { uncompleteShift, startPayback, stopPayback, finishPayback, enableFlex, disableFlex, flexStartBreak, flexStopBreak } = useShiftStore()
  const { t } = useT()
  const activeItemRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [confirmPayback, setConfirmPayback] = useState(false)

  useEffect(() => {
    if (currentActivity && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentActivity?.id])

  const handleScroll = () => {
    setScrolled((scrollRef.current?.scrollTop ?? 0) > 12)
  }

  const scrollToFirst = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!activeTemplate || activeTemplate.activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 text-slate-500">
        <span className="text-3xl mb-2">📅</span>
        <p className="text-xs text-center">Bugün için aktif bir vardiya planı bulunmuyor.</p>
      </div>
    )
  }

  const sorted = [...activeTemplate.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
  // The engine's activity list carries the mode adjustments: in PLANNED (Programlı)
  // mode breaks whose allowance flex spent are shortened and the rest of the day
  // slides earlier; in FLEX mode break rows are removed entirely (their windows are
  // absorbed into the surrounding work). Breaks are spent only from the flex pool
  // card above, which still reads the raw template.
  const sortedDisp = mode === 'myshift' && activityList && activityList.length > 0 ? activityList : sorted
  const completedCount = sortedDisp.filter(a => (activitiesStatus[a.id] || 'future') === 'completed').length
  const breakPoolSecs = sorted.filter(a => a.isBreak).reduce((sum, a) => sum + (a.duration || 0), 0) * 60
  // Per-scheduled-break allowances — each "Mola mı?" activity owns its own minutes.
  const breakPoolByBreakId: Record<string, number> = {}
  for (const a of sorted) {
    if (a.isBreak) breakPoolByBreakId[a.id] = Math.max(0, (a.duration || 0) * 60)
  }

  // Breaks whose scheduled window already fully finished in PLANNED mode were consumed
  // by the plan clock (they ran automatically) — carry that spent time into the flex
  // pool so a mid-day switch to Esnek doesn't refund breaks the plan already gave.
  // Only genuinely finished windows are carried; future breaks keep their allowance.
  const planSpentCarry: Record<string, number> = {}
  for (const a of sorted) {
    if (!a.isBreak) continue
    const spent = planUsedBy[a.id] ?? 0
    if (spent > 0 && (activitiesStatus[a.id] || 'future') === 'completed') {
      planSpentCarry[a.id] = Math.min((a.duration || 0) * 60, spent)
    }
  }

  // After a late start / pause the whole schedule moves forward: reflect the NEW
  // times here so "where am I / what's next" stays truthful at a glance.
  const shiftFactor = activeShiftSecs > 0 ? activeShiftSecs : 0
  const shiftTime = (hm: string) => secondsToHHMM((timeToSeconds(`${hm}:00`) + shiftFactor + 86400) % 86400)

  // Earliest break that hasn't fully ended yet → "next break" highlight.
  const nextBreak = !isShiftFinished
    ? (sortedDisp.find(a => a.isBreak && (activitiesStatus[a.id] || 'future') !== 'completed') ?? null)
    : null
  const nextBreakId = nextBreak?.id ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Live status strip — answers "where am I / how much is left / what's next" */}
      {mode === 'myshift' && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg border border-white/5 bg-white/3 text-[11px] text-slate-300 flex-shrink-0">
          <span className="min-w-0 truncate">
            {t('timelineUI.effectiveClock')}:{' '}
            <span className="font-mono font-bold text-slate-100">{effectiveTime}</span>
            {shiftFactor > 0 && (
              <span className="ml-1.5 text-amber-300/90">{t('timelineUI.shifted')}</span>
            )}
          </span>
          {isShiftFinished ? (
            <span className="text-emerald-400 font-semibold flex-shrink-0">✔ {t('timelineUI.shiftDone')}</span>
          ) : (
            <span className="flex-shrink-0">
              {nextBreak ? (
                <> {t('timelineUI.nextBreak')}:{' '}
                  <span className="font-semibold text-sky-300">☕ {nextBreak.name} {shiftFactor > 0 ? shiftTime(nextBreak.startTime) : nextBreak.startTime}</span>
                </>
              ) : (
                <span className="text-slate-500">{t('timelineUI.noNextBreak')}</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Flexible-break control — MyShift only. Scheduled break minutes are pooled and
          spent at will (Esnek) instead of running on a set clock (Programlı). */}
      {mode === 'myshift' && (
        <div className="flex-shrink-0 mb-2">
          <div className="flex p-0.5 rounded-lg bg-slate-800/60 border border-white/5 text-[11px] font-semibold">
            <button
              onClick={disableFlex}
              disabled={!flexMode}
              className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
                !flexMode ? 'accent-solid text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('timelineUI.breakModePlanned')}
            </button>
            <button
              onClick={() => enableFlex(breakPoolSecs, breakPoolByBreakId, planSpentCarry)}
              disabled={flexMode || isPaused || isShiftFinished}
              title={breakPoolSecs === 0 ? t('timelineUI.flexNoBreaks') : undefined}
              className={`flex-1 px-3 py-1.5 rounded-md transition-colors ${
                flexMode ? 'accent-solid text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('timelineUI.breakModeFlex')}
            </button>
          </div>

          {flexMode && (() => {
            const activeBreak = flexActiveId ? sorted.find(a => a.id === flexActiveId) ?? null : null
            return (
              <div className="mt-2 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-400">{t('timelineUI.flexPoolLabel')}</span>
                  <span className={`text-[10px] font-mono ${flexRemainingSecs === 0 ? 'text-slate-500' : 'text-emerald-300'}`}>
                    {t('timelineUI.flexRemaining', { time: formatRemaining(flexRemainingSecs, false, 'sa', 'dk', true) })}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2 border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${flexTotalSecs > 0 ? Math.min(100, (flexUsedSecs / flexTotalSecs) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 min-w-0 truncate">
                  {flexRunning && activeBreak ? (
                    <span className="text-emerald-300">
                      {activeBreak.icon} {activeBreak.name} {t('timelineUI.flexRunningBreak')}
                    </span>
                  ) : (
                    t('timelineUI.flexDesc')
                  )}
                </p>
                {flexOverage && (
                  <p className="text-[10px] text-amber-300 font-semibold mt-1 animate-pulse">
                    🔥 {t('timelineUI.flexOverageNote')}
                  </p>
                )}
                {/* Per-break breakdown — each scheduled break's pool has how much left (incl. what
                    the plan already consumed). These chips ARE the start/stop controls:
                    click a break to spend it (☕), click the running one to end it (⏹). */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {sorted.filter(a => a.isBreak).map(a => {
                    const rem = flexRemainingMap[a.id] ?? 0
                    const runningHere = flexActiveId === a.id && flexRunning
                    const blocked = flexRunning && flexActiveId !== null && !runningHere
                    const spent = rem <= 0 && !runningHere
                    return (
                      <button
                        key={a.id}
                        disabled={blocked || spent}
                        onClick={() => (runningHere ? flexStopBreak() : flexStartBreak(a.id, Math.round(effectiveSecs)))}
                        title={`${a.name}: ${runningHere
                          ? flexOverage
                            ? `🔥 ${t('timelineUI.flexOverageNote')}`
                            : `${t('timelineUI.flexEndBreak')} — ${t('timelineUI.flexStartBreak')} ile durur`
                          : spent
                            ? t('timelineUI.flexDoneBadge')
                            : `${t('timelineUI.flexStartBreak')} · ${t('timelineUI.flexLeft')} ${formatRemaining(rem, false, 'sa', 'dk', true)}`}`}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-mono border transition-colors ${
                          runningHere
                            ? flexOverage
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse'
                              : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                            : blocked || spent
                            ? 'bg-slate-800/40 border-white/5 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 cursor-pointer hover:bg-emerald-500/25 hover:border-emerald-400 active:scale-95'
                        }`}
                      >
                        <span>{a.icon}</span>
                        <span className="max-w-24 truncate">{a.name}</span>
                        <span className="whitespace-nowrap">
                          {runningHere
                            ? flexOverage
                              ? `🔥 ${t('timelineUI.flexOvertimeBadge')}`
                              : `⏹ ${formatRemaining(rem, false, 'sa', 'dk', true)} ${t('timelineUI.flexLeft')}`
                            : spent
                            ? `✔ ${t('timelineUI.flexDoneBadge')}`
                            : `${formatRemaining(rem, false, 'sa', 'dk', true)} ${t('timelineUI.flexLeft')}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Activity list */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto flex flex-col gap-1.5 pr-8">
          {sortedDisp.map((act) => {
            const status = activitiesStatus[act.id] || 'future'
            const isCurrent = status === 'active'
            const isCompleted = status === 'completed'
            // Flexible mode: how many seconds this break still has on its own
            // allowance. A break is "done" once this hits zero, not on first use.
            const flexRem = flexMode && act.isBreak ? flexRemainingMap[act.id] ?? 0 : 0
            const flexRunningHere = flexMode && act.isBreak && flexActiveId === act.id && flexRunning
            // Planned mode: a break that flex spending shortened or the plan already
            // consumed shows its remaining allowance — the synced ledger countdown.
            const planBreakRem = !flexMode && act.isBreak && mode === 'myshift'
              ? flexRemainingMap[act.id] ?? (act.duration || 0) * 60
              : null
            const planBreakTouched = !flexMode && act.isBreak && mode === 'myshift'
              ? ((flexUsedBy[act.id] ?? 0) + (planUsedBy[act.id] ?? 0)) > 0
              : false

            return (
              <div
                key={act.id}
                ref={isCurrent ? activeItemRef : null}
                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all duration-200 ${
                  isCurrent
                    ? 'accent-soft accent-border shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-500/5 border-emerald-500/15 opacity-55'
                    : 'bg-white/2 border-white/5 opacity-35'
                }`}
              >
                {/* Status dot */}
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isCurrent ? 'accent-solid animate-pulse' : isCompleted ? 'bg-emerald-400' : 'bg-slate-600'
                }`} />

                {/* Icon */}
                <span className="text-sm flex-shrink-0 leading-none w-5 text-center">{act.icon}</span>

                {/* Pooled-break badge: in flexible mode a scheduled break that still has
                    time left is free time — clickable to spend. Once fully consumed (or
                    running) the badge drops; a partially used break keeps it. */}
                {flexMode && act.isBreak && !flexRunningHere && flexRem > 0 && (
                  <span className="text-[10px] leading-none flex-shrink-0" title={t('timelineUI.flexPoolBadge')}>🔓</span>
                )}

                {/* Name */}
                <span className={`text-xs font-medium truncate flex-1 min-w-0 ${
                  isCurrent ? 'text-white' : isCompleted ? 'text-emerald-300' : 'text-slate-400'
                }`}>
                  {act.name}
                </span>

                {/* Time range — reflects the active shift (kaydırma/duraklatma) so the list
                  always matches the effective schedule */}
                <span className={`text-[10px] font-mono flex-shrink-0 ${shiftFactor > 0 ? 'text-amber-300/90' : 'text-slate-500'}`}>
                  {shiftFactor > 0 ? `${shiftTime(act.startTime)}–${shiftTime(act.endTime)}` : `${act.startTime}–${act.endTime}`}
                </span>

                {/* Next-break marker */}
                {act.id === nextBreakId && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold flex-shrink-0">
                    {t('timelineUI.nextBreak')}
                  </span>
                )}

                {/* Duration */}
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                  isCurrent
                    ? 'accent-soft accent-text-soft'
                    : isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-white/5 text-slate-500'
                }`}>
                  {act.duration}dk
                </span>

                {/* Planned-mode sync chip — flex spending shortened this break's window
                    (07:30–07:45 → 07:30–07:35) and/or the plan already consumed some of
                    it; the remaining shows what's still unused from the shared ledger. */}
                {planBreakTouched && (
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${
                    (planBreakRem ?? 0) <= 0
                      ? 'bg-white/5 text-slate-500'
                      : 'bg-sky-500/15 text-sky-300'
                  }`}>
                    {(planBreakRem ?? 0) <= 0
                      ? `✔ ${t('timelineUI.flexDoneBadge')}`
                      : `${formatRemaining(planBreakRem ?? 0)} ${t('timelineUI.flexLeft')}`}
                  </span>
                )}

                {/* Flexible-break interaction — scheduled "Mola mı?" chips become the
                    spendable pool. The running break shows its live remaining time (and
                    AŞIM once its allowance runs out). Controls stack under the remaining
                    chip so rows stay narrow; fixed chip width + a reserved button slot
                    keep the list from shifting as the countdown ticks. Ending a break
                    only consumes the minutes actually used — the rest stay available
                    for another round; a break is locked only once fully spent. */}
                {flexMode && act.isBreak && (
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`h-5 min-w-[4.5rem] px-1.5 flex items-center justify-center text-[9px] font-mono rounded whitespace-nowrap ${
                      flexRunningHere
                        ? flexOverage
                          ? 'bg-amber-500/15 text-amber-300 font-semibold animate-pulse'
                          : 'bg-emerald-500/15 text-emerald-300'
                        : flexRem <= 0
                        ? 'bg-white/5 text-slate-500'
                        : 'bg-slate-800/60 text-slate-300'
                    }`}>
                      {flexRunningHere
                        ? flexOverage
                          ? `🔥 ${t('timelineUI.flexOvertimeBadge')}`
                          : `${formatRemaining(flexRem)} ${t('timelineUI.flexLeft')}`
                        : flexRem <= 0
                        ? `✔ ${t('timelineUI.flexDoneBadge')}`
                        : `${formatRemaining(flexRem)} ${t('timelineUI.flexLeft')}`}
                    </span>
                    <div className="h-6 flex items-center justify-end">
                      {flexRunningHere ? (
                        <button
                          onClick={flexStopBreak}
                          className="flex-shrink-0 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-slate-200 font-semibold transition-colors whitespace-nowrap"
                        >
                          ⏹ {t('timelineUI.flexEndBreak')}
                        </button>
                      ) : flexRem > 0 ? (
                        <button
                          onClick={() => flexStartBreak(act.id, Math.round(effectiveSecs))}
                          className="flex-shrink-0 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors shadow-md shadow-emerald-500/20"
                        >
                          ☕ {t('timelineUI.flexStartBreak')}
                        </button>
                      ) : (
                        <span className="block" aria-hidden />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Aşım (payback) — optional work session at the end of the day that pays
              back the aşım time: while it runs, each second subtracts from aşım. */}
          <div className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-lg border transition-all duration-200 ${
            paybackRunning
              ? 'border-amber-400/60 bg-amber-500/10 shadow-md shadow-amber-500/10'
              : 'border-dashed border-amber-500/40 bg-amber-500/5'
          } ${isShiftFinished || (idleSeconds === 0 && paybackSeconds === 0 && !paybackRunning) ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${paybackRunning ? 'bg-amber-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-sm flex-shrink-0 leading-none w-5 text-center">⏳</span>
              <span className="text-xs font-medium truncate flex-1 min-w-0 text-amber-300">
                Aşım (Payback)
              </span>
              <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">Gün Sonunda</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 bg-amber-500/15 text-amber-400">
                Kalan: {idleSeconds > 0 ? formatRemaining(idleSeconds) : '00:00'}
              </span>
            </div>
            <div className="flex items-center justify-between pl-9 gap-2">
              <span className="text-[10px] font-mono text-slate-400 min-w-0 truncate">
                {paybackRunning
                  ? <span className="text-amber-300">⏱ Payback sürüyor — {fmtHMS(paybackSeconds)}</span>
                  : paybackSeconds > 0
                  ? <span>Ödenen: <span className="text-amber-300 font-semibold">{fmtHMS(paybackSeconds)}</span></span>
                  : <span>Geri ödeme yapılmadı</span>}
              </span>
              {!isShiftFinished && (idleSeconds > 0 || paybackSeconds > 0 || paybackRunning) && (
                <div className="flex gap-1.5 flex-shrink-0">
                  {paybackRunning ? (
                    <>
                      <button
                        onClick={stopPayback}
                        className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-slate-300 font-semibold transition-colors"
                        title="Payback'i duraklat"
                      >
                        ⏸ Durdur
                      </button>
                      <button
                        onClick={finishPayback}
                        className="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-semibold transition-colors shadow-md shadow-amber-500/20"
                        title="Payback'i bitir ve vardiyayı tamamla"
                      >
                        ✔ Bitir
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmPayback(true)}
                        className="px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-semibold transition-colors shadow-md shadow-amber-500/20"
                        title={paybackSeconds > 0 ? "Payback'e devam et" : 'Payback başlat — aşım süresini çalışarak kapat'}
                      >
                        ▶ {paybackSeconds > 0 ? 'Devam Et' : 'Başla'}
                      </button>
                      {paybackSeconds > 0 && (
                        <button
                          onClick={finishPayback}
                          className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-slate-300 font-semibold transition-colors"
                          title="Payback'i bitir ve vardiyayı tamamla"
                        >
                          ✔ Bitir
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floating scroll-to-first button — only appears once the list is scrolled.
            Kept small (icon only) so it stays inside the pr-8 gutter and never
            overlaps the row's controls on the right. */}
        {scrolled && (
          <button
            onClick={scrollToFirst}
            className="absolute top-0 right-0 z-10 flex items-center justify-center w-6 h-6 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-[11px] text-slate-300 font-medium transition-colors shadow-lg backdrop-blur"
            title="İlk Aktiviteye Dön"
          >
            <span className="leading-none">⤒</span>
          </button>
        )}
      </div>

      {/* Bottom section: progress + undone */}
      <div className="mt-3 pt-3 border-t border-white/5 flex-shrink-0">
        {/* Progress bar */}
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] text-slate-500">
            {completedCount}/{sortedDisp.length} tamamlandı
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {Math.round((completedCount / sortedDisp.length) * 100)}%
          </span>
        </div>
        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isShiftFinished ? 'bg-emerald-500' : isOvertime ? 'bg-amber-500' : 'accent-solid'
            }`}
            style={{ width: `${(completedCount / sortedDisp.length) * 100}%` }}
          />
        </div>

        {/* Undone button — only when shift is manually completed */}
        {isShiftFinished && (
          <button
            onClick={() => uncompleteShift(currentDateStr)}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/5 text-xs text-slate-300 font-medium transition-colors"
          >
            <span>↩</span>
            <span>Vardiyayı Geri Al / Devam Et</span>
          </button>
        )}
        {isOvertime && (
          <div className="text-center text-[10px] text-amber-400 font-mono animate-pulse">
            ⏳ Aşım (boşta) sürüyor
          </div>
        )}
      </div>

      {/* Payback start confirmation */}
      {confirmPayback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setConfirmPayback(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-lg shadow-lg shadow-amber-500/20">⏳</div>
                <h3 className="text-lg font-semibold text-white">Payback Başlat</h3>
              </div>
              <p className="text-sm text-slate-400 mt-4 leading-relaxed">
                Bugünkü <span className="text-amber-300 font-medium">{formatRemaining(idleSeconds)}</span> aşım sürenizi çalışarak kapatmaya başlamak istiyor musunuz? Payback sürerken aşım sayacı her saniye azalır.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <button
                onClick={() => setConfirmPayback(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  startPayback()
                  setConfirmPayback(false)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.03] active:scale-[0.98]"
              >
                ▶ {paybackSeconds > 0 ? 'Devam Et' : 'Başla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
