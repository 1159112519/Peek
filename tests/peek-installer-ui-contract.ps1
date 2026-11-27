param([Parameter(Mandatory=$true)][string]$Msi)
$ErrorActionPreference='Stop'
$i=New-Object -ComObject WindowsInstaller.Installer
$d=$i.OpenDatabase((Resolve-Path -LiteralPath $Msi).Path,0)
function Require-Row([string]$sql,[string]$description){
 try{$v=$d.OpenView($sql)}catch{throw "Cannot query $description ($sql): $_"}
 try{$v.Execute();if(!$v.Fetch()){throw "Missing $description"}}finally{$v.Close()}
}
Require-Row 'SELECT `Control` FROM `Control` WHERE `Type` = ''PathEdit'' AND `Property` = ''INSTALLFOLDER''' 'installation directory field'
Require-Row 'SELECT `Control` FROM `Control` WHERE `Type` = ''DirectoryList'' AND `Property` = ''INSTALLFOLDER''' 'Windows folder browser'
Require-Row 'SELECT `Control_` FROM `ControlEvent` WHERE `Event` = ''SetTargetPath'' AND `Argument` = ''INSTALLFOLDER''' 'directory validation and commit'
Require-Row 'SELECT `Control` FROM `Control` WHERE `Type` = ''Icon''' 'wizard brand icon'
Require-Row 'SELECT `Name` FROM `Binary` WHERE `Name` = ''PeekSetupIcon''' 'embedded icon'
Require-Row 'SELECT `Property` FROM `AppSearch` WHERE `Property` = ''PEEKPREVIOUSPATH''' 'stored upgrade path lookup'
Write-Output 'MSI directory picker and brand icon contract passed.'
