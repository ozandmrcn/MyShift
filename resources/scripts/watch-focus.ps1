# MyShift — foreground-window poller (observation mode).
# Polls the foreground window every 3s and prints one line per poll:
#   <pid>|<processName>|<windowTitle>
# Read by the MyShift main process; everything stays local.

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FGWatch {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@
Add-Type -TypeDefinition $sig

while ($true) {
  try {
    $h = [FGWatch]::GetForegroundWindow()
    [uint32]$procId = 0
    [void][FGWatch]::GetWindowThreadProcessId($h, [ref]$procId)
    $name = ''
    if ($procId -gt 0) {
      $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      if ($p) { $name = $p.ProcessName }
    }
    $sb = New-Object System.Text.StringBuilder 512
    [void][FGWatch]::GetWindowText($h, $sb, 512)
    $title = $sb.ToString() -replace '[^\x20-\x7E]', ''
    [Console]::WriteLine("$procId|$name|$title")
  } catch {
    [Console]::WriteLine("0||")
  }
  Start-Sleep -Seconds 3
}
