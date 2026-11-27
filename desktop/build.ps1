param([switch]$WidgetOnly = $true)
$ErrorActionPreference='Stop'
if(-not $WidgetOnly){throw 'This repository builds Peek only.'}
$previewRoot=$PSScriptRoot
Push-Location (Join-Path $previewRoot 'web')
try { & npm.cmd run build; if($LASTEXITCODE -ne 0){throw 'Frontend build failed'} } finally { Pop-Location }
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$appRoot=Join-Path $previewRoot 'app'
$fontOutput=Join-Path $appRoot 'resources/fonts'
New-Item -ItemType Directory -Path $fontOutput -Force | Out-Null
Copy-Item -Path (Join-Path $previewRoot 'host/fonts/*') -Destination $fontOutput -Force
New-Item -ItemType Directory -Path (Join-Path $appRoot 'licenses') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $previewRoot 'web/public/fonts/HarmonyOS-Sans-LICENSE.txt') -Destination (Join-Path $appRoot 'licenses/HarmonyOS-Sans-LICENSE.txt') -Force
$localeOutput=Join-Path $appRoot 'resources/locales'
New-Item -ItemType Directory -Path $localeOutput -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $previewRoot 'web/src/i18n/en.json') -Destination (Join-Path $localeOutput 'en.json') -Force
$brandOutput=Join-Path $appRoot 'resources/brand-icons'
New-Item -ItemType Directory -Path $brandOutput -Force | Out-Null
Copy-Item -Path (Join-Path $previewRoot 'host/brand-icons/*') -Destination $brandOutput -Recurse -Force
& (Join-Path $previewRoot 'scripts/build-backend.ps1') -Root $previewRoot
$framework=Split-Path $compiler
$refs=@('System.Windows.Forms.dll','System.Drawing.dll','System.dll','System.Core.dll','System.Web.Extensions.dll','System.Xaml.dll',(Join-Path $framework 'WPF/WindowsBase.dll'),(Join-Path $framework 'WPF/PresentationCore.dll'),(Join-Path $framework 'WPF/PresentationFramework.dll'),(Join-Path $framework 'WPF/UIAutomationClient.dll'),(Join-Path $framework 'WPF/UIAutomationTypes.dll'),(Join-Path $appRoot 'runtime/managed/Microsoft.Web.WebView2.Core.dll'),(Join-Path $appRoot 'runtime/managed/Microsoft.Web.WebView2.Wpf.dll'),(Join-Path $appRoot 'app/modules/AsterHub.Core.dll'),(Join-Path $appRoot 'app/modules/AsterHub.Storage.dll'),(Join-Path $appRoot 'app/modules/AsterHub.Platform.Windows.dll'))
$exe=if($WidgetOnly){'PeekHost.exe'}else{'AsterHub.exe'}
$entry=if($WidgetOnly){'WidgetHost'}else{'WorkbenchHost'}
$exeIcon=if($WidgetOnly){'host/peek-icons/01/app.ico'}else{'host/AsterHub.Process.ico'}
$argsBuild=@(('/main:'+$entry),'/nologo','/target:winexe','/platform:x64','/optimize+',('/out:'+(Join-Path $appRoot $exe)),('/win32icon:'+(Join-Path $previewRoot $exeIcon)))
if($WidgetOnly){$argsBuild+='/define:ASTERHUB_WIDGET'}
foreach($reference in $refs){$argsBuild+=('/reference:'+$reference)}
if($WidgetOnly){
 $peekOutput=Join-Path $appRoot 'resources/peek-icons'
 New-Item -ItemType Directory -Path $peekOutput -Force | Out-Null
 foreach($id in 1..12){$key='{0:00}' -f $id;$target=New-Item -ItemType Directory -Path (Join-Path $peekOutput $key) -Force;Copy-Item -LiteralPath (Join-Path $previewRoot "host/peek-icons/$key/app.ico") -Destination $target.FullName -Force}
}
$argsBuild+=('/win32manifest:'+(Join-Path $previewRoot 'host/AsterHub.manifest'))
$protocol=Join-Path $previewRoot 'updates/PeekUpdateProtocol.cs'
$dataRoot=Join-Path $previewRoot 'updates/PeekDataRoot.cs'
$worker=Join-Path $appRoot 'runtime/PeekUpdateWorker.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:'+$worker) $protocol $dataRoot (Join-Path $previewRoot 'updates/PeekDataMove.cs') (Join-Path $previewRoot 'updates/PeekUpdateWorker.cs')
if($LASTEXITCODE -ne 0){throw 'Peek update worker build failed'}
$argsBuild+=$protocol
$argsBuild+=$dataRoot
$argsBuild+=Join-Path $previewRoot 'updates/PeekDataMove.cs'
$argsBuild+=@(Get-ChildItem (Join-Path $previewRoot 'host') -Filter *.cs -Recurse | ForEach-Object {$_.FullName})
$releaseSource=$null
try {
 if($WidgetOnly){
  $version=(Get-Content -LiteralPath (Join-Path $previewRoot 'PEEK-VERSION') -Raw).Trim()
  if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid Peek release version'}
  $releaseSource=Join-Path $appRoot ('peek-version-'+[guid]::NewGuid().ToString('N')+'.cs')
  ('internal static class PeekRelease { internal const string Version="'+$version+'"; }') | Set-Content -LiteralPath $releaseSource -Encoding utf8
  $argsBuild+=$releaseSource
 }
 & $compiler @argsBuild
} finally { if($releaseSource -and (Test-Path -LiteralPath $releaseSource)){Remove-Item -LiteralPath $releaseSource} }
if($LASTEXITCODE -ne 0){throw 'Windows host build failed'}
Copy-Item -LiteralPath (Join-Path $previewRoot 'host/App.config') -Destination (Join-Path $appRoot ($exe+'.config')) -Force
if($WidgetOnly){ & node (Join-Path $previewRoot 'scripts/package-app.mjs') --widget }else{ & node (Join-Path $previewRoot 'scripts/package-app.mjs') }
if($LASTEXITCODE -ne 0){throw 'Payload inventory failed'}
Write-Output ('ASTERHUB_EXE='+(Join-Path $appRoot $exe))
