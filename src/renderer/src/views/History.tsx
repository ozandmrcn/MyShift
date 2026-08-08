import { useShiftStore } from '../stores/useShiftStore'
import { formatRemaining } from '../hooks/useLiveShiftEngine'

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]
const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${WEEKDAY_NAMES[date.getDay()]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

export default function History() {
  const dailyLogs = useShiftStore((s) => s.dailyLogs)

  const entries = Object.entries(dailyLogs)
    .map(([date, log]) => ({ date, ...log }))
    .filter(e => e.workedSeconds > 0 || e.idleSeconds > 0 || e.paybackSeconds > 0)
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
      completed: acc.completed + (e.completed ? 1 : 0)
    }),
    { worked: 0, idle: 0, payback: 0, completed: 0 }
  )

  const tiles = [
    { key: 'worked', label: 'Çalışılan Süre', value: formatRemaining(weekTotals.worked), icon: '💪', accent: false },
    { key: 'idle', label: 'Toplam Aşım', value: formatRemaining(weekTotals.idle), icon: '📈', accent: weekTotals.idle > 0 },
    { key: 'payback', label: 'Geri Ödenen', value: formatRemaining(weekTotals.payback), icon: '🔄', accent: false },
    { key: 'done', label: 'Tamamlanan Gün', value: `${weekTotals.completed}`, icon: '🎉', accent: false }
  ]

  return (
    <div className="grid grid-cols-1 gap-6 h-[calc(100vh-6.5rem)] overflow-y-auto pr-1">
      <div className="fluent-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-200">Gün Geçmişi & İstatistik</h2>
            <p className="text-xs text-slate-400 mt-1">Uygulama açıkken kaydedilen günlük özetler — son 7 günün toplamları.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tiles.map(t => (
            <div key={t.key} className="rounded-xl border border-white/5 bg-white/2 p-4">
              <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span>{t.icon}</span>
                {t.label}
              </p>
              <p className={`text-2xl font-semibold mt-1.5 font-mono ${t.accent ? 'text-rose-400' : 'text-slate-100'}`}>
                {t.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="fluent-card p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">SON 30 GÜN</span>
          <span className="text-[11px] text-slate-500">{entries.length} kayıt</span>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3">
            <span className="text-5xl">🗓️</span>
            <p className="text-sm">Henüz kayıt yok. Uygulama çalışırken her günün özeti otomatik toplanır.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map(e => (
              <div
                key={e.date}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  e.date === todayStr ? 'bg-blue-500/5 border-blue-500/20' : 'bg-white/2 border-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{formatDate(e.date)}</p>
                  {e.date === todayStr && (
                    <p className="text-[10px] text-blue-400">Bugün</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Çalışılan</p>
                    <p className="text-sm font-semibold font-mono text-slate-200">{formatRemaining(e.workedSeconds)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Aşım</p>
                    <p className={`text-sm font-semibold font-mono ${e.idleSeconds > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{formatRemaining(e.idleSeconds)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">Ödenen</p>
                    <p className="text-sm font-semibold font-mono text-emerald-300">{formatRemaining(e.paybackSeconds)}</p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
                      e.completed
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-800 border-white/5 text-slate-500'
                    }`}
                  >
                    {e.completed ? '✔ Tamamlandı' : 'Açık'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
