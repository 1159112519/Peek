param([Parameter(Mandatory=$true)][string]$Msi,[Parameter(Mandatory=$true)][string]$BuiltHost,[Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$Msi=(Resolve-Path -LiteralPath $Msi).Path;$BuiltHost=(Resolve-Path -LiteralPath $BuiltHost).Path
$Evidence=(New-Item -ItemType Directory -Force $Evidence).FullName
$target=(New-Item -ItemType Directory (Join-Path $Evidence ('installed-'+[guid]::NewGuid().ToString('N')))).FullName
$msiexec=Join-Path $env:WINDIR 'System32/msiexec.exe'
$key='HKCU:\Software\Peek\Installer';$old='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{B86A0A48-66C9-4C84-B53C-6BA90801F43F}_is1'
$link=Join-Path ([Environment]::GetFolderPath('Programs')) 'Peek.lnk'
if((Test-Path $key) -or (Test-Path $old) -or (Test-Path -LiteralPath $link)){throw 'Existing Peek installation or shortcut; refusing to touch it.'}
$installer=New-Object -ComObject WindowsInstaller.Installer;$db=$installer.OpenDatabase($Msi,0)
$view=$db.OpenView('SELECT `Value` FROM `Property` WHERE `Property` = ''ProductCode''');$view.Execute();$code=$view.Fetch().StringData(1);$view.Close();$view=$db=$null
if($installer.ProductState($code) -gt 0){throw 'The test product is already installed.'}
function Run-Msi($argsList){$p=Start-Process -FilePath $msiexec -ArgumentList $argsList -WindowStyle Hidden -Wait -PassThru;$p.ExitCode}
$doCleanup=$false
try{
 $doCleanup=$true
 $result=Run-Msi @('/i',('"'+$Msi+'"'),'/qn','/norestart',('INSTALLFOLDER="'+$target+'"'),'/L*v',('"'+(Join-Path $Evidence 'install.log')+'"'))
 if($result -ne 0){throw "MSI install exited $result; see install.log"}
 $installed=Join-Path $target 'Peek.exe'
 if((Get-FileHash -LiteralPath $BuiltHost).Hash -ne (Get-FileHash -LiteralPath $installed).Hash){throw 'MSI installed host differs from the build output'}
 foreach($file in @('Peek.exe.config','runtime/PeekUpdateWorker.exe','resources/workbench/index.html','app/modules/AsterHub.Core.dll')){if(!(Test-Path -LiteralPath (Join-Path $target $file))){throw "Missing installed resource: $file"}}
 if((Get-ItemProperty -LiteralPath $key).InstallLocation.TrimEnd('\') -ne $target -or !(Test-Path -LiteralPath $link)){throw 'MSI install marker/shortcut missing'}
 Write-Output "PASS: installed version $((Get-Item -LiteralPath $installed).VersionInfo.ProductVersion) in a private directory, hash equal, registration and Start menu shortcut verified."
}finally{
 if($doCleanup -and $installer.ProductState($code) -gt 0){$result=Run-Msi @('/x',$code,'/qn','/norestart','/L*v',('"'+(Join-Path $Evidence 'uninstall.log')+'"'));if($result -ne 0){throw "MSI uninstall exited $result"}}
 if((Test-Path -LiteralPath (Join-Path $target 'Peek.exe')) -or (Test-Path -LiteralPath $link) -or (Get-ItemProperty -LiteralPath $key -Name InstallLocation -ErrorAction SilentlyContinue)){throw 'Test MSI uninstall did not remove its files/shortcut/marker'}
}
Write-Output 'PASS: test product quietly uninstalled without touching the running portable app or its preferences.'
