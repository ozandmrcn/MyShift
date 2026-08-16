import { useState, useEffect, useCallback } from 'react'

// ─── Gözlem Modu ──────────────────────────────────────────────────────────────
// Pure data-collection mode. Shift tracking is irrelevant here — the app exists
// only to get to know the user: which window is focused, what they're working on
// (window title: file/doc/site names), what they typed, and for how long.
// Everything stays on this machine in data/surveillance/ as a day JSONL file.
//
// Capture detail: window title (what the window itself says — file, tab, doc) +
// the characters typed while that window was focused (flushed every ~5s). This is
// the user's own private log for their own analysis — nothing leaves the device.

function fmtClock(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function fmtDur(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0 dk'
  const mins = Math.round(totalSec / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}.${y}`
}

export default function ObserveView() {
  const api = window.electronAPI
  const [status, setStatus] = useState<SurveillanceSnapshot | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    if (!api?.surveillance) return
    const s = await api.surveillance.getStatus()
    setStatus(s)
  }, [api])

  // Keep the live view ticking; recording is NOT auto-started — the user
  // presses the button explicitly (the mode exists to collect data on demand).
  useEffect(() => {
    refresh()
    const t = setInterval(() => { refresh(); setNow(Date.now()) }, 3000)
    return () => clearInterval(t)
  }, [refresh])

  const toggle = async () => {
    const next = !(status?.enabled ?? false)
    await api?.surveillance?.setEnabled(next)
    await refresh()
  }

  const recording = status?.enabled ?? false
  const current = status?.current ?? null
  const today = status?.today
  const maxAppSec = Math.max(1, ...(today?.appSeconds.map(a => a.seconds) ?? [0]))

  // Build the feed with durations between entries.
  const feed = (status?.recent ?? []).slice().reverse().map((s, i, arr) => {
    const prev = arr[i + 1]
    const span = prev ? Math.max(0, (prev.t - s.t)) : (status?.current && status.current.t >= s.t ? Math.max(0, Date.now() - s.t) : 0)
    return { ...s, span }
  })

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-2">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xl shadow-lg shadow-amber-500/10">
            👁️
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-slate-100">Gözlem Modu</h2>
            <p className="text-xs text-slate-400 mt-0.5">Saf veri toplama — vardiya takibini boş verir, sadece sizi tanır.</p>
          </div>
          <button
            onClick={toggle}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors flex-shrink-0 ${
              recording
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${recording ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
            {recording ? '■ KAYDI DURDUR' : '▶ KAYDETMEYE BAŞLA'}
          </button>
        </div>

        {/* Live current activity */}
        <div className="fluent-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">ŞU AN</span>
            <span className="font-mono text-[11px] text-slate-500">{fmtClock(now)}</span>
          </div>

          {!recording ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-3">
              <span className="text-4xl">😴</span>
              <p className="text-sm">Kayıt kapalı — bu modda arka plan vardiyası da duraklar. Başlatmak için üstteki butona basın.</p>
            </div>
          ) : !current ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-3">
              <span className="text-4xl animate-pulse">🔍</span>
              <p className="text-sm">İlk kayıt bekleniyor…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-11 h-11 rounded-xl accent-soft border accent-border-soft text-lg flex-shrink-0">
                  🖥️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-100 truncate">{current.app}</p>
                  {current.title && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">“{current.title}”</p>
                  )}
                  {current.typed && (
                    <p className="text-[11px] text-amber-300/80 truncate mt-1">
                      <span className="text-slate-500">⌨️ son yazılan:</span> “{current.typed.slice(0, 120)}{current.typed.length > 120 ? '…' : ''}”
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider">Başlangıç</p>
                  <p className="font-mono text-sm text-slate-300">{fmtClock(current.t)}</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pencere başlığı (dosya, sekme, açık belge) ve bu pencerede yazdıklarınız kaydediliyor —
                hepsi cihazınızda, size özel.
              </p>
            </div>
          )}
        </div>

        {/* Live feed */}
        <div className="fluent-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">📜 AKIŞ — SON KAYITLAR</span>
            <span className="text-[10px] text-slate-600">{feed.length} kayıt</span>
          </div>

          {feed.length === 0 ? (
            <p className="text-[11px] text-slate-500 py-4 text-center">Henüz kayıt yok.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {feed.map((s, i) => (
                <div key={`${s.t}-${i}`} className={`flex items-start gap-3 px-2 py-1.5 rounded-lg ${i === 0 ? 'bg-white/3' : ''}`}>
                  <span className="font-mono text-[10px] text-slate-500 w-16 flex-shrink-0 pt-0.5">{fmtClock(s.t)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">{s.app || '—'}</p>
                    {s.title && <p className="text-[10px] text-slate-500 truncate">“{s.title}”</p>}
                    {s.typed && (
                      <p className="text-[10px] text-amber-300/70 truncate mt-0.5">
                        <span className="text-slate-600">⌨</span> “{s.typed.slice(0, 160)}{s.typed.length > 160 ? '…' : ''}”
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-600 flex-shrink-0 pt-0.5">
                    {i === 0 && s.span > 0 ? `${fmtDur(s.span)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today totals */}
        <div className="fluent-card p-5">
          <div className="flex items-end justify-between mb-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">📊 BUGÜN</span>
            <span className="text-[11px] text-slate-400">
              {today ? fmtDur(today.totalSeconds) : '0 dk'} aktif • {today?.samples ?? 0} kayıt
              {(today?.typedChars ?? 0) > 0 && <span className="text-amber-400/80"> • ⌨ {today?.typedChars ?? 0} karakter</span>}
            </span>
          </div>

          {(today?.appSeconds.length ?? 0) === 0 ? (
            <p className="text-[11px] text-slate-500 py-3 text-center">Kayıt başlayınca burada görünür.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {today!.appSeconds.slice(0, 8).map(a => (
                <div key={a.name} className="flex items-center gap-2">
                  <span className="w-28 text-[11px] text-slate-300 truncate flex-shrink-0">{a.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(a.seconds / maxAppSec) * 100}%` }} />
                  </div>
                  <span className="w-14 text-[10px] text-slate-500 text-right flex-shrink-0">{fmtDur(a.seconds)}</span>
                </div>
              ))}
            </div>
          )}

          {status?.recentDays && status.recentDays.length > 0 && (
            <div className="border-t border-white/5 mt-4 pt-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-300 mb-1">Son günler</span>
              {status.recentDays.slice(-7).map(d => (
                <div key={d.date} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{fmtDate(d.date)}</span>
                  <span className="text-[11px] text-slate-500">{fmtDur(d.totalSeconds)} • {d.samples} kayıt</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Privacy / detail note */}
        <div className="rounded-xl border border-white/5 bg-white/2 p-4">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            👁️ Gözlem modu <span className="text-slate-400">data/surveillance/</span> klasörüne günlük kayıt yazar
            ve bu cihazdan çıkmaz. Kayıtlar uygulama adı + pencere başlığı (dosya/sekme adı gibi) + o pencerede
            yazılan metin + zaman damgasıdır. Şifre/kimlik pencereleri atlanır; veriler yedeklemek için
            <span className="text-slate-400"> Toplanan Veriler → Dışa Aktar</span> ile tek dosyaya alınabilir.
          </p>
        </div>
      </div>
    </div>
  )
}
