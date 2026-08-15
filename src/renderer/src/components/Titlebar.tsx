import { useLiveShiftEngine, formatRemaining } from '../hooks/useLiveShiftEngine'

export default function Titlebar() {
  const {
    currentActivity,
    isBeforeShift,
    isShiftFinished,
    isOvertime,
    paybackRunning,
    isIdle,
    remainingTimeStr,
    idleSeconds,
    activeTemplate
  } = useLiveShiftEngine() as any

  const handleMinimize = () => window.electronAPI?.window?.minimize()
  const handleMaximize = () => window.electronAPI?.window?.maximize()
  const handleClose = () => window.electronAPI?.window?.close()

  // Build status pill
  let pill: { label: string; color: string } | null = null
  if (isShiftFinished) {
    pill = { label: '✔ Tamamlandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
  } else if (paybackRunning) {
    pill = { label: `⏳ Payback · ${formatRemaining(idleSeconds)}`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
  } else if (isOvertime) {
    pill = { label: '⏰ Aşım', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
  } else if (isIdle && idleSeconds > 0) {
    pill = { label: `📈 Aşım · ${formatRemaining(idleSeconds)}`, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
  } else if (currentActivity) {
    pill = {
      label: `${currentActivity.icon} ${currentActivity.name} · ${remainingTimeStr}`,
      color: 'text-blue-300 bg-blue-500/10 border-blue-500/20'
    }
  } else if (isBeforeShift && activeTemplate) {
    pill = { label: '💤 Vardiya Bekleniyor', color: 'text-slate-400 bg-white/5 border-white/10' }
  }

  return (
    <div
      className="flex items-center justify-between h-10 px-4 bg-slate-950/70 border-b border-white/5 flex-shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: App name */}
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold text-slate-200 tracking-wide">MyShift</span>
        <span className="text-slate-700 text-xs">|</span>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Vardiya Sistemi</span>
      </div>

      {/* Center: Live activity status pill */}
      {pill && (
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium max-w-[40%] truncate ${pill.color}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="truncate">{pill.label}</span>
        </div>
      )}

      {/* Right: Window controls */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm"
          title="Küçült"
        >
          ─
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all text-xs"
          title="Büyüt / Küçült"
        >
          □
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-rose-500 transition-all text-sm"
          title="Kapat"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
