import { AiCommentRequest, AiCommentResult } from '../shared/aiTypes'

// ─── AI Comment Writer (main process) ────────────────────────────────────────
// Asks a local (Ollama) or OpenAI-compatible LLM to write the one-liner comment
// that sits under the clock. Running this in the main process keeps API keys out
// of the renderer and avoids CORS entirely. Every failure silently falls back to
// the offline generative engine — the AI is a bonus, never a blocker.

export interface AiCommentConfig {
  provider: 'off' | 'static' | 'offline' | 'ollama' | 'openai' | 'openrouter'
  baseUrl: string
  apiKey: string
  model: string
}

const SYSTEM_PROMPT = `Sen MyShift adlı vardiya takip uygulamasının iç sesisin. Kullanıcıyı iyi tanıyorsun — birikmiş gözlem verilerin, klavye geçmişin, uygulama alışkanlıkların ve profil notların var. Bu verileri bir bütün olarak değerlendirerek yorum yap. Kullanıcıyı tanıyan, onun rutinlerini bilen biri gibi konuş.

Kurallar:
- TON: soğuk, karanlık, kuru, sarkastik. ASLA tatlı, cesaretlendirici veya pozitif olma. Sıcaklık ve teselli yok.
- ASLA emoji kullanma.
- Kısa yaz: en fazla ~100 karakter.
- "Yapay zeka" gibi konuşma. Genel geçer, herkese uygun cümlelerden kaçın. Sanki uygulama kullanıcıyı yakından tanıyor ve o anki durumu kuru bir gözle yorumluyormuş gibi yaz. Tırnak içinde ironi ve parantez içi karanlık küçük notlar serbest.
- Her seferinde farklı bir şey yaz. Aynı kalıbı, aynı kelimeleri tekrarlama. Yapıyı değiştir: bazen tek cümle, bazen kısa bir gözlem + kapanış, bazen sadece bir soru.
- Kullanıcının o anki durumunu (aktif aktivite, mola, aşım, payback, vardiya bitti vb.) yorumla.
- VERİ KULLANIM ÖNCELİĞİ (tümünü bir bütün olarak değerlendir, sadece birine takılma):
  1. PROFİL NOTLARI (~%30): Birikmiş gözlem notları kullanıcıyı tanımanın temelidir. Bunları doğal şekilde referans al — rutinlerini, alışkanlıklarını, tekrar eden davranışlarını hatırla. "Her gün aynı saatte..." veya "Genelde ... yaparken..." gibi ifadelerle kullan.
  2. KLAVYE GEÇMİŞİ (~%20): Son yazılan içerik (typedText) VE yazılan geçmiş (typedHistory) birlikte değerlendir. Tek kelimeye değil, yazma kalıbına, konu bütünlüğüne bak. typedText tek bir kelimeyse ve typedHistory varsa, geçmişi de hesaba kat — kullanıcının ne tür içeriklerle uğraştığını anla.
  3. UYGULAMA ALIŞKANLIKLARI (~%15): Bugünkü ve geçmiş uygulama kullanımı. "Bugün yine X'te geçirdin" gibi doğal göndermeler yap. Sadece uygulama adını sayma, ne yaptığını çıkar.
  4. VARDİYA DURUMU (~%20): Aktif aktivite, aşım, mola, ilerleme. Duruma göre yorum yap.
  5. SON YORUMLAR (~%15): Önceki yorumları tekrarlama, farklı bir açı bul.

- GÖZLEM VERİSİ VARSA (typedHistory veya typedText dolu): Bu veriyi aktif kullan. Kullanıcının ne yazdığı, ne hakkında düşündüğü, neye odaklandığı hakkında çıkarımlar yap. Ama tek bir kelimeyi kopyalama — konusundan bahset, kalıbı yorumla.
- GÖZLEM VERİSİ YOKSA (typedText ve typedHistory boş): Klavye göndermesi yapma. Doğrudan vardiya/mola durumunu veya profil notlarını kullan.

Çıktı SADECE geçerli JSON olmalı, başka hiçbir şey yazma:
{"text": "yorum", "highlight": "yorumun içinde geçen ve farklı renkle vurgulanacak tek bir kelime ya da kısa ifade (istenirse boş string olabilir)"}

"highlight" değeri kesinlikle "text" içinde geçen bir alt dize olmalı.`

function fmtDur(totalSec: number): string {
  if (totalSec <= 0) return '0 dk'
  const mins = Math.round(totalSec / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

function buildUserPrompt(req: AiCommentRequest): string {
  const top = (req.topApps ?? []).slice(0, 5).map(a => `${a.name} (${fmtDur(a.seconds)})`).join(', ')
  const app = req.currentApp
    ? `${req.currentApp}${req.currentAppTitle ? ` — şu anki başlık: "${req.currentAppTitle}"` : ''}${req.currentAppSeconds ? ` (${fmtDur(req.currentAppSeconds)}dır açık)` : ''}`
    : 'yok'

  const fields: [string, unknown][] = [
    ['Kullanıcı hakkında birikmiş bilgin (profil notları — bunları doğal şekilde kullan, ezberden okuma)', (req.profileNotes ?? []).join(' | ') || 'henüz yok'],
    ['Son yazılan içerik (klavye aktivitesi — en önemli veri, gözlem modu açıkken dolu olur)', (req.typedText ?? '').trim() ? `"${(req.typedText ?? '').trim()}"` : 'yok (gözlem modu kapalı)'],
    ['Yazılan geçmiş (son kayıtlardan yazma kalıpları — konu bütünlüğü için kullan)', (req.typedHistory ?? []).join(' | ') || 'yok'],
    ['Şu anki durum (state)', req.state],
    ['Saat', `${req.hour}:00`],
    ['Aktif aktivite', req.activityName ? `${req.activityIcon ?? ''} ${req.activityName}` : 'yok'],
    ['Sıradaki aktivite', req.nextLabel || 'yok'],
    ['Bu aktivite son aktivite mi', req.isLastActivity],
    ['Vardiya ilerlemesi %', Math.round(req.shiftProgress)],
    ['Vardiya adı', req.shiftName || 'yok'],
    ['Bugün çalışılan süre', fmtDur(req.workedSeconds)],
    ['Şu anki mola/aşım süresi', fmtDur(req.breakSeconds)],
    ['Aşım', fmtDur(req.idleSeconds)],
    ['Bugün yazılan toplam karakter (klavye aktivitesi)', req.typedCharsToday ?? 0],
    ['O an açık uygulama (ikincil bilgi)', app],
    ['Bugün en çok kullanılan uygulamalar (ikincil bilgi)', top || 'yok'],
    ['Son yazdığın yorumlar (bunları TEKRARLAMA)', (req.recentLines ?? []).join(' | ') || 'yok']
  ]

  return fields.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')
}

async function postJson(url: string, body: unknown, cfg: { apiKey?: string; headers?: Record<string, string> }, timeoutMs = 12000): Promise<{ ok: boolean; status: number; body: any; error: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(cfg.headers ?? {}) }
  if (cfg.apiKey) headers['authorization'] = `Bearer ${cfg.apiKey}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
    const detail = parsed?.error?.message
      ? String(parsed.error.message).slice(0, 140)
      : text.slice(0, 140)
    return { ok: res.ok, status: res.status, body: parsed, error: res.ok ? '' : (detail || `HTTP ${res.status}`) }
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: e?.name === 'AbortError'
        ? `Zaman aşımı (${timeoutMs}ms doldu)`
        : String(e?.cause?.code || e?.message || e)
    }
  } finally {
    clearTimeout(timer)
  }
}

function parseResult(raw: string): AiCommentResult | null {
  let content = raw.trim()
  // Tolerate markdown fences around the JSON.
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) content = fence[1].trim()
  try {
    const obj = JSON.parse(content)
    if (!obj || typeof obj.text !== 'string') return null
    let text = obj.text.trim()
    // Defensive: never let an emoji slip into a comment.
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F2FF}]/gu, '').trim()
    if (!text || text.length > 220) return null

    let highlight: string | null = null
    if (typeof obj.highlight === 'string' && obj.highlight.trim()) {
      const h = obj.highlight.trim().slice(0, 60)
      if (text.includes(h)) highlight = h
    }
    return { text, highlight }
  } catch {
    return null
  }
}

// Generic LLM call — shared by the comment writer and the surveillance analyzer.
// Returns the raw text content, or null on any failure/timeout/offline provider.
export async function askLlm(systemPrompt: string, userPrompt: string, cfg: AiCommentConfig, timeoutMs = 15000): Promise<string | null> {
  const r = await askLlmWithDetail(systemPrompt, userPrompt, cfg, timeoutMs)
  return r.ok ? r.raw! : null
}

export interface LlmCallDetail {
  ok: boolean
  raw?: string
  error?: string
  status?: number
}

// Same as askLlm but keeps the failure reason (HTTP status + provider error
// message) so the Settings page can tell the user *why* the AI isn't working:
//   - auth rejected (401/403)  → "API anahtarı geçersiz"
//   - model not found (404)    → "Model bulunamadı"
//   - timeout / network        → "Bağlantı kurulamadı"
//   - no key / base / model    → config check
export async function askLlmWithDetail(systemPrompt: string, userPrompt: string, cfg: AiCommentConfig, timeoutMs = 15000): Promise<LlmCallDetail> {
  if (cfg.provider === 'offline' || cfg.provider === 'off' || cfg.provider === 'static') {
    return { ok: false, error: 'Yerleşik motor aktif — harici API çağrısı yok.' }
  }
  const base = (cfg.baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) return { ok: false, error: 'Sunucu adresi (Base URL) boş.' }
  if (!cfg.model?.trim()) return { ok: false, error: 'Model adı boş.' }
  if (cfg.provider !== 'ollama' && !cfg.apiKey?.trim()) return { ok: false, error: 'API anahtarı girilmemiş.' }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  try {
    let raw: string | undefined
    if (cfg.provider === 'ollama') {
      const res = await postJson(`${base}/api/chat`, {
        model: cfg.model,
        messages,
        stream: false,
        format: 'json',
        options: { temperature: 0.9 }
      }, {}, timeoutMs)
      if (!res.ok) return { ok: false, error: res.error, status: res.status }
      raw = res.body?.message?.content
    } else {
      // OpenRouter (and any OpenAI-compatible provider) share the chat/completions shape.
      const headers: Record<string, string> = {}
      if (cfg.provider === 'openrouter') {
        // OpenRouter asks for app attribution headers (optional, good citizenship).
        headers['http-referer'] = 'https://github.com/MyShift'
        headers['x-title'] = 'MyShift'
      }
      const res = await postJson(`${base}/chat/completions`, {
        model: cfg.model,
        messages,
        temperature: 0.9,
        response_format: { type: 'json_object' }
      }, { apiKey: cfg.apiKey, headers }, timeoutMs)
      if (!res.ok) {
        const friendly =
          res.status === 401 || res.status === 403
            ? 'API anahtarı geçersiz (401/403)'
            : res.status === 404
              ? 'Model bulunamadı (404) — model adını kontrol edin'
              : res.status === 429
                ? 'Kota aşıldı (429) — sağlayıcıda yeterli bakiye/kredi yok. Hesap ayarlarınızı kontrol edin.'
                : res.status >= 500
                  ? `Sağlayıcı hatası (${res.status}) — sunucu geçici bir sorun döndürdü, birazdan tekrar deneyin.`
                  : `Sağlayıcı hata döndü: ${res.error}`
        return { ok: false, error: friendly, status: res.status }
      }
      raw = res.body?.choices?.[0]?.message?.content
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Sağlayıcı boş yanıt döndü (model istenen formatta yanıtlamadı).' }
    }
    return { ok: true, raw }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// Live connection check for the Settings page. Makes a real, tiny request to the
// configured provider and reports precisely whether the AI works (and why not).
export interface AiTestResult {
  ok: boolean
  detail: string
  elapsedMs: number
}

export interface OpenRouterModelInfo {
  id: string
  name: string
  context_length: number
}

// Fetches the *current* free model list from OpenRouter (their free lineup
// changes often — a model that exists today may be gone tomorrow). Only models
// ending in ":free" are returned so the Settings page can offer a safe pick.
export async function getOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models')
    if (!res.ok) return []
    const j: any = await res.json()
    const list = (j?.data ?? []).filter((m: any) => typeof m?.id === 'string' && m.id.endsWith(':free'))
    return list
      .map((m: any) => ({
        id: m.id,
        name: typeof m.name === 'string' ? m.name : m.id,
        context_length: typeof m.context_length === 'number' ? m.context_length : 0
      }))
      .sort((a: OpenRouterModelInfo, b: OpenRouterModelInfo) => b.context_length - a.context_length)
  } catch {
    return []
  }
}

export async function testAiConnection(cfg: AiCommentConfig): Promise<AiTestResult> {
  const t0 = Date.now()
  if (cfg.provider === 'offline' || cfg.provider === 'off' || cfg.provider === 'static') {
    return { ok: false, detail: 'Yerleşik motor aktif — API anahtarı kullanılmıyor. Sağlayıcı seçin ve tekrar test edin.', elapsedMs: 0 }
  }
  const base = (cfg.baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) return { ok: false, detail: 'Sunucu adresi (Base URL) boş — Ayarlar\'dan doldurun.', elapsedMs: 0 }
  if (!cfg.model?.trim()) return { ok: false, detail: 'Model adı boş.', elapsedMs: 0 }
  if (cfg.provider !== 'ollama' && !cfg.apiKey?.trim()) return { ok: false, detail: 'API anahtarı girilmemiş — anahtarı kaydedip tekrar test edin.', elapsedMs: 0 }

  const r = await askLlmWithDetail(
    'Sadece tek bir kelime yanıtla: evet',
    'Bağlantı testi. Tek kelime yanıt ver: evet',
    cfg,
    10000
  )
  return {
    ok: r.ok,
    detail: r.ok
      ? 'Bağlantı başarılı — AI sağlayıcısı yanıt verdi. 🎉'
      : (r.error ?? 'Bilinmeyen hata.'),
    elapsedMs: Date.now() - t0
  }
}

// Reassembles the user's most recent typing into a few *complete, meaningful*
// words for the AI to reference.
//
// Why this exists: the keyboard hook flushes every 5s, so a single word is often
// split across two flushes ("alt" + "yazı" → "altyazı"). Naively reading the
// last flush hands the AI a fragment ("alt") that means nothing. This helper:
//   1. re-joins the last few flushes so split words become whole again,
//   2. drops the trailing token that has no space after it (still being typed),
//   3. keeps only word-like tokens (>=3 letters, Turkish-aware) and returns the
//      last `maxWords` of them.
export function extractMeaningfulTyped(samples: Array<{ typed?: string }>, maxWords = 8): string | null {
  const flushes = samples
    .filter(s => typeof s.typed === 'string' && s.typed.trim().length > 0)
    .slice(-4) // a word spans at most two adjacent flushes → 4 is plenty
    .map(s => s.typed as string)
  if (flushes.length === 0) return null

  const raw = flushes.join('')
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  // No space after the last token AND the user has typed more than one word ⇒
  // that trailing token is still being typed ⇒ drop it. A lone single word is
  // kept (it's the whole message, e.g. "altyazı", not a mid-word fragment).
  const endsWithSpace = /\s$/.test(raw)
  const tokens = normalized.split(' ')
  const last = tokens.pop() ?? ''
  const complete = tokens.length >= 1 && !endsWithSpace ? tokens : [...tokens, last]

  const WORD = /[A-Za-z0-9ÇĞİÖŞÜçğıöşü]/
  const clean = complete.filter(w => {
    const letters = w.split('').filter(c => WORD.test(c))
    return letters.length >= 3
  })

  if (clean.length === 0) return null
  return clean.slice(-maxWords).join(' ')
}

export async function generateAiComment(req: AiCommentRequest, cfg: AiCommentConfig): Promise<AiCommentResult | null> {
  const raw = await askLlm(SYSTEM_PROMPT, buildUserPrompt(req), cfg)
  if (!raw) return null
  return parseResult(raw)
}
