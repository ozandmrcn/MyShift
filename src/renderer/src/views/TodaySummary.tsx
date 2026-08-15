import { useMemo } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import type { BreakSubtype } from '../stores/useShiftStore'
import { useLiveShiftEngine, computeWorkedSeconds, timeToSeconds, formatRemaining } from '../hooks/useLiveShiftEngine'

const SUBTYPE_LABELS: Record<BreakSubtype, { label: string; icon: string }> = {
  cay: { label: 'Çay', icon: '🍵' },
  kahve: { label: 'Kahve', icon: '☕' },
  ihtiyac: { label: 'İhtiyaç Molası', icon: '🚻' },
  kahvalti: { label: 'Kahvaltı', icon: '🍳' },
  ogle: { label: 'Öğle Yemeği', icon: '🍲' },
  aksam: { label: 'Akşam Yemeği', icon: '🍛' }
}

const TYPE_LABELS: Record<string, string> = { short: 'Kısa Mola', meal: 'Yemek Molası' }

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
  const engine = useLiveShiftEngine()
  const settings = useShiftStore((s) => s.settings)
  const runningBreak = useShiftStore((s) => s.runningBreak)
  const breakLog = useShiftStore((s) => s.breakLog)
  const idleLog = useShiftStore((s) => s.idleLog)
  const paybackLog = useShiftStore((s) => s.paybackLog)
  const todayHourly = useShiftStore((s) => s.todayHourly)
  const breakUsage = useShiftStore((s) => s.breakUsage)

  const nowSecs = timeToSeconds(engine.currentTimeSecs)
  const nowMs = Date.now()
  const { activeTemplate } = engine

  // Shift window
  const shift = useMemo(() => {
    if (settings.mode === 'pay') {
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
  }, [settings.mode, settings.payShiftStart, settings.payShiftEnd, activeTemplate])

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

  // Hourly rows — from shift start hour up to the current hour.
  const hours = useMemo(() => {
    if (!shift) return []
    const rows: { key: string; h: number; worked: number; breakSec: number; idle: number; payback: number; current: boolean; inShift: boolean }[] = []
    const startHour = Math.floor(shift.start / 3600)
    const currentHour = Math.floor(nowSecs / 3600)
    const lastHour = Math.max(startHour, currentHour)

    for (let h = startHour; h <= lastHour; h++) {
      const hourStartSecs = h * 3600
      const hourEndSecs = Math.min((h + 1) * 3600, 86400)
      const clampNow = Math.min(nowSecs, hourEndSecs)
      const hourKey = `${pad(h)}:00`
      const hourStartMs = new Date(`${engine.currentDateStr}T${hourKey}:00:00`).getTime()
      const hourEndMs = hourStartMs + 3600000
      const inShift = hourEndSecs > shift.start && hourStartSecs < shift.end

      let worked = 0
      let breakSec = 0
      if (inShift) {
        if (settings.mode === 'pay') {
          const shiftOverlap = Math.max(0, Math.min(clampNow, shift.end, hourEndSecs) - Math.max(shift.start, hourStartSecs))
          breakSec = payBreakSecsInHour(hourStartMs, hourEndMs)
          worked = Math.max(0, shiftOverlap - breakSec)
        } else if (shift.activities) {
          worked = computeWorkedSeconds(shift.activities, clampNow) - computeWorkedSeconds(shift.activities, hourStartSecs)
          breakSec = plannedBreakSecsInHour(hourStartSecs, clampNow)
        }
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
          <h1 className="text-xl font-bold text-slate-100">Bugünün Özeti</h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            {engine.currentDateStr} · Saat {engine.currentTime}
            {settings.mode === 'pay' ? ' · PAY MODU' : activeTemplate ? ` · ${activeTemplate.name}` : ' · Vardiya yok'}
          </p>
        </div>
        {engine.isShiftFinished && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">✓ Bugün tamamlandı</span>
        )}
        {engine.isOvertime && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">⏰ Aşımda</span>
        )}
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon="💼" label="Çalışma" value={formatRemaining(engine.workedSeconds)} />
        <StatCard
          icon="🧘"
          label="Mola"
          value={formatRemaining(engine.breakSeconds)}
          sub={
            engine.breakCount > 0
              ? settings.mode === 'pay'
                ? `${engine.breakCount} mola · kısa ${usedOf('short')}/${settings.payShortBreakMin} dk, yemek ${usedOf('meal')}/${settings.payMealBreakMin} dk`
                : `${engine.breakCount} mola`
              : 'Bugün henüz mola yok'
          }
          accent="text-orange-300"
        />
        <StatCard
          icon="😴"
          label="Aşım (net)"
          value={formatRemaining(engine.idleSeconds)}
          sub={`Toplam aşım: ${formatRemaining(engine.idleLogSeconds)}`}
          accent="text-rose-300"
        />
        <StatCard
          icon="⚡"
          label="Payback"
          value={formatRemaining(engine.paybackSeconds)}
          sub={paybackRunning ? 'Payback çalışıyor…' : undefined}
          accent="text-emerald-300"
        />
        <StatCard icon="🎯" label="Vardiya" value={`%${Math.round(engine.shiftProgress)}`} sub={engine.currentActivity ? `${engine.currentActivity.icon} ${engine.currentActivity.name}` : undefined} />
        <StatCard
          icon="🔁"
          label="Mola Günlüğü"
          value={`${breakLog.length + (settings.mode === 'pay' ? 0 : plannedBreaks.length)} kayıt`}
          sub={runningBreak ? `${SUBTYPE_LABELS[runningBreak.subtype].label} devam ediyor` : 'Günlük detayı aşağıda'}
        />
      </div>

      {/* Hour-by-hour log */}
      <SectionCard icon="🕐" title="Saat Saat Bugün">
        {!shift ? (
          <p className="text-xs text-slate-500">Bugün için aktif bir vardiya tanımlı değil.</p>
        ) : hours.length === 0 ? (
          <p className="text-xs text-slate-500">Vardiya henüz başlamadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">Saat</th>
                  <th className="pb-2 pr-3 font-semibold">Çalışma</th>
                  <th className="pb-2 pr-3 font-semibold">Mola</th>
                  <th className="pb-2 pr-3 font-semibold">Aşım</th>
                  <th className="pb-2 pr-3 font-semibold">Payback</th>
                  <th className="pb-2 font-semibold w-1/3">Yoğunluk</th>
                </tr>
              </thead>
              <tbody>
                {hours.map((r) => (
                  <tr
                    key={r.key}
                    className={`border-t border-white/5 ${r.current ? 'bg-white/5' : ''} ${r.inShift ? '' : 'opacity-40'}`}
                  >
                    <td className="py-2 pr-3 text-sm font-mono font-semibold text-slate-300">
                      {r.key}
                      {r.current && <span className="ml-1.5 text-[9px] text-blue-300 font-sans uppercase tracking-wide">şimdi</span>}
                    </td>
                    <td className="py-2 pr-3 text-sm font-mono text-slate-200">{formatRemaining(r.worked)}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-orange-300">{formatRemaining(r.breakSec)}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-rose-300">{formatRemaining(r.idle)}</td>
                    <td className="py-2 pr-3 text-sm font-mono text-emerald-300">{formatRemaining(r.payback)}</td>
                    <td className="py-2">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                        <div className="h-full bg-blue-500/70" style={{ width: `${Math.min(100, (r.worked / maxHourWorked) * 100)}%` }} />
                        <div className="h-full bg-orange-400/70" style={{ width: `${Math.min(100, (r.breakSec / maxHourWorked) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t border-white/10">
                  <td className="py-2 pr-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Toplam</td>
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
      <SectionCard icon="🧘" title="Mola Günlüğü">
        {settings.mode === 'pay' ? (
          <>
            {liveRunningBreak && (
              <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${liveRunningBreak.overBudget ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{SUBTYPE_LABELS[liveRunningBreak.subtype].icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${liveRunningBreak.overBudget ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {SUBTYPE_LABELS[liveRunningBreak.subtype].label}
                      <span className="ml-2 text-[9px] uppercase tracking-wide text-slate-500">Devam ediyor</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                      {msToHHMM(liveRunningBreak.startedAt)} – … · {formatRemaining(liveRunningBreak.durationSec)}
                    </p>
                  </div>
                </div>
                {liveRunningBreak.overBudget && <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">AŞIM</span>}
              </div>
            )}

            {payBreaks.length === 0 && !runningBreak ? (
              <p className="text-xs text-slate-500">Bugün henüz mola kaydı yok. Dashboard'dan bir mola başlatın.</p>
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
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">AŞIM</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          plannedBreaks.length === 0 ? (
            <p className="text-xs text-slate-500">Bu modda molalar vardiya planındaki "Mola mı?" aktivitelerinden gelir. Henüz planlanmış mola yok.</p>
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

      {/* Aşım & Payback */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard icon="😴" title="Aşım Kaydı">
          {idleList.length === 0 ? (
            <p className="text-xs text-slate-500">Bugün aşım yok. Bol şans! 🍀</p>
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

        <SectionCard icon="⚡" title="Payback Kaydı">
          {paybackRunning && (
            <div className="mb-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-emerald-300">Payback çalışıyor</p>
              <span className="text-sm font-mono font-semibold text-emerald-300">{formatRemaining(engine.paybackSeconds)}</span>
            </div>
          )}
          {paybackList.length === 0 ? (
            <p className="text-xs text-slate-500">Bugün henüz payback yapılmadı. Aşımı geri ödemek için Dashboard'dan başlatın.</p>
          ) : (
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
            Net aşım: {formatRemaining(engine.idleSeconds)} — payback her saniyesinde aşımı azaltır.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}
