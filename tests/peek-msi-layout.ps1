param([Parameter(Mandatory=$true)][string]$Msi,[Parameter(Mandatory=$true)][string]$Evidence,[string]$PayloadDirectory="$PSScriptRoot/../desktop/app")
$ErrorActionPreference='Stop'
$Msi=(Resolve-Path -LiteralPath $Msi).Path
$PayloadDirectory=(Resolve-Path -LiteralPath $PayloadDirectory).Path
$manifest=Get-Content -LiteralPath (Join-Path $PayloadDirectory 'payload-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$Evidence=(New-Item -ItemType Directory -Force $Evidence).FullName
$target=(New-Item -ItemType Directory (Join-Path $Evidence ('files-'+[guid]::NewGuid().ToString('N')))).FullName
$log=Join-Path $target 'extract.log'
$p=Start-Process -FilePath (Join-Path $env:WINDIR 'System32/msiexec.exe') -ArgumentList @('/a',('"'+$Msi+'"'),'/qn','/norestart',('TARGETDIR="'+$target+'"'),'/L*v',('"'+$log+'"')) -WindowStyle Hidden -Wait -PassThru
if($p.ExitCode -ne 0){throw "MSI administrative extraction failed ($($p.ExitCode)); $log"}
$installedHost=Get-ChildItem -LiteralPath $target -Filter Peek.exe -File -Recurse | Select-Object -First 1
if(!$installedHost){throw "No installed Peek.exe in $target"}
$root=$installedHost.Directory.FullName
foreach($file in $manifest.files){
 $f=switch($file.file){'PeekHost.exe'{'Peek.exe'} 'PeekHost.exe.config'{'Peek.exe.config'} default{$file.file}}
 $actual=Get-Item -LiteralPath (Join-Path $root $f)
 if($actual.Length -ne $file.bytes -or (Get-FileHash -LiteralPath $actual.FullName).Hash -ne $file.sha256){throw "Installed payload mismatch: $f"}
}
$asm=[Reflection.Assembly]::LoadFile($installedHost.FullName)
if($asm.GetManifestResourceNames() -contains 'WidgetPayload'){throw 'Installed host must not embed the portable bundle'}
if($installedHost.VersionInfo.ProductName -ne 'Peek' -or $installedHost.VersionInfo.ProductVersion -ne $manifest.version){throw 'Invalid installed host identity'}
if(Test-Path -LiteralPath (Join-Path $root 'AsterHubWidgets.exe')){throw 'Old host found in install'}
[IO.File]::WriteAllText((Join-Path $Evidence 'installed-host.txt'),$installedHost.FullName)
"PASS: MSI expanded $($manifest.files.Count) matched runtime files, no portable archive. $($installedHost.FullName)"
