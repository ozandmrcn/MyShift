import { useState, useEffect } from 'react'
import { useShiftStore } from '../stores/useShiftStore'
import { playSound } from '../utils/soundEffects'

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

export default function SettingsView() {
  const { settings, updateSettings } = useShiftStore()

  // Parse birthday state
  const [bDay, setBDay] = useState(1)
  const [bMonth, setBMonth] = useState(1)

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

  return (
    <div className="max-w-2xl mx-auto fluent-card p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-200">Uygulama Ayarları</h2>
        <p className="text-xs text-slate-400 mt-1">Uygulama açılış, tepsi ve genel bildirim tercihlerini yönetin.</p>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/5 pt-4">
        
        {/* Startup integration */}
        <div className="flex justify-between items-start py-3 border-b border-white/5">
          <div>
            <span className="text-sm font-medium text-slate-200">Windows ile Birlikte Başlat</span>
            <p className="text-xs text-slate-400 mt-0.5">Bilgisayarınız açıldığında MyShift otomatik olarak başlasın.</p>
          </div>
          <input 
            type="checkbox" 
            checked={settings.launchWithWindows}
            onChange={(e) => updateSettings({ launchWithWindows: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Start minimized */}
        <div className="flex justify-between items-start py-3 border-b border-white/5">
          <div>
            <span className="text-sm font-medium text-slate-200">Küçültülmüş Olarak Başlat (Sistem Tepsisi)</span>
            <p className="text-xs text-slate-400 mt-0.5">Uygulama başladığında ekranda görünmeden doğrudan sistem tepsisine küçülsün.</p>
          </div>
          <input 
            type="checkbox" 
            checked={settings.startMinimized}
            disabled={!settings.launchWithWindows}
            onChange={(e) => updateSettings({ startMinimized: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
          />
        </div>

        {/* Minimize to tray on close */}
        <div className="flex justify-between items-start py-3 border-b border-white/5">
          <div>
            <span className="text-sm font-medium text-slate-200">Kapatıldığında Sistem Tepsisine Küçült</span>
            <p className="text-xs text-slate-400 mt-0.5">Pencereyi kapat butonuna bastığınızda uygulama tamamen kapanmak yerine arka planda çalışmaya devam eder.</p>
          </div>
          <input 
            type="checkbox" 
            checked={settings.minimizeToTray}
            onChange={(e) => updateSettings({ minimizeToTray: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Auto-minimize to tray on launch */}
        <div className="flex justify-between items-start py-3 border-b border-white/5">
          <div>
            <span className="text-sm font-medium text-slate-200">Açılışta Göster, Sonra Tepsiye Küçült</span>
            <p className="text-xs text-slate-400 mt-0.5">Uygulama açılışta kısa süre ekranda görünür, ardından sistem tepsisine küçülür. Bu sırada pencereyle etkileşime girerseniz açık kalır.</p>
          </div>
          <input 
            type="checkbox" 
            checked={settings.autoMinimizeToTray}
            disabled={!settings.launchWithWindows}
            onChange={(e) => updateSettings({ autoMinimizeToTray: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
          />
        </div>

        {/* Birthday Setting */}
        <div className="flex justify-between items-start py-3 border-b border-white/5">
          <div className="mr-4">
            <span className="text-sm font-medium text-slate-200">Doğum Günü Tatili</span>
            <p className="text-xs text-slate-400 mt-0.5">Doğum gününüzde sistem otomatik olarak "Doğum Günü" veya "Birthday" isimli şablonu aktif eder.</p>
          </div>
          <div className="flex gap-2">
            <select
              value={bDay}
              onChange={(e) => handleBirthdayChange(Number(e.target.value), bMonth)}
              className="bg-slate-950 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {Array.from({ length: 31 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
            <select
              value={bMonth}
              onChange={(e) => handleBirthdayChange(bDay, Number(e.target.value))}
              className="bg-slate-950 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Default notification sound */}
        <div className="flex justify-between items-end py-3">
          <div className="flex-1 mr-4">
            <span className="text-sm font-medium text-slate-200">Varsayılan Bildirim Sesi</span>
            <p className="text-xs text-slate-400 mt-0.5">Genel vardiya geçişleri ve varsayılan aktiviteler için çalınacak ses.</p>
            <select
              value={settings.defaultNotificationSound}
              onChange={(e) => updateSettings({ defaultNotificationSound: e.target.value })}
              className="mt-2 w-full max-w-[200px] bg-slate-950 border border-white/10 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="default">VARSAYILAN</option>
              <option value="bell">ÇAN (WARM BELL)</option>
              <option value="digital">DİJİTAL BİP</option>
              <option value="none">SESSİZ</option>
            </select>
          </div>
          <button
            onClick={handleTestSound}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-2.5 rounded-lg border border-white/5 font-semibold transition-colors"
          >
            Sesi Test Et
          </button>
        </div>

      </div>

      <div className="border-t border-white/5 pt-4 text-center">
        <span className="text-[10px] text-slate-600 block">MyShift v1.0.0 • Çevrimdışı Kişisel Vardiya Sistemi</span>
        <span className="text-[10px] text-slate-600 block mt-0.5">Windows 10/11 Fluent Design</span>
      </div>
    </div>
  )
}
