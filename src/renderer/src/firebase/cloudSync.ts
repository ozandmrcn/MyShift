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

export function isReady(uid: string): boolean {
  return getDb() !== null && uid.length > 0
}

export async function pushMeta(uid: string, meta: CloudMeta): Promise<void> {
  if (!isReady(uid)) return
  await setDoc(metaRef(uid), meta)
}

export async function readMeta(uid: string): Promise<CloudMeta | null> {
  if (!isReady(uid)) return null
  const snap = await getDoc(metaRef(uid))
  if (!snap.exists()) return null
  return snap.data() as CloudMeta
}

/** Batched write of every given day doc (dates as doc ids). */
export async function pushDays(uid: string, days: Record<string, DayLog>): Promise<void> {
  if (!isReady(uid) || Object.keys(days).length === 0) return
  const db = getDb()!
  const batch = writeBatch(db)
  for (const [date, log] of Object.entries(days)) {
    batch.set(dayRef(uid, date), { ...log, updatedAt: log.updatedAt ?? Date.now() })
  }
  await batch.commit()
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