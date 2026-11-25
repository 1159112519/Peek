param([Parameter(Mandatory=$true)][string]$PeekExe,[Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$Bootstrapper)
$ErrorActionPreference='Stop'
$project=(Split-Path $PSScriptRoot)
$version=(Get-Content -LiteralPath (Join-Path $project 'PEEK-VERSION') -Raw).Trim()
$PeekExe=(Resolve-Path -LiteralPath $PeekExe).Path
$Compiler=(Resolve-Path -LiteralPath $Compiler).Path
$Bootstrapper=(Resolve-Path -LiteralPath $Bootstrapper).Path
$OutputDirectory=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
$metadata=[Diagnostics.FileVersionInfo]::GetVersionInfo($PeekExe)
if($version -notmatch '^\d+\.\d+\.\d+$' -or $metadata.ProductVersion -ne $version -or $metadata.ProductName -ne 'Peek'){throw 'Peek EXE metadata disagrees with PEEK-VERSION'}
$signature=Get-AuthenticodeSignature -LiteralPath $Bootstrapper
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'Microsoft WebView2 bootstrapper signature invalid'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$installer=Join-Path $OutputDirectory ("Peek-Setup-v$version.exe")
if(Test-Path -LiteralPath $installer){throw 'Use a fresh installer output target'}
& $Compiler ("/DReleaseVersion=$version") ("/DProjectRoot=$project") ("/DPeekExe=$PeekExe") ("/DBootstrapper=$Bootstrapper") ("/DInstallerOutputDir=$OutputDirectory") (Join-Path $PSScriptRoot 'Peek.iss')
if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $installer)){throw 'Peek installer build failed'}
Get-FileHash -LiteralPath $installer,$PeekExe -Algorithm SHA256
