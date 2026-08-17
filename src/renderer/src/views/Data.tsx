import { useState, useEffect, useCallback } from 'react'
import { useT } from '../i18n/useT'

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
  const { t } = useT()
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
    if (!window.confirm(t('data.clearProfileConfirm'))) return
    setProfile(await api!.profile.clear())
  }

  const analyze = async () => {
    setAnalyzing(true)
    setAnalysisMsg('')
    try {
      const result = await api!.surveillance.analyze(7)
      setProfile(result)
      setAnalysisMsg(result.notes.length > 0
        ? t('data.analysisResult', { count: result.notes.length })
        : t('data.analysisNothing'))
    } catch {
      setAnalysisMsg(t('data.analysisError'))
    } finally {
      setAnalyzing(false)
    }
  }

  const exportData = async () => {
    setBusy('export')
    try {
      const r = await api!.data.export()
      if (r.ok) flash('ok', t('data.exportSuccess', { file: r.file ?? '' }))
      else if (r.error !== 'iptal') flash('err', t('data.exportFail', { error: r.error ?? t('data.unknownError') }))
    } catch {
      flash('err', t('data.exportError'))
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
        if (r.notes) parts.push(`${r.notes} ${t('data.notes')}`)
        if (r.files) parts.push(`${r.files} ${t('data.dailyRecords')}`)
        flash('ok', t('data.importSuccess', { parts: parts.join(', ') || t('data.importNothing') }))
        await refreshProfile()
      } else if (r.error !== 'iptal') {
        flash('err', t('data.importFail', { error: r.error ?? t('data.unknownError') }))
      }
    } catch {
      flash('err', t('data.importError'))
    } finally {
      setBusy('')
    }
  }

  const clearSurveillance = async () => {
    if (!window.confirm(t('data.clearSurveillanceConfirm'))) return
    setBusy('clear')
    try {
      const r = await api!.data.clearSurveillance()
      if (r.ok) flash('ok', t('data.clearSuccess'))
      else flash('err', t('data.clearFail', { error: r.error ?? t('data.unknownError') }))
    } catch {
      flash('err', t('data.clearError'))
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
            <h2 className="text-xl font-semibold text-slate-100">{t('data.pageTitle')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('data.pageSubtitle')}</p>
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
          title={t('data.backupTitle')}
          description={t('data.backupDesc')}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">{t('data.exportTitle')}</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t('data.exportDesc')}</p>
            </div>
            <button
              onClick={exportData}
              disabled={busy === 'export'}
              className="accent-solid-strong hover:accent-solid disabled:opacity-50 text-white text-[11px] px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'export' ? t('data.exporting') : t('data.exportBtn')}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">{t('data.importTitle')}</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t('data.importDesc')}</p>
            </div>
            <button
              onClick={importData}
              disabled={busy === 'import'}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'import' ? t('data.exporting') : t('data.importBtn')}
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <span className="block text-sm font-medium text-slate-200">{t('data.clearSurveillanceTitle')}</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{t('data.clearSurveillanceDesc')}</p>
            </div>
            <button
              onClick={clearSurveillance}
              disabled={busy === 'clear'}
              className="bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-300 text-[11px] px-3 py-2 rounded-lg border border-rose-500/30 font-semibold transition-colors whitespace-nowrap flex-shrink-0"
            >
              {busy === 'clear' ? t('data.clearing') : t('data.clearSurveillanceBtn')}
            </button>
          </div>
        </Section>

        {/* AI Profile */}
        <Section
          icon="🧠"
          title={t('data.aiProfileTitle')}
          description={t('data.aiProfileDesc')}
        >
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <button
                onClick={analyze}
                disabled={analyzing}
                className="accent-solid-strong hover:accent-solid disabled:opacity-50 text-white text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-colors"
              >
                {analyzing ? t('data.analyzing') : `🔎 ${t('data.analyzeBtn')}`}
              </button>
              {profile.notes.length > 0 && (
                <button
                  onClick={clearNotes}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] px-3 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors"
                >
                  {t('data.clearNotes')}
                </button>
              )}
            </div>
            {analysisMsg && <p className="text-[11px] text-slate-400 mt-2">{analysisMsg}</p>}
            {analyzing && <p className="text-[10px] text-slate-500 mt-1.5">{t('data.analysisLoading')}</p>}
          </div>

          <div className="flex flex-col">
            {profile.notes.length === 0 ? (
              <p className="px-4 py-4 text-[11px] text-slate-500">
                {t('data.noNotes')}
              </p>
            ) : (
              profile.notes.map((note, i) => (
                <div key={`${note.addedAt}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 hover:bg-white/2 transition-colors">
                  <p className="text-xs text-slate-300 leading-relaxed">{note.text}</p>
                  <button
                    onClick={() => removeNote(i)}
                    className="text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
                    title={t('data.deleteNote')}
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
              placeholder={t('data.notePlaceholder')}
              maxLength={160}
              className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:accent-border placeholder:text-slate-600"
            />
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors"
            >
              {t('data.addNote')}
            </button>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-white/5 pt-4 text-center">
          <span className="text-[10px] text-slate-600 block">{t('data.allDataFooter')}</span>
        </div>
      </div>
    </div>
  )
}
