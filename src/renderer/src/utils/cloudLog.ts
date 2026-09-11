// Best-effort structured logging for cloud-sync diagnostics. Every error is
// appended to data/cloud-sync.log (via the main process) so a failure stays fully
// diagnosable even when the UI only shows a short message. Never throws.

export function extractError(err: unknown): { code?: string; message: string; stack?: string; customData?: unknown } {
  if (err instanceof Error) {
    const code = typeof (err as { code?: unknown }).code === 'string' ? (err as { code?: unknown }).code as string : undefined
    return {
      code,
      message: err.message,
      stack: err.stack,
      customData: (err as { customData?: unknown }).customData
    }
  }
  return { message: String(err) }
}

export function logCloudError(where: string, err: unknown, extra: Record<string, unknown> = {}): void {
  const payload = { where, ...extractError(err), ...extra }
  console.error('[cloud]', where, err)
  try {
    void window.electronAPI?.cloud?.logError(payload)
  } catch { /* logging never breaks the app */ }
}

export function logCloudInfo(where: string, extra: Record<string, unknown> = {}): void {
  try {
    void window.electronAPI?.cloud?.logInfo({ where, ...extra })
  } catch { /* ignore */ }
}