param([string]$PayloadDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$Bootstrapper)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot
$version=(Get-Content -LiteralPath (Join-Path $project 'PEEK-VERSION') -Raw).Trim()
if(!$PayloadDirectory){$PayloadDirectory=Join-Path $project 'app'}
$PayloadDirectory=(Resolve-Path -LiteralPath $PayloadDirectory).Path
$Compiler=(Resolve-Path -LiteralPath $Compiler).Path
$Bootstrapper=(Resolve-Path -LiteralPath $Bootstrapper).Path
$OutputDirectory=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
$manifest=Get-Content -LiteralPath (Join-Path $PayloadDirectory 'payload-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$metadata=[Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $PayloadDirectory 'PeekHost.exe'))
if($version -notmatch '^\d+\.\d+\.\d+$' -or $manifest.version -ne $version -or $metadata.ProductVersion -ne $version -or $metadata.ProductName -ne 'Peek'){throw 'Peek payload metadata disagrees with PEEK-VERSION'}
$signature=Get-AuthenticodeSignature -LiteralPath $Bootstrapper
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Microsoft WebView2 bootstrapper signature invalid'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$installer=Join-Path $OutputDirectory ("Peek-Setup-v$version.exe")
if(Test-Path -LiteralPath $installer){throw 'Use a fresh installer output target'}
$staging=(New-Item -ItemType Directory (Join-Path $env:TEMP ('peek-inno-build-'+[guid]::NewGuid().ToString('N')))).FullName
try{
 $payload=New-Item -ItemType Directory (Join-Path $staging 'payload')
 $icon=Join-Path $staging 'PeekSetup.ico';$wizard=Join-Path $staging 'wizard'
 $windowsPowerShell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
 & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-setup-icon.ps1') -Out $icon -WizardDirectory $wizard
 if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $icon)){throw 'Setup icon generation failed'}
 $files=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
 foreach($entry in $manifest.files){
  $name=[string]$entry.file
  if($name -notmatch '\A[A-Za-z0-9_ .@+()/\-]+\z' -or ($name.Split('/') | Where-Object {$_ -in '', '.', '..'})){throw "Invalid payload path: $name"}
  $src=Get-Item -LiteralPath (Join-Path $PayloadDirectory $name)
  if($src.Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $src.FullName).Hash -ne $entry.sha256){throw "Payload mismatch: $name"}
  $installName=switch($name){'PeekHost.exe'{'Peek.exe'} 'PeekHost.exe.config'{'Peek.exe.config'} default{$name}}
  if(!$files.Add($installName)){throw "Duplicate install destination: $installName"}
  $dest=Join-Path $payload.FullName $installName
  New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
  Copy-Item -LiteralPath $src.FullName -Destination $dest
 }
 if($files.Count -lt 10 -or !$files.Contains('Peek.exe') -or !$files.Contains('Peek.exe.config')){throw 'Peek install inventory missing host or resources'}
 & $Compiler ("/DReleaseVersion=$version") ("/DInstalledPayload=$($payload.FullName)") ("/DSetupIcon=$icon") ("/DWizardAssets=$wizard") ("/DBootstrapper=$Bootstrapper") ("/DInstallerOutputDir=$OutputDirectory") (Join-Path $PSScriptRoot 'Peek.iss')
 if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $installer)){throw 'Peek installer build failed'}
 Get-FileHash -LiteralPath $installer -Algorithm SHA256
}finally{
 $actual=(Resolve-Path -LiteralPath $staging).Path
 $parent=(Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
 if((Split-Path -Parent $actual) -eq $parent -and (Split-Path -Leaf $actual) -match '^peek-inno-build-[0-9a-f]{32}$'){Remove-Item -LiteralPath $actual -Recurse -Force}
}
