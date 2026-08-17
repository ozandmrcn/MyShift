import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { surveillanceDir, AiProfile, loadAiProfile, appendAiNote } from './dataStore'
import { askLlm, AiCommentConfig } from './aiComment'

// ─── Surveillance Analyzer ────────────────────────────────────────────────────
// Turns the raw JSONL activity logs into a small set of personality notes the
// comment AI can use ("kullanıcıyı tanıyan" remarks). Runs on demand from the
// "Toplanan Veriler" page. Falls back to a deterministic offline summary when no
// LLM is configured or reachable — the offline notes are still useful.

interface Sample { t: number; app: string; title: string | null; typed?: string }

function readDaySamples(dateStr: string): Sample[] {
  const file = join(surveillanceDir(), `${dateStr}.jsonl`)
  if (!existsSync(file)) return []
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try { return JSON.parse(l) as Sample } catch { return null }
      })
      .filter((x): x is Sample => x !== null && typeof x.app === 'string')
  } catch {
    return []
  }
}

function fmtDur(totalSec: number): string {
  const mins = Math.round(totalSec / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

export function buildSurveillanceSummary(days = 7, includeTyped = false): string {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    const samples = readDaySamples(ds)
    if (samples.length === 0) continue

    const appSeconds: Record<string, number> = {}
    const titles: Record<string, Record<string, number>> = {}
    let typedAll = ''
    for (let s = 0; s < samples.length; s++) {
      const cur = samples[s]
      const next = samples[s + 1]
      const span = next ? Math.min(30000, Math.max(0, next.t - cur.t)) / 1000 : 30
      if (!cur.app) continue
      appSeconds[cur.app] = (appSeconds[cur.app] || 0) + span
      if (cur.title) {
        titles[cur.app] = titles[cur.app] || {}
        titles[cur.app][cur.title] = (titles[cur.app][cur.title] || 0) + span
      }
      if (includeTyped && typeof cur.typed === 'string' && cur.typed.trim()) {
        typedAll += cur.typed.replace(/\s+/g, ' ').trim() + ' '
      }
    }

    const sorted = Object.entries(appSeconds).sort((a, b) => b[1] - a[1]).slice(0, 4)
    const top = sorted.map(([name, sec]) => `${name} (${fmtDur(sec)})`).join(', ')
    const topTitles = Object.entries(titles)
      .map(([app, t]) => {
        const tTop = Object.entries(t).sort((a, b) => b[1] - a[1])[0]
        return tTop ? `${app}: "${tTop[0]}"` : null
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(' | ')
    let day = `${ds} → ${top}${topTitles ? ` | sık başlıklar: ${topTitles}` : ''}`
    if (includeTyped && typedAll) {
      day += ` | yazılan (özet): "${typedAll.slice(0, 400)}${typedAll.length > 400 ? '…' : ''}"`
    }
    out.push(day)
  }
  return out.length ? out.join('\n') : 'kayıt yok'
}

function offlineNotes(summary: string): string[] {
  const notes: string[] = []
  // Parse app usage from the summary for varied, specific notes.
  const appMatches = [...summary.matchAll(/([a-zA-Z0-9_\- ]+?) \((\d+ (?:sa|dk)(?: \d+ dk)?)\)/g)]
  const seen = new Set<string>()
  const apps: { name: string; dur: string }[] = []
  for (const m of appMatches) {
    const app = m[1].trim()
    if (seen.has(app)) continue
    seen.add(app)
    apps.push({ name: app, dur: m[2] })
  }

  if (apps.length === 0) {
    notes.push('Henüz yeterli gözetleme verisi yok; birkaç oturum sonra daha net konuşabilirim.')
    return notes
  }

  // App-based notes
  if (apps[0]) notes.push(`Bugünün favorisi ${apps[0].name} — ${apps[0].dur} boyunca açık kalmış.`)
  if (apps[1]) notes.push(`${apps[1].name} da fena değil, ${apps[1].dur} göz kırpmadan.`)

  // Title-based notes
  const titleMatches = [...summary.matchAll(/sık başlıklar: (.+?)(?:\s*\||\s*$)/g)]
  if (titleMatches[0]) {
    const titles = titleMatches[0][1].trim()
    if (titles.length > 10) notes.push(`Pencere başlıklarından anladığım kadarıyla: ${titles.slice(0, 70)}`)
  }

  // Typed-text based notes
  const typedMatches = [...summary.matchAll(/yazılan \(özet\): "([^"]+)"/g)]
  if (typedMatches[0]) {
    const typed = typedMatches[0][1].trim()
    if (typed.length > 5) notes.push(`Klavyeden akan metin: "${typed.slice(0, 60)}" — ne yazıyorsa ilginç.`)
  }

  // Duration extremes
  if (apps.length >= 3) {
    const totalMin = apps.reduce((s, a) => {
      const hm = a.dur.match(/(\d+)\s*sa/)
      const mm = a.dur.match(/(\d+)\s*dk/)
      return s + (hm ? parseInt(hm[1]) * 60 : 0) + (mm ? parseInt(mm[1]) : 0)
    }, 0)
    if (totalMin > 120) notes.push(`Toplam ${Math.round(totalMin / 60)} saate yakın bilgisayar başında — tempo yüksek.`)
  }

  // Fallback variety
  if (notes.length < 3) notes.push('Veriler ilginç bir tablo çiziyor, biraz daha bekleyelim.')

  return notes.slice(0, 6)
}

const ANALYZE_SYSTEM_PROMPT = `Sen MyShift'in veri analizi asistanısın. Sana kullanıcının bilgisayar kullanımına dair ham kayıtlar verilecek (gün, uygulama, süre, sık görülen pencere başlıkları, bazen yazılan metin özeti). Bu kayıtlardan kullanıcının alışkanlıklarını, rutinlerini ve tuhaf/ironik yönlerini tespit edip KISA gözlem notlarına dönüştür.

Kurallar:
- TON: soğuk, kuru, hafif sarkastik. Asla pohpohlama.
- Her not en fazla ~80 karakter.
- 5-8 not üret. Çeşitlilik önemli:
  - Uygulama alışkanlıklarına dair notlar (hangi uygulamayı ne kadar kullandı)
  - Yazma kalıplarına dair notlar (ne hakkında yazıyor, ne sıklıkla yazıyor)
  - Zamanlama notları (hangi saatlerde aktif, ne zaman molaya giriyor)
  - Dikkat çekici detaylar (beklenmedik uygulama kullanımı, uzun oturumlar)
  - Tekrar eden davranışlar (her gün aynı şeyi yapıyor mu)
- Genelleme yapma; doğrudan veride gördüğün şeye dayan. "Genelde X kullanıyor" demek yerine "Bugün X'te Y dakika geçirdi, çoğunlukla Z başlığını açık tuttu" gibi spesifik ol.
- Emoji KULLANMA.
- Çıktı SADECE geçerli JSON olmalı: {"notes": ["not1", "not2"]}`

export async function analyzeSurveillance(cfg: AiCommentConfig, days = 7): Promise<AiProfile> {
  // Typed-text excerpts only go to a local LLM (ollama) or a remote one the user
  // explicitly configured — never to the offline fallback, which needs none of it.
  const includeTyped = cfg.provider === 'ollama' || cfg.provider === 'openai'
  const summary = buildSurveillanceSummary(days, includeTyped)

  const raw = await askLlm(ANALYZE_SYSTEM_PROMPT, `İşte kayıtlar:\n${summary}`, cfg, 20000)
  let notes: string[] = []
  if (raw) {
    try {
      let content = raw.trim()
      const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fence) content = fence[1].trim()
      const obj = JSON.parse(content)
      const arr = Array.isArray(obj) ? obj : obj?.notes
      if (Array.isArray(arr)) notes = arr.filter((n: unknown) => typeof n === 'string').map((n: string) => n.trim()).filter(Boolean).slice(0, 6)
    } catch { /* fall through to offline */ }
  }
  if (notes.length === 0) notes = offlineNotes(summary)

  for (const n of notes) appendAiNote(n)
  return loadAiProfile()
}
