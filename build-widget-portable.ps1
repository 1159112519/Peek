param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=(Resolve-Path (Join-Path $PSScriptRoot 'desktop')).Path
$payload=(Resolve-Path (Join-Path $root 'app')).Path
$manifest=Get-Content -LiteralPath (Join-Path $payload 'payload-manifest.json') -Raw | ConvertFrom-Json
$version=(Get-Content -LiteralPath (Join-Path $root 'PEEK-VERSION') -Raw).Trim()
if($version -notmatch '^\d+\.\d+\.\d+$' -or $manifest.version -ne $version){throw 'Unexpected Peek payload version'}
$hostVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $payload 'AsterHubWidgets.exe'))
if($hostVersion.ProductVersion -ne $version -or $hostVersion.ProductName -ne 'Peek'){throw 'Unexpected embedded Peek host metadata'}
$entries=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($item in $manifest.files){$entries.Add($item.file,$item)}
if(-not $entries.ContainsKey('AsterHubWidgets.exe') -or $entries.ContainsKey('AsterHub.exe')){throw 'Unexpected executable identity'}
$archive=Join-Path $PSScriptRoot ('portable.' + [guid]::NewGuid().ToString('N') + '.payload')
$info=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($name in @($entries.Keys | Sort-Object)+@('payload-manifest.json')){
  $p=[IO.Path]::GetFullPath((Join-Path $payload $name))
  if(-not $p.StartsWith($payload+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw "Invalid payload path: $name"}
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($info,$p,$name,[IO.Compression.CompressionLevel]::Optimal)
 }
} finally {$info.Dispose()}
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
$sha=[Security.Cryptography.SHA256]::Create()
try{
 if($zip.Entries.Count -ne $entries.Count+1){throw 'Invalid embedded inventory'}
 foreach($entry in $zip.Entries){
  if($entry.FullName -eq 'payload-manifest.json'){continue}
  $item=$entries[$entry.FullName]
  $stream=$entry.Open()
  try {$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')} finally {$stream.Dispose()}
  if($entry.Length -ne $item.bytes -or $actual -ne $item.sha256){throw ('Embedded payload mismatch: '+$entry.FullName)}
 }
} finally {$sha.Dispose();$zip.Dispose()}
$hash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
$meta="$archive.cs"
"internal static class PortableBundle { internal const string Id=`"$($hash.Substring(0,24))`"; internal const string Version=`"$version`"; }" | Set-Content -LiteralPath $meta -Encoding utf8
if(Test-Path -LiteralPath $OutputDirectory){throw 'Use a new output directory'}
$dir=(New-Item -Path $OutputDirectory -ItemType Directory).FullName
$exe=Join-Path $dir 'Peek.exe'
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ '/r:System.IO.Compression.dll' '/r:System.Windows.Forms.dll' ('/win32manifest:'+(Join-Path $root 'host/AsterHub.manifest')) ('/win32icon:'+(Join-Path $root 'host/peek-icons/01/app.ico')) ('/resource:'+$archive+',WidgetPayload') ('/out:'+$exe) (Join-Path $PSScriptRoot 'widget-portable.cs') $meta
if($LASTEXITCODE -ne 0){throw 'Portable EXE build failed'}
Remove-Item -LiteralPath $archive,$meta
Get-Item -LiteralPath $exe | Select-Object FullName,Length
Get-FileHash -LiteralPath $exe -Algorithm SHA256
