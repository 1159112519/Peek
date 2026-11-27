param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Evidence,[string]$PayloadDirectory="$PSScriptRoot/../desktop/app")
$ErrorActionPreference='Stop'
$Installer=(Resolve-Path -LiteralPath $Installer).Path
$Evidence=(New-Item -ItemType Directory -Force $Evidence).FullName
$PayloadDirectory=(Resolve-Path -LiteralPath $PayloadDirectory).Path
$stem='PeekInnoQA-'+[Guid]::NewGuid().ToString('N').Substring(0,9)
$public=(Resolve-Path -LiteralPath (Join-Path $env:PUBLIC 'Documents')).Path
$base=(New-Item -ItemType Directory -Path (Join-Path $public $stem)).FullName
$user=$worker=$null
try{
 $password=ConvertTo-SecureString ('Q9!k'+[Guid]::NewGuid().ToString('N')) -AsPlainText -Force
 $user=New-LocalUser -Name $stem -Password $password -Description 'Temporary Peek Inno Setup QA profile'
 Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
 & (Join-Path $env:WINDIR 'System32/icacls.exe') $base '/grant' ('*'+$user.SID.Value+':(OI)(CI)M') | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Could not grant the QA user access to its test folder'}
 Copy-Item -LiteralPath $Installer -Destination (Join-Path $base 'Peek-ui-qa.exe')
 Copy-Item -LiteralPath (Join-Path $PayloadDirectory 'payload-manifest.json') -Destination $base
 $runner=Join-Path $base 'run.ps1'
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'peek-inno-wizard-runner.ps1') -Destination $runner
 $hash=(Get-FileHash -LiteralPath $Installer).Hash
 $credential=[PSCredential]::new("$env:COMPUTERNAME\$stem",$password)
 $worker=Start-Process -FilePath (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Credential $credential -LoadUserProfile -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -TestSid $($user.SID.Value) -Hash $hash" -WorkingDirectory $base -WindowStyle Hidden -PassThru
 if(!$worker.WaitForExit(195000)){throw 'Inno Setup wizard test timed out'}
 foreach($file in (Get-ChildItem -LiteralPath $base -File | Where-Object {$_.Name -ne 'payload-manifest.json' -and $_.Extension -in '.txt','.log','.json','.png'})){Copy-Item -LiteralPath $file.FullName -Destination $Evidence}
 $failure=Join-Path $base 'failure.txt';if(Test-Path -LiteralPath $failure){throw (Get-Content -LiteralPath $failure -Raw)}
 Get-Content -LiteralPath (Join-Path $base 'result.json') -Raw
}finally{
 if($worker -and !$worker.HasExited){Stop-Process -Id $worker.Id}
 if($user){
  $profile=Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'"
  if($profile -and !$profile.Loaded -and !$profile.Special -and (Split-Path -Leaf $profile.LocalPath) -eq $stem){Remove-CimInstance -InputObject $profile}
  Remove-LocalUser -SID $user.SID
 }
 $actual=(Resolve-Path -LiteralPath $base).Path
 if((Split-Path -Parent $actual) -eq $public -and (Split-Path -Leaf $actual) -eq $stem){Remove-Item -LiteralPath $actual -Recurse -Force}
}
