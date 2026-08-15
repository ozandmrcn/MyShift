import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'

// ─── Data folder ──────────────────────────────────────────────────────────────
// All persisted user data lives in a single visible `data/` folder:
//   - dev mode:  <project>/data
//   - packaged:  <exe-folder>/data   (sits next to the app, easy to inspect)
// It is intentionally NOT gitignored, so anyone who downloads the repo can see
// exactly what is stored. Nothing is ever sent off-device unless the user
// explicitly enables a remote AI provider.

export function dataDir(): string {
  const base = app.isPackaged ? dirname(process.execPath) : process.cwd()
  const dir = join(base, 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function surveillanceDir(): string {
  const dir = join(dataDir(), 'surveillance')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dataFile(name: string): string {
  return join(dataDir(), name)
}

export interface AiNote {
  text: string
  addedAt: string // ISO
}

export interface AiProfile {
  notes: AiNote[]
  updatedAt: string
}

export function loadAiProfile(): AiProfile {
  const file = dataFile('aiProfile.json')
  try {
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      if (raw && Array.isArray(raw.notes)) return raw
    }
  } catch { /* corrupt → start fresh */ }
  return { notes: [], updatedAt: new Date().toISOString() }
}

export function saveAiProfile(profile: AiProfile): void {
  writeFileSync(dataFile('aiProfile.json'), JSON.stringify(profile, null, 2), 'utf8')
}

export function appendAiNote(text: string): AiProfile {
  const profile = loadAiProfile()
  const clean = text.trim()
  if (!clean) return profile
  // Avoid exact duplicates
  if (profile.notes.some(n => n.text.toLowerCase() === clean.toLowerCase())) return profile
  profile.notes.push({ text: clean.slice(0, 160), addedAt: new Date().toISOString() })
  profile.updatedAt = new Date().toISOString()
  // Cap the profile so it stays readable and cheap for the LLM prompt.
  if (profile.notes.length > 40) profile.notes = profile.notes.slice(-40)
  saveAiProfile(profile)
  return profile
}
