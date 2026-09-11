import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseEnabled, onAuthChange, signInWithGoogle, signOutUser, type CloudUser } from '../firebase/firebase'
import { pushMeta, readMeta, pushDays, readAllDays, type CloudMeta } from '../firebase/cloudSync'
import { useShiftStore, type DayLog } from '../stores/useShiftStore'
import { logCloudError, logCloudInfo, extractError } from '../utils/cloudLog'

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

// Format Firebase errors human-readably: "firestore/permission-denied — <message>".
function formatError(err: unknown): string {
  const { code, message } = extractError(err)
  const msg = (message && !message.includes(code ?? '') ? message : code) ?? ''
  return code && !msg.includes(code) ? `${code} — ${msg}` : msg
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
 *  - on any local change: debounced push of meta + the days that actually changed
 */
export function useCloudSync() {
  const [status, setStatus] = useState<CloudStatus>(isFirebaseEnabled ? 'signed-out' : 'disabled')
  const [user, setUser] = useState<CloudUser | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uidRef = useRef<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // date -> last updatedAt we know is safely stored in the cloud (dirty tracking).
  const pushedRef = useRef<Record<string, number>>({})

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
        await pushMeta(uid, { ...cloudMeta, updatedAt: Date.now() })
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

      // After a full sync, local == cloud everywhere → nothing left to push.
      const fresh = useShiftStore.getState().dailyLogs
      for (const date of Object.keys(fresh)) pushedRef.current[date] = fresh[date].updatedAt ?? Date.now()

      setLastSyncAt(Date.now())
      setStatus('synced')
      logCloudInfo('sync-complete', { uid, force, imported: Object.keys(toImport).length, pushed: Object.keys(toPush).length })
    } catch (err) {
      logCloudError('sync-failed', err, { uid, force })
      setError(formatError(err))
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
        logCloudInfo('signed-in', { uid: fbUser.uid, email: fbUser.email })
        // force=false: adopt the cloud meta whenever it's newer than what we last
        // saw (critical after a factory reset — otherwise the cleared local state
        // would overwrite the cloud backup). Days still merge newer-wins per day.
        void syncNow(false)
      } else {
        uidRef.current = null
        setUser(null)
        setStatus('signed-out')
      }
    })
    return off
  }, [syncNow])

  // Push local changes (debounced) while signed in — only days that changed.
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
        const dirtyDays: Record<string, DayLog> = {}
        for (const [date, log] of Object.entries(store.dailyLogs)) {
          if ((log.updatedAt ?? 0) !== pushedRef.current[date]) dirtyDays[date] = log
        }
        setStatus('syncing')
        Promise.all([
          pushMeta(uid, { settings: store.settings, templates: store.templates, completedShifts: store.completedShifts, updatedAt: Date.now() } as CloudMeta),
          pushDays(uid, dirtyDays)
        ])
          .then(() => {
            for (const [date, log] of Object.entries(dirtyDays)) pushedRef.current[date] = log.updatedAt ?? Date.now()
            setLastSyncAt(Date.now())
            setStatus('synced')
            logCloudInfo('push-complete', { uid, days: Object.keys(dirtyDays).length })
          })
          .catch((err) => {
            logCloudError('push-failed', err, { uid, days: Object.keys(dirtyDays).length })
            setError(formatError(err))
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
      logCloudError('sign-in-failed', err, {})
      setError(formatError(err))
      setStatus('error')
    }
  }, [])

  const signOut = useCallback(async () => {
    const uid = uidRef.current
    await signOutUser()
    uidRef.current = null
    setUser(null)
    setStatus('signed-out')
    setLastSyncAt(null)
    logCloudInfo('signed-out', { uid })
  }, [])

  const enabled = isFirebaseEnabled

  return { enabled, status, user, lastSyncAt, error, signIn, signOut, syncNow: () => syncNow() }
}