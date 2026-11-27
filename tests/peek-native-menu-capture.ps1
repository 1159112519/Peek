param([int]$PeekPid,[string]$Out,[switch]$RequireClosed,[switch]$ActivateSettings,[switch]$RaiseOnly,[ValidateSet("None","Escape","Outside","SelectSettings")][string]$Action="None")
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public static class PopupCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 public delegate bool Iter(IntPtr w,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Iter i,IntPtr p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,System.Text.StringBuilder name,int capacity);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flag,uint dx,uint dy,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
}
"@
[void][PopupCapture]::SetThreadDpiAwarenessContext([IntPtr](-4))
$script:found=$null
$cb=[PopupCapture+Iter]{param($h,$p)
 $procId=0
 [void][PopupCapture]::GetWindowThreadProcessId($h,[ref]$procId)
 if($procId -ne $PeekPid -or ![PopupCapture]::IsWindowVisible($h)){return $true}
 $r=[PopupCapture+Rect]::new();if(![PopupCapture]::GetWindowRect($h,[ref]$r)){return $true}
 $class=New-Object Text.StringBuilder 64
 [void][PopupCapture]::GetClassName($h,$class,$class.Capacity)
 if($ActivateSettings -and $class.ToString() -like 'HwndWrapper*' -and ($r.R-$r.L) -gt 500){$script:found=$r;$script:settingsHandle=$h;return $false}
 if($class.ToString() -eq '#32768'){$script:found=$r;return $false}
 return $true
}
[void][PopupCapture]::EnumWindows($cb,[IntPtr]::Zero)
if($ActivateSettings){
 if(!$script:found){throw 'No visible Peek settings window to activate'}
 $r=$script:found
 # Keep only this disposable QA window above other desktop apps while sending real input.
 if(![PopupCapture]::SetWindowPos($script:settingsHandle,[IntPtr](-1),0,0,0,0,0x13)){throw 'Could not raise the isolated Peek window'}
 if($RaiseOnly){return}
 # Native click on the title area grants foreground to this isolated QA window.
 [void][PopupCapture]::SetCursorPos($r.L+90,$r.T+13)
 [PopupCapture]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[PopupCapture]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 250
 $activeId=0;$foreground=[PopupCapture]::GetForegroundWindow()
 $thread=[PopupCapture]::GetWindowThreadProcessId($foreground,[ref]$activeId)
 if($activeId -ne $PeekPid){
  $mine=[PopupCapture]::GetCurrentThreadId();$attached=$thread -and [PopupCapture]::AttachThreadInput($mine,[uint32]$thread,$true)
  try{[void][PopupCapture]::BringWindowToTop($script:settingsHandle);[void][PopupCapture]::SetForegroundWindow($script:settingsHandle)}finally{if($attached){[void][PopupCapture]::AttachThreadInput($mine,[uint32]$thread,$false)}}
  Start-Sleep -Milliseconds 300
  [void][PopupCapture]::GetWindowThreadProcessId([PopupCapture]::GetForegroundWindow(),[ref]$activeId)
 }
 if($activeId -ne $PeekPid){throw "Could not activate the isolated Peek window: foreground PID $activeId"}
 return
}
if($RequireClosed){if($script:found){throw 'Native Peek menu did not close'};return}
for($i=0; !$script:found -and $i -lt 25; $i++){Start-Sleep -Milliseconds 100;[void][PopupCapture]::EnumWindows($cb,[IntPtr]::Zero)}
if(!$script:found){throw 'No visible Win32 Peek menu popup (#32768).'}
$r=$script:found
if($Out){
 $bmp=[Drawing.Bitmap]::new(($r.R-$r.L),($r.B-$r.T));$g=[Drawing.Graphics]::FromImage($bmp)
 try{$g.CopyFromScreen($r.L,$r.T,0,0,$bmp.Size);$bmp.Save($Out,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bmp.Dispose()}
}
function Press([byte]$key){[PopupCapture]::keybd_event($key,0,0,[UIntPtr]::Zero);[PopupCapture]::keybd_event($key,0,2,[UIntPtr]::Zero)}
if($Action -eq 'Escape'){Press 27}
if($Action -eq 'SelectSettings'){
  # Desktop menu: click its second (Settings) row, leaving Exit untouched.
 $x=$r.L+[int](($r.R-$r.L)/2);$y=$r.T+[int](($r.B-$r.T)*0.43)
 [void][PopupCapture]::SetCursorPos($x,$y)
 [PopupCapture]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[PopupCapture]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
if($Action -eq 'Outside'){
 $bounds=[Windows.Forms.Screen]::FromPoint([Drawing.Point]::new($r.L,$r.T)).Bounds
 $x=if($r.R+24 -lt $bounds.Right){$r.R+24}else{$r.L-24}
 $y=[int](($r.T+$r.B)/2)
 [void][PopupCapture]::SetCursorPos($x,$y)
 [PopupCapture]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[PopupCapture]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
}
if($Action -ne 'None'){
 for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 100
  $script:found=$null;[void][PopupCapture]::EnumWindows($cb,[IntPtr]::Zero)
  if(!$script:found){return}
 }
 throw "Native Peek menu did not close after $Action"
}