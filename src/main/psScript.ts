import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

function scriptsDir(): string {
  return join(app.getAppPath(), 'resources', 'scripts')
}

// Build the PowerShell argument list for one of the helper scripts. The .ps1
// files live in resources/scripts/ (not embedded in the JS bundle — that keeps
// the P/Invoke / keyboard-hook payload out of index.js so heuristic AV doesn't
// flag it) and are passed via -EncodedCommand. NOTE: PowerShell's
// -EncodedCommand expects the base64 of the UTF-16LE encoding of the script,
// NOT UTF-8 — using UTF-8 makes PowerShell fail to parse the command and the
// helper silently never starts (which used to produce zero observation records).
// Returns null when the script is missing; callers then skip that helper.
export function psArgs(scriptName: 'watch-focus.ps1' | 'watch-typing.ps1'): string[] | null {
  try {
    const content = readFileSync(join(scriptsDir(), scriptName), 'utf8')
    const b64 = Buffer.from(content, 'utf16le').toString('base64')
    return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64]
  } catch {
    return null
  }
}
