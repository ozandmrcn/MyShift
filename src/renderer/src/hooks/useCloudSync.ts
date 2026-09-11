import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseEnabled, onAuthChange, signInWithGoogle, signOutUser, type CloudUser } from '../firebase/firebase'
import { pushMeta, readMeta, pushDays, readAllDays, type CloudMeta } from '../firebase/cloudSync'
import { useShiftStore, type DayLog } from '../stores/useShiftStore'

export type CloudStatus =
  | 'disabled' // no .env config → feature off, app fully local
  | 'signed-out'
  | 'signing-in'
  | 'syncing'
  | 'synced'
  | 'error'

interface CloudMetaSyncStamp {
  at: number
}

// Where the last cloud meta sync time lives (electron-store in Electron, localStorage there).
async function readLastMetaSync(): Promise<number> {
  const api = window.electronAPI
  if (api?.store) {
    const raw = await api.store.get('cloudMetaSync', null)
    return raw && typeof raw.at === 'number' ? raw.at : 0
  }
  try {
    const raw = localStorage.getItem('cloudMetaSync')
    return raw ? (JSON.parse(raw) as CloudMetaSyncStamp).at ?? 0 : 0
  } catch {
    return 0
  }
}

async function writeLastMetaSync(at: number): Promise<void> {
  const api = window.electronAPI
  const payload: CloudMetaSyncStamp = { at }
  if (api?.store) {
    await api.store.set('cloudMetaSync', payload)
  } else {
    localStorage.setItem('cloudMetaSync', JSON.stringify(payload))
  }
}

/** Wires Firebase (optional) to the local store:
 *  - listens to auth, exposes sign in/out
 *  - on login: pull + merge (newer wins per document via updatedAt)
 *  - on any local change: debounced push of meta + day docs
 */
export function useCloudSync() {
  const [status, setStatus] = useState<CloudStatus>(isFirebaseEnabled ? 'signed-out' : 'disabled')
  const [user, setUser] = useState<CloudUser | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uidRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncNow = useCallback(async (force = false) => {
    const uid = uidRef.current
    if (!uid) return
    const store = useShiftStore.getState()
    setStatus('syncing')
    setError(null)
    try {
      const localMeta: CloudMeta = {
        settings: store.settings,
        templates: store.templates,
        completedShifts: store.completedShifts,
        updatedAt: Date.now()
      }

      // ── meta: newer wins ───────────────────────────────────────────────
      const cloudMeta: CloudMeta | null = await readMeta(uid)
      if (!force && cloudMeta && cloudMeta.updatedAt > (await readLastMetaSync())) {
        // Cloud has changes we haven't seen yet -> adopt them.
        store.cloudImportMeta({
          settings: cloudMeta.settings,
          templates: cloudMeta.templates,
          completedShifts: cloudMeta.completedShifts
        })
        await writeLastMetaSync(cloudMeta.updatedAt)
        void pushMeta(uid, { ...cloudMeta, updatedAt: Date.now() })
      } else {
        // Local is newer (or no cloud meta) -> push local.
        await pushMeta(uid, localMeta)
        await writeLastMetaSync(localMeta.updatedAt)
      }

      // ── days: per-day merge, newer wins ────────────────────────────────
      const cloudDays = await readAllDays(uid)
      const localDays = useShiftStore.getState().dailyLogs
      const toPush: Record<string, DayLog> = {}
      const toImport: Record<string, DayLog> = {}
      const mergedDates = new Set([...Object.keys(cloudDays), ...Object.keys(localDays)])
      for (const date of mergedDates) {
        const cloud = cloudDays[date]
        const local = localDays[date]
        if (!cloud) toPush[date] = local
        else if (!local || (cloud.updatedAt ?? 0) > (local.updatedAt ?? 0)) toImport[date] = cloud
        else if ((local.updatedAt ?? 0) > (cloud.updatedAt ?? 0)) toPush[date] = local
      }
      if (Object.keys(toImport).length > 0) store.cloudImportDays(toImport)
      if (Object.keys(toPush).length > 0) await pushDays(uid, toPush)

      setLastSyncAt(Date.now())
      setStatus('synced')
    } catch (err) {
      console.error('[cloud] sync failed', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  // Auth listener + initial sync-on-login
  useEffect(() => {
    if (!isFirebaseEnabled) {
      setStatus('disabled')
      return
    }
    const off = onAuthChange((fbUser) => {
      if (fbUser) {
        uidRef.current = fbUser.uid
        setUser({ uid: fbUser.uid, displayName: fbUser.displayName ?? undefined, email: fbUser.email ?? undefined, photoURL: fbUser.photoURL ?? undefined })
        void syncNow(true)
      } else {
        uidRef.current = null
        setUser(null)
        setStatus('signed-out')
      }
    })
    return off
  }, [syncNow])

  // Push local changes (debounced) while signed in
  useEffect(() => {
    if (!isFirebaseEnabled) return
    const unsub = useShiftStore.subscribe((state, prev) => {
      if (!uidRef.current) return
      const changed =
        state.settings !== prev.settings ||
        state.templates !== prev.templates ||
        state.completedShifts !== prev.completedShifts ||
        state.dailyLogs !== prev.dailyLogs
      if (!changed) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const uid = uidRef.current
        if (!uid) return
        const store = useShiftStore.getState()
        setStatus('syncing')
        Promise.all([
          pushMeta(uid, { settings: store.settings, templates: store.templates, completedShifts: store.completedShifts, updatedAt: Date.now() } as CloudMeta),
          pushDays(uid, store.dailyLogs)
        ])
          .then(() => {
            setLastSyncAt(Date.now())
            setStatus('synced')
          })
          .catch((err) => {
            console.error('[cloud] push failed', err)
            setError(err instanceof Error ? err.message : String(err))
            setStatus('error')
          })
      }, 2000)
    })
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const signIn = useCallback(async () => {
    setStatus('signing-in')
    setError(null)
    try {
      await signInWithGoogle()
      // status/user follow from the auth listener
    } catch (err) {
      console.error('[cloud] sign-in failed', err)
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  const signOut = useCallback(async () => {
    await signOutUser()
    uidRef.current = null
    setUser(null)
    setStatus('signed-out')
    setLastSyncAt(null)
  }, [])

  const enabled = isFirebaseEnabled

  return { enabled, status, user, lastSyncAt, error, signIn, signOut, syncNow: () => syncNow() }
}