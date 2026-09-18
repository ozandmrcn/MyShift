import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { getDb } from './firebase'
import type { DayLog, Settings, ShiftTemplate } from '../stores/useShiftStore'

// Cloud layout (Firestore, rules: only the signed-in uid can touch its own folder):
//   users/{uid}/meta/current   -> settings + templates + completedShifts + updatedAt
//   users/{uid}/days/{YYYY-MM-DD} -> one rich DayLog + updatedAt (review like a calendar)

export interface CloudMeta {
  settings: Settings
  templates: ShiftTemplate[]
  completedShifts: string[]
  updatedAt: number
}

function metaRef(uid: string) {
  const db = getDb()
  return doc(db!, 'users', uid, 'meta', 'current')
}

function dayRef(uid: string, date: string) {
  const db = getDb()
  return doc(db!, 'users', uid, 'days', date)
}

function daysColl(uid: string) {
  const db = getDb()
  return collection(db!, 'users', uid, 'days')
}

/** Firestore rejects `undefined` anywhere in a written document. Legacy or
 *  optional fields can be undefined, so scrub them recursively before any write.
 *  Never throws. */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => (item === undefined ? undefined : sanitizeForFirestore(item)))
      .filter((item) => item !== undefined) as unknown as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue
    out[key] = sanitizeForFirestore(v)
  }
  return out as T
}

export function isReady(uid: string): boolean {
  return getDb() !== null && uid.length > 0
}

export async function pushMeta(uid: string, meta: CloudMeta): Promise<void> {
  if (!isReady(uid)) return
  await setDoc(metaRef(uid), sanitizeForFirestore(meta))
}

export async function readMeta(uid: string): Promise<CloudMeta | null> {
  if (!isReady(uid)) return null
  const snap = await getDoc(metaRef(uid))
  if (!snap.exists()) return null
  return snap.data() as CloudMeta
}

/** Batched write of every given day doc (dates as doc ids), chunked to stay far
 *  below Firestore's 500-writes-per-batch limit even on a huge backlog. */
export async function pushDays(uid: string, days: Record<string, DayLog>): Promise<void> {
  if (!isReady(uid) || Object.keys(days).length === 0) return
  const db = getDb()!
  const entries = Object.entries(days)
  for (let i = 0; i < entries.length; i += 400) {
    const chunk = entries.slice(i, i + 400)
    const batch = writeBatch(db)
    for (const [date, log] of chunk) {
      batch.set(dayRef(uid, date), sanitizeForFirestore({ ...log, updatedAt: log.updatedAt ?? Date.now() }))
    }
    await batch.commit()
  }
}

export async function readDay(uid: string, date: string): Promise<DayLog | null> {
  if (!isReady(uid)) return null
  const snap = await getDoc(dayRef(uid, date))
  if (!snap.exists()) return null
  return snap.data() as DayLog
}

export async function readAllDays(uid: string): Promise<Record<string, DayLog>> {
  if (!isReady(uid)) return {}
  const snap = await getDocs(daysColl(uid))
  const out: Record<string, DayLog> = {}
  snap.forEach((s) => {
    out[s.id] = s.data() as DayLog
  })
  return out
}