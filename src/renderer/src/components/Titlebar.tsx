import React from 'react'

export default function Titlebar() {
  const handleMinimize = () => {
    window.electronAPI?.window?.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI?.window?.maximize()
  }

  const handleClose = () => {
    window.electronAPI?.window?.close()
  }

  return (
    <header 
      className="flex items-center justify-between h-9 px-3 bg-slate-900/40 border-b border-white/5 select-none"
      style={{ WebKitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Brand Label */}
      <div className="flex items-center gap-2">
        <span className="text-sm">📅</span>
        <span className="text-xs font-semibold tracking-wider text-slate-300">MYSHIFT</span>
      </div>

      {/* Control Buttons */}
      <div 
        className="flex h-full"
        style={{ WebKitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <button 
          onClick={handleMinimize}
          className="flex items-center justify-center w-11 h-full hover:bg-white/10 transition-colors"
          title="Simge Durumuna Küçült"
        >
          <svg className="w-2.5 h-2.5 fill-slate-300" viewBox="0 0 10 1">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize */}
        <button 
          onClick={handleMaximize}
          className="flex items-center justify-center w-11 h-full hover:bg-white/10 transition-colors"
          title="Ekranı Kapla"
        >
          <svg className="w-2.5 h-2.5 fill-none stroke-slate-300 stroke-[1px]" viewBox="0 0 10 10">
            <rect x="1.5" y="1.5" width="7" height="7" />
          </svg>
        </button>

        {/* Close */}
        <button 
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-full hover:bg-red-600/90 hover:fill-white group transition-colors"
          title="Kapat"
        >
          <svg className="w-2.5 h-2.5 fill-slate-300 group-hover:fill-white" viewBox="0 0 10 10">
            <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
