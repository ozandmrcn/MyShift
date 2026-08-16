import { useState, useEffect, useCallback } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import type { Settings } from '../stores/useShiftStore'
import { playSound, playReminderSound } from '../utils/soundEffects'

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

// General themes — keys must match the [data-theme=...] palettes in index.css.
// Each swatch is a circular conic-gradient showing the theme's tones:
// base surface -> deep accent -> mid accent -> light accent.
const THEMES = [
  {
    key: 'mavi',
    label: 'Gece Mavisi',
    swatch: 'conic-gradient(#0f172a 0 25%, #1e40af 0 50%, #3b82f6 0 75%, #93c5fd 0 100%)'
  },
  {
    key: 'zurut',
    label: 'Zümrüt',
    swatch: 'conic-gradient(#0a1f16 0 25%, #065f46 0 50%, #10b981 0 75%, #6ee7b7 0 100%)'
  },
  {
    key: 'turkuaz',
    label: 'Turkuaz',
    swatch: 'conic-gradient(#072624 0 25%, #0f766e 0 50%, #14b8a6 0 75%, #5eead4 0 100%)'
  },
  {
    key: 'menekse',
    label: 'Menekşe',
    swatch: 'conic-gradient(#170d2e 0 25%, #6d28d9 0 50%, #8b5cf6 0 75%, #c4b5fd 0 100%)'
  },
  {
    key: 'kiraz',
    label: 'Kiraz',
    swatch: 'conic-gradient(#240d12 0 25%, #be123c 0 50%, #f43f5e 0 75%, #fda4af 0 100%)'
  },
  {
    key: 'kehribar',
    label: 'Kehribar',
    swatch: 'conic-gradient(#241d09 0 25%, #b45309 0 50%, #f59e0b 0 75%, #fcd34d 0 100%)'
  }
]

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
  const { settings, updateSettings, clearHistory } = useShiftStore()
  const api = window.electronAPI

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
    setTimeout(() => setKeySavedFlash(false), 2500)
  }

  const handleTestAi = async () => {
    if (!api?.ai?.test) return
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.ai.test())
    } catch {
      setTestResult({ ok: false, detail: 'Test isteği iletilemedi (dahili hata).', elapsedMs: 0 })
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
            <h2 className="text-xl font-semibold text-slate-100">Uygulama Ayarları</h2>
            <p className="text-xs text-slate-400 mt-0.5">Açılış, tepsi ve bildirim tercihlerinizi yönetin.</p>
          </div>
        </div>

        {/* Görünüm */}
        <Section
          icon="🎨"
          title="Görünüm"
          description="Genel temayı seçin — uygulamanın tamamı (arka plan, kartlar, yazılar) bu renge bürünür."
        >
          <Row
            icon="🌈"
            title="Tema"
            description="Uygulamanın ana teması — arka plan, kartlar, butonlar ve tüm metin renkleri uyum sağlar."
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

        {/* Çalışma Modu */}
        <Section
          icon="🗓️"
          title="Çalışma Modu"
          description="Günlük vardiyanın nasıl işlendiğini seçin"
        >
          <Row
            icon="⚙️"
            title="Mod"
            description="MyShift: aktivite şablonlarına göre planlı vardiya. Pay: sabit başlangıç/bitiş saati + günlük mola bütçeleri."
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
              </div>
            }
          />

          {settings.mode === 'pay' && (
            <>
              <Row
                icon="🕐"
                title="Vardiya Tipi"
                description="Saat Aralığı: sabit başlangıç/bitiş saati. Toplam Süre: bugün 'ödeyeceğin' toplam çalışma dakikası — çalıştıkça kalan azalır."
                right={
                  <div className="flex rounded-lg overflow-hidden border border-white/10 bg-slate-950 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => updateSettings({ payTargetMode: 'window' })}
                      className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        settings.payTargetMode === 'window' ? 'accent-solid-strong text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Saat Aralığı
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ payTargetMode: 'duration' })}
                      className={`px-3 py-1.5 text-[11px] font-semibold transition-colors border-l border-white/5 ${
                        settings.payTargetMode === 'duration' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Toplam Süre
                    </button>
                  </div>
                }
              />

              {settings.payTargetMode === 'window' ? (
                <Row
                  icon="🌅"
                  title="Pay Vardiyası"
                  description="Sabit mesai başlangıç ve bitiş saati."
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
                  title="Ödenecek Süre"
                  description="Bugün tamamlaman gereken toplam çalışma süresi. Çalıştıkça kalan azalır; molalar sayılmaz."
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
                title="Kısa Mola Bütçesi"
                description="Çay, kahve ve ihtiyaç molaları için günlük toplam süre (dakika)."
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
                title="Yemek Molası Bütçesi"
                description="Kahvaltı, öğle ve akşam yemeği molaları için günlük toplam süre (dakika)."
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
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mola Hatırlatması</p>
                <p className="text-[9px] text-slate-600 mt-0.5">Uyarı 1 dakika görünür ve farklı bir ses çalar.</p>
              </div>

              <Row
                icon="⏳"
                title="Tahmini Shift Süresi (dk)"
                description="Örn. 50 — bu süre aralıksız çalışınca 'mola yapmadın' uyarısı. (0 = kapalı)"
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
                title="Tahmini Kısa Mola Süresi (dk)"
                description="Örn. 15 — planladığın molayı aşınca 'başka molandan yiyorsun' uyarısı. (0 = kapalı)"
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
                      title="Hatırlatma sesini dinle"
                    >
                      ▶ Ses
                    </button>
                  </div>
                }
              />
            </>
          )}
        </Section>

        {/* Startup & Tray */}
        <Section
          icon="🚀"
          title="Başlangıç ve Tepsi"
          description="Uygulamanın açılış ve sistem tepsi davranışı"
        >
          <Row
            icon="🖥️"
            title="Windows ile Birlikte Başlat"
            description="Bilgisayarınız açıldığında MyShift otomatik olarak başlasın."
            right={
              <Toggle
                checked={settings.launchWithWindows}
                onChange={(v) => updateSettings({ launchWithWindows: v })}
              />
            }
          />
          <Row
            icon="📉"
            title="Küçültülmüş Olarak Başlat"
            description="Ekranda görünmeden doğrudan sistem tepsisine küçülerek başlasın."
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
            title="Açılışta Göster, Sonra Tepsiye Küçült"
            description="Kısa süre görünür, etkileşime girilmezse tepsiye küçülür."
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
            title="Kapatıldığında Tepsiye Küçült"
            description="Kapat butonu uygulamayı bitirmez, arka planda çalışmaya devam eder."
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
          title="Bildirimler"
          description="Genel vardiya geçişleri için varsayılan ses"
        >
          <Row
            icon="🎵"
            title="Varsayılan Bildirim Sesi"
            description="Vardiya başlangıcı ve genel geçişlerde çalınacak ses."
            right={
              <div className="flex items-center gap-2">
                <select
                  value={settings.defaultNotificationSound}
                  onChange={(e) => updateSettings({ defaultNotificationSound: e.target.value })}
                  className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
                >
                  <option value="default">Varsayılan</option>
                  <option value="bell">Çan</option>
                  <option value="digital">Dijital</option>
                  <option value="none">Sessiz</option>
                </select>
                <button
                  onClick={handleTestSound}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                >
                  ▶ Test Et
                </button>
              </div>
            }
          />
        </Section>

        {/* Comments / AI */}
        <Section
          icon="💬"
          title="Yorumlar"
          description="Saat altındaki tek satırlık yorumu kim yazsın?"
        >
          <Row
            icon="🧠"
            title="Yorum Kaynağı"
            description="Ollama (yerel) veya OpenAI uyumlu bir API kullanılabilir; yoksa yerleşik motor devreye girer. AI ayarlıyken yorumlar gerçek zamanlı davranışınıza göre yazılır."
            right={
              <select
                value={settings.commentProvider}
                onChange={(e) => handleProviderChange(e.target.value as Settings['commentProvider'])}
                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:accent-border cursor-pointer"
              >
                <option value="offline">Yerleşik Motor</option>
                <option value="ollama">Ollama (Yerel)</option>
                <option value="openai">OpenAI Uyumlu API</option>
                <option value="openrouter">OpenRouter (Ücretsiz Modeller)</option>
              </select>
            }
          />
          {settings.commentProvider !== 'offline' && (
            <>
              {settings.commentProvider === 'ollama' && (
                <>
                  <Row
                    icon="🔗"
                    title="Sunucu Adresi (Base URL)"
                    description="Ollama varsayılanı: http://127.0.0.1:11434"
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
                    title="Model"
                    description="Örn: qwen2.5, llama3.1"
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
                        <span className="block text-sm font-medium text-slate-200">API Anahtarı</span>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          Anahtarı yapıştırıp <span className="text-slate-300">Kaydet</span>'e basın. Yalnızca bu bilgisayarda saklanır; yorum üretirken doğrudan sağlayıcıya gider.
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
                        {keySavedFlash ? '✓ Kaydedildi' : '💾 Kaydet'}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {settings.commentApiKey
                        ? `✅ Kayıtlı anahtar: ${maskKey(settings.commentApiKey)}`
                        : '⚠️ Henüz kayıtlı anahtar yok — yukarıdaki alana yapıştırıp Kaydet\'e basın.'}
                    </p>
                  </div>

                  {settings.commentProvider === 'openai' && (
                    <>
                      <div className="px-4 py-2 border-b border-white/5">
                        <button
                          onClick={() => setShowAdvanced(v => !v)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {showAdvanced ? '▾ Gelişmiş Ayarları Gizle' : '▸ Gelişmiş: Özel Sağlayıcı / Model Kullan'}
                        </button>
                      </div>
                      {showAdvanced && (
                        <>
                          <Row
                            icon="🔗"
                            title="Sunucu Adresi (Base URL)"
                            description="OpenAI uyumlu başka bir sağlayıcı (Groq vb.) kullanmak için değiştirin."
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
                            title="Model"
                            description="Örn: gpt-4o-mini, gpt-4.1-mini"
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
                          <span className="block text-sm font-medium text-slate-200">Model (güncel ücretsizler)</span>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            OpenRouter'daki <span className="text-slate-300">:free</span> modeller anlık listelenir. Ücretsiz modeller zamanla eklenip kaldırılabilir — listeden seçmeniz yeterli.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {modelsLoading ? (
                          <div className="flex-1 text-xs text-slate-400 py-2 animate-pulse">Ücretsiz modeller yükleniyor…</div>
                        ) : modelsError ? (
                          <div className="flex-1 text-xs text-rose-400 py-2">Liste alınamadı — internet bağlantınızı kontrol edin.</div>
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
                          <div className="flex-1 text-xs text-slate-500 py-2">Liste boş — bir süre sonra tekrar deneyin.</div>
                        )}
                        <button
                          onClick={() => void loadOpenRouterModels()}
                          disabled={modelsLoading}
                          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] px-3 py-2 rounded-lg border border-white/5 font-semibold transition-colors whitespace-nowrap"
                          title="Listeyi yenile"
                        >
                          ↻ Yenile
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        {settings.commentApiKey
                          ? '✅ Anahtar kayıtlı — aşağıdan test edebilirsiniz.'
                          : '⚠️ Önce yukarıdaki alana OpenRouter anahtarınızı yapıştırıp Kaydet\'e basın.'}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="px-4 py-3 border-b border-white/5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">🔬 AI Bağlantısını Test Et</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Gerçek bir istek gönderilir: anahtar geçerli mi, sunucu erişilebilir mi, model yanıt veriyor mu — anında görürsünüz.
                    </p>
                  </div>
                  <button
                    onClick={handleTestAi}
                    disabled={testing}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] px-3 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {testing ? 'Test Ediliyor…' : '▶ Test Et'}
                  </button>
                </div>

                {testing && (
                  <p className="text-[10px] text-slate-400 animate-pulse">İstek gönderiliyor, yanıt bekleniyor…</p>
                )}

                {!testing && testResult && (
                  <div className={`px-3 py-2.5 rounded-lg border text-[11px] leading-relaxed ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    <span className="font-semibold">{testResult.ok ? '✓ Çalışıyor' : '✗ Sorun var'}</span>
                    <span className="text-slate-400"> — {testResult.detail}</span>
                    {testResult.elapsedMs > 0 && (
                      <span className="block text-[9px] text-slate-500 mt-0.5 font-mono">Yanıt süresi: {testResult.elapsedMs} ms</span>
                    )}
                  </div>
                )}

                {!testing && !testResult && (
                  <p className="text-[10px] text-slate-600">
                    Henüz test yapılmadı. Sorun varsa ayrıntı burada görünür.
                  </p>
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/5">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Not: Bu ayar açıkken yorum bağlamı (aktif aktivite, açık uygulama, şarkı başlığı vb.)
                  seçtiğiniz sağlayıcıya gönderilir. AI yanıt vermezse yerleşik motor devreye girer.
                </p>
              </div>
            </>
          )}
        </Section>

        {/* Birthday */}
        <Section
          icon="🎂"
          title="Tatil"
          description="Özel günlerde otomatik şablon seçimi"
        >
          <Row
            icon="📅"
            title="Doğum Günü Tatili"
            description='"Doğum Günü" veya "Birthday" isimli şablon otomatik etkinleşir.'
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

        {/* Veri */}
        <Section
          icon="🗑️"
          title="Veri"
          description="Geçmiş kayıtları tek tuşla temizle"
        >
          <div className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-300">Geçmişi Temizle</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Tüm günlük kayıtlar ve tamamlanan vardiyalar silinir. Bugünün kaydı korunur.</p>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('Geçmiş tamamen silinecek. Bu işlem geri alınamaz. Devam edilsin mi?')) {
                    clearHistory()
                  }
                }}
                className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                🗑️ Temizle
              </button>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-white/5 pt-4 text-center">
          <span className="text-[10px] text-slate-600 block">MyShift v1.0.0 • Çevrimdışı Kişisel Vardiya Sistemi</span>
          <span className="text-[10px] text-slate-600 block mt-0.5">Windows 10/11 Fluent Design</span>
        </div>
      </div>
    </div>
  )
}
