/**
 * MyShift Admin Panel — local-only.
 *
 * Reads and edits the ENTIRE Firestore used by the Electron app (users/{uid}/meta/current
 * and users/{uid}/days/{date}) with the Firebase Admin SDK. No authentication in the UI:
 * access is protected by the fact that this binds to 127.0.0.1 and the credentials live in
 * the git-ignored root .env (service account keys). Never deploy this anywhere public.
 *
 * Config (from the shared root .env, or admin/.env on top):
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT=/yol/serviceAccountKey.json   (recommended)
 *   — or inline —
 *   FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
 *   Optional second project for the UI dropdown: FIREBASE_ADMIN2_* (same keys).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })

const path = require('path')
const fs = require('fs')
const express = require('express')
const admin = require('firebase-admin')

const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.ADMIN_PORT || process.env.VITE_ADMIN_PORT || 5100)

function buildCredential(prefix) {
  const label = process.env[prefix + 'LABEL'] || prefix.replace(/^FIREBASE_/, '').replace(/_+$/, '')
  const saPath = process.env[prefix + 'SERVICE_ACCOUNT']
  if (saPath) {
    const abs = path.isAbsolute(saPath) ? saPath : path.resolve(ROOT, saPath)
    if (!fs.existsSync(abs)) return { label, error: `service account dosyası bulunamadı: ${abs}` }
    let cred
    try {
      cred = JSON.parse(fs.readFileSync(abs, 'utf8'))
    } catch (e) {
      return { label, error: `service account JSON okunamadı: ${e.message}` }
    }
    return { label, projectId: cred.project_id, credential: admin.credential.cert(cred) }
  }
  const projectId = process.env[prefix + 'PROJECT_ID']
  const clientEmail = process.env[prefix + 'CLIENT_EMAIL']
  const privateKey = process.env[prefix + 'PRIVATE_KEY']
  if (!projectId && !clientEmail && !privateKey) return null // hiç yapılandırılmamış
  if (!projectId || !clientEmail || !privateKey) {
    return { label, error: `${prefix}PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY eksik — ya da ${prefix}SERVICE_ACCOUNT yolunu ver` }
  }
  return {
    label,
    projectId,
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n')
    })
  }
}

// projectId -> { app, firestore, label }
const projects = new Map()
const projectStatus = []

function setupProject(prefix) {
  const conf = buildCredential(prefix)
  if (!conf) return
  if (conf.error) {
    projectStatus.push({ label: conf.label, error: conf.error, ready: false })
    return
  }
  projects.set(conf.projectId, conf) // credential holder; firestore lazily
  projectStatus.push({ label: conf.label, projectId: conf.projectId, ready: true })
}
setupProject('FIREBASE_ADMIN_')
setupProject('FIREBASE_ADMIN2_')

function getFirestore(pid) {
  const conf = projects.get(pid)
  if (!conf) return null
  if (!conf.app) {
    conf.app = admin.initializeApp({ credential: conf.credential, projectId: conf.projectId }, `myshift-admin-${pid}`)
    conf.firestore = admin.firestore(conf.app)
    conf.firestore.settings({ ignoreUndefinedProperties: true })
  }
  return conf.firestore
}

// ─── helpers ────────────────────────────────────────────────────────────────
// JSON bodies from the UI can't carry `undefined`, but scrub defensively so a
// malformed edit can never break Firestore writes.
function sanitize(value) {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? undefined : sanitize(v))).filter((v) => v !== undefined)
  }
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = sanitize(v)
  }
  return out
}

function pickProject(req) {
  const pid = String(req.query.pid || req.body?.pid || '')
  if (pid) return getFirestore(pid)
  const first = [...projects.keys()][0]
  return first ? getFirestore(first) : null
}

// ─── app ────────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, 'public')))

app.get('/api/status', (_req, res) => {
  res.json({ ok: projectStatus.length > 0, projects: projectStatus })
})

const metaRef = (fs, uid) => fs.doc(`users/${uid}/meta/current`)
const daysColl = (fs, uid) => fs.collection(`users/${uid}/days`)
const dayRef = (fs, uid, date) => fs.doc(`users/${uid}/days/${date}`)

// UID'leri collectionGroup ile bul (users/{uid} seviyesinde doküman olmayabilir)
async function findAllUids(fs) {
  const uids = new Set()
  const metaSnap = await fs.collectionGroup('meta').get()
  metaSnap.forEach((d) => {
    const parts = d.ref.path.split('/')
    // users/{uid}/meta/current → parts[0]='users', parts[1]=uid
    if (parts[0] === 'users' && parts.length >= 3) uids.add(parts[1])
  })
  return [...uids]
}

// Kullanıcı listesi: meta özeti + gün istatistikleri
app.get('/api/users', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı (root .env → FIREBASE_ADMIN_*)' })
  try {
    const uids = await findAllUids(fs)
    const users = []
    for (const uid of uids) {
      let meta = null
      try {
        const m = await metaRef(fs, uid).get()
        if (m.exists) meta = m.data()
      } catch { /* meta okunamadı */ }
      let daysCount = 0
      let totalWorked = 0
      let totalIdle = 0
      let totalBreak = 0
      let totalPayback = 0
      try {
        const days = await daysColl(fs, uid).get()
        daysCount = days.size
        days.forEach((d) => {
          const data = d.data()
          totalWorked += data.workedSeconds || 0
          totalIdle += data.idleSeconds || 0
          totalBreak += data.breakSeconds || 0
          totalPayback += data.paybackSeconds || 0
        })
      } catch { /* günler okunamadı */ }
      users.push({
        uid,
        daysCount,
        totalWorked,
        totalIdle,
        totalBreak,
        totalPayback,
        templates: Array.isArray(meta?.templates) ? meta.templates.length : 0,
        completedShifts: Array.isArray(meta?.completedShifts) ? meta.completedShifts.length : 0,
        settingsKeys: meta?.settings ? Object.keys(meta.settings).length : 0,
        lastMetaUpdate: meta?.updatedAt ?? null
      })
    }
    users.sort((a, b) => (a.uid < b.uid ? -1 : 1))
    res.json({ ok: true, users })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

// Tek kullanıcı: meta + tüm günler
app.get('/api/users/:uid', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const { uid } = req.params
    const m = await metaRef(fs, uid).get()
    const days = []
    const d = await daysColl(fs, uid).get()
    d.forEach((s) => days.push({ date: s.id, ...s.data() }))
    days.sort((a, b) => (a.date < b.date ? -1 : 1))
    res.json({ ok: true, uid, meta: m.exists ? m.data() : null, days })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.get('/api/users/:uid/meta', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const m = await metaRef(fs, req.params.uid).get()
    res.json({ ok: true, meta: m.exists ? m.data() : null })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/users/:uid/meta', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const { uid } = req.params
    const body = sanitize(req.body || {})
    const payload = {
      ...(body.settings !== undefined ? { settings: body.settings } : {}),
      ...(body.templates !== undefined ? { templates: body.templates } : {}),
      ...(body.completedShifts !== undefined ? { completedShifts: body.completedShifts } : {}),
      updatedAt: Date.now()
    }
    await metaRef(fs, uid).set(payload, { merge: true })
    res.json({ ok: true, savedAt: Date.now() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/users/:uid/days/:date', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const { uid, date } = req.params
    const data = sanitize(req.body || {})
    const payload = { ...data }
    if (typeof payload.updatedAt !== 'number') payload.updatedAt = Date.now()
    await dayRef(fs, uid, date).set(payload)
    res.json({ ok: true, savedAt: Date.now() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/users/:uid/days/:date', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    await dayRef(fs, req.params.uid, req.params.date).delete()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

// Global istatistik: her gün tüm kullanıcıların toplam süreleri
app.get('/api/stats', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const series = {}
    const uids = await findAllUids(fs)
    for (const uid of uids) {
      const days = await daysColl(fs, uid).get()
      days.forEach((d) => {
        const data = d.data()
        const key = d.id
        if (!series[key]) series[key] = { date: key, users: 0, worked: 0, idle: 0, break: 0, payback: 0, daily: 0, completed: 0 }
        series[key].users++
        series[key].worked += data.workedSeconds || 0
        series[key].idle += data.idleSeconds || 0
        series[key].break += data.breakSeconds || 0
        series[key].payback += data.paybackSeconds || 0
        if (data.completed) series[key].completed++
      })
    }
    res.json({ ok: true, series: Object.values(series).sort((a, b) => (a.date < b.date ? -1 : 1)) })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

// Tüm Firestore'u tek JSON olarak dışa aktar
app.get('/api/export', async (req, res) => {
  const fs = pickProject(req)
  if (!fs) return res.status(400).json({ error: 'Firestore yapılandırılmadı' })
  try {
    const users = {}
    const uids = await findAllUids(fs)
    for (const uid of uids) {
      const entry = { uid, meta: null, days: {} }
      const m = await metaRef(fs, uid).get()
      if (m.exists) entry.meta = m.data()
      const days = await daysColl(fs, uid).get()
      days.forEach((s) => { entry.days[s.id] = s.data() })
      users[uid] = entry
    }
    res.json({ exportedAt: new Date().toISOString(), users })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`MyShift Admin Panel → http://localhost:${PORT}`)
  if (projectStatus.length === 0) {
    console.log('⚠️  Firestore yapılandırması yok: root .env içine FIREBASE_ADMIN_SERVICE_ACCOUNT (ya da FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY) ekleyin.')
  } else {
    for (const p of projectStatus) {
      console.log(p.ready ? `   • ${p.label} → ${p.projectId}` : `   • ${p.label} → ${p.error}`)
    }
  }
})