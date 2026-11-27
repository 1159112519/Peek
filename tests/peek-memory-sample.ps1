param([int]$RootPid)
$ErrorActionPreference='Stop'
$tree=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe' or ProcessId=$RootPid")
$root=$tree | Where-Object ProcessId -eq $RootPid
if(!$root){'[]';return}
$list=[Collections.Generic.List[object]]::new();$list.Add($root)
for($i=0;$i -lt $list.Count;$i++){$parent=$list[$i];foreach($x in $tree | Where-Object {$_.ParentProcessId -eq $parent.ProcessId -and $_.Name -eq 'msedgewebview2.exe' -and $_.CreationDate -ge $parent.CreationDate}){$list.Add($x)}}
$perf=@{};Get-CimInstance Win32_PerfRawData_PerfProc_Process | ForEach-Object {$perf[[int]$_.IDProcess]=$_}
$result=@(foreach($x in $list){$m=$perf[[int]$x.ProcessId];if($m){$role=if($x.CommandLine -match '--type=([^ ]+)'){$Matches[1]}elseif($x.ProcessId -eq $RootPid){'host'}else{'browser'};[pscustomobject]@{pid=$x.ProcessId;role=$role;privateWorkingSet=[uint64]$m.WorkingSetPrivate;workingSet=[uint64]$m.WorkingSet;privateCommit=[uint64]$m.PrivateBytes}}})
ConvertTo-Json -InputObject $result -Compress
