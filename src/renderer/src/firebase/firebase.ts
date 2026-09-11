import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// The whole cloud feature is OPTIONAL: it only activates when the FB config vars
// are present (via .env). Anyone who clones the repo without a .env (or without
// filling these) keeps the app fully local — nothing here is ever initialized.
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
const appId = import.meta.env.VITE_FIREBASE_APP_ID

export const isFirebaseEnabled = Boolean(apiKey && projectId)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (isFirebaseEnabled) {
  try {
    app = initializeApp({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId })
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (error) {
    console.error('[cloud] Firebase init failed — cloud disabled', error)
    app = null
    auth = null
    db = null
  }
}

export function getDb(): Firestore | null {
  return db
}

export function getAuthRef(): Auth | null {
  return auth
}

/** Prompts the Google account chooser and signs the user in (popup). */
export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) {
    throw new Error('Firebase ayarlanamadı — bulut devre dışı')
  }
  try {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, provider)
    return result.user
  } catch (error) {
    console.error('[cloud] Google sign-in failed', error)
    throw error
  }
}

export async function signOutUser(): Promise<void> {
  if (!auth) return
  await firebaseSignOut(auth)
}

/** Reacts to auth changes. Returns an unsubscribe function. */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (user) => callback(user))
}

export interface CloudUser {
  uid: string
  displayName?: string
  email?: string
  photoURL?: string
}