# MyShift — typed-text capture (observation mode, opt-in, local-only).
# Installs a WH_KEYBOARD_LL low-level keyboard hook and flushes the characters
# typed since the last flush every 5s, tagged with the focused window:
#   {"pid":..., "app":"...", "title":"...", "typed":"..."}
# Secure/credential windows are skipped; auto-repeat is ignored. This script is
# read and run by the MyShift main process only while observation recording is on.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class KBWatch {
  public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  public struct KBDLLHOOKSTRUCT { public int vkCode; public int scanCode; public int flags; public int time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
  [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hhk);
  [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int ToUnicode(int wVirtKey, int wScanCode, byte[] lpKeyState, StringBuilder pwszBuff, int cchBuff, int wFlags);
  [DllImport("user32.dll")] public static extern bool GetKeyboardState(byte[] lpKeyState);
}
'@
Add-Type -TypeDefinition $sig
Add-Type -AssemblyName System.Windows.Forms

$script:buffer = New-Object System.Text.StringBuilder
$script:lastKey = ''
$script:lastTime = -1

function Get-Fg {
  $h = [KBWatch]::GetForegroundWindow()
  [uint32]$procId = 0
  [void][KBWatch]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  if ($procId -gt 0) {
    $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
    if ($p) { $name = $p.ProcessName }
  }
  $sb = New-Object System.Text.StringBuilder 512
  [void][KBWatch]::GetWindowText($h, $sb, 512)
  $cls = New-Object System.Text.StringBuilder 256
  [void][KBWatch]::GetClassName($h, $cls, 256)
  return @{ pid=[int]$procId; name=$name; title=$sb.ToString(); cls=$cls.ToString() }
}

function Write-Flush {
  $fg = Get-Fg
  $line = [pscustomobject]@{ pid=$fg.pid; app=$fg.name; title=$fg.title; typed=$script:buffer.ToString() }
  [Console]::WriteLine(($line | ConvertTo-Json -Compress -Depth 3))
  $script:buffer.Clear()
}

$hookProc = [KBWatch+LowLevelKeyboardProc] {
  param($nCode, $wParam, $lParam)
  if ($nCode -ge 0 -and $wParam -eq 256) {   # WM_KEYDOWN
    $kbd = [System.Runtime.InteropServices.Marshal]::PtrToStructure($lParam, [type][KBWatch+KBDLLHOOKSTRUCT])
    $keyCode = $kbd.vkCode

    # Modifier & navigation keys are not "text"
    $mods = @(160,161,162,163,164,165,20,144,145,8,9,27,33,34,35,36,37,38,39,40,45,46,91,92,93,44)
    if ($mods -contains $keyCode) { return [KBWatch]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam) }

    # Auto-repeat guard: same key within ~30ms is the OS repeating, not typing.
    if ($script:lastKey -eq "$keyCode" -and ($kbd.time - $script:lastTime) -lt 30) {
      return [KBWatch]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
    }
    $script:lastKey = "$keyCode"
    $script:lastTime = $kbd.time

    # Skip secure/credential windows (password prompts, lock screens, ...)
    $fg = Get-Fg
    $secCls = @('Credential','LockHost','LogonUI','IME')
    foreach ($s in $secCls) { if ($fg.cls -like "*$s*") { return [KBWatch]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam) } }

    $state = New-Object byte[] 256
    [void][KBWatch]::GetKeyboardState($state)
    $buf = New-Object System.Text.StringBuilder 8
    $r = [KBWatch]::ToUnicode($keyCode, $kbd.scanCode, $state, $buf, 8, 0)
    if ($r -gt 0) {
      [void]$script:buffer.Append($buf.ToString())
    } else {
      $name = [System.Enum]::GetName([System.Windows.Forms.Keys], $keyCode)
      if ($name -eq 'Space') { [void]$script:buffer.Append(' ') }
      elseif ($name -eq 'Return' -or $name -eq 'Enter') { [void]$script:buffer.Append([char]10) }
      elseif ($name -eq 'OemPeriod') { [void]$script:buffer.Append('.') }
      elseif ($name -eq 'Oemcomma') { [void]$script:buffer.Append(',') }
    }
  }
  return [KBWatch]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
}

$hook = [KBWatch]::SetWindowsHookEx(13, $hookProc, [IntPtr]::Zero, 0)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ if ($script:buffer.Length -gt 0) { Write-Flush } })
$timer.Start()

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($hook -ne [IntPtr]::Zero) { [void][KBWatch]::UnhookWindowsHookEx($hook) }
}
