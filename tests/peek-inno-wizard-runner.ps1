param([string]$TestSid,[string]$Hash)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
Set-Location -LiteralPath $PSScriptRoot
function Check($ok,$message){if(!$ok){throw $message}}
function Stop-InstalledQaPeek {
 if(!$custom){return}
 $exePath=Join-Path $custom 'Peek.exe'
 foreach($proc in (Get-Process -Name Peek -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $exePath})){
  if($proc.HasExited){continue}
  try{Stop-Process -InputObject $proc -Force -ErrorAction Stop}catch{if(!$proc.HasExited){throw}}
  Check $proc.WaitForExit(5000) 'Temporary installed Peek did not exit'
 }
}
function WaitProcess($process){if(!$process.WaitForExit(90000)){throw 'Process did not exit'};return $process.ExitCode}
$install=$probe=$null
$reg='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{B86A0A48-66C9-4C84-B53C-6BA90801F43F}_is1'
try{
 Check ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $TestSid) 'Not the temporary account'
 $profileInfo=Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$TestSid)
 $profile=[Environment]::ExpandEnvironmentVariables([string]$profileInfo.ProfileImagePath)
 Check ((Split-Path -Leaf $profile) -eq (Split-Path -Leaf $PSScriptRoot)) 'Wrong Windows profile'
 $env:USERPROFILE=$profile;$env:LOCALAPPDATA=Join-Path $profile 'AppData\Local';$env:APPDATA=Join-Path $profile 'AppData\Roaming';$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp';$env:TMP=$env:TEMP
 $programs=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';$link=Join-Path $programs 'Peek\Peek.lnk'
 $default=Join-Path $env:LOCALAPPDATA 'Programs\Peek';$custom=Join-Path $env:LOCALAPPDATA 'QA Custom Folder\Peek'
 New-Item -ItemType Directory -Path $env:TEMP,$programs -Force | Out-Null
 Check (!(Test-Path -LiteralPath $reg) -and !(Test-Path -LiteralPath $default) -and !(Test-Path -LiteralPath $custom)) 'Existing installation in the test account'
 $pkg=Join-Path $PSScriptRoot 'Peek-ui-qa.exe';Check ((Get-FileHash -LiteralPath $pkg).Hash -eq $Hash) 'Wrong test installer'
 Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing
 Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class PeekSetupCapture {
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
}
"@
 $install=Start-Process -FilePath $pkg -ArgumentList @('/SP-','/LANG=chinesesimplified','/NORESTART',('/LOG="'+(Join-Path $PSScriptRoot 'install.log')+'"')) -PassThru
 function WindowNodes {
  $condition=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ControlTypeProperty),([Windows.Automation.ControlType]::Window)
  $root=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$condition)
  foreach($window in $root){
   $proc=Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
   if($proc -and ($proc.Id -eq $install.Id -or ($proc.ProcessName -like 'Peek-ui-qa*' -and $proc.Path -like "$env:TEMP\*"))){$window}
  }
 }
 function Element($type,[string]$pattern){
  $c=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ControlTypeProperty),$type
  foreach($window in (WindowNodes)){
   foreach($element in $window.FindAll([Windows.Automation.TreeScope]::Descendants,$c)){
    if(!$element.Current.IsOffscreen -and $element.Current.IsEnabled -and $element.Current.Name -match $pattern){return $element}
   }
  }
 }
 function WaitElement($type,$pattern){
  for($i=0;$i -lt 140;$i++){
   $e=Element $type $pattern;if($e){return $e}
   if($install.HasExited){throw "Inno Setup exited before showing $pattern ($($install.ExitCode))"}
   Start-Sleep -Milliseconds 300
  }
  throw "Timed out waiting for $pattern"
 }
 function InvokeElement($element){$element.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 450}
 function Screenshot($name){
  $window=WindowNodes | Where-Object {$_.Current.Name -like 'Peek*'} | Select-Object -First 1
  Check $window 'Wizard not visible for screenshot'
  $r=$window.Current.BoundingRectangle
  $bmp=New-Object Drawing.Bitmap ([int]$r.Width),([int]$r.Height);$g=[Drawing.Graphics]::FromImage($bmp)
  try{
   $dc=$g.GetHdc()
   try{Check ([PeekSetupCapture]::PrintWindow([IntPtr]$window.Current.NativeWindowHandle,$dc,2)) 'Unable to capture actual Inno installer window'}finally{$g.ReleaseHdc($dc)}
   $bmp.Save((Join-Path $PSScriptRoot "$name.png"),[Drawing.Imaging.ImageFormat]::Png)
  }finally{$g.Dispose();$bmp.Dispose()}
 }
 $button=[Windows.Automation.ControlType]::Button
 $null=WaitElement $button '^浏览';Screenshot '01-choose-directory'
 $edit=$null
 $editCondition=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ControlTypeProperty),([Windows.Automation.ControlType]::Edit)
 foreach($window in (WindowNodes)){foreach($field in $window.FindAll([Windows.Automation.TreeScope]::Descendants,$editCondition)){
  $value=$null
  if($field.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$value) -and $value.Current.Value -eq $default){$edit=$value;break}
 }}
 Check $edit 'Default folder field not found'
 $edit.SetValue($custom);Screenshot '02-custom-directory'
 for($i=0;$i -lt 4;$i++){
  $action=WaitElement $button '^(下一步|安装)(\(|\s|$)'
  $installing=$action.Current.Name -match '^安装'
  InvokeElement $action
  if($installing){break}
 }
 Check $installing 'Did not reach install confirmation'
 $finish=WaitElement $button '^完成';Screenshot '03-install-complete'
 $checkbox=Element ([Windows.Automation.ControlType]::CheckBox) '启动 Peek'
 if($checkbox){$toggle=$checkbox.GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern);if($toggle.Current.ToggleState -eq [Windows.Automation.ToggleState]::On){$toggle.Toggle()}}
 InvokeElement $finish
 $installed=WaitProcess $install;Check ($installed -eq 0) "Installation exited $installed"
 Check (!(Test-Path -LiteralPath $default)) 'User selection was ignored; files exist at default path'
 $metadata=Get-ItemProperty -LiteralPath $reg
 Check ($metadata.InstallLocation.TrimEnd('\') -eq $custom) 'Wrong registry install path'
 Check (Test-Path -LiteralPath $link) 'Start menu shortcut is missing'
 $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
 Check ($shortcut.TargetPath -eq (Join-Path $custom 'Peek.exe')) 'Incorrect shortcut target'
 $manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'payload-manifest.json') -Raw | ConvertFrom-Json
 foreach($file in $manifest.files){
  $rel=switch($file.file){'PeekHost.exe'{'Peek.exe'} 'PeekHost.exe.config'{'Peek.exe.config'} default{$file.file}}
  $actual=Get-Item -LiteralPath (Join-Path $custom $rel)
  Check ($actual.Length -eq $file.bytes -and (Get-FileHash -LiteralPath $actual.FullName).Hash -eq $file.sha256) "Installed payload differs: $rel"
 }
 $raw=[IO.File]::ReadAllBytes((Join-Path $custom 'resources/setup/PeekSetup.ico'))
 $count=[BitConverter]::ToUInt16($raw,4);$sizes=@(for($i=0;$i -lt $count;$i++){if($raw[6+16*$i] -eq 0){256}else{[int]$raw[6+16*$i]}})
 foreach($size in 16,24,32,40,48,64,128,256){Check ($size -in $sizes) "Missing icon size $size"}
 $smoke=Join-Path $PSScriptRoot 'app-check';$probe=Start-Process -FilePath (Join-Path $custom 'Peek.exe') -ArgumentList @('--smoke',('"'+$smoke+'"')) -WindowStyle Hidden -PassThru
 for($i=0;$i -lt 80 -and !(Test-Path -LiteralPath (Join-Path $smoke 'widget-ready.json'));$i++){if($probe.HasExited){throw 'Installed Peek exited early'};Start-Sleep -Milliseconds 350}
 Check (Test-Path -LiteralPath (Join-Path $smoke 'widget-ready.json')) 'Installed Peek did not open'
 if(!$probe.CloseMainWindow() -or !$probe.WaitForExit(3000)){Stop-Process -Id $probe.Id -ErrorAction SilentlyContinue}
 Stop-InstalledQaPeek
 $uninstall=Get-ChildItem -LiteralPath $custom -Filter 'unins*.exe' -File | Select-Object -First 1
 Check $uninstall 'Uninstaller was not created'
 $remove=Start-Process -FilePath $uninstall.FullName -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="'+(Join-Path $PSScriptRoot 'uninstall.log')+'"')) -WindowStyle Hidden -PassThru
 $removed=WaitProcess $remove
 for($n=0;$n -lt 30 -and (Test-Path -LiteralPath $uninstall.FullName);$n++){Start-Sleep -Milliseconds 200}
 Check ($removed -eq 0 -and !(Test-Path -LiteralPath (Join-Path $custom 'Peek.exe')) -and !(Test-Path -LiteralPath $link) -and !(Test-Path -LiteralPath $reg)) 'Uninstall left an installation, shortcut, or registry marker'
 [ordered]@{installerHash=$Hash;defaultFolderDisplayed=$true;path=$custom;installExit=$installed;verifiedFiles=$manifest.files.Count;iconSizes=$sizes;appStarted=$true;uninstallExit=$removed;uninstallClean=$true} | ConvertTo-Json | Set-Content result.json -Encoding UTF8
}catch{$_ | Out-String | Set-Content failure.txt -Encoding UTF8}finally{
 if($probe -and !$probe.HasExited){Stop-Process -Id $probe.Id -ErrorAction SilentlyContinue}
 if($install -and !$install.HasExited){Stop-Process -Id $install.Id -ErrorAction SilentlyContinue}
 Stop-InstalledQaPeek
 Get-Process -Name 'Peek-ui-qa*' -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "$env:TEMP\*"} | Stop-Process -ErrorAction SilentlyContinue
}
