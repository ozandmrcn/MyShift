import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { useShiftStore } from '../stores/useShiftStore'
import { timeToSeconds } from '../hooks/useLiveShiftEngine'
import { playReminderSound } from '../utils/soundEffects'

// Runs in the App root (independent of the active view) and watches Pay mode for:
//  1. Work stretch — if the user has been working uninterruptedly for more than
//     `payWorkReminderMin` minutes without a break, suggest one.
//  2. Short break overrun — if an in-budget short break (çay/kahve/ihtiyaç) runs
//     longer than `payBreakReminderMin`, warn that it's eating into other breaks.
// Fires at most once per stretch / per break session, so it never spams.
export function useBreakReminders() {
  const settings = useShiftStore((s) => s.settings)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const lastBreakEndedAt = useShiftStore((s) => s.lastBreakEndedAt)
  const showReminder = useShiftStore((s) => s.showReminder)
  const firedRef = useRef<{ work: string; brk: string }>({ work: '', brk: '' })

  useEffect(() => {
    if (settings.mode !== 'pay') {
      firedRef.current = { work: '', brk: '' }
      return
    }
    const timer = window.setInterval(() => {
      const now = Date.now()
      const d = new Date()
      const todayStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
      const dayStartMs = new Date(`${todayStr}T00:00:00`).getTime()
      const shiftStartMs = dayStartMs + timeToSeconds(`${settings.payShiftStart}:00`) * 1000
      const shiftEndMs = dayStartMs + timeToSeconds(`${settings.payShiftEnd}:00`) * 1000

      // ── Work stretch reminder ──
      // In window mode: only fire within the shift window.
      // In duration mode: fire anytime (user defines work by accumulator, not clock).
      const inShiftWindow = settings.payTargetMode === 'duration'
        || (now >= shiftStartMs && now < shiftEndMs)
      if (settings.payWorkReminderMin > 0 && !runningBreak && inShiftWindow) {
        const stretchStartMs = lastBreakEndedAt ?? 0
        const workMinutes = (now - stretchStartMs) / 60000
        if (workMinutes >= settings.payWorkReminderMin) {
          const key = `${todayStr}|${stretchStartMs}`
          if (firedRef.current.work !== key) {
            firedRef.current.work = key
            showReminder('work', `${settings.payWorkReminderMin} dakikadır mola yapmadın — kısa bir mola önerilir.`)
          }
        }
      }

      // ── Short break overrun reminder ──
      if (
        settings.payBreakReminderMin > 0
        && runningBreak
        && runningBreak.type === 'short'
        && !runningBreak.overBudget
      ) {
        const runMinutes = (now - runningBreak.startedAt) / 60000
        if (runMinutes >= settings.payBreakReminderMin) {
          const key = `${runningBreak.startedAt}`
          if (firedRef.current.brk !== key) {
            firedRef.current.brk = key
            showReminder('break', `Dikkatli ol, ${settings.payBreakReminderMin} dakikalık planladığın molanı bitirdin — başka molandan yiyorsun.`)
          }
        }
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [settings, runningBreak, lastBreakEndedAt, showReminder])
}

// Global banner for pay-mode break reminders. Auto-dismisses after 60 seconds so
// it never gets annoying, plays a distinct sound, and can be closed with one click.
export function ReminderBanner() {
  const reminder = useShiftStore((s) => s.reminder)
  const dismissReminder = useShiftStore((s) => s.dismissReminder)
  const { t } = useT()
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!reminder) return
    setClosing(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    playReminderSound()
    const t = window.setTimeout(() => {
      setClosing(true)
      closeTimerRef.current = window.setTimeout(() => dismissReminder(), 350)
    }, 60000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder?.id])

  if (!reminder) return null

  const isWork = reminder.kind === 'work'
  const accent = isWork
    ? { tile: 'bg-emerald-500/15 border-emerald-400/30', glow: 'bg-emerald-400/25', bar: 'rgba(52,211,153,0.65)', title: 'Mola Önerisi', ring: 'text-emerald-300' }
    : { tile: 'bg-amber-500/15 border-amber-400/30', glow: 'bg-amber-400/25', bar: 'rgba(251,191,36,0.65)', title: 'Mola Aşımı', ring: 'text-amber-300' }

  return (
    <div
      style={closing ? undefined : { animation: 'reminderslide 0.45s cubic-bezier(0.2,0.9,0.3,1) both' }}
      className={`fixed bottom-6 right-6 z-[70] w-96 max-w-[calc(100vw-3rem)] ${closing ? 'opacity-0 translate-y-3 transition-all duration-300' : ''}`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/90 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50">
        {/* soft colored glow in the corner */}
        <div className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl ${accent.glow}`} />

        <div className="relative flex items-start gap-3 p-4">
          {/* icon tile */}
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-xl flex-shrink-0 ${accent.tile}`}>
            {isWork ? '🧘' : '⚠️'}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${accent.ring}`}>{accent.title}</p>
            <p className="text-[13px] text-slate-100 leading-snug mt-1">{reminder.message}</p>
          </div>

          <button
            onClick={() => {
              if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
              setClosing(true)
              closeTimerRef.current = window.setTimeout(() => dismissReminder(), 300)
            }}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm flex items-center justify-center flex-shrink-0 -mr-1 -mt-1 transition-colors"
            title="Kapat"
          >
            ✕
          </button>
        </div>

        {/* 60s auto-dismiss progress bar */}
        <div className="relative h-1 bg-white/5">
          <div
            className="h-full rounded-r-full"
            style={{ background: accent.bar, animation: 'reminderbar 60s linear forwards' }}
          />
        </div>
      </div>
    </div>
  )
}
