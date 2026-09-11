import { useState } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import { formatRemaining } from '../hooks/useLiveShiftEngine'
import { useT } from '../i18n/useT'
import { getMonthNames, getWeekdayNames, getWeekdayShort } from '../utils/dateConstants'

export default function History() {
  const { t, language } = useT()

  const MONTH_NAMES = getMonthNames(language)
  const WEEKDAY_NAMES = getWeekdayNames(language)
  const WEEKDAY_SHORT = getWeekdayShort(language)

  function formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return `${WEEKDAY_NAMES[date.getDay()]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
  }
  const { dailyLogs, updateDayLog, deleteDayLog } = useShiftStore()

  // Inline editing state: which date is being edited + draft minutes
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [draft, setDraft] = useState({ worked: 0, idle: 0, payback: 0 })

  const startEdit = (e: { date: string; workedSeconds: number; idleSeconds: number; paybackSeconds: number }) => {
    setEditingDate(e.date)
    setDraft({
      worked: Math.round(e.workedSeconds / 60),
      idle: Math.round(e.idleSeconds / 60),
      payback: Math.round(e.paybackSeconds / 60)
    })
  }

  const saveEdit = (date: string) => {
    updateDayLog(date, {
      workedSeconds: Math.max(0, draft.worked) * 60,
      idleSeconds: Math.max(0, draft.idle) * 60,
      paybackSeconds: Math.max(0, draft.payback) * 60
    })
    setEditingDate(null)
  }

  const removeDay = (date: string) => {
    if (!window.confirm(t('history.deleteConfirm', { date }))) return
    deleteDayLog(date)
    if (editingDate === date) setEditingDate(null)
  }

  const entries = Object.entries(dailyLogs)
    .map(([date, log]) => ({ date, ...log }))
    .filter(e => e.workedSeconds > 0 || e.idleSeconds > 0 || e.paybackSeconds > 0 || (e.breakSeconds ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30)

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekStartStr = `${weekAgo.getFullYear()}-${(weekAgo.getMonth() + 1).toString().padStart(2, '0')}-${weekAgo.getDate().toString().padStart(2, '0')}`
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

  const weekEntries = entries.filter(e => e.date >= weekStartStr)
  const weekTotals = weekEntries.reduce(
    (acc, e) => ({
      worked: acc.worked + e.workedSeconds,
      idle: acc.idle + e.idleSeconds,
      payback: acc.payback + e.paybackSeconds,
      breaks: acc.breaks + (e.breakSeconds ?? 0),
      completed: acc.completed + (e.completed ? 1 : 0)
    }),
    { worked: 0, idle: 0, payback: 0, breaks: 0, completed: 0 }
  )

  const tiles = [
    { key: 'worked', label: t('history.worked'), value: formatRemaining(weekTotals.worked), icon: '💪', accent: false },
    { key: 'idle', label: t('history.overtimeTotal'), value: formatRemaining(weekTotals.idle), icon: '📈', accent: weekTotals.idle > 0 },
    { key: 'payback', label: t('history.payback'), value: formatRemaining(weekTotals.payback), icon: '🔄', accent: false },
    { key: 'breaks', label: t('history.breaks'), value: formatRemaining(weekTotals.breaks), icon: '🧘', accent: false },
    { key: 'done', label: t('history.completedDays'), value: `${weekTotals.completed}`, icon: '🎉', accent: false }
  ]

  // Last 7 days bar chart data
  const chartDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const log = dailyLogs[ds]
    return {
      dateStr: ds,
      dayLabel: WEEKDAY_SHORT[d.getDay()],
      isToday: ds === todayStr,
      worked: log?.workedSeconds ?? 0,
      idle: log?.idleSeconds ?? 0,
      completed: log?.completed ?? false
    }
  })

  const maxWorked = Math.max(...chartDays.map(d => d.worked), 3600) // min 1h for scale

  return (
    <div className="grid grid-cols-1 gap-6 h-full overflow-y-auto pr-1">

      {/* Weekly Summary Tiles */}
      <div className="fluent-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-200">{t('history.title')}</h2>
            <p className="text-xs text-slate-400 mt-1">{t('history.subtitle')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {tiles.map(tile => (
            <div key={tile.key} className="rounded-xl border border-white/5 bg-white/2 p-4">
              <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span>{tile.icon}</span>
                {tile.label}
              </p>
              <p className={`text-2xl font-semibold mt-1.5 font-mono ${tile.accent ? 'text-rose-400' : 'text-slate-100'}`}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Day Bar Chart */}
      {chartDays.some(d => d.worked > 0) && (
        <div className="fluent-card p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t('history.last7Days')}</span>
            <span className="text-[10px] text-slate-600">{Math.floor(maxWorked / 3600)}{t('history.maxHours')}</span>
          </div>

          <div className="flex items-end gap-3 h-36">
            {chartDays.map((day) => {
              const workedPct = maxWorked > 0 ? (day.worked / maxWorked) * 100 : 0
              const idlePct = maxWorked > 0 ? Math.min(30, (day.idle / maxWorked) * 100) : 0
              const hasData = day.worked > 0

              return (
                <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                  {/* Tooltip area */}
                  <div className="flex-1 flex flex-col-reverse w-full group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex z-10 pointer-events-none">
                      <div className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-200 whitespace-nowrap shadow-xl">
                        <p className="font-semibold">{day.dayLabel}</p>
                        {hasData ? (
                          <>
                            <p>💪 {formatRemaining(day.worked)}</p>
                            {day.idle > 0 && <p className="text-amber-400">📈 {formatRemaining(day.idle)}</p>}
                            {day.completed && <p className="text-emerald-400">{t('history.completedBadge')}</p>}
                          </>
                        ) : (
                          <p className="text-slate-500">{t('history.noData')}</p>
                        )}
                      </div>
                    </div>

                    {/* Bar */}
                    <div className="w-full flex flex-col justify-end h-full gap-0.5">
                      {/* Idle top bar (red) */}
                      {idlePct > 0 && (
                        <div
                          className="w-full rounded-t-sm bg-rose-500/40 flex-shrink-0"
                          style={{ height: `${idlePct}%` }}
                        />
                      )}
                      {/* Worked bar (blue) */}
                      <div
                        className={`w-full transition-all duration-500 ${
                          hasData
                            ? day.completed
                              ? 'bg-gradient-to-t from-emerald-600 to-emerald-500'
                              : day.isToday
                              ? 'accent-grad-t'
                              : 'accent-grad-t-dull'
                            : 'bg-slate-800/30'
                        } ${idlePct > 0 ? 'rounded-b-sm' : 'rounded-sm'}`}
                        style={{ height: hasData ? `${Math.max(workedPct, 4)}%` : '4%' }}
                      />
                    </div>
                  </div>

                  {/* Label */}
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <span className={`text-[10px] font-medium ${day.isToday ? 'accent-text' : 'text-slate-500'}`}>
                      {day.dayLabel}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono">
                      {hasData ? `${Math.floor(day.worked / 3600)}${t('times.hours')}` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 justify-end">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm accent-grad-t-dull" />
              <span className="text-[10px] text-slate-500">{t('history.workedBar')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-500" />
              <span className="text-[10px] text-slate-500">{t('history.completedBar')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-rose-500/40" />
              <span className="text-[10px] text-slate-500">{t('history.overtimeBar')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Full Log List */}
      <div className="fluent-card p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{t('history.last30Days')}</span>
          <span className="text-[11px] text-slate-500">{entries.length} {t('history.records')}</span>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3">
            <span className="text-5xl">🗓️</span>
            <p className="text-sm">{t('history.noRecords')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <div
                key={e.date}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  e.date === todayStr ? 'accent-soft-faint accent-border-soft' : 'bg-white/2 border-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{formatDate(e.date)}</p>
                  {e.date === todayStr && (
                    <p className="text-[10px] accent-text">{t('history.today')}</p>
                  )}
                  {e.detail && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {e.detail.templateName && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400 truncate max-w-[200px]">
                          📋 {e.detail.templateName}
                        </span>
                      )}
                      {e.detail.flexUsedSecs !== undefined && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300" title={t('history.flexUsed')}>
                          🧘 {t('history.flexUsed')}: {formatRemaining(e.detail.flexUsedSecs)}
                        </span>
                      )}
                      {e.detail.flexRemainingSecs !== undefined && e.detail.flexRemainingSecs > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300">
                          {t('history.flexLeft')}: {formatRemaining(e.detail.flexRemainingSecs)}
                        </span>
                      )}
                      {(e.detail.breakLog?.length ?? 0) > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400">
                          🧾 {e.detail.breakLog.length} {t('history.breakDetail')}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editingDate === e.date ? (
                  <div className="flex items-center gap-2.5 flex-wrap justify-end">
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider text-center">{t('history.workMin')}</p>
                      <input
                        type="number"
                        min={0}
                        value={draft.worked}
                        onChange={(ev) => setDraft(d => ({ ...d, worked: Number(ev.target.value) }))}
                        className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 text-center focus:outline-none focus:accent-border"
                      />
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider text-center">{t('history.overMin')}</p>
                      <input
                        type="number"
                        min={0}
                        value={draft.idle}
                        onChange={(ev) => setDraft(d => ({ ...d, idle: Number(ev.target.value) }))}
                        className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 text-center focus:outline-none focus:accent-border"
                      />
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider text-center">{t('history.paidMin')}</p>
                      <input
                        type="number"
                        min={0}
                        value={draft.payback}
                        onChange={(ev) => setDraft(d => ({ ...d, payback: Number(ev.target.value) }))}
                        className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 text-center focus:outline-none focus:accent-border"
                      />
                    </div>
                    <div className="flex flex-col gap-1 ml-1">
                      <button
                        onClick={() => saveEdit(e.date)}
                        className="accent-solid-strong hover:accent-solid text-white text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors"
                      >
                        {t('history.save')}
                      </button>
                      <button
                        onClick={() => setEditingDate(null)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2.5 py-1 rounded-lg border border-white/5 transition-colors"
                      >
                        {t('history.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">{t('history.workedLabel')}</p>
                        <p className="text-sm font-semibold font-mono text-slate-200">{formatRemaining(e.workedSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">{t('history.overtimeLabel')}</p>
                        <p className={`text-sm font-semibold font-mono ${e.idleSeconds > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{formatRemaining(e.idleSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">{t('history.paybackLabel')}</p>
                        <p className="text-sm font-semibold font-mono text-emerald-300">{formatRemaining(e.paybackSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">{t('history.breakLabel')}</p>
                        <p className="text-sm font-semibold font-mono text-orange-300">
                          {formatRemaining(e.breakSeconds ?? 0)}
                          {(e.breakCount ?? 0) > 0 && <span className="text-[9px] text-slate-500 ml-1">×{e.breakCount ?? 0}</span>}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                          e.completed
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-slate-800 border-white/5 text-slate-500'
                        }`}
                      >
                        {e.completed ? t('history.completedBadge') : t('history.openBadge')}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(e)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2.5 py-1 rounded-lg border border-white/5 transition-colors"
                        title={t('history.editDay')}
                      >
                        ✏️ {t('history.edit')}
                      </button>
                      <button
                        onClick={() => removeDay(e.date)}
                        className="bg-slate-800/60 hover:bg-rose-500/20 text-slate-500 hover:text-rose-300 text-[10px] px-2.5 py-1 rounded-lg border border-white/5 transition-colors"
                        title={t('history.deleteDay')}
                      >
                        🗑
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
