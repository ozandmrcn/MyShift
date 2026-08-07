import React from 'react'
import { useLiveShiftEngine } from '../hooks/useLiveShiftEngine'
import { useShiftStore } from '../stores/useShiftStore'
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
    isOvertime
  } = useLiveShiftEngine()

  const { completeShift, extendActiveShift, uncompleteShift } = useShiftStore()

  const colors = currentActivity ? getColors(currentActivity.color) : null

  const handleCompleteShift = () => {
    completeShift(currentDateStr)
  }

  const handleUncompleteShift = () => {
    uncompleteShift(currentDateStr)
  }

  const handleExtendShift = () => {
    if (activeTemplate) {
      extendActiveShift(activeTemplate.id, 30) // extend by 30 mins
    }
  }

  return (
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
          </div>
          <div className="text-left md:text-right">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">AKTİF VARDİYA</span>
            <h3 className="text-xl font-medium text-slate-200 mt-1">
              {activeTemplate ? activeTemplate.name : 'Vardiya Atanmadı'}
            </h3>
            {activeTemplate && (
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
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">MEVCUT AKTİVİTE</span>
            
            {currentActivity ? (
              <div className="mt-4 flex items-start gap-4">
                <div className={`text-5xl p-4 rounded-2xl border ${colors?.bg} ${colors?.border} shadow-lg ${colors?.glow}`}>
                  {currentActivity.icon}
                </div>
                <div>
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
            ) : isBeforeShift ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">💤</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">Vardiya Henüz Başlamadı</h1>
                  <p className="text-sm text-slate-400 mt-1">Günün ilk aktivitesi başlamak üzere bekleniyor.</p>
                </div>
              </div>
            ) : isOvertime ? (
              <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="text-5xl p-4 rounded-2xl border bg-rose-500/10 border-rose-500/30 animate-pulse">⏰</div>
                  <div>
                    <h1 className="text-2xl font-semibold text-rose-400">Vardiya Süresi Aşıldı!</h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Aşım: <span className="font-mono font-bold text-rose-300">{remainingTimeStr}</span> — Tamamlayın veya süreyi uzatın.
                    </p>
                  </div>
                </div>
                {/* Control Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button 
                    onClick={handleExtendShift}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg font-semibold border border-white/5 transition-colors"
                  >
                    ⏱ 30 Dk Uzat
                  </button>
                  <button 
                    onClick={handleCompleteShift}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
                  >
                    ✔ Vardiyayı Tamamla
                  </button>
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
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <div className="text-5xl p-4 rounded-2xl border bg-slate-500/10 border-slate-500/20">☕</div>
                <div>
                  <h1 className="text-2xl font-medium text-slate-300">Serbest Zaman (Boşluk)</h1>
                  <p className="text-sm text-slate-400 mt-1">Şu anda planlanmış bir aktivite bulunmuyor.</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress & Remaining Time / Overtime */}
          <div className="mt-8">
            <div className="flex justify-between items-end mb-2">
              <div>
                <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
                  {isOvertime ? 'AŞIM SÜRESİ' : 'KALAN SÜRE'}
                </span>
                <span className={`text-4xl font-semibold tracking-tight ${
                  isOvertime ? 'text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.2)]' : colors?.text || 'text-slate-300'
                }`}>
                  {isShiftFinished ? '00:00' : remainingTimeStr}
                </span>
              </div>
              {currentActivity && (
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Tamamlanma: %{Math.round(activityProgress)}
                </span>
              )}
            </div>
            
            {/* Custom Progress Bar */}
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-1000 ease-out rounded-full ${
                  isOvertime ? 'bg-rose-500' : colors?.raw || 'bg-slate-500'
                }`}
                style={{ width: `${isShiftFinished || isOvertime ? 100 : currentActivity ? activityProgress : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Bottom Shift Progress and Next Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Shift Completion Card */}
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
                ></div>
              </div>
            </div>
          </div>

          {/* Next Activity Card */}
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

      </div>

      {/* Right Column - Today's Timeline */}
      <div className="fluent-card p-6 flex flex-col h-full min-h-[450px]">
        <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-4">BUGÜNÜN ZAMAN ÇİZELGESİ</span>
        <div className="flex-1 overflow-y-auto">
          <Timeline />
        </div>
      </div>
    </div>
  )
}
