param([string]$PayloadDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot
$version=(Get-Content -LiteralPath (Join-Path $project 'PEEK-VERSION') -Raw).Trim()
if(!$PayloadDirectory){$PayloadDirectory=Join-Path $project 'app'}
$PayloadDirectory=(Resolve-Path -LiteralPath $PayloadDirectory).Path
$manifest=Get-Content -LiteralPath (Join-Path $PayloadDirectory 'payload-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$hostExe=Join-Path $PayloadDirectory 'PeekHost.exe'
$meta=[Diagnostics.FileVersionInfo]::GetVersionInfo($hostExe)
if($version -notmatch '^\d+\.\d+\.\d+$' -or $manifest.version -ne $version -or $meta.ProductVersion -ne $version -or $meta.ProductName -ne 'Peek'){throw 'Peek payload metadata disagrees with PEEK-VERSION'}
$OutputDirectory=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$target=Join-Path $OutputDirectory "Peek-Setup-v$version.msi"
if(Test-Path -LiteralPath $target){throw 'Use a fresh installer output target'}
$staging=(New-Item -ItemType Directory (Join-Path $env:TEMP ('peek-msi-build-'+[guid]::NewGuid().ToString('N')))).FullName
function Call($object,[string]$method,[object[]]$parameters){$object.GetType().InvokeMember($method,'InvokeMethod',$null,$object,$parameters)}
function Put($object,[string]$property,[object[]]$parameters){$null=$object.GetType().InvokeMember($property,'SetProperty',$null,$object,$parameters)}
function Get($object,[string]$property,[object[]]$parameters){$object.GetType().InvokeMember($property,'GetProperty',$null,$object,$parameters)}
function Table($name,$columns,$types,$keys,$rows){
 $path=Join-Path $staging "$name.idt"
 $body=@($columns,$types,"$name`t$keys")+@($rows)
 [IO.File]::WriteAllText($path,($body -join "`r`n")+"`r`n",[Text.Encoding]::ASCII)
 try{Call $db Import @($staging,"$name.idt")}catch{throw "Cannot import MSI table ${name}: $_"}
}
function Stream($table,$name,$source){
 $query='INSERT INTO `{0}` (`Name`, `Data`) VALUES (?, ?)' -f $table
 $view=Call $db OpenView @($query);$rec=Call $engine CreateRecord @(2)
 try{Put $rec StringData @(1,$name);$rec.SetStream(2,[string]$source);$view.Execute($rec);$view.Close()}finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($rec);[void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)}
}
function Add-Sequence($table,$rows){Table $table "Action`tCondition`tSequence" "s72`tS255`tI2" 'Action' $rows}
function StableCode($value){
 $sha=[Security.Cryptography.SHA256]::Create();try{$hash=$sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($value))}finally{$sha.Dispose()}
 '{'+[guid]::new([byte[]]$hash[0..15]).ToString().ToUpperInvariant()+'}'
}
$engine=$db=$summary=$null
try{
 $msi=Join-Path $staging 'Peek.msi';$cab=Join-Path $staging 'peek.cab'
 $ddf=Join-Path $staging 'peek.ddf';$fileKey='PeekExecutable'
 # Embed only the installed layout, not the portable extractor or its embedded archive.
 $cabinetInput=(New-Item -ItemType Directory (Join-Path $staging 'inputs')).FullName
 $directives=[Collections.Generic.List[string]]::new()
 $directives.AddRange([string[]]@('.Set Cabinet=ON','.Set Compress=ON','.Set CompressionType=MSZIP','.Set MaxDiskSize=0','.Set CabinetNameTemplate=peek.cab','.Set DiskDirectoryTemplate=.'))
 $directoryRows=[Collections.Generic.List[string]]::new()
 $directoryRows.AddRange([string[]]@("TARGETDIR`t`tSourceDir","LocalAppDataFolder`tTARGETDIR`t.","PeekPrograms`tLocalAppDataFolder`tPrograms","INSTALLFOLDER`tPeekPrograms`tPeek","ProgramMenuFolder`tTARGETDIR`t."))
 $directoryKeys=@{'.'='INSTALLFOLDER'}
 $fileRows=[Collections.Generic.List[string]]::new();$componentRows=[Collections.Generic.List[string]]::new();$featureRows=[Collections.Generic.List[string]]::new();$registryRows=[Collections.Generic.List[string]]::new()
 $componentRows.Add("PeekStartMenu`t{7BC3B221-1A0A-485A-B83E-DD15645683D9}`tProgramMenuFolder`t260`t`tPeekInstallMarker")
 $featureRows.Add("Main`tPeekStartMenu")
 $registryRows.Add("PeekInstallMarker`t1`tSoftware\Peek\Installer`tInstallLocation`t[INSTALLFOLDER]`tPeekStartMenu")
 $count=0
 foreach($entry in ($manifest.files | Sort-Object -Property file)){
  $name=[string]$entry.file
  if($name -notmatch '\A[A-Za-z0-9_ .@+()/\-]+\z' -or $name.StartsWith('/') -or ($name.Split('/') | Where-Object {$_ -in '', '.', '..'})){throw "Unsupported MSI payload path: $name"}
  $source=Join-Path $PayloadDirectory $name
  $file=Get-Item -LiteralPath $source
  if($file.Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $source).Hash -ne $entry.sha256){throw "Peek payload mismatch: $name"}
  $directory='.';$parent='INSTALLFOLDER';$pieces=$name.Split('/')
  for($i=0;$i -lt $pieces.Length-1;$i++){
   $directory=if($directory -eq '.'){$pieces[$i]}else{$directory+'/'+$pieces[$i]}
   if(!$directoryKeys.ContainsKey($directory)){
    $key='D{0:D6}' -f $directoryKeys.Count
    $directoryKeys[$directory]=$key
    $directoryRows.Add("$key`t$parent`t$key|$($pieces[$i])")
   }
   $parent=$directoryKeys[$directory]
  }
  $count++;$id='{0:D6}' -f $count;$stored='F'+$id;$component='C'+$id;$registry='R'+$id
  $fileName=$pieces[-1];$fileVersion='';$key=$stored
  if($name -eq 'PeekHost.exe'){$fileName='Peek.exe';$fileVersion=$meta.FileVersion;$key=$fileKey}
  elseif($name -eq 'PeekHost.exe.config'){$fileName='Peek.exe.config'}
  if($fileName -notmatch '\A[A-Za-z0-9_]{1,8}(\.[A-Za-z0-9_]{1,3})?\z'){$fileName=$stored+'|'+$fileName}
  $guid=StableCode ('Peek.MSI.Loose.File.'+$name.ToLowerInvariant())
  $componentRows.Add("$component`t$guid`t$parent`t260`t`t$registry")
  $registryRows.Add("$registry`t1`tSoftware\Peek\Installer\Files`t$guid`t#1`t$component")
  $featureRows.Add("Main`t$component")
  $fileRows.Add("$key`t$component`t$fileName`t$($file.Length)`t$fileVersion`t`t512`t$count")
  Copy-Item -LiteralPath $source -Destination (Join-Path $cabinetInput $stored)
  $directives.Add("inputs\$stored $key")
 }
 if($count -lt 10 -or !($fileRows -match '^PeekExecutable\t')){throw 'Peek install inventory missing host or resources'}
 [IO.File]::WriteAllLines($ddf,$directives,[Text.Encoding]::ASCII)
 Push-Location -LiteralPath $staging;try{& (Join-Path $env:WINDIR 'System32/makecab.exe') /F peek.ddf | Out-Null;if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $cab)){throw 'Cabinet build failed'}}finally{Pop-Location}
 $engine=New-Object -ComObject WindowsInstaller.Installer
 $db=$engine.OpenDatabase([string]$msi,3)
 $summary=Get $db SummaryInformation @(12)
 foreach($entry in @(@(2,'Installation Database'),@(3,'Peek'),@(4,'Peek'),@(7,'x64;1033'),@(9,('{'+[guid]::NewGuid().ToString().ToUpperInvariant()+'}')),@(14,500),@(15,10),@(19,2))){Put $summary Property @($entry[0],$entry[1])}
 Call $summary Persist @();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($summary);$summary=$null
 $upgrade='{A5890BC5-FE2E-477A-AE36-C0345A415707}'
 Table 'Property' "Property`tValue" "s72`tl0" 'Property' @(
  "ProductName`tPeek","ProductVersion`t$version","ProductLanguage`t1033","Manufacturer`tPeek","ProductCode`t$(StableCode ('Peek.MSI.Loose.Product.'+$version))","UpgradeCode`t$upgrade",
  "ARPPRODUCTICON`tPeekIcon.exe","MSIUSEREALADMINDETECTION`t1","DefaultUIFont`tPeekFont","SecureCustomProperties`tPEEKOLD;PEEKNEW;PEEKINNO32;PEEKINNO64;WEBVIEWUSER32;WEBVIEWUSER64;WEBVIEWMACHINE32;WEBVIEWMACHINE64;NETFXRELEASE;WINDOWSBUILD;INSTALLFOLDER")
 Table 'Directory' "Directory`tDirectory_Parent`tDefaultDir" "s72`tS72`tl255" 'Directory' $directoryRows.ToArray()
 Table 'Component' "Component`tComponentId`tDirectory_`tAttributes`tCondition`tKeyPath" "s72`tS38`ts72`ti2`tS255`tS72" 'Component' $componentRows.ToArray()
 Table 'Feature' "Feature`tFeature_Parent`tTitle`tDescription`tDisplay`tLevel`tDirectory_`tAttributes" "s38`tS38`tL64`tL255`tI2`ti2`tS72`ti2" 'Feature' @("Main`t`tPeek`tPeek`t1`t1`tINSTALLFOLDER`t0")
 Table 'FeatureComponents' "Feature_`tComponent_" "s38`ts72" "Feature_`tComponent_" $featureRows.ToArray()
 Table 'File' "File`tComponent_`tFileName`tFileSize`tVersion`tLanguage`tAttributes`tSequence" "s72`ts72`tl255`ti4`tS72`tS20`tI2`ti2" 'File' $fileRows.ToArray()
 Table 'Media' "DiskId`tLastSequence`tDiskPrompt`tCabinet`tVolumeLabel`tSource" "i2`ti2`tL64`tS255`tS32`tS72" 'DiskId' @("1`t$count`t`t#peek.cab`t`t")
 Table 'Registry' "Registry`tRoot`tKey`tName`tValue`tComponent_" "s72`ti2`tl255`tL255`tL0`ts72" 'Registry' $registryRows.ToArray()
 Table 'Shortcut' "Shortcut`tDirectory_`tName`tComponent_`tTarget`tArguments`tDescription`tHotkey`tIcon_`tIconIndex`tShowCmd`tWkDir`tDisplayResourceDLL`tDisplayResourceId`tDescriptionResourceDLL`tDescriptionResourceId" "s72`ts72`tl128`ts72`ts72`tS255`tL255`tI2`tS72`tI2`tI2`tS72`tS255`tI2`tS255`tI2" 'Shortcut' @("PeekShortcut`tProgramMenuFolder`tPeek`tPeekStartMenu`t[#$fileKey]`t`tPeek system monitor`t`tPeekIcon.exe`t0`t1`tINSTALLFOLDER`t`t`t`t")
 Table 'Upgrade' "UpgradeCode`tVersionMin`tVersionMax`tLanguage`tAttributes`tRemove`tActionProperty" "s38`tS20`tS20`tS255`ti4`tS255`ts72" "UpgradeCode`tVersionMin`tVersionMax`tLanguage`tAttributes" @(
  "$upgrade`t`t$version`t`t512`t`tPEEKOLD","$upgrade`t$version`t`t`t2`t`tPEEKNEW")
 $inno='Software\Microsoft\Windows\CurrentVersion\Uninstall\{B86A0A48-66C9-4C84-B53C-6BA90801F43F}_is1'
 $edge='Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
 Table 'AppSearch' "Property`tSignature_" "s72`ts72" "Property`tSignature_" @('PEEKPREVIOUSPATH','PEEKINNO32','PEEKINNO64','WEBVIEWUSER32','WEBVIEWUSER64','WEBVIEWMACHINE32','WEBVIEWMACHINE64','NETFXRELEASE','WINDOWSBUILD'|ForEach-Object{"$_`t$_"})
 # AppSearch queries Signature even for raw RegLocator lookups. The table must
 # exist, but those raw registry values must not be described as file signatures.
 Table 'Signature' "Signature`tFileName`tMinVersion`tMaxVersion`tMinSize`tMaxSize`tMinDate`tMaxDate`tLanguages" "s72`ts255`tS20`tS20`tI4`tI4`tI4`tI4`tS255" 'Signature' @()
 Table 'RegLocator' "Signature_`tRoot`tKey`tName`tType" "s72`ti2`ts255`tS255`tI2" 'Signature_' @(
  "PEEKPREVIOUSPATH`t1`tSoftware\Peek\Installer`tInstallLocation`t2",
  "PEEKINNO32`t1`t$inno`tUninstallString`t2","PEEKINNO64`t1`t$inno`tUninstallString`t18",
  "WEBVIEWUSER32`t1`t$edge`tpv`t2","WEBVIEWUSER64`t1`t$edge`tpv`t18","WEBVIEWMACHINE32`t2`t$edge`tpv`t2","WEBVIEWMACHINE64`t2`t$edge`tpv`t18",
  "NETFXRELEASE`t2`tSOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`tRelease`t18", "WINDOWSBUILD`t2`tSOFTWARE\Microsoft\Windows NT\CurrentVersion`tCurrentBuildNumber`t18")
 Table 'LaunchCondition' "Condition`tDescription" "s255`tl255" 'Condition' @(
  ('Installed OR (VersionNT64 AND WINDOWSBUILD >= 17763)' + "`tPeek requires 64-bit Windows 10 (1809) or later."),
  ('Installed OR NOT PEEKNEW' + "`tA newer version of Peek is already installed."),
  ('Installed OR (NOT PEEKINNO32 AND NOT PEEKINNO64)' + "`tUninstall the previous Inno Setup edition of Peek from Windows Settings, then run this MSI again. Your Peek preferences are retained."),
  ('Installed OR (NETFXRELEASE >= "#461808")' + "`tInstall Microsoft .NET Framework 4.7.2 or newer, then run this MSI again."),
  ('Installed OR (WEBVIEWUSER32 AND WEBVIEWUSER32 <> "0.0.0.0") OR (WEBVIEWUSER64 AND WEBVIEWUSER64 <> "0.0.0.0") OR (WEBVIEWMACHINE32 AND WEBVIEWMACHINE32 <> "0.0.0.0") OR (WEBVIEWMACHINE64 AND WEBVIEWMACHINE64 <> "0.0.0.0")' + "`tInstall Microsoft Edge WebView2 Runtime, then run this MSI again."))
 Table 'CustomAction' "Action`tType`tSource`tTarget`tExtendedType" "s72`ti2`tS72`tS255`tI4" 'Action' @("SetInstallLocation`t51`tARPINSTALLLOCATION`t[INSTALLFOLDER]`t","RestoreInstallLocation`t51`tINSTALLFOLDER`t[PEEKPREVIOUSPATH]`t")
 Add-Sequence 'InstallExecuteSequence' @(
  "FindRelatedProducts`t`t25","AppSearch`t`t50","LaunchConditions`t`t100","ValidateProductID`t`t700","CostInitialize`t`t800","FileCost`t`t900","RestoreInstallLocation`tPEEKPREVIOUSPATH AND NOT INSTALLFOLDER AND (Installed OR PEEKOLD)`t950","CostFinalize`t`t1000","SetInstallLocation`t`t1100",
  "InstallValidate`t`t1400","InstallInitialize`t`t1500","RemoveExistingProducts`t`t1550","ProcessComponents`t`t1600","UnpublishFeatures`t`t1800","RemoveShortcuts`t`t3200","RemoveFiles`t`t3500","RemoveRegistryValues`t`t3600","InstallFiles`t`t4000","CreateShortcuts`t`t4500","WriteRegistryValues`t`t5000","RegisterUser`t`t6000","RegisterProduct`t`t6100","PublishFeatures`t`t6300","PublishProduct`t`t6400","InstallFinalize`t`t6600")
 Add-Sequence 'AdminExecuteSequence' @(
  "CostInitialize`t`t800","FileCost`t`t900","CostFinalize`t`t1000","InstallValidate`t`t1400","InstallInitialize`t`t1500","InstallAdminPackage`t`t3900","InstallFiles`t`t4000","InstallFinalize`t`t6600")
 Add-Sequence 'InstallUISequence' @(
  "FindRelatedProducts`t`t25","AppSearch`t`t50","LaunchConditions`t`t100","ValidateProductID`t`t700","CostInitialize`t`t800","FileCost`t`t900","RestoreInstallLocation`tPEEKPREVIOUSPATH AND NOT INSTALLFOLDER AND (Installed OR PEEKOLD)`t950","CostFinalize`t`t1000","WelcomeDlg`tNOT Installed AND NOT PEEKOLD`t1230","ProgressDlg`t`t1280","ExecuteAction`t`t1300","FinishDlg`tNOT Installed`t-1")
 Table 'TextStyle' "TextStyle`tFaceName`tSize`tColor`tStyleBits" "s72`ts32`ti2`tI4`tI2" 'TextStyle' @("PeekFont`tSegoe UI`t9`t`t0","PeekHeading`tSegoe UI`t13`t`t1")
 Table 'Dialog' "Dialog`tHCentering`tVCentering`tWidth`tHeight`tAttributes`tTitle`tControl_First`tControl_Default`tControl_Cancel" "s72`ti2`ti2`ti2`ti2`ti4`tL128`ts50`tS50`tS50" 'Dialog' @(
  'WelcomeDlg|50|50|318|163|3|Peek Setup|Path|Install|Cancel',
  'BrowseDlg|50|50|318|218|3|Choose installation folder|Drive|OK|Cancel',
  'ProgressDlg|50|50|318|106|17|Peek Setup|Heading||',
  'FinishDlg|50|50|318|118|3|Peek Setup|Close|Close|Close' | ForEach-Object {$_.Replace('|',"`t")})
 Table 'Control' "Dialog_`tControl`tType`tX`tY`tWidth`tHeight`tAttributes`tProperty`tText`tControl_Next`tHelp" "s72`ts50`ts20`ti2`ti2`ti2`ti2`ti4`tS50`tL0`tS50`tL50" "Dialog_`tControl" @(
  'WelcomeDlg|Brand|Icon|17|14|24|24|4194307||PeekSetupIcon||',
  'WelcomeDlg|Heading|Text|52|13|249|19|3||{\PeekHeading}Install Peek||',
  'WelcomeDlg|Description|Text|52|36|249|16|3||Version [ProductVersion]  /  For this Windows user||',
  'WelcomeDlg|FolderLabel|Text|17|67|284|13|3||Installation folder||',
  'WelcomeDlg|Path|PathEdit|17|85|216|18|7|INSTALLFOLDER||Browse|',
  'WelcomeDlg|Browse|PushButton|241|85|60|18|3||Browse...|Install|',
  'WelcomeDlg|Install|PushButton|175|127|60|19|3||Install|Cancel|',
  'WelcomeDlg|Cancel|PushButton|241|127|60|19|3||Cancel|Path|',
  'BrowseDlg|DriveLabel|Text|17|14|284|12|3||Look in:||',
  'BrowseDlg|Drive|DirectoryCombo|17|29|284|18|3|INSTALLFOLDER||Folders|',
  'BrowseDlg|Folders|DirectoryList|17|54|284|78|7|INSTALLFOLDER||Path|',
  'BrowseDlg|FolderLabel|Text|17|139|284|12|3||Folder path:||',
  'BrowseDlg|Path|PathEdit|17|154|284|18|7|INSTALLFOLDER||OK|',
  'BrowseDlg|OK|PushButton|175|185|60|19|3||OK|Cancel|',
  'BrowseDlg|Cancel|PushButton|241|185|60|19|3||Cancel|Drive|',
  'ProgressDlg|Brand|Icon|17|14|24|24|4194307||PeekSetupIcon||',
  'ProgressDlg|Heading|Text|52|15|249|19|3||{\PeekHeading}Installing Peek||',
  'ProgressDlg|Progress|ProgressBar|17|63|284|10|65537||||',
  'FinishDlg|Brand|Icon|17|14|24|24|4194307||PeekSetupIcon||',
  'FinishDlg|Heading|Text|52|13|249|19|3||{\PeekHeading}Peek is installed||',
  'FinishDlg|Description|Text|52|36|249|25|3||Open Peek from the Windows Start menu.||',
  'FinishDlg|Close|PushButton|241|82|60|19|3||Close|Close|' | ForEach-Object {$_.Replace('|',"`t")})
 Table 'ControlEvent' "Dialog_`tControl_`tEvent`tArgument`tCondition`tOrdering" "s72`ts50`ts50`tl255`tS255`tI2" "Dialog_`tControl_`tEvent`tArgument`tCondition" @(
  'WelcomeDlg|Browse|SetTargetPath|INSTALLFOLDER|1|1',
  'WelcomeDlg|Browse|[PeekBrowseOriginal]|[INSTALLFOLDER]|1|2',
  'WelcomeDlg|Browse|SpawnDialog|BrowseDlg|1|3',
  'BrowseDlg|OK|SetTargetPath|INSTALLFOLDER|1|1',
  'BrowseDlg|OK|EndDialog|Return|1|2',
  'BrowseDlg|Cancel|[INSTALLFOLDER]|[PeekBrowseOriginal]|1|1',
  'BrowseDlg|Cancel|SetTargetPath|INSTALLFOLDER|1|2',
  'BrowseDlg|Cancel|EndDialog|Return|1|3',
  'WelcomeDlg|Install|SetTargetPath|INSTALLFOLDER|1|1',
  'WelcomeDlg|Install|EndDialog|Return|1|2',
  'WelcomeDlg|Cancel|EndDialog|Exit|1|1',
  'FinishDlg|Close|EndDialog|Return|1|1' | ForEach-Object {$_.Replace('|',"`t")})
 Table 'EventMapping' "Dialog_`tControl_`tEvent`tAttribute" "s72`ts50`ts50`ts50" "Dialog_`tControl_`tEvent" @("ProgressDlg`tProgress`tSetProgress`tProgress")
 Table 'Icon' "Name`tData" "s72`tv0" 'Name' @()
 Table 'Binary' "Name`tData" "s72`tv0" 'Name' @()
 $brandIcon=Join-Path $PSScriptRoot 'PeekSetup.ico'
 Stream 'Icon' 'PeekIcon.exe' $brandIcon
 Stream 'Binary' 'PeekSetupIcon' $brandIcon
 Stream '_Streams' 'peek.cab' $cab
 Call $db Commit @();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($db);$db=$null
 Copy-Item -LiteralPath $msi -Destination $target
 Get-FileHash -LiteralPath $target -Algorithm SHA256
}finally{
 foreach($object in @($summary,$db,$engine)){if($null -ne $object){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($object)}}
 # Clean only this verified, uniquely allocated temporary build directory.
 $verified=(Resolve-Path -LiteralPath $staging).Path
 $temp=(Resolve-Path -LiteralPath $env:TEMP).Path.TrimEnd('\')
 if($verified.StartsWith($temp+'\peek-msi-build-',[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $verified) -eq $temp){Remove-Item -LiteralPath $verified -Force -Recurse}
}
