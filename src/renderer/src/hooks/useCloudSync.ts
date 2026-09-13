import { useCallback, useEffect, useRef, useState } from 'react'
import { isFirebaseEnabled, onAuthChange, signInWithGoogle, signOutUser, type CloudUser } from '../firebase/firebase'
import { pushMeta, readMeta, pushDays, readAllDays } from '../firebase/cloudSync'
import { useShiftStore } from '../stores/useShiftStore'
import { logCloudError, logCloudInfo, extractError } from '../utils/cloudLog'

export type CloudStatus =
  | 'disabled' // no .env config → feature off, app fully local
  | 'signed-out'
  | 'signing-in'
  | 'syncing'
  | 'synced'
  | 'error'

// Format Firebase errors human-readably: "firestore/permission-denied — <message>".
function formatError(err: unknown): string {
  const { code, message } = extractError(err)
  const msg = (message && !message.includes(code ?? '') ? message : code) ?? ''
  return code && !msg.includes(code) ? `${code} — ${msg}` : msg
}

/** Wires Firebase (optional) to the local store with fully manual sync:
 *  - listens to auth, exposes sign in/out
 *  - Push → upload local data, overwriting the cloud copy
 *  - Pull → download the cloud copy, overwriting local data
 *  Nothing happens automatically after sign-in; the user decides when to sync.
 */
export function useCloudSync() {
  const [status, setStatus] = useState<CloudStatus>(isFirebaseEnabled ? 'signed-out' : 'disabled')
  const [user, setUser] = useState<CloudUser | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uidRef = useRef<string | null>(null)

  // Push uploads everything locally to the cloud (overwrite there).
  const pushNow = useCallback(async () => {
    const uid = uidRef.current
    if (!uid) return
    setStatus('syncing')
    setError(null)
    try {
      const store = useShiftStore.getState()
      await pushMeta(uid, {
        settings: store.settings,
        templates: store.templates,
        completedShifts: store.completedShifts,
        updatedAt: Date.now()
      })
      await pushDays(uid, useShiftStore.getState().dailyLogs)
      setLastSyncAt(Date.now())
      setStatus('synced')
      logCloudInfo('push-manual', { uid })
    } catch (err) {
      logCloudError('push-failed', err, { uid })
      setError(formatError(err))
      setStatus('error')
    }
  }, [])

  // Pull downloads the cloud copy and replaces local data (overwrite here).
  const pullNow = useCallback(async () => {
    const uid = uidRef.current
    if (!uid) return
    setStatus('syncing')
    setError(null)
    try {
      const cloudMeta = await readMeta(uid)
      if (cloudMeta) {
        await useShiftStore.getState().cloudImportMeta({
          settings: cloudMeta.settings,
          templates: cloudMeta.templates,
          completedShifts: cloudMeta.completedShifts
        })
      }
      const cloudDays = await readAllDays(uid)
      if (Object.keys(cloudDays).length > 0) {
        await useShiftStore.getState().cloudReplaceDays(cloudDays)
      }
      setLastSyncAt(Date.now())
      setStatus('synced')
      logCloudInfo('pull-manual', { uid, days: Object.keys(cloudDays).length })
    } catch (err) {
      logCloudError('pull-failed', err, { uid })
      setError(formatError(err))
      setStatus('error')
    }
  }, [])

  // Auth listener — sign-in/out only, no automatic sync.
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
        setStatus('signed-out')
      } else {
        uidRef.current = null
        setUser(null)
        setStatus('signed-out')
      }
    })
    return off
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

  return { enabled, status, user, lastSyncAt, error, signIn, signOut, pushNow, pullNow }
}