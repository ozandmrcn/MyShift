import React, { useEffect, useRef } from 'react'
import { useLiveShiftEngine } from '../hooks/useLiveShiftEngine'
import { useShiftStore } from '../stores/useShiftStore'

export default function Timeline() {
  const { activeTemplate, currentActivity, activitiesStatus, isShiftFinished, isOvertime, currentDateStr } =
    useLiveShiftEngine()
  const { uncompleteShift } = useShiftStore()
  const activeItemRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (currentActivity && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentActivity?.id])

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
      {/* Activity list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
        {sorted.map((act) => {
          const status = activitiesStatus[act.id] || 'future'
          const isCurrent = status === 'active'
          const isCompleted = status === 'completed'

          return (
            <div
              key={act.id}
              ref={isCurrent ? activeItemRef : null}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all duration-200 ${
                isCurrent
                  ? 'bg-blue-500/10 border-blue-500/50 shadow-sm'
                  : isCompleted
                  ? 'bg-emerald-500/5 border-emerald-500/15 opacity-55'
                  : 'bg-white/2 border-white/5 opacity-35'
              }`}
            >
              {/* Status dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isCurrent ? 'bg-blue-400 animate-pulse' : isCompleted ? 'bg-emerald-400' : 'bg-slate-600'
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
                  ? 'bg-blue-500/20 text-blue-300'
                  : isCompleted
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-white/5 text-slate-500'
              }`}>
                {act.duration}dk
              </span>
            </div>
          )
        })}
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
              isShiftFinished ? 'bg-emerald-500' : isOvertime ? 'bg-rose-500' : 'bg-blue-500'
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
          <div className="text-center text-[10px] text-rose-400 font-mono animate-pulse">
            ⏰ Vardiya süresi aşıldı
          </div>
        )}
      </div>
    </div>
  )
}
