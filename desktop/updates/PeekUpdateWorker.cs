using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

internal static class PeekUpdateWorker {
 static readonly TimeSpan PreflightTimeout=TimeSpan.FromSeconds(30),ExitTimeout=TimeSpan.FromSeconds(30),LaunchTimeout=TimeSpan.FromSeconds(50);
 static int Main(string[] args){
  PeekUpdateJob job=null;
  bool approved=false,started=false,msiCommitted=false;
  string staged=null,backup=null;
  try{
   if(args.Length!=1)return 2;
   job=PeekUpdateJob.Load(args[0]);
   string standard=job.Smoke?PeekDataRoot.Default:PeekDataRoot.Read();
   if(job.Smoke){
    string testFolder=Path.GetDirectoryName(job.DataRoot);
    if(string.IsNullOrEmpty(testFolder)||PeekUpdateProtocol.Same(job.DataRoot,standard)||!PeekUpdateProtocol.Same(Path.GetDirectoryName(job.Target),testFolder))throw new InvalidDataException("Invalid test target");
   }else if(!PeekUpdateProtocol.Same(job.DataRoot,standard)||job.Installed!=PeekUpdateProtocol.InstalledAt(job.Target)||job.Msi!=PeekUpdateProtocol.MsiInstalledAt(job.Target))throw new InvalidDataException("Invalid installation target");
   using(var ready=EventWaitHandle.OpenExisting(PeekUpdateProtocol.EventName(job.Id,"ready")))
   using(var go=EventWaitHandle.OpenExisting(PeekUpdateProtocol.EventName(job.Id,"go")))
   using(var running=new EventWaitHandle(false,EventResetMode.ManualReset,PeekUpdateProtocol.EventName(job.Id,"running")))
   using(var parent=Process.GetProcessById(job.ParentId)){
    if(parent.StartTime.ToUniversalTime().Ticks!=job.ParentStart||!PeekDataMove.IsHost(parent.ProcessName))throw new InvalidDataException("Update owner changed");
    PeekUpdateProtocol.VerifyVersion(job.Target,job.Current,false);
    PeekUpdateProtocol.Verify(job.Payload,job.Size,job.Digest,job.Version,job.Installed,job.Msi);
    backup=job.Target+".peek-backup-"+job.Id;
    if(job.Installed){if(!job.Msi)File.Copy(job.Target,backup,false);}
    else{staged=job.Target+".peek-new-"+job.Id;File.Copy(job.Payload,staged,false);PeekUpdateProtocol.Verify(staged,job.Size,job.Digest,job.Version,false);}
    ready.Set();
    if(!go.WaitOne(PreflightTimeout))return 3;
    if(!parent.WaitForExit((int)ExitTimeout.TotalMilliseconds))throw new TimeoutException("旧版 Peek 未退出，文件没有被替换。");
    approved=true;
    if(job.Installed){
     using(var lockPackage=File.OpenRead(job.Payload)){
      PeekUpdateProtocol.Verify(job.Payload,job.Size,job.Digest,job.Version,true,job.Msi);
      string directory=Path.GetDirectoryName(job.Target),log=Path.Combine(job.Directory,"install.log");
      string program=job.Msi?Path.Combine(Environment.SystemDirectory,"msiexec.exe"):job.Payload;
      string arguments=job.Msi?PeekUpdateProtocol.MsiArguments(job.Payload,directory,log):PeekUpdateProtocol.InstallerArguments(directory,log);
      using(var setup=Process.Start(new ProcessStartInfo(program,arguments){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=job.Directory})){
       if(setup==null)throw new IOException("无法启动更新安装程序。");
       setup.WaitForExit();
       if(job.Msi&&setup.ExitCode==3010){msiCommitted=true;throw new IOException("新版已安装，Windows 要求先重启系统。Peek 不会自动重启系统。");}
       if(setup.ExitCode!=0)throw new IOException("安装程序未完成，退出码："+setup.ExitCode);
       msiCommitted=job.Msi;
      }
     }
    }else File.Replace(staged,job.Target,backup,true);
    PeekUpdateProtocol.VerifyVersion(job.Target,job.Version,false);
    TryDelete(Path.Combine(job.DataRoot,PeekUpdateProtocol.FailureFile));
    Launch(job,job.Id);started=true;
    if(!running.WaitOne(LaunchTimeout))throw new TimeoutException("新版已写入，但未确认重启。请从原位置重新打开 Peek。");
    File.WriteAllText(Path.Combine(job.Directory,"completed.txt"),job.Version.ToString(3));
    TryDelete(backup);TryDelete(job.Payload);
   }
   return 0;
  }catch(Exception ex){
   if(job!=null){
    TryWrite(Path.Combine(job.Directory,"error.txt"),ex.ToString());
    if(approved){
     TryWrite(Path.Combine(job.DataRoot,PeekUpdateProtocol.FailureFile),ex.GetBaseException().Message);
     if(!started&&!msiCommitted)try{
      if(File.Exists(backup)){
       if(File.Exists(job.Target))File.Replace(backup,job.Target,null,true);
       else File.Move(backup,job.Target);
      }
      PeekUpdateProtocol.VerifyVersion(job.Target,job.Current,false);Launch(job,null);
     }catch(Exception recovery){TryWrite(Path.Combine(job.Directory,"recovery-error.txt"),recovery.ToString());}
    }else TryDelete(backup);
   }
   return 1;
  }finally{TryDelete(staged);if(!approved)TryDelete(backup);}
 }
 static void Launch(PeekUpdateJob job,string ticket){
  string arguments=ticket==null?"":"--update-ticket "+ticket;
  if(job.Smoke)arguments+=" --smoke "+PeekUpdateProtocol.Quote(job.DataRoot)+" --debug-port "+job.DebugPort;
  using(var launched=Process.Start(new ProcessStartInfo(job.Target,arguments){UseShellExecute=false,WorkingDirectory=Path.GetDirectoryName(job.Target)})){
   if(launched==null)throw new IOException("无法重新打开 Peek。");
  }
 }
 internal static void TryDelete(string path){if(path==null)return;try{File.Delete(path);}catch(IOException){}catch(UnauthorizedAccessException){}}
 static void TryWrite(string path,string text){try{File.WriteAllText(path,text);}catch(IOException){}catch(UnauthorizedAccessException){}}
}
