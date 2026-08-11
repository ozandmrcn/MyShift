import { useState } from 'react'
import { useLiveShiftEngine, timeToSeconds, formatRemaining } from '../hooks/useLiveShiftEngine'
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
    isOvertime,
    idleSeconds,
    idleLogSeconds,
    paybackSeconds,
    paybackRunning,
    workedSeconds,
    resetIdle,
    effectiveTime,
    timeOffset
  } = useLiveShiftEngine()

  const { completeShift, extendActiveShift, uncompleteShift, setTimeOffset, stopPayback, finishPayback } = useShiftStore()

  const colors = currentActivity ? getColors(currentActivity.color) : null

  const [confirmReset, setConfirmReset] = useState(false)

  // Idle (aşım) state — only inside an active shift with activities, between activities
  // or in overtime. With no shift for today the user is simply free, NOT in aşım.
  const isIdle = !!activeTemplate && activeTemplate.activities.length > 0
    && !currentActivity && !isBeforeShift && !isShiftFinished

  // Payback progress — what fraction of today's gross aşım log has been paid back
  const paybackPercent = idleLogSeconds > 0
    ? Math.min(100, (Math.max(0, idleLogSeconds - idleSeconds) / idleLogSeconds) * 100)
    : 0

  // ── Day summary calculations (always based on the LIVE clock) ───────────────
  const sortedActivities = activeTemplate
    ? [...activeTemplate.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    : []
  const plannedMinutes = sortedActivities.reduce((s, a) => s + a.duration, 0)
  const shiftStartTime = sortedActivities[0]?.startTime ?? '--:--'
  const shiftEndTime = sortedActivities[sortedActivities.length - 1]?.endTime ?? '--:--'
  const isCurrentLast = !!currentActivity && sortedActivities.length > 0
    && sortedActivities[sortedActivities.length - 1].id === currentActivity.id

  // Live position (ignores manual completion & rewind so the summary reflects reality)
  const realSecs = timeToSeconds(currentTimeSecs)
  const shiftEndSecs = sortedActivities.length ? timeToSeconds(sortedActivities[sortedActivities.length - 1].endTime) : 0

  let status = { text: '—', cls: 'text-slate-400' }
  if (isShiftFinished) status = { text: 'Tamamlandı', cls: 'text-emerald-400' }
  else if (isBeforeShift) status = { text: 'Başlamadı', cls: 'text-slate-400' }
  else if (paybackRunning) status = { text: 'Payback', cls: 'text-amber-400' }
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

  // While idle (aşım), jump straight to the next activity's start.
  // Only the real time spent idle is counted as aşım.
  const handleGoToNextActivity = () => {
    if (!nextActivity) return
    const targetSecs = timeToSeconds(nextActivity.startTime)
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs))
  }

  const handleResetIdle = () => {
    setConfirmReset(false)
    resetIdle()
  }

  // Complete the current activity — jumps to its end so the next one becomes active.
  // On the last activity it completes the whole shift.
  const handleCompleteCurrentActivity = () => {
    if (!currentActivity) return
    if (isCurrentLast) {
      completeShift(currentDateStr)
      return
    }
    const targetSecs = timeToSeconds(currentActivity.endTime)
    setTimeOffset(targetSecs - timeToSeconds(currentTimeSecs))
  }

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
            {timeOffset !== 0 && (
              <button
                onClick={() => setTimeOffset(0)}
                className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300 font-medium hover:bg-indigo-500/20 transition-colors"
                title="Canlı saate dön"
              >
                ↺ Geri alındı — <span className="font-mono font-bold">{effectiveTime}</span> · Canlıya Dön
              </button>
            )}
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
                          ></div>
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
                    title="Payback'i duraklat"
                  >
                    ⏸ Durdur
                  </button>
                  <button
                    onClick={finishPayback}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-amber-500/20"
                    title="Payback'i bitir ve vardiyayı tamamla"
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
                )}
                {nextActivity && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleGoToNextActivity}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md shadow-blue-500/20"
                      title="Boşta beklemeyi bırak, sıradaki aktiviteye geç"
                    >
                      ▶ Sıradaki Aktiviteye Geç — {nextActivity.icon} {nextActivity.name} ({nextActivity.startTime})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress & Remaining Time / Overtime */}
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
            
            {/* Custom Progress Bar */}
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-1000 ease-out rounded-full ${
                  isIdle ? 'bg-amber-500' : colors?.raw || 'bg-slate-500'
                }`}
                style={{ width: `${isShiftFinished || isOvertime ? 100 : paybackRunning ? paybackPercent : currentActivity ? activityProgress : 0}%` }}
              ></div>
            </div>
          </div>
          )}
        </div>

        {/* Bottom Shift Progress and Next Activity */}
        {activeTemplate && activeTemplate.activities.length > 0 && (
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
        )}

      </div>

      {/* Right Column - Today's Timeline */}
      <div className="fluent-card p-6 flex flex-col h-full min-h-[450px]">
        <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-4">BUGÜNÜN ZAMAN ÇİZELGESİ</span>
        <div className="flex-1 overflow-y-auto">
          <Timeline />
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
                title="Anlık aşım süresini sıfırla"
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
