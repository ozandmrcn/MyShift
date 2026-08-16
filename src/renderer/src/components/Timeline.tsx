import { useEffect, useRef, useState } from 'react'
import { useLiveShiftEngine, formatRemaining, timeToSeconds } from '../hooks/useLiveShiftEngine'
import { useShiftStore, Activity } from '../stores/useShiftStore'

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
    currentActivity,
    activitiesStatus,
    isShiftFinished,
    isOvertime,
    idleSeconds,
    paybackSeconds,
    paybackRunning,
    currentDateStr,
    effectiveTime,
    currentTimeSecs,
    timeOffset
  } = useLiveShiftEngine()
  const { uncompleteShift, setTimeOffset, startPayback, stopPayback, finishPayback } = useShiftStore()
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

  // Rewind the engine so the app behaves as if it were that activity's start time
  const handleRewind = (act: Activity) => {
    const [ah, am] = act.startTime.split(':').map(Number)
    const targetSecs = ah * 3600 + am * 60
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs))
    uncompleteShift(currentDateStr)
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
  const completedCount = sorted.filter(a => (activitiesStatus[a.id] || 'future') === 'completed').length

  return (
    <div className="flex flex-col h-full">
      {/* Rewind banner — visible when the day has been rewound manually */}
      {timeOffset !== 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300 flex-shrink-0">
          <span className="min-w-0">
            ↺ Geri alındı — efektif saat{' '}
            <span className="font-mono font-bold text-indigo-200">{effectiveTime}</span>
          </span>
          <button
            onClick={() => setTimeOffset(0)}
            className="px-2.5 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 font-semibold transition-colors flex-shrink-0"
          >
            Canlı Saate Dön
          </button>
        </div>
      )}

      {/* Activity list */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto flex flex-col gap-1.5 pr-8">
          {sorted.map((act) => {
            const status = activitiesStatus[act.id] || 'future'
            const isCurrent = status === 'active'
            const isCompleted = status === 'completed'

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

                {/* Name */}
                <span className={`text-xs font-medium truncate flex-1 min-w-0 ${
                  isCurrent ? 'text-white' : isCompleted ? 'text-emerald-300' : 'text-slate-400'
                }`}>
                  {act.name}
                </span>

                {/* Time range */}
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                  {act.startTime}–{act.endTime}
                </span>

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

                {/* Rewind to this activity */}
                <button
                  onClick={() => handleRewind(act)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:accent-text-soft hover:bg-white/5 rounded-md px-1 py-0.5 text-[12px] leading-none"
                  title="Bu aktiviteye geri al — o saatteymiş gibi başlat"
                >
                  ↺
                </button>
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

        {/* Floating scroll-to-first button — only appears once the list is scrolled */}
        {scrolled && (
          <button
            onClick={scrollToFirst}
            className="absolute top-0 right-0 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 border border-white/10 text-[10px] text-slate-300 font-medium transition-colors shadow-lg backdrop-blur"
            title="İlk Aktiviteye Dön"
          >
            <span className="text-[11px] leading-none">⤒</span>
            <span className="hidden sm:inline">Başa Dön</span>
          </button>
        )}
      </div>

      {/* Bottom section: progress + undone */}
      <div className="mt-3 pt-3 border-t border-white/5 flex-shrink-0">
        {/* Progress bar */}
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] text-slate-500">
            {completedCount}/{sorted.length} tamamlandı
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {Math.round((completedCount / sorted.length) * 100)}%
          </span>
        </div>
        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isShiftFinished ? 'bg-emerald-500' : isOvertime ? 'bg-amber-500' : 'accent-solid'
            }`}
            style={{ width: `${(completedCount / sorted.length) * 100}%` }}
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
