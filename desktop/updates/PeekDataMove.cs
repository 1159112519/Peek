using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

internal static class PeekDataMove {
    internal static bool IsHost(string name){return string.Equals(name,"Peek",StringComparison.OrdinalIgnoreCase)||string.Equals(name,"PeekHost",StringComparison.OrdinalIgnoreCase);}
    internal static int Run(string[] args,string restartPath) {
        bool ownerVerified=false;string source=null;
        try {
            if(args.Length!=5)return 2;
            using(var owner=Process.GetProcessById(int.Parse(args[2]))) {
                if(!IsHost(owner.ProcessName)||owner.StartTime.ToUniversalTime().Ticks!=long.Parse(args[3]))return 2;
                source=PeekDataRoot.Read();string target=PeekDataRoot.Destination(source,args[1]);
                using(var ready=EventWaitHandle.OpenExisting(PeekDataRoot.MoveEvent(args[4])))ready.Set();
                ownerVerified=true;
                if(!owner.WaitForExit(30000))throw new IOException("Peek 未退出，原数据未迁移。");
                using(var gate=new Mutex(false,PeekDataRoot.LockKey(PeekDataRoot.Legacy))) {
                    bool acquired;try{acquired=gate.WaitOne(30000);}catch(AbandonedMutexException){acquired=true;}
                    if(!acquired)throw new IOException("无法锁定 Peek 数据，原目录未变更。");
                    try{
                        if(!string.Equals(source,PeekDataRoot.Read(),StringComparison.OrdinalIgnoreCase))throw new IOException("数据目录已变更。");
                        string backup=PeekDataRoot.Migrate(source,target,PeekDataRoot.Locator);
                        PeekDataRoot.Report("迁移完成。原始数据备份："+backup);
                    }finally{gate.ReleaseMutex();}
                }
            }
        } catch(Exception ex) {
            if(!ownerVerified)return 2;
            PeekDataRoot.Report("未完成迁移："+ex.Message);
        }
        using(var p=Process.Start(new ProcessStartInfo(restartPath){UseShellExecute=false}))return p==null?1:0;
    }

}
