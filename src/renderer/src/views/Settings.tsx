import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import type { Settings } from '../stores/useShiftStore'
import { playSound, playReminderSound } from '../utils/soundEffects'
import { useT } from '../i18n/useT'

const THEMES_SWATCHES: Record<string, string> = {
  light: 'conic-gradient(#ffffff 0 25%, #e2e8f0 0 50%, #94a3b8 0 75%, #475569 0 100%)',
  dark: 'conic-gradient(#0a0a0b 0 25%, #1c1c20 0 50%, #3a3a42 0 75%, #71717a 0 100%)',
  mavi: 'conic-gradient(#0f172a 0 25%, #1e40af 0 50%, #3b82f6 0 75%, #93c5fd 0 100%)',
  zurut: 'conic-gradient(#0a1f16 0 25%, #065f46 0 50%, #10b981 0 75%, #6ee7b7 0 100%)',
  turkuaz: 'conic-gradient(#072624 0 25%, #0f766e 0 50%, #14b8a6 0 75%, #5eead4 0 100%)',
  menekse: 'conic-gradient(#170d2e 0 25%, #6d28d9 0 50%, #8b5cf6 0 75%, #c4b5fd 0 100%)',
  kiraz: 'conic-gradient(#240d12 0 25%, #be123c 0 50%, #f43f5e 0 75%, #fda4af 0 100%)',
  kehribar: 'conic-gradient(#241d09 0 25%, #b45309 0 50%, #f59e0b 0 75%, #fcd34d 0 100%)',
}
const THEME_KEYS = ['dark', 'light', 'mavi', 'zurut', 'turkuaz', 'menekse', 'kiraz', 'kehribar'] as const
const THEME_LABEL_KEY: Record<string, string> = {
  light: 'settingsView.themeLight',
  dark: 'settingsView.themeDark',
  mavi: 'settingsView.themeMidnightBlue',
  zurut: 'settingsView.themeEmerald',
  turkuaz: 'settingsView.themeTurquoise',
  menekse: 'settingsView.themeViolet',
  kiraz: 'settingsView.themeCherry',
  kehribar: 'settingsView.themeAmber',
}

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_NAMES_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// Show only a hint of the saved API key (sk-…abcd) so the user can see whether
// one is stored without ever printing the secret.
function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••' + key.slice(-2)
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

// Reusable fluent-style toggle switch (same visual language as the rest of the app)
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex items-center cursor-pointer flex-shrink-0 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all toggle-checked" />
    </label>
  )
}

// Settings section wrapper
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

// One setting row inside a section
function Row({ icon, title, description, right }: { icon: string; title: string; description?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/2 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0">
          <span className="block text-sm font-medium text-slate-200">{title}</span>
          {description && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{right}</div>
    </div>
  )
}

export default function SettingsView() {
  const { settings, updateSettings, clearHistory, factoryReset, dayShiftSecs, shiftDay, myshiftPaused, setDayShift, resumeDay } = useShiftStore()
  const { t, language } = useT()
  const api = window.electronAPI

  const MONTH_NAMES = language === 'tr' ? MONTH_NAMES_TR : MONTH_NAMES_EN
  const THEMES = useMemo(() => THEME_KEYS.map(k => ({ key: k, label: t(THEME_LABEL_KEY[k] as any), swatch: THEMES_SWATCHES[k] })), [language])

  // Today's MyShift day-guard key — restores which "today" the shift/pause state belongs to.
  const todayStrLocal = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  })()
  const shiftActiveToday = shiftDay === todayStrLocal && dayShiftSecs > 0
  const pausedToday = myshiftPaused && shiftDay === todayStrLocal
  const fmtShiftHours = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // Parse birthday state
  const [bDay, setBDay] = useState(1)
  const [bMonth, setBMonth] = useState(1)

  // Advanced (custom provider / model) section, shown for OpenAI
  const [showAdvanced, setShowAdvanced] = useState(false)

  // API key is saved explicitly (it's a secret) — the input holds a draft until
  // the user presses "Kaydet", so it never auto-persists on every keystroke.
  const [keyDraft, setKeyDraft] = useState(settings.commentApiKey)
  const [keySavedFlash, setKeySavedFlash] = useState(false)

  // Live AI connection check — "anahtarı ekledim mi, AI çalışıyor mu?"
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AiTestResult | null>(null)

  // OpenRouter's current free model lineup (fetched live from their API).
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelInfo[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState(false)

  // Full data export/import feedback.
  const [exportFlash, setExportFlash] = useState('')
  const [importFlash, setImportFlash] = useState('')
  const [importing, setImporting] = useState(false)

  // Factory reset confirmation
  const [resetDraft, setResetDraft] = useState('')
  const [resetting, setResetting] = useState(false)

  // Weather widget — geocoding
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<{ name: string; country: string; admin1?: string; lat: number; lon: number }[]>([])
  const [geoSearching, setGeoSearching] = useState(false)

  // Clean up all flash-timeouts on unmount
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout) }
  }, [])
  const flashTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(() => { fn(); timersRef.current = timersRef.current.filter(t => t !== id) }, ms)
    timersRef.current.push(id)
  }

  const loadOpenRouterModels = useCallback(async () => {
    if (!api?.ai?.getOpenRouterModels) return
    setModelsLoading(true)
    setModelsError(false)
    try {
      const list = await api.ai.getOpenRouterModels()
      setOpenRouterModels(list)
      // Default to the best (largest context) free model if nothing sensible is set.
      if (list.length > 0) {
        const st = useShiftStore.getState().settings
        const cur = st.commentModel.trim()
        if (!cur || cur === 'gpt-4o-mini' || cur === 'qwen2.5' || !list.some(m => m.id === cur)) {
          updateSettings({ commentModel: list[0].id })
        }
      }
    } catch {
      setModelsError(true)
    } finally {
      setModelsLoading(false)
    }
  }, [api, updateSettings])

  // Load the free models whenever OpenRouter is the active provider.
  useEffect(() => {
    if (settings.commentProvider === 'openrouter') {
      void loadOpenRouterModels()
    }
  }, [settings.commentProvider, loadOpenRouterModels])

  // Sync state on load
  useEffect(() => {
    if (settings.birthday) {
      const [m, d] = settings.birthday.split('-').map(Number)
      if (m && d) {
        setBMonth(m)
        setBDay(d)
      }
    }
  }, [settings.birthday])

  // Keep the key draft in sync whenever the saved key changes from elsewhere.
  useEffect(() => {
    setKeyDraft(settings.commentApiKey)
  }, [settings.commentApiKey])

  const handleTestSound = () => {
    playSound(settings.defaultNotificationSound)
  }

  const handleBirthdayChange = (day: number, month: number) => {
    setBDay(day)
    setBMonth(month)
    const monthStr = month.toString().padStart(2, '0')
    const dayStr = day.toString().padStart(2, '0')
    updateSettings({ birthday: `${monthStr}-${dayStr}` })
  }

  const handleSaveApiKey = () => {
    updateSettings({ commentApiKey: keyDraft.trim() })
    setKeySavedFlash(true)
    flashTimer(() => setKeySavedFlash(false), 2500)
  }

  const handleTestAi = async () => {
    if (!api?.ai?.test) return
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.ai.test())
    } catch {
      setTestResult({ ok: false, detail: t('settingsView.testError'), elapsedMs: 0 })
    } finally {
      setTesting(false)
    }
  }

  const handleProviderChange = (p: Settings['commentProvider']) => {
    const patch: Partial<Settings> = { commentProvider: p }
    if (p === 'openai') {
      // "API anahtarını gir, gerisi benim." — prefill the OpenAI endpoint and a
      // sane model so the user only has to paste the key.
      const base = settings.commentBaseUrl.trim()
      if (!base || base === 'http://127.0.0.1:11434' || base === 'https://openrouter.ai/api/v1') patch.commentBaseUrl = 'https://api.openai.com/v1'
      if (!settings.commentModel.trim() || settings.commentModel.trim() === 'qwen2.5') patch.commentModel = 'gpt-4o-mini'
    } else if (p === 'openrouter') {
      // OpenRouter is OpenAI-compatible; pin its endpoint so the user only has
      // to paste the key and pick a model from the live free list.
      if (settings.commentBaseUrl.trim() !== 'https://openrouter.ai/api/v1') patch.commentBaseUrl = 'https://openrouter.ai/api/v1'
      if (settings.commentModel.trim() === 'gpt-4o-mini') patch.commentModel = ''
    } else if (p === 'ollama') {
      const base = settings.commentBaseUrl.trim()
      if (!base || base === 'https://openrouter.ai/api/v1' || base === 'https://api.openai.com/v1') patch.commentBaseUrl = 'http://127.0.0.1:11434'
      if (!settings.commentModel.trim() || settings.commentModel.trim() === 'gpt-4o-mini') patch.commentModel = 'qwen2.5'
    }
    updateSettings(patch)
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-2">
        {/* Page header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-11 h-11 rounded-2xl accent-soft border accent-border-soft text-xl shadow-lg accent-glow-lg">
            ⚙️
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{t('settingsView.pageTitle')}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('settingsView.pageSubtitle')}</p>
          </div>
        </div>

        {/* Dil */}
        <Section
          icon="🌐"
          title={t('settings.language')}
          description={t('settings.languageDesc')}
        >
          <Row
            icon="🌐"
            title={t('settings.language')}
            description={t('settings.languageDesc')}
            right={
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as 'en' | 'tr' })}
                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
              >
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
            }
          />
        </Section>

        {/* Bugünün Vardiya Durumu — kaydırma/duraklatma sıfırlamaları Dashboard'dan
            buraya taşındı (moral-bozucu "kaydırıldı" rozetleri yerine) */}
        <Section
          icon="📌"
          title={t('settingsView.shiftStateSection')}
          description={t('settingsView.shiftStateSectionDesc')}
        >
          <Row
            icon="⏩"
            title={t('settingsView.todayShifted')}
            description={shiftActiveToday ? t('settingsView.todayShiftedValue', { time: `+${fmtShiftHours(dayShiftSecs)}` }) : t('settingsView.todayShiftedNone')}
            right={
              <button
                onClick={() => setDayShift(0)}
                disabled={!shiftActiveToday}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                  shiftActiveToday
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                }`}
              >
                {t('settingsView.resetShiftBtn')}
              </button>
            }
          />
          <Row
            icon="⏸"
            title={t('settingsView.pauseState')}
            description={pausedToday ? t('settingsView.pausedLabel') : t('settingsView.pauseNone')}
            right={
              pausedToday ? (
                <button
                  onClick={resumeDay}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 transition-colors flex-shrink-0"
                >
                  {t('settingsView.resumeShiftBtn')}
                </button>
              ) : (
                <span className="text-xs text-slate-500 flex-shrink-0">{t('settingsView.pauseNone')}</span>
              )
            }
          />
        </Section>

        {/* Debug modu */}
        <Section
          icon="🧪"
          title={t('settingsView.debugMode')}
          description={t('settingsView.debugModeDesc')}
        >
          <Row
            icon="🧪"
            title={t('settingsView.debugMode')}
            description={t('settingsView.debugModeDesc')}
            right={<Toggle checked={settings.debugMode} onChange={(v) => updateSettings({ debugMode: v })} />}
          />
        </Section>

        {/* Görünüm */}
        <Section
          icon="🎨"
          title={t('settings.appearance')}
          description={t('settingsView.appearanceHint')}
        >
          <Row
            icon="🌈"
            title={t('settings.theme')}
            description={t('settings.themeDesc')}
            right={
              <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 justify-end">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    title={t.label}
                    onClick={() => updateSettings({ theme: t.key })}
                    className={`w-9 h-9 rounded-full transition-all accent-ring ${
                      settings.theme === t.key
                        ? 'scale-110 opacity-100 ring-2 ring-offset-2 ring-offset-slate-950'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ background: t.swatch }}
                  >
                    <span className="sr-only">{t.label}</span>
                  </button>
                ))}
              </div>
            }
          />
        </Section>

        {/* Saat Görünümü */}
        <Section
          icon="🕐"
          title={t('settingsView.clockView')}
          description={t('settingsView.clockViewDesc')}
        >
          <Row
            icon="✏️"
            title={t('settings.clockFont')}
            description={t('settingsView.clockFontDesc')}
            right={
              <select
                value={settings.clockFont}
                onChange={(e) => updateSettings({ clockFont: e.target.value })}
                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
              >
                <option value="jetbrains">JetBrains Mono</option>
                <option value="fira">Fira Code</option>
                <option value="inter">Inter</option>
                <option value="space">Space Grotesk</option>
                <option value="dm">DM Sans</option>
                <option value="_outfit">Outfit</option>
              </select>
            }
          />
        </Section>

        {/* Çalışma Modu */}
        <Section
          icon="🗓️"
          title={t('settingsView.workMode')}
          description={t('settingsView.workModeDesc')}
        >
          <Row
            icon="⚙️"
            title={t('settingsView.mode')}
            description={t('settingsView.modeDesc')}
            right={
              <div className="flex rounded-lg overflow-hidden border border-white/10 bg-slate-950 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => updateSettings({ mode: 'myshift' })}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    settings.mode === 'myshift' ? 'accent-solid-strong text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  MyShift
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ mode: 'pay' })}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors border-l border-white/5 ${
                    settings.mode === 'pay' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Pay
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ mode: 'chrono' })}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors border-l border-white/5 ${
                    settings.mode === 'chrono' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Krono
                </button>
              </div>
            }
          />

          {settings.mode === 'pay' && (
            <>
              <Row
                icon="🕐"
                title={t('settingsView.shiftType')}
                description={t('settingsView.shiftTypeDesc')}
                right={
                  <div className="flex rounded-lg overflow-hidden border border-white/10 bg-slate-950 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => updateSettings({ payTargetMode: 'window' })}
                      className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        settings.payTargetMode === 'window' ? 'accent-solid-strong text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('settingsView.timeWindow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ payTargetMode: 'duration' })}
                      className={`px-3 py-1.5 text-[11px] font-semibold transition-colors border-l border-white/5 ${
                        settings.payTargetMode === 'duration' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('settingsView.totalTime')}
                    </button>
                  </div>
                }
              />

              {settings.payTargetMode === 'window' ? (
                <Row
                  icon="🌅"
                  title={t('settingsView.payShiftTitle')}
                  description={t('settingsView.payShiftDesc')}
                  right={
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="time"
                        value={settings.payShiftStart}
                        onChange={(e) => updateSettings({ payShiftStart: e.target.value })}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-slate-500 text-xs">→</span>
                      <input
                        type="time"
                        value={settings.payShiftEnd}
                        onChange={(e) => updateSettings({ payShiftEnd: e.target.value })}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  }
                />
              ) : (
                <Row
                  icon="⏱️"
                  title={t('settingsView.durationToPay')}
                  description={t('settingsView.durationToPayDesc')}
                  right={
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={settings.payDurationMin}
                      onChange={(e) => updateSettings({ payDurationMin: Math.max(1, Math.min(1440, parseInt(e.target.value, 10) || 1)) })}
                      className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 text-right"
                    />
                  }
                />
              )}
              <Row
                icon="☕"
                title={t('settingsView.shortBreakBudget')}
                description={t('settingsView.shortBreakBudgetDesc')}
                right={
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={settings.payShortBreakMin}
                    onChange={(e) => updateSettings({ payShortBreakMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                    className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 text-right"
                  />
                }
              />
              <Row
                icon="🍽️"
                title={t('settingsView.mealBreakBudget')}
                description={t('settingsView.mealBreakBudgetDesc')}
                right={
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={settings.payMealBreakMin}
                    onChange={(e) => updateSettings({ payMealBreakMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                    className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 text-right"
                  />
                }
              />

              <div className="px-4 py-2.5 bg-white/5 border-b border-white/5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('settingsView.breakReminderHeader')}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{t('settingsView.breakReminderHint')}</p>
              </div>

              <Row
                icon="⏳"
                title={t('settingsView.workStretchReminder')}
                description={t('settingsView.workStretchReminderDesc')}
                right={
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={settings.payWorkReminderMin}
                    onChange={(e) => updateSettings({ payWorkReminderMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                    className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 text-right"
                  />
                }
              />
              <Row
                icon="⚠️"
                title={t('settingsView.breakOverrunReminder')}
                description={t('settingsView.breakOverrunReminderDesc')}
                right={
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={480}
                      value={settings.payBreakReminderMin}
                      onChange={(e) => updateSettings({ payBreakReminderMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                      className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 text-right"
                    />
                    <button
                      onClick={() => playReminderSound()}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                      title={t('settingsView.listenReminder')}
                    >
                      ▶ {t('settingsView.sound')}
                    </button>
                  </div>
                }
              />
            </>
          )}

          {settings.mode === 'chrono' && (
            <>
              <div className="px-4 py-2.5 bg-white/5 border-b border-white/5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('settingsView.chronoSettings')}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{t('settingsView.chronoSettingsDesc')}</p>
              </div>
              <Row
                icon="⏳"
                title={t('settingsView.chronoWorkReminder')}
                description={t('settingsView.chronoWorkReminderDesc')}
                right={
                  <input
                    type="number"
                    min={0}
                    max={480}
                    value={settings.chronoWorkReminderMin}
                    onChange={(e) => updateSettings({ chronoWorkReminderMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                    className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-right"
                  />
                }
              />
              <Row
                icon="⚠️"
                title={t('settingsView.chronoBreakReminder')}
                description={t('settingsView.chronoBreakReminderDesc')}
                right={
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={480}
                      value={settings.chronoBreakReminderMin}
                      onChange={(e) => updateSettings({ chronoBreakReminderMin: Math.max(0, Math.min(480, parseInt(e.target.value, 10) || 0)) })}
                      className="w-20 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 text-right"
                    />
                    <button
                      onClick={() => playReminderSound()}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                      title={t('settingsView.listenReminder')}
                    >
                      ▶ {t('settingsView.sound')}
                    </button>
                  </div>
                }
              />
            </>
          )}
        </Section>
        <Section
          icon="🚀"
          title={t('settingsView.startupTray')}
          description={t('settingsView.startupTrayDesc')}
        >
          <Row
            icon="🖥️"
            title={t('settingsView.launchWithWindows')}
            description={t('settingsView.launchWithWindowsDesc')}
            right={
              <Toggle
                checked={settings.launchWithWindows}
                onChange={(v) => updateSettings({ launchWithWindows: v })}
              />
            }
          />
          <Row
            icon="📉"
            title={t('settingsView.startMinimized')}
            description={t('settingsView.startMinimizedDesc')}
            right={
              <Toggle
                checked={settings.startMinimized}
                disabled={!settings.launchWithWindows}
                onChange={(v) => updateSettings({ startMinimized: v })}
              />
            }
          />
          <Row
            icon="🌱"
            title={t('settingsView.autoMinimize')}
            description={t('settingsView.autoMinimizeDesc')}
            right={
              <Toggle
                checked={settings.autoMinimizeToTray}
                disabled={!settings.launchWithWindows}
                onChange={(v) => updateSettings({ autoMinimizeToTray: v })}
              />
            }
          />
          <Row
            icon="🚪"
            title={t('settingsView.closeToTray')}
            description={t('settingsView.closeToTrayDesc')}
            right={
              <Toggle
                checked={settings.minimizeToTray}
                onChange={(v) => updateSettings({ minimizeToTray: v })}
              />
            }
          />
        </Section>

        {/* Notifications */}
        <Section
          icon="🔔"
          title={t('settingsView.notificationsTitle')}
          description={t('settingsView.notificationsDesc')}
        >
          <Row
            icon="🎵"
            title={t('settingsView.defaultSound')}
            description={t('settingsView.defaultSoundDesc')}
            right={
              <div className="flex items-center gap-2">
                <select
                  value={settings.defaultNotificationSound}
                  onChange={(e) => updateSettings({ defaultNotificationSound: e.target.value })}
                  className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
                >
                  <option value="default">{t('settingsView.soundDefault')}</option>
                  <option value="bell">{t('settingsView.soundBell')}</option>
                  <option value="digital">{t('settingsView.soundDigital')}</option>
                  <option value="soft">{t('settingsView.soundSoft')}</option>
                  <option value="elegant">{t('settingsView.soundElegant')}</option>
                  <option value="urgent">{t('settingsView.soundUrgent')}</option>
                  <option value="minimal">{t('settingsView.soundMinimal')}</option>
                  <option value="none">{t('settingsView.soundMuted')}</option>
                </select>
                <button
                  onClick={handleTestSound}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                >
                  ▶ {t('settingsView.testSound')}
                </button>
              </div>
            }
          />
        </Section>

        {/* Comments / AI */}
        <Section
          icon="💬"
          title={t('settingsView.comments')}
          description={t('settingsView.commentsDesc')}
        >
          <Row
            icon="🧠"
            title={t('settingsView.commentSource')}
            description={t('settingsView.commentSourceDesc')}
            right={
              <select
                value={settings.commentProvider}
                onChange={(e) => handleProviderChange(e.target.value as Settings['commentProvider'])}
                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
              >
                <option value="offline">{t('settingsView.commentOffline')}</option>
                <option value="ollama">{t('settingsView.commentOllama')}</option>
                <option value="openai">{t('settingsView.commentOpenai')}</option>
                <option value="openrouter">{t('settingsView.commentOpenrouter')}</option>
              </select>
            }
          />
          {settings.commentProvider !== 'offline' && (
            <>
              {settings.commentProvider === 'ollama' && (
                <>
                  <Row
                    icon="🔗"
                    title={t('settingsView.serverUrl')}
                    description={t('settingsView.serverUrlOllamaDesc')}
                    right={
                      <input
                        type="text"
                        value={settings.commentBaseUrl}
                        onChange={(e) => updateSettings({ commentBaseUrl: e.target.value })}
                        placeholder="http://127.0.0.1:11434"
                        className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border w-52"
                      />
                    }
                  />
                  <Row
                    icon="📦"
                    title={t('settingsView.model')}
                    description={t('settingsView.modelOllamaDesc')}
                    right={
                      <input
                        type="text"
                        value={settings.commentModel}
                        onChange={(e) => updateSettings({ commentModel: e.target.value })}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border w-40"
                      />
                    }
                  />
                </>
              )}

              {(settings.commentProvider === 'openai' || settings.commentProvider === 'openrouter') && (
                <>
                  <div className="px-4 py-3 border-b border-white/5">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-base flex-shrink-0 mt-0.5">🔑</span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-200">{t('settingsView.apiKey')}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t('settingsView.apiKeyDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="password"
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        placeholder={settings.commentProvider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...'}
                        className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:accent-border placeholder:text-slate-600"
                      />
                      <button
                        onClick={handleSaveApiKey}
                        className="accent-solid-strong hover:accent-solid text-white text-[11px] px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap"
                      >
                        {keySavedFlash ? t('settingsView.apiKeySaved') : t('settingsView.apiKeySave')}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {settings.commentApiKey
                        ? t('settingsView.apiKeyStored', { key: maskKey(settings.commentApiKey) })
                        : t('settingsView.apiKeyNone')}
                    </p>
                  </div>

                  {settings.commentProvider === 'openai' && (
                    <>
                      <div className="px-4 py-2 border-b border-white/5">
                        <button
                          onClick={() => setShowAdvanced(v => !v)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {showAdvanced ? t('settingsView.showAdvancedAdvanced') : t('settingsView.showAdvancedCollapsed')}
                        </button>
                      </div>
                      {showAdvanced && (
                        <>
                          <Row
                            icon="🔗"
                            title={t('settingsView.serverUrl')}
                            description={t('settingsView.serverUrlOpenaiDesc')}
                            right={
                              <input
                                type="text"
                                value={settings.commentBaseUrl}
                                onChange={(e) => updateSettings({ commentBaseUrl: e.target.value })}
                                placeholder="https://api.openai.com/v1"
                                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border w-52"
                              />
                            }
                          />
                          <Row
                            icon="📦"
                            title={t('settingsView.model')}
                            description={t('settingsView.modelOpenaiDesc')}
                            right={
                              <input
                                type="text"
                                value={settings.commentModel}
                                onChange={(e) => updateSettings({ commentModel: e.target.value })}
                                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border w-40"
                              />
                            }
                          />
                        </>
                      )}
                    </>
                  )}

                  {settings.commentProvider === 'openrouter' && (
                    <div className="px-4 py-3 border-b border-white/5">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-base flex-shrink-0 mt-0.5">📦</span>
                        <div className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-200">{t('settingsView.openrouterModels')}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {t('settingsView.openrouterModelsDesc')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {modelsLoading ? (
                          <div className="flex-1 text-xs text-slate-400 py-2 animate-pulse">{t('settingsView.openrouterLoading')}</div>
                        ) : modelsError ? (
                          <div className="flex-1 text-xs text-rose-400 py-2">{t('settingsView.openrouterError')}</div>
                        ) : openRouterModels && openRouterModels.length > 0 ? (
                          <select
                            value={settings.commentModel}
                            onChange={(e) => updateSettings({ commentModel: e.target.value })}
                            className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
                          >
                            {openRouterModels.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.id}{m.context_length > 0 ? ` (${Math.round(m.context_length / 1024)}K ctx)` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex-1 text-xs text-slate-500 py-2">{t('settingsView.openrouterEmpty')}</div>
                        )}
                        <button
                          onClick={() => void loadOpenRouterModels()}
                          disabled={modelsLoading}
                          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                          title="Listeyi yenile"
                        >
                          {t('settingsView.refresh')}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        {settings.commentApiKey
                          ? t('settingsView.openrouterKeySaved')
                          : t('settingsView.openrouterKeyNone')}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">{t('settingsView.testAi')}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      {t('settingsView.testAiDesc')}
                    </p>
                  </div>
                  <button
                    onClick={handleTestAi}
                    disabled={testing}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {testing ? t('settingsView.testingLabel') : t('settingsView.testBtn')}
                  </button>
                </div>

                {testing && (
                  <p className="text-[10px] text-slate-400 animate-pulse">{t('settingsView.testSending')}</p>
                )}

                {!testing && testResult && (
                  <div className={`px-3 py-2.5 rounded-lg border text-[11px] leading-relaxed ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    <span className="font-semibold">{testResult.ok ? t('settingsView.testWorking') : t('settingsView.testFailed')}</span>
                    <span className="text-slate-400"> — {testResult.detail}</span>
                    {testResult.elapsedMs > 0 && (
                      <span className="block text-[9px] text-slate-500 mt-0.5 font-mono">{t('settingsView.testResponseTime', { ms: testResult.elapsedMs })}</span>
                    )}
                  </div>
                )}

                {!testing && !testResult && (
                  <p className="text-[10px] text-slate-600">
                    {t('settingsView.testNotRun')}
                  </p>
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/5">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {t('settingsView.aiNote')}
                </p>
              </div>
            </>
          )}
        </Section>

        {/* Birthday */}
        <Section
          icon="🎂"
          title={t('settingsView.holiday')}
          description={t('settingsView.holidayDesc')}
        >
          <Row
            icon="📅"
            title={t('settingsView.birthdayTemplate')}
            description={t('settingsView.birthdayDesc')}
            right={
              <div className="flex gap-1.5">
                <select
                  value={bDay}
                  onChange={(e) => handleBirthdayChange(Number(e.target.value), bMonth)}
                  className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
                >
                  {Array.from({ length: 31 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <select
                  value={bMonth}
                  onChange={(e) => handleBirthdayChange(bDay, Number(e.target.value))}
                  className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
            }
          />
        </Section>

        {/* Tüm Veriler — Dışa / İçe Aktar */}
        <Section
          icon="📦"
          title={t('settingsView.dataExportImport')}
          description={t('settingsView.dataExportImportDesc')}
        >
          <div className="p-4 flex flex-col gap-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t('settingsView.dataExportImportLongDesc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={async () => {
                  if (!api?.data) return
                  const r = await api.data.export()
                  if (r.ok) {
                    setExportFlash(t('settingsView.dataExported'))
                    flashTimer(() => setExportFlash(''), 3000)
                  }
                }}
                className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                {t('settingsView.dataExportBtn')}
              </button>
              <button
                onClick={async () => {
                  if (!api?.data) return
                  if (!window.confirm(t('settingsView.dataImportConfirm'))) return
                  setImporting(true)
                  setImportFlash('')
                  try {
                    const r = await api.data.import()
                    if (r.ok) {
                      const parts: string[] = []
                      if (r.storeKeys) parts.push(`${r.storeKeys} ${t('settingsView.dataSettingsLabel')}`)
                      if (r.notes) parts.push(`${r.notes} ${t('settingsView.dataNotesLabel')}`)
                      if (r.files) parts.push(`${r.files} ${t('settingsView.dataFilesLabel')}`)
                      setImportFlash(parts.length > 0 ? t('settingsView.dataImported', { parts: parts.join(', ') }) : t('settingsView.dataImportError'))
                    } else {
                      setImportFlash(r.error || t('settingsView.dataImportError'))
                    }
                  } finally {
                    setImporting(false)
                    flashTimer(() => setImportFlash(''), 4000)
                  }
                }}
                disabled={importing}
                className="bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40"
              >
                {importing ? t('settingsView.dataImporting') : t('settingsView.dataImportBtn')}
              </button>
            </div>
            {(exportFlash || importFlash) && (
              <p className="text-[11px] text-emerald-400 font-medium">{exportFlash || importFlash}</p>
            )}
          </div>
        </Section>

        {/* Özel Widget — Hava Durumu */}
        <Section
          icon="🌤️"
          title={t('settingsView.weatherWidget')}
          description={t('settingsView.weatherWidgetDesc')}
        >
          <Row
            icon="📡"
            title={t('settingsView.widgetEnabled')}
            description={t('settingsView.widgetEnabledDesc')}
            right={<Toggle checked={settings.widgetEnabled} onChange={(v) => updateSettings({ widgetEnabled: v })} />}
          />
          {settings.widgetEnabled && (
            <div className="p-4 space-y-4">
              {/* Quick-select popular cities */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">{t('settingsView.popularCities')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: 'Kızıltepe', lat: 37.0744, lon: 40.2928, district: 'Mardin' },
                    { name: 'Istanbul', lat: 41.0082, lon: 28.9784, district: 'İstanbul' },
                    { name: 'Ankara', lat: 39.9334, lon: 32.8597, district: 'Ankara' },
                    { name: 'İzmir', lat: 38.4237, lon: 27.1428, district: 'İzmir' },
                    { name: 'Bursa', lat: 40.1885, lon: 29.061, district: 'Bursa' },
                    { name: 'Antalya', lat: 36.8969, lon: 30.7133, district: 'Antalya' },
                    { name: 'Adana', lat: 37.0, lon: 35.3213, district: 'Adana' },
                    { name: 'Konya', lat: 37.8746, lon: 32.4932, district: 'Konya' },
                    { name: 'Gaziantep', lat: 37.0662, lon: 37.3833, district: 'Gaziantep' },
                    { name: 'Trabzon', lat: 41.0027, lon: 39.7168, district: 'Trabzon' },
                    { name: 'Diyarbakır', lat: 37.9144, lon: 40.2306, district: 'Diyarbakır' },
                    { name: 'Eskişehir', lat: 39.7767, lon: 30.5206, district: 'Eskişehir' },
                    { name: 'Samsun', lat: 41.2867, lon: 36.33, district: 'Samsun' },
                  ].map((city) => (
                    <button
                      key={city.name}
                      onClick={() => {
                        updateSettings({
                          widgetCity: city.name,
                          widgetCountry: 'TR',
                          widgetDistrict: city.district,
                          widgetLat: city.lat,
                          widgetLon: city.lon,
                        })
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                        settings.widgetCity === city.name && settings.widgetLat === city.lat
                          ? 'bg-accent/20 border-accent/30 accent-text'
                          : 'bg-white/3 border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-300'
                      }`}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom search */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">{t('settingsView.customCitySearch')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={geoQuery}
                    onChange={(e) => setGeoQuery(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && geoQuery.trim().length >= 2) {
                        setGeoSearching(true)
                        try {
                          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geoQuery.trim())}&count=8&language=${language}&format=json`)
                          const data = await res.json()
                          const mapped = (data.results ?? []).map((r: Record<string, unknown>) => ({
                            name: r.name as string,
                            country: r.country as string,
                            admin1: r.admin1 as string | undefined,
                            lat: (r.latitude ?? r.lat) as number,
                            lon: (r.longitude ?? r.lon) as number,
                          }))
                          setGeoResults(mapped)
                        } catch { setGeoResults([]) }
                        setGeoSearching(false)
                      }
                    }}
                    placeholder={t('settings.searchCity')}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-white/20 transition-colors"
                  />
                  <button
                    onClick={async () => {
                      if (geoQuery.trim().length < 2) return
                      setGeoSearching(true)
                      try {
                        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geoQuery.trim())}&count=8&language=${language}&format=json`)
                        const data = await res.json()
                        const mapped = (data.results ?? []).map((r: Record<string, unknown>) => ({
                          name: r.name as string,
                          country: r.country as string,
                          admin1: r.admin1 as string | undefined,
                          lat: (r.latitude ?? r.lat) as number,
                          lon: (r.longitude ?? r.lon) as number,
                        }))
                        setGeoResults(mapped)
                      } catch { setGeoResults([]) }
                      setGeoSearching(false)
                    }}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400 hover:bg-white/10 transition-colors"
                  >
                    {geoSearching ? '⏳' : '🔍'}
                  </button>
                </div>
              </div>

              {/* Search results */}
              {geoResults.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500">{t('settingsView.searchResultsHint')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {geoResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          updateSettings({
                            widgetCity: r.name,
                            widgetCountry: r.country,
                            widgetDistrict: r.admin1 ?? '',
                            widgetLat: r.lat,
                            widgetLon: r.lon,
                          })
                          setGeoResults([])
                          setGeoQuery('')
                        }}
                        className={`text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                          settings.widgetCity === r.name && settings.widgetLat === r.lat
                            ? 'bg-accent/20 border-accent/30 accent-text'
                            : 'bg-white/3 border border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                        }`}
                      >
                        <span className="font-medium">📍 {r.name}</span>
                        {r.admin1 && <span className="text-slate-500"> — {r.admin1}</span>}
                        <span className="text-slate-600"> ({r.country})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Currently selected */}
              {settings.widgetCity && (
                <div className="p-3 rounded-lg bg-accent/5 border border-accent/15">
                  <p className="text-xs text-slate-300 flex items-center gap-1.5">
                    📍 <span className="font-semibold">{settings.widgetCity}</span>
                    {settings.widgetDistrict && <span className="text-slate-400">, {settings.widgetDistrict}</span>}
                    <span className="text-slate-500"> — {settings.widgetCountry}</span>
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1 font-mono">
                    {settings.widgetLat?.toFixed(4)}°N, {settings.widgetLon?.toFixed(4)}°E
                  </p>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Tehlikeli Bölge — Geri Döndürülemez Ayarlar */}
        <div className="border-t border-rose-500/20 pt-6 mt-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm">⚠️</span>
            <div>
              <h3 className="text-sm font-semibold text-rose-300">{t('settingsView.dangerZone')}</h3>
              <p className="text-[10px] text-rose-400/50">{t('settingsView.dangerZoneDesc')}</p>
            </div>
          </div>
          <div className="flex flex-col rounded-xl border border-rose-500/15 bg-rose-500/3">
            {/* Geçmişi Sil */}
            <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-rose-500/10">
              <div>
                <p className="text-sm font-medium text-slate-300">{t('settings.clearHistory')}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{t('settings.clearHistoryDesc')}</p>
              </div>
              <button
                onClick={() => {
                  if (window.confirm(t('settings.clearHistoryConfirm'))) {
                    clearHistory()
                  }
                }}
                className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                {t('settings.clearHistory')}
              </button>
            </div>
            {/* Fabrika Ayarlarına Dön */}
            <div className="p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-300">{t('settings.factoryReset')}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{t('settings.factoryResetDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resetDraft}
                  onChange={(e) => setResetDraft(e.target.value)}
                  placeholder={t('settings.factoryResetPlaceholder')}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-rose-500/50 transition-colors"
                />
                <button
                  disabled={resetDraft !== 'reset' || resetting}
                  onClick={async () => {
                    setResetting(true)
                    await factoryReset()
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    resetDraft === 'reset' && !resetting
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 cursor-pointer'
                      : 'bg-white/5 border border-white/10 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {resetting ? t('settings.resetting') : t('settings.reset')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 pt-4 text-center">
          <span className="text-[10px] text-slate-600 block">{t('settingsView.footerApp')}</span>
          <span className="text-[10px] text-slate-600 block mt-0.5">{t('settingsView.footerDesign')}</span>
        </div>
      </div>
    </div>
  )
}
