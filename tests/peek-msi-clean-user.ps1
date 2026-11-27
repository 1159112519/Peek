param([Parameter(Mandatory=$true)][string]$Msi,[Parameter(Mandatory=$true)][string]$BuiltHost,[Parameter(Mandatory=$true)][string]$Evidence,[switch]$Wizard,[ValidateSet("Default","Custom","Cancel")][string]$WizardPath="Default")
$ErrorActionPreference='Stop'
if(!$Wizard -and $WizardPath -ne "Default"){throw "Select -Wizard for custom directory or cancel coverage"}
$Msi=(Resolve-Path -LiteralPath $Msi).Path
$BuiltHost=(Resolve-Path -LiteralPath $BuiltHost).Path
$Evidence=(New-Item -ItemType Directory -Force $Evidence).FullName
if(!(Get-Command New-LocalUser -ErrorAction SilentlyContinue)){throw 'LocalAccounts module is required'}
$stem='PeekMsiQA-'+[Guid]::NewGuid().ToString('N').Substring(0,10)
$public=(Resolve-Path -LiteralPath (Join-Path $env:PUBLIC 'Documents')).Path
$base=(New-Item -ItemType Directory -Path (Join-Path $public $stem)).FullName
$user=$worker=$null
try {
 $password=ConvertTo-SecureString ('t9!Q'+[Guid]::NewGuid().ToString('N')) -AsPlainText -Force
 $user=New-LocalUser -Name $stem -Password $password -Description 'Temporary Peek installer QA profile'
 Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user -ErrorAction Stop
 & (Join-Path $env:WINDIR 'System32/icacls.exe') $base '/grant' ('*'+$user.SID.Value+':(OI)(CI)M') | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Could not limit write access to the test directory and user'}
 Copy-Item -LiteralPath $Msi -Destination (Join-Path $base 'Peek-test.msi')
 $identity=(Get-FileHash -LiteralPath $Msi).Hash
 $hash=(Get-FileHash -LiteralPath $BuiltHost).Hash
 $runner=Join-Path $base 'run.ps1'
 @'
param([string]$TestSid,[string]$MsiHash,[string]$ExeHash,[switch]$Wizard,[ValidateSet("Default","Custom","Cancel")][string]$WizardPath="Default")
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
Set-Location -LiteralPath $PSScriptRoot
$reg='HKCU:\Software\Peek\Installer'
$inno='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{B86A0A48-66C9-4C84-B53C-6BA90801F43F}_is1'
$msiexec=Join-Path $env:WINDIR 'System32/msiexec.exe'
$msi=Join-Path $PSScriptRoot 'Peek-test.msi'
function Wait-Exit($p,[int]$ms=90000){if(!$p.WaitForExit($ms)){throw 'Timed out waiting for the isolated installer'};return $p.ExitCode}
function Assert($value,$reason){if(!$value){throw $reason}}
function Button($process,[string]$name){
 $c1=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ProcessIdProperty),$process.Id
 $c2=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::NameProperty),$name
 $c3=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ControlTypeProperty),([Windows.Automation.ControlType]::Button)
 $target=New-Object Windows.Automation.AndCondition $c2,$c3
 for($i=0;$i -lt 150;$i++){
  $root=[Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children,$c1)
  foreach($dialog in $root){$button=$dialog.FindFirst([Windows.Automation.TreeScope]::Descendants,$target);if($button -and $button.Current.IsEnabled){return $button}}
  if($process.HasExited){throw "Installer exited before showing $name ($($process.ExitCode))"}
  Start-Sleep -Milliseconds 300
 }
 throw "Timed out waiting for $name in the interactive installer"
}
function Invoke-Button($el){$el.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()}
function Dialog-Window($button){
 $w=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($button)
 while($w -and $w.Current.ControlType -ne [Windows.Automation.ControlType]::Window){$w=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($w)}
 Assert $w 'Could not identify wizard window'
 return $w
}
function Dialog-Folder($button){
 $window=Dialog-Window $button
 $condition=New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ControlTypeProperty),([Windows.Automation.ControlType]::Edit)
 $fields=$window.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)
 foreach($field in $fields){
  $pattern=$null
  if($field.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$pattern) -and $pattern.Current.Value -match '^[a-zA-Z]:\\'){return $pattern}
 }
 throw 'Could not find the installation folder field'
}
function Screenshot($button,$name){
 $r=(Dialog-Window $button).Current.BoundingRectangle
 if($r.IsEmpty -or $r.Width -le 0 -or $r.Height -le 0){return}
 $bmp=New-Object Drawing.Bitmap ([int]$r.Width),([int]$r.Height)
 $graphics=[Drawing.Graphics]::FromImage($bmp)
 try{$graphics.CopyFromScreen([int]$r.X,[int]$r.Y,0,0,$bmp.Size);$bmp.Save((Join-Path $PSScriptRoot "$name.png"),[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bmp.Dispose()}
}
function Snapshot($target){
 Assert (Test-Path -LiteralPath (Join-Path $target 'Peek.exe')) 'Installed host missing'
 Assert ((Get-FileHash -LiteralPath (Join-Path $target 'Peek.exe')).Hash -eq $ExeHash) 'Incorrect host hash'
 foreach($f in @('Peek.exe.config','runtime/PeekUpdateWorker.exe','resources/workbench/index.html','app/modules/AsterHub.Core.dll','licenses/webview2_sdk_LICENSE.txt')){Assert (Test-Path -LiteralPath (Join-Path $target $f)) "Installed file missing: $f"}
 Assert ((Get-ItemPropertyValue -LiteralPath $reg -Name InstallLocation).TrimEnd('\') -eq $target) 'Installation marker missing or at unexpected path'
 Assert (Test-Path -LiteralPath $link) 'Peek Start menu shortcut not created'
 $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut($link)
 Assert ($shortcut.TargetPath -eq (Join-Path $target 'Peek.exe')) 'Shortcut links to the wrong program'
}
try {
 Assert ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq $TestSid) 'Installer worker has the wrong Windows identity'
 Assert ((Get-FileHash -LiteralPath $msi).Hash -eq $MsiHash) 'Installer hash changed'
 Assert (!(Test-Path -LiteralPath $reg) -and !(Test-Path -LiteralPath $inno)) 'Not a clean profile'
 $profileInfo=Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$TestSid)
 $profile=[Environment]::ExpandEnvironmentVariables([string]$profileInfo.ProfileImagePath)
 Assert ((Split-Path -Leaf $profile) -eq (Split-Path -Leaf $PSScriptRoot)) 'Test profile path did not match the isolated user'
 $env:USERPROFILE=$profile;$env:LOCALAPPDATA=Join-Path $profile 'AppData\Local';$env:APPDATA=Join-Path $profile 'AppData\Roaming';$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp';$env:TMP=$env:TEMP
 $programs=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
 New-Item -ItemType Directory -Path $env:TEMP,$programs -Force | Out-Null
 $target=Join-Path $env:LOCALAPPDATA 'Programs\Peek';$link=Join-Path $programs 'Peek.lnk'
 Assert (!(Test-Path -LiteralPath $target) -and !(Test-Path -LiteralPath $link)) 'Existing target or shortcut, refusing to proceed'
 $i=New-Object -ComObject WindowsInstaller.Installer
 $db=$i.OpenDatabase($msi,0);$v=$db.OpenView('SELECT `Value` FROM `Property` WHERE `Property` = ''ProductCode''');$v.Execute();$code=$v.Fetch().StringData(1);$v.Close()
 $args=@('/i',('"'+$msi+'"'),'/norestart','/L*v',('"'+(Join-Path $PSScriptRoot 'install.log')+'"'))
 if($Wizard){
  Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Drawing
  $proc=Start-Process -FilePath $msiexec -ArgumentList $args -PassThru
  $install=Button $proc 'Install'
  Assert ((Dialog-Folder $install).Current.Value.TrimEnd('\') -eq $target) 'Wrong initial wizard folder'
  Screenshot $install '01-initial-folder'
  if($WizardPath -eq 'Cancel'){
   Invoke-Button (Button $proc 'Cancel')
   $result=Wait-Exit $proc
   Assert ($result -eq 1602) "Cancel returned $result (expected 1602)"
   Assert (!(Test-Path -LiteralPath $target) -and !(Test-Path -LiteralPath $link) -and !(Test-Path -LiteralPath $reg)) 'Cancel left installation state'
   $out=[ordered]@{installerHash=$MsiHash;wizard=$true;cancelled=$true;installExit=$result;installStateClean=$true}
   return
  }
  if($WizardPath -eq 'Custom'){
   Invoke-Button (Button $proc 'Browse...')
   $ok=Button $proc 'OK'
   Screenshot $ok '02-browse-folder'
   $target=Join-Path $env:LOCALAPPDATA 'Peek Custom Folder\Peek'
   (Dialog-Folder $ok).SetValue($target)
   Invoke-Button $ok
   $install=Button $proc 'Install'
   Assert ((Dialog-Folder $install).Current.Value.TrimEnd('\') -eq $target) 'Browse did not apply the selected folder'
   Screenshot $install '03-selected-folder'
  }
  Invoke-Button $install
  $close=Button $proc 'Close'
  Screenshot $close '04-complete'
  Invoke-Button $close
 }else{$proc=Start-Process -FilePath $msiexec -ArgumentList ($args+@('/qn')) -WindowStyle Hidden -PassThru}
 $result=Wait-Exit $proc
 Assert ($result -eq 0) "Installation exit $result; see install.log"
 Snapshot $target
 $out=[ordered]@{installerHash=$MsiHash;path=$target;wizard=$Wizard.IsPresent;installExit=$result;verifiedFiles=$true;shortcutVerified=$true}
 $probe=Start-Process -FilePath (Join-Path $target 'Peek.exe') -ArgumentList @('--smoke',('"'+(Join-Path $PSScriptRoot 'app-check')+'"')) -WindowStyle Hidden -PassThru
 try{
  $status=Join-Path $PSScriptRoot 'app-check/widget-ready.json'
  for($n=0;$n -lt 60 -and !(Test-Path -LiteralPath $status) -and !$probe.HasExited;$n++){Start-Sleep -Milliseconds 500}
  Assert (Test-Path -LiteralPath $status) 'Installed app did not display its settings window in the isolated profile'
  $out.appStarted=$true
 }finally{if(!$probe.HasExited){if(!$probe.CloseMainWindow() -or !$probe.WaitForExit(3000)){Stop-Process -Id $probe.Id}}}
} catch{
 $_ | Out-String | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'failure.txt') -Encoding UTF8
} finally{
 if($proc -and !$proc.HasExited){Stop-Process -Id $proc.Id}
 if($code -and $i.ProductState($code) -gt 0){
  $remove=Start-Process -FilePath $msiexec -ArgumentList @('/x',$code,'/qn','/norestart','/L*v',('"'+(Join-Path $PSScriptRoot 'uninstall.log')+'"')) -WindowStyle Hidden -PassThru
  $removeCode=Wait-Exit $remove
  if($out){$out.uninstallExit=$removeCode;$out.uninstallClean=$removeCode -eq 0 -and !(Test-Path -LiteralPath (Join-Path $target 'Peek.exe')) -and !(Test-Path -LiteralPath $link) -and !(Test-Path -LiteralPath $reg)}
 }
 if($out){$out | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'result.json') -Encoding UTF8}
}
'@ | Set-Content -LiteralPath $runner -Encoding UTF8
 $testMode=if($Wizard){" -Wizard -WizardPath $WizardPath"}else{''}
 $credential=[PSCredential]::new("$env:COMPUTERNAME\$stem",$password)
 $worker=Start-Process -FilePath (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Credential $credential -LoadUserProfile -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -TestSid $($user.SID.Value) -MsiHash $identity -ExeHash $hash$testMode" -WorkingDirectory $base -WindowStyle Hidden -PassThru
 if(!$worker.WaitForExit(170000)){throw 'Isolated MSI test exceeded its time budget'}
 $files=Get-ChildItem -LiteralPath $base -File | Where-Object Extension -in @('.txt','.log','.json','.png')
 foreach($file in $files){Copy-Item -LiteralPath $file.FullName -Destination $Evidence}
 $failure=Join-Path $base 'failure.txt';if(Test-Path -LiteralPath $failure){throw (Get-Content -LiteralPath $failure -Raw)}
 $result=Get-Content -LiteralPath (Join-Path $base 'result.json') -Raw | ConvertFrom-Json
 if($WizardPath -eq 'Cancel'){if(!$result.cancelled -or !$result.installStateClean){throw 'Cancel verification did not pass'}}
 elseif(!$result.verifiedFiles -or !$result.shortcutVerified -or !$result.appStarted -or !$result.uninstallClean){throw 'Install/start/uninstall verification did not pass'}
 $result | ConvertTo-Json
} finally{
 if($worker -and !$worker.HasExited){Stop-Process -Id $worker.Id}
 if($user){
  $profile=Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'"
  if($profile -and !$profile.Loaded -and !$profile.Special -and (Split-Path -Leaf $profile.LocalPath) -eq $stem){Remove-CimInstance -InputObject $profile}
  Remove-LocalUser -SID $user.SID
 }
 $actual=(Resolve-Path -LiteralPath $base).Path
 if((Split-Path -Parent $actual) -eq $public -and (Split-Path -Leaf $actual) -eq $stem){Remove-Item -LiteralPath $actual -Recurse -Force}
}
