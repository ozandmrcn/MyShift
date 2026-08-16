import { useState, useEffect, useCallback } from 'react'

// ─── Toplanan Veriler ─────────────────────────────────────────────────────────
// Management page for the data the app has collected about the user:
//   • the AI profile notes (from Gözlem Modu analysis + manual additions)
//   • the raw observation logs (data/surveillance/*.jsonl)
// Export bundles everything into one JSON file for backup/transfer; import merges
// a previously exported file back in. The recording itself lives in Gözlem Modu.

function Section({ icon, title, description, children }: { icon: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-sm">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {description && <p className="text-[10px] text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col rounded-xl border border-white/5 bg-white/2 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default function DataView() {
  const api = window.electronAPI
  const [profile, setProfile] = useState<AiProfile>({ notes: [], updatedAt: new Date().toISOString() })
  const [newNote, setNewNote] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisMsg, setAnalysisMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!api?.profile) return
    setProfile(await api.profile.get())
  }, [api])

  useEffect(() => {
    refreshProfile()
  }, [refreshProfile])

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const addNote = async () => {
    const text = newNote.trim()
    if (!text) return
    setProfile(await api!.profile.addNote(text))
    setNewNote('')
  }

  const removeNote = async (index: number) => {
    setProfile(await api!.profile.removeNote(index))
  }

  const clearNotes = async () => {
    if (!window.confirm('Profil notlarının tamamı silinsin mi? Bu geri alınamaz.')) return
    setProfile(await api!.profile.clear())
  }

  const analyze = async () => {
    setAnalyzing(true)
    setAnalysisMsg('')
    try {
      const result = await api!.surveillance.analyze(7)
      setProfile(result)
      setAnalysisMsg(result.notes.length > 0
        ? `${result.notes.length} yeni gözlem eklendi.`
        : 'Analiz bitti ama yeni not çıkmadı.')
    } catch {
      setAnalysisMsg('Analiz sırasında bir sorun oluştu.')
    } finally {
      setAnalyzing(false)
    }
  }

  const exportData = async () => {
    setBusy('export')
    try {
      const r = await api!.data.export()
      if (r.ok) flash('ok', `Veriler dışa aktarıldı: ${r.file ?? ''}`)
      else if (r.error !== 'iptal') flash('err', `Dışa aktarılamadı: ${r.error ?? 'bilinmeyen hata'}`)
    } catch {
      flash('err', 'Dışa aktarma sırasında bir sorun oluştu.')
    } finally {
      setBusy('')
    }
  }

  const importData = async () => {
    setBusy('import')
    try {
      const r = await api!.data.import()
      if (r.ok) {
        const parts = []
        if (r.notes) parts.push(`${r.notes} not`)
        if (r.files) parts.push(`${r.files} günlük kayıt`)
        flash('ok', `İçe aktarıldı: ${parts.join(', ') || 'değişiklik yok'}.`)
        await refreshProfile()
      } else if (r.error !== 'iptal') {
        flash('err', `İçe aktarılamadı: ${r.error ?? 'bilinmeyen hata'}`)
      }
    } catch {
      flash('err', 'İçe aktarma sırasında bir sorun oluştu.')
    } finally {
      setBusy('')
    }
  }

  const clearSurveillance = async () => {
    if (!window.confirm('Gözlem modunun topladığı TÜM kayıtlar (data/surveillance) silinsin mi? Bu geri alınamaz.')) return
    setBusy('clear')
    try {
      const r = await api!.data.clearSurveillance()
      if (r.ok) flash('ok', 'Tüm gözlem kayıtları silindi.')
      else flash('err', `Silinemedi: ${r.error ?? 'bilinmeyen hata'}`)
    } catch {
      flash('err', 'Silme sırasında bir sorun oluştu.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-2">
        {/* Page header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl accent-soft border accent-border-soft text-xl shadow-lg accent-glow-lg">
            🛰️
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Toplanan Veriler</h2>
            <p className="text-xs text-slate-400 mt-0.5">Gözlem modu kayıtları, AI profil notları ve yedekleme.</p>
          </div>
        </div>

        {msg && (
          <div className={`px-4 py-2.5 rounded-xl border text-xs ${
            msg.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {msg.text}
          </div>
        )}

        {/* Backup / transfer */}
        <Section
          icon="💾"
          title="Yedekleme ve Taşıma"
          description="Profil notları + gözlem kayıtlarını tek dosyada dışa/içe aktarın"
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">Veri Dışa Aktar</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Gözlem kayıtları ve AI notlarını tek bir .json dosyasına kaydeder (yedeklemek veya başka cihaza taşımak için).</p>
            </div>
            <button
              onClick={exportData}
              disabled={busy === 'export'}
              className="accent-solid-strong hover:accent-solid disabled:opacity-50 text-white text-[11px] px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'export' ? 'Aktarılıyor…' : '⬇ Dışa Aktar'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">Veri İçe Aktar</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Önceden dışa aktarılmış bir dosyayı birleştirir; aynı kayıtlar çift eklenmez.</p>
            </div>
            <button
              onClick={importData}
              disabled={busy === 'import'}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'import' ? 'Aktarılıyor…' : '⬆ İçe Aktar'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">Gözlem Kayıtlarını Sil</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">data/surveillance/ altındaki tüm günlük kayıtları kalıcı olarak siler (profil notlarına dokunmaz).</p>
            </div>
            <button
              onClick={clearSurveillance}
              disabled={busy === 'clear'}
              className="bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-300 text-[11px] px-3 py-2 rounded-lg border border-rose-500/30 font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'clear' ? 'Siliniyor…' : '🗑 Tümünü Sil'}
            </button>
          </div>
        </Section>

        {/* AI Profile */}
        <Section
          icon="🧠"
          title="AI Profil Notları"
          description="Analiz sonucu biriken profil notları; yorum yazarken kullanılır"
        >
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <button
                onClick={analyze}
                disabled={analyzing}
                className="accent-solid-strong hover:accent-solid disabled:opacity-50 text-white text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-colors"
              >
                {analyzing ? 'Analiz Ediliyor…' : '🔎 Son 7 Günü Analiz Et'}
              </button>
              {profile.notes.length > 0 && (
                <button
                  onClick={clearNotes}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] px-3 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors"
                >
                  🗑 Notları Sil
                </button>
              )}
            </div>
            {analysisMsg && <p className="text-[11px] text-slate-400 mt-2">{analysisMsg}</p>}
            {analyzing && <p className="text-[10px] text-slate-500 mt-1.5">Gözlem verisi, Ayarlar'daki yorum kaynağına özet olarak gönderiliyor (veya çevrimdışı özetleniyor)…</p>}
          </div>

          <div className="flex flex-col">
            {profile.notes.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-slate-500">
                Henüz not yok. Önce Gözlem Modu'nda bir süre kayıt toplayın, sonra "Son 7 Günü Analiz Et" ile
                otomatik gözlemler üretin — ya da aşağıdan elle ekleyin.
              </p>
            ) : (
              profile.notes.map((note, i) => (
                <div key={`${note.addedAt}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 hover:bg-white/2 transition-colors">
                  <p className="text-xs text-slate-300 leading-relaxed">{note.text}</p>
                  <button
                    onClick={() => removeNote(i)}
                    className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
                    title="Notu sil"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/5 flex items-center gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
              placeholder="Manuel gözlem ekle (örn: gece geç saatlerde odaklanıyor)…"
              maxLength={160}
              className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:accent-border placeholder:text-slate-600"
            />
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors"
            >
              Ekle
            </button>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-white/5 pt-4 text-center">
          <span className="text-[10px] text-slate-600 block">Tüm veriler bu cihazda — data/ klasöründe düz metin olarak. İstediğiniz an silebilirsiniz.</span>
        </div>
      </div>
    </div>
  )
}
