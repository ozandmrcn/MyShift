import { useState, useEffect } from 'react'
import { useShiftStore, ShiftTemplate, Activity, calculateDuration } from '../stores/useShiftStore'
import { playSound } from '../utils/soundEffects'
import { useT } from '../i18n/useT'
import tr from '../i18n/tr'
import en from '../i18n/en'

// ─── Quick Presets ─────────────────────────────────────────────────────────────
function getActivityPresets(t: (key: string) => string): Partial<Activity>[] {
  return [
    { name: t('shiftEditorUI.presetTea'), icon: '☕', color: 'orange', duration: 15, isBreak: true },
    { name: t('shiftEditorUI.presetBreakfast'), icon: '🍳', color: 'orange', duration: 30, isBreak: true },
    { name: t('shiftEditorUI.presetMeal'), icon: '🍔', color: 'amber', duration: 30, isBreak: true },
    { name: t('shiftEditorUI.presetWork'), icon: '💻', color: 'blue', duration: 90 },
    { name: t('shiftEditorUI.presetMeeting'), icon: '💬', color: 'purple', duration: 60 },
    { name: t('shiftEditorUI.presetExercise'), icon: '🏃', color: 'red', duration: 45 },
    { name: t('shiftEditorUI.presetReading'), icon: '📚', color: 'indigo', duration: 30 },
    { name: t('shiftEditorUI.presetRest'), icon: '🛌', color: 'indigo', duration: 480 },
  ]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMOJI_OPTIONS = ['💻', '☕', '🍔', '📚', '🏃', '😴', '🚗', '🎮', '🎨', '🎵', '🏢', '💬', '🧹', '🛒', '🏋️', '🧘', '🛌', '🍕', '✏️', '📝', '🎯', '🍳', '🌿', '🏖️']
const COLOR_OPTIONS = [
  { key: 'blue',    labelKey: 'shiftEditorUI.colorBlue',   bg: 'accent-solid',   ring: 'accent-ring',   card: 'accent-soft accent-border-soft accent-text-soft' },
  { key: 'orange',  labelKey: 'shiftEditorUI.colorOrange', bg: 'bg-orange-500', ring: 'ring-orange-400', card: 'bg-orange-500/10 border-orange-500/30 text-orange-300' },
  { key: 'emerald', labelKey: 'shiftEditorUI.colorGreen',  bg: 'bg-emerald-500',ring: 'ring-emerald-400',card: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  { key: 'purple',  labelKey: 'shiftEditorUI.colorPurple', bg: 'bg-purple-500', ring: 'ring-purple-400', card: 'bg-purple-500/10 border-purple-500/30 text-purple-300' },
  { key: 'red',     labelKey: 'shiftEditorUI.colorRed',    bg: 'bg-rose-500',   ring: 'ring-rose-400',   card: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
  { key: 'amber',   labelKey: 'shiftEditorUI.colorAmber',  bg: 'bg-amber-500',  ring: 'ring-amber-400',  card: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
  { key: 'indigo',  labelKey: 'shiftEditorUI.colorIndigo', bg: 'bg-indigo-500', ring: 'ring-indigo-400', card: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' },
]
const SOUND_OPTIONS = [
  { key: 'default', labelKey: 'shiftEditorUI.soundDefault' },
  { key: 'bell',    labelKey: 'shiftEditorUI.soundBell' },
  { key: 'digital', labelKey: 'shiftEditorUI.soundDigital' },
]

function getColorCard(colorKey: string) {
  return COLOR_OPTIONS.find(c => c.key === colorKey)?.card || 'bg-slate-500/10 border-slate-500/30 text-slate-300'
}

// ─── Activity Card ─────────────────────────────────────────────────────────────
function ActivityCard({
  act,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast
}: {
  act: Activity
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const { t } = useT()
  const cardColor = getColorCard(act.color)

  return (
    <div className={`flex items-stretch gap-0 rounded-xl border overflow-hidden group transition-all duration-150 hover:shadow-md ${cardColor}`}>
      {/* Left color strip */}
      <div className={`w-1 flex-shrink-0 ${COLOR_OPTIONS.find(c => c.key === act.color)?.bg || 'bg-slate-500'}`} />

      {/* Main content */}
      <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
        {/* Icon */}
        <span className="text-2xl flex-shrink-0 w-8 text-center leading-none">{act.icon}</span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{act.name}</p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            {act.startTime} → {act.endTime}
            <span className="ml-2 text-slate-500">{act.duration} {t('shiftEditorUI.minLabel')}</span>
            {act.isBreak && (
              <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300">🧘 {t('shiftEditorUI.breakBadge')}</span>
            )}
          </p>
          {act.notes && (
            <p className="text-[10px] text-slate-500 italic truncate mt-0.5">{act.notes}</p>
          )}
        </div>

        {/* Notification badge */}
        {act.notificationEnabled && (
          <span className="text-[10px] text-slate-500 flex-shrink-0">🔔</span>
        )}
      </div>

      {/* Right action buttons — always visible, clean */}
      <div className="flex flex-col border-l border-white/5 flex-shrink-0">
        {/* Move up/down */}
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex-1 px-2.5 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-[11px]"
          title={t('shiftEditorUI.moveUpTitle')}
        >▲</button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="flex-1 px-2.5 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed text-[11px]"
          title={t('shiftEditorUI.moveDownTitle')}
        >▼</button>
      </div>

      <div className="flex flex-col border-l border-white/5 flex-shrink-0">
        <button
          onClick={onDuplicate}
          className="flex-1 px-2.5 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors text-[11px]"
          title={t('shiftEditorUI.duplicateTitle')}
        >⧉</button>
        <button
          onClick={onEdit}
          className="flex-1 px-2.5 text-slate-400 hover:accent-text-soft accent-soft-hover transition-colors text-[11px]"
          title={t('shiftEditorUI.editTitle')}
        >✎</button>
      </div>

      <div className="flex flex-col border-l border-white/5 flex-shrink-0">
        <button
          onClick={onDelete}
          className="h-full px-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors text-sm"
          title={t('shiftEditor.delete')}
        >✕</button>
      </div>
    </div>
  )
}

// ─── Activity Modal ────────────────────────────────────────────────────────────
function ActivityModal({
  activity,
  isNew,
  onSave,
  onClose
}: {
  activity: Activity
  isNew: boolean
  onSave: (act: Activity) => void
  onClose: () => void
}) {
  const { t } = useT()
  const [form, setForm] = useState<Activity>(activity)
  const ACTIVITY_PRESETS = getActivityPresets(t)

  const applyPreset = (preset: Partial<Activity>) => {
    // Calculate end time based on current start + preset duration
    const [sh, sm] = form.startTime.split(':').map(Number)
    const endMins = sh * 60 + sm + (preset.duration ?? 60)
    const endH = Math.floor(endMins / 60) % 24
    const endM = endMins % 60
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
    setForm({
      ...form,
      name: preset.name ?? form.name,
      icon: preset.icon ?? form.icon,
      color: preset.color ?? form.color,
      isBreak: preset.isBreak ?? form.isBreak,
      endTime,
      duration: preset.duration ?? form.duration
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.startTime >= form.endTime) {
      alert(t('shiftEditorUI.startTimeError'))
      return
    }
    onSave({ ...form, duration: calculateDuration(form.startTime, form.endTime) })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {isNew ? t('shiftEditorUI.newActivity') : t('shiftEditorUI.editActivity')}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm transition-colors flex items-center justify-center"
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          {/* Quick Presets — only show for new activities */}
          {isNew && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {t('shiftEditorUI.quickTemplates')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-white/10 text-[11px] text-slate-300 font-medium transition-all hover:scale-105"
                  >
                    <span>{p.icon}</span>
                    <span>{p.name}</span>
                    <span className="text-slate-600 text-[9px]">{p.duration}{t('shiftEditorUI.minLabel')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('shiftEditorUI.activityName')}
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:accent-border transition-colors"
              placeholder={t('shiftEditorUI.activityNamePlaceholder')}
            />
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {t('shiftEditorUI.startTime')}
              </label>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:accent-border transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {t('shiftEditorUI.endTime')}
              </label>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:accent-border transition-colors"
              />
            </div>
          </div>

          {/* Duration preview */}
          {form.startTime && form.endTime && form.startTime < form.endTime && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-white/5">
              <span className="text-slate-500 text-xs">⏱</span>
              <span className="text-xs text-slate-400">
                {t('shiftEditor.duration')}: <span className="text-slate-200 font-semibold font-mono">
                  {calculateDuration(form.startTime, form.endTime)} {t('shiftEditor.durationMinutes')}
                  {' '}({Math.floor(calculateDuration(form.startTime, form.endTime) / 60) > 0 && `${Math.floor(calculateDuration(form.startTime, form.endTime) / 60)} ${t('shiftEditorUI.hoursShort')} `}{calculateDuration(form.startTime, form.endTime) % 60 > 0 && `${calculateDuration(form.startTime, form.endTime) % 60} ${t('shiftEditorUI.minLabel')}`})
                </span>
              </span>
            </div>
          )}

          {/* Emoji picker */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('shiftEditorUI.icon')}
            </label>
            <div className="grid grid-cols-8 gap-1.5 p-2.5 bg-slate-950 rounded-lg border border-white/5">
              {EMOJI_OPTIONS.map(emo => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setForm({ ...form, icon: emo })}
                  className={`aspect-square text-xl rounded-lg flex items-center justify-center transition-all hover:scale-110 ${
                    form.icon === emo
                      ? 'accent-solid-strong shadow-md accent-glow scale-110'
                      : 'hover:bg-white/10'
                  }`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('shiftEditor.color')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(col => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => setForm({ ...form, color: col.key })}
                  title={t(col.labelKey)}
                  className={`w-7 h-7 rounded-full ${col.bg} border-2 transition-all hover:scale-110 ${
                    form.color === col.key
                      ? `ring-2 ${col.ring} ring-offset-1 ring-offset-slate-900 scale-110 border-white/30`
                      : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Mola mı? */}
          <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">{t('shiftEditorUI.breakQuestion')}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('shiftEditorUI.breakDescription')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.isBreak}
                onChange={e => setForm({ ...form, isBreak: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
            </label>
          </div>

          {/* Notifications */}
          <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-300">{t('shiftEditorUI.notification')}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{t('shiftEditorUI.notificationDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notificationEnabled}
                  onChange={e => setForm({ ...form, notificationEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all toggle-checked" />
              </label>
            </div>

            {form.notificationEnabled && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {t('shiftEditorUI.notificationSound')}
                  </label>
                  <button
                    type="button"
                    onClick={() => playSound(form.notificationSound)}
                    disabled={form.notificationSound === 'none'}
                    className="text-[10px] font-medium px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('shiftEditorUI.testSound')}
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {SOUND_OPTIONS.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setForm({ ...form, notificationSound: s.key })}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                        form.notificationSound === s.key
                          ? 'accent-solid-strong accent-border text-white'
                          : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {t(s.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('shiftEditorUI.notesOptional')}
            </label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder={t('shiftEditorUI.notesPlaceholder')}
              rows={2}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:accent-border transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 text-slate-300 rounded-xl text-sm font-medium transition-colors"
            >
              {t('shiftEditor.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 accent-solid-strong hover:accent-solid text-white rounded-xl text-sm font-semibold transition-colors shadow-lg accent-glow-lg"
            >
              {isNew ? t('shiftEditorUI.addActivity') : t('shiftEditor.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main ShiftEditor ──────────────────────────────────────────────────────────
export default function ShiftEditor() {
  const { t, language } = useT()
  const locale = language === 'tr' ? tr : en
  const {
    templates,
    saveTemplate,
    deleteTemplate,
    duplicateTemplate,
    importTemplates,
    exportTemplates,
    addTurkishHolidays
  } = useShiftStore()
  const mode = useShiftStore((s) => s.settings.mode)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [isNewActivity, setIsNewActivity] = useState(false)
  const [customDateInput, setCustomDateInput] = useState('')

  // Auto-select first template
  useEffect(() => {
    if (templates.length > 0 && !selectedId) {
      setSelectedId(templates[0].id)
    }
  }, [templates, selectedId])

  const selected = templates.find(t => t.id === selectedId) || null

  // ── Template handlers ──────────────────────────────────────────────────────
  const handleCreate = () => {
    const newTemplate: ShiftTemplate = {
      id: crypto.randomUUID(),
      name: t('shiftEditorUI.newTemplate'),
      activities: [],
      weekdays: [1, 2, 3, 4, 5],
      customDates: [],
      isActive: false
    }
    saveTemplate(newTemplate)
    setSelectedId(newTemplate.id)
  }

  const handleToggleWeekday = (day: number) => {
    if (!selected) return
    const weekdays = selected.weekdays.includes(day)
      ? selected.weekdays.filter(d => d !== day)
      : [...selected.weekdays, day]
    saveTemplate({ ...selected, weekdays })
  }

  const handleAddCustomDate = () => {
    if (!selected || !customDateInput) return
    if (selected.customDates?.includes(customDateInput)) return
    saveTemplate({ ...selected, customDates: [...(selected.customDates || []), customDateInput] })
    setCustomDateInput('')
  }

  const handleRemoveCustomDate = (date: string) => {
    if (!selected) return
    saveTemplate({ ...selected, customDates: (selected.customDates || []).filter(d => d !== date) })
  }

  // ── Activity handlers ──────────────────────────────────────────────────────
  const handleAddActivity = () => {
    setEditingActivity({
      id: crypto.randomUUID(),
      name: t('shiftEditorUI.newActivityName'),
      icon: '💻',
      color: 'blue',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      notificationEnabled: true,
      notificationSound: 'default',
      notes: '',
      isBreak: false
    })
    setIsNewActivity(true)
  }

  const handleEditActivity = (act: Activity) => {
    setEditingActivity({ ...act })
    setIsNewActivity(false)
  }

  const handleSaveActivity = (act: Activity) => {
    if (!selected) return
    const activities = isNewActivity
      ? [...selected.activities, act]
      : selected.activities.map(a => a.id === act.id ? act : a)
    saveTemplate({ ...selected, activities })
    setEditingActivity(null)
  }

  const handleDeleteActivity = (id: string) => {
    if (!selected) return
    saveTemplate({ ...selected, activities: selected.activities.filter(a => a.id !== id) })
  }

  const handleDuplicateActivity = (act: Activity) => {
    if (!selected) return
    const newStart = act.endTime
    const endMins = Math.min(23 * 60 + 59, (() => {
      const [h, m] = act.endTime.split(':').map(Number)
      return h * 60 + m + act.duration
    })())
    const newEnd = `${Math.floor(endMins / 60).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}`
    const dup: Activity = {
      ...act,
      id: crypto.randomUUID(),
      name: `${act.name} ${t('shiftEditorUI.copySuffix')}`,
      startTime: newStart,
      endTime: newEnd,
      duration: calculateDuration(newStart, newEnd)
    }
    saveTemplate({ ...selected, activities: [...selected.activities, dup] })
  }

  const handleMoveActivity = (index: number, direction: 'up' | 'down') => {
    if (!selected) return
    const sorted = [...selected.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    // Swap start/end times to reorder
    const a = sorted[index]
    const b = sorted[swapIdx]
    const dur_a = a.duration
    const dur_b = b.duration

    // Recalculate times: swap logical positions
    let newActivities = [...selected.activities]
    const idxA = newActivities.findIndex(x => x.id === a.id)
    const idxB = newActivities.findIndex(x => x.id === b.id)

    // Swap b into a's position and a into b's position
    const tempStart = a.startTime
    const tempEnd = a.endTime
    newActivities[idxA] = { ...a, startTime: b.startTime, endTime: b.endTime, duration: dur_b }
    newActivities[idxB] = { ...b, startTime: tempStart, endTime: tempEnd, duration: dur_a }

    saveTemplate({ ...selected, activities: newActivities })
  }

  // ── Import / Export ────────────────────────────────────────────────────────
  const handleExport = () => {
    const blob = new Blob([exportTemplates()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'myshift-templates.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const res = await importTemplates(evt.target?.result as string)
      alert(res.success ? t('shiftEditorUI.importSuccess', { count: res.count }) : t('shiftEditorUI.importError', { error: res.error ?? '' }))
    }
    reader.readAsText(file)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const sortedActivities = selected
    ? [...selected.activities].sort((a, b) => a.startTime.localeCompare(b.startTime))
    : []

  // Compute the daily summary bar relative to the actual shift span (first start → last end),
  // so the last activity reaches the right edge of the bar instead of being scaled to 24h.
  const toSecs = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 3600 + m * 60
  }
  const firstAct = sortedActivities[0]
  const lastAct = sortedActivities[sortedActivities.length - 1]
  let shiftSpanSecs = 0
  if (firstAct && lastAct) {
    let endSecs = toSecs(lastAct.endTime)
    let startSecs = toSecs(firstAct.startTime)
    if (endSecs < startSecs) endSecs += 24 * 3600
    shiftSpanSecs = endSecs - startSecs || 24 * 3600
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5 h-full">

      {/* ── LEFT: Template sidebar ── */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">

        {mode === 'pay' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-200 leading-relaxed">
            {t('shiftEditorUI.payModeActive')}
          </div>
        )}
        {mode === 'chrono' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-200 leading-relaxed">
            {t('shiftEditorUI.chronoModeActive')}
          </div>
        )}

        {/* Template list */}
        <div className="fluent-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-200 text-sm">{t('shiftEditorUI.myTemplates')}</h3>
            <button
              onClick={handleCreate}
              className="text-xs accent-solid-strong hover:accent-solid text-white px-2.5 py-1.5 rounded-lg transition-colors font-medium"
            >
              + Yeni
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => setSelectedId(tpl.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all duration-150 ${
                  selectedId === tpl.id
                    ? 'accent-soft accent-border text-white'
                    : 'bg-white/2 border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{tpl.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    tpl.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {tpl.isActive ? t('shiftEditorUI.active') : t('shiftEditorUI.passive')}
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">
                  {tpl.activities.length} {t('shiftEditorUI.activityWord')}
                </p>
              </button>
            ))}

            {templates.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-4">
                {t('shiftEditorUI.noTemplatesYet')}
              </p>
            )}
          </div>
        </div>

        {/* Template settings */}
        {selected && (
          <div className="fluent-card p-4 flex flex-col gap-4">
            <h3 className="font-semibold text-slate-200 text-sm border-b border-white/5 pb-2">{t('shiftEditorUI.templateSettings')}</h3>

            {/* Name */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">{t('shiftEditor.name')}</label>
              <input
                type="text"
                value={selected.name}
                onChange={e => saveTemplate({ ...selected, name: e.target.value })}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:accent-border"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300 font-medium">{t('shiftEditorUI.templateActive')}</p>
                <p className="text-[10px] text-slate-500">{t('shiftEditorUI.templateActiveDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.isActive}
                  onChange={e => saveTemplate({ ...selected, isActive: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all toggle-checked" />
              </label>
            </div>

            {/* Weekdays */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">{t('shiftEditorUI.weekdays')}</label>
              <div className="flex gap-1 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 0].map(day => (
                  <button
                    key={day}
                    onClick={() => handleToggleWeekday(day)}
                    title={locale.shiftEditorUI.weekdayFull[day]}
                    className={`flex-1 min-w-[32px] py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                      selected.weekdays.includes(day)
                        ? 'accent-solid-strong accent-border text-white'
                        : 'bg-slate-900 border-white/5 text-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    {locale.shiftEditorUI.weekdayShort[day]}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom dates */}
            <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('shiftEditorUI.customDates')}</label>
              <button
                onClick={() => addTurkishHolidays(selected.id)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-1.5 rounded-lg border border-white/5 font-medium transition-colors"
              >
                {t('shiftEditorUI.addHolidays')}
              </button>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={customDateInput}
                  onChange={e => setCustomDateInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 min-w-0"
                />
                <button
                  onClick={handleAddCustomDate}
                  className="accent-solid-strong hover:accent-solid text-white text-xs px-2.5 rounded-lg font-medium flex-shrink-0"
                >
                  +
                </button>
              </div>
              {(selected.customDates?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {selected.customDates?.map(date => (
                    <span key={date} className="inline-flex items-center gap-1 bg-white/5 border border-white/5 rounded-full px-2 py-0.5 text-[10px] text-slate-300">
                      {date}
                      <button onClick={() => handleRemoveCustomDate(date)} className="text-slate-500 hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div className="flex gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => duplicateTemplate(selected.id)}
                className="flex-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-medium"
              >
                {t('shiftEditorUI.copyBtn')}
              </button>
              <button
                onClick={() => {
                  if (confirm(t('shiftEditorUI.templateDeleteConfirm'))) {
                    deleteTemplate(selected.id)
                    setSelectedId(null)
                  }
                }}
                className="flex-1 text-xs bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 py-2 rounded-lg border border-rose-900/30 font-medium"
              >
                {t('shiftEditorUI.deleteBtn')}
              </button>
            </div>
          </div>
        )}

        {/* Import / Export */}
        <div className="fluent-card p-4 flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="w-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-medium"
          >
            {t('shiftEditorUI.exportBtn')}
          </button>
          <label className="w-full text-xs text-center bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-medium cursor-pointer block">
            {t('shiftEditorUI.importBtn')}
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* ── RIGHT: Activity list editor ── */}
      <div className="fluent-card flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              {selected ? selected.name : t('shiftEditor.activities')}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {selected
                ? `${sortedActivities.length} ${t('shiftEditorUI.activityEditHint')}`
                : t('shiftEditorUI.selectTemplate')}
            </p>
          </div>
          <button
            disabled={!selected}
            onClick={handleAddActivity}
            className="accent-solid-strong hover:accent-solid disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-xl font-semibold transition-colors shadow-md accent-glow-lg"
          >
            {t('shiftEditorUI.newActivity')}
          </button>
        </div>

        {/* Activity list */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <span className="text-5xl">⚙️</span>
              <p className="text-sm">{t('shiftEditorUI.selectTemplate')}</p>
            </div>
          ) : sortedActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <span className="text-5xl">📋</span>
              <p className="text-sm">{t('shiftEditorUI.noActivities')}</p>
              <button
                onClick={handleAddActivity}
                className="mt-2 accent-solid-strong hover:accent-solid text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-colors"
              >
                {t('shiftEditorUI.addFirst')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedActivities.map((act, idx) => (
                <ActivityCard
                  key={act.id}
                  act={act}
                  isFirst={idx === 0}
                  isLast={idx === sortedActivities.length - 1}
                  onEdit={() => handleEditActivity(act)}
                  onDelete={() => {
                    if (confirm(t('shiftEditorUI.deleteActivityConfirm', { name: act.name }))) {
                      handleDeleteActivity(act.id)
                    }
                  }}
                  onDuplicate={() => handleDuplicateActivity(act)}
                  onMoveUp={() => handleMoveActivity(idx, 'up')}
                  onMoveDown={() => handleMoveActivity(idx, 'down')}
                />
              ))}

              {/* Visual day summary bar */}
              <div className="mt-4 p-4 bg-slate-900/50 border border-white/5 rounded-xl">
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-2">{t('shiftEditorUI.dailyTimeSummary')}</p>
                <div className="relative h-5 rounded overflow-hidden bg-slate-800">
                  {sortedActivities.map(act => {
                    let actStartSecs = toSecs(act.startTime)
                    let actEndSecs = toSecs(act.endTime)
                    if (actEndSecs < actStartSecs) actEndSecs += 24 * 3600
                    const left = ((actStartSecs - toSecs(firstAct.startTime)) / shiftSpanSecs) * 100
                    const width = ((actEndSecs - actStartSecs) / shiftSpanSecs) * 100
                    const colorCls = COLOR_OPTIONS.find(c => c.key === act.color)?.bg || 'bg-slate-500'
                    return (
                      <div
                        key={act.id}
                        title={`${act.name}: ${act.startTime}–${act.endTime}`}
                        className={`absolute top-0 h-full ${colorCls} opacity-80 hover:opacity-100 transition-opacity`}
                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '3px' }}
                      />
                    )
                  })}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-slate-600 font-mono">{firstAct.startTime}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {t('shiftEditorUI.totalDuration')} {sortedActivities.reduce((s, a) => s + a.duration, 0)} {t('shiftEditorUI.minLabel')}
                    {' '}({Math.round(sortedActivities.reduce((s, a) => s + a.duration, 0) / 60 * 10) / 10} {t('shiftEditorUI.hoursShort')})
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">{lastAct.endTime}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Modal */}
      {editingActivity && (
        <ActivityModal
          activity={editingActivity}
          isNew={isNewActivity}
          onSave={handleSaveActivity}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </div>
  )
}
