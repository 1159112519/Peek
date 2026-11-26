using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

internal static class PeekUpdateDownload {
 static void WithAsset(Uri uri,CancellationToken token,Action<HttpWebResponse> read){
  var protocol=ServicePointManager.SecurityProtocol;
  if((int)protocol!=0&&(protocol&SecurityProtocolType.Tls12)==0)ServicePointManager.SecurityProtocol=protocol|SecurityProtocolType.Tls12;
  for(int redirect=0;redirect<6;redirect++){
   token.ThrowIfCancellationRequested();
   if(!PeekUpdateProtocol.AllowedDownload(uri))throw new InvalidDataException("拒绝使用非官方更新地址。");
   var request=(HttpWebRequest)WebRequest.Create(uri);
   request.AllowAutoRedirect=false;request.Timeout=15000;request.ReadWriteTimeout=15000;
   request.UserAgent="Peek/"+WidgetHost.VersionText;
   request.CachePolicy=new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
   using(token.Register(request.Abort)){
    try{using(var response=(HttpWebResponse)request.GetResponse()){
     int status=(int)response.StatusCode;
     if(status==301||status==302||status==303||status==307||status==308){
      string location=response.Headers[HttpResponseHeader.Location];
      if(string.IsNullOrEmpty(location)||!Uri.TryCreate(uri,location,out uri))throw new InvalidDataException("无效的官方更新跳转。");
      continue;
     }
     if(status!=200)throw new IOException("无法下载 Peek 的官方更新文件。");
     read(response);return;
    }}catch(WebException ex){token.ThrowIfCancellationRequested();if(ex.Response!=null)ex.Response.Close();throw new IOException("无法下载 Peek 的官方更新文件，请稍后重试。",ex);}
    catch(IOException){token.ThrowIfCancellationRequested();throw;}
   }
  }
  throw new IOException("官方更新地址跳转过多。");
 }
 internal static string Fetch(Version version,bool installed,string destination,Action<int> progress,CancellationToken token){
  string package=PeekUpdateProtocol.AssetName(version,installed),digest=null;
  string release=PeekUpdates.ReleasesUrl+"/download/v"+version.ToString(3)+"/";
  // This public asset is tied to the checked Release tag and does not need anonymous REST API quota.
  WithAsset(new Uri(release+"SHA256SUMS.txt"),token,response=>{
   if(response.ContentLength>8192)throw new InvalidDataException("官方更新校验文件超出大小限制。");
   using(var reader=new StreamReader(response.GetResponseStream())){
    var buffer=new char[8193];int count=reader.ReadBlock(buffer,0,buffer.Length);
    if(count==buffer.Length)throw new InvalidDataException("官方更新校验文件超出大小限制。");
    digest=PeekUpdateProtocol.ManifestDigest(new string(buffer,0,count),package);
   }
  });
  var clock=Stopwatch.StartNew();
  WithAsset(new Uri(release+package),token,response=>{
   long expected=response.ContentLength;
   if(expected==0||expected>PeekUpdateProtocol.MaxBytes)throw new InvalidDataException("官方更新包大小不符合要求。");
   long limit=expected>0?expected:PeekUpdateProtocol.MaxBytes;
   using(var from=response.GetResponseStream())using(var to=new FileStream(destination,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    byte[] buffer=new byte[128*1024];long bytes=0;int count,last=-1;
    while((count=from.Read(buffer,0,buffer.Length))>0){
     token.ThrowIfCancellationRequested();
     if(bytes+count>limit||clock.Elapsed>TimeSpan.FromMinutes(10))throw new IOException("更新下载超出限制。");
     to.Write(buffer,0,count);bytes+=count;
     int percent=expected>0?(int)(99*bytes/expected):0;if(percent!=last){last=percent;progress(percent);}
    }
    if(bytes==0||(expected>0&&bytes!=expected))throw new IOException("更新包未完整下载。");
    to.Flush(true);
   }
  });
  return digest;
 }
 internal static PeekUpdateJob Prepare(Version version,Action<int> progress,CancellationToken token){
  string target=WidgetHost.LauncherPath;
  if(string.IsNullOrEmpty(target)||!File.Exists(target))throw new IOException("请从原来的 Peek.exe 启动后再更新。");
  var current=PeekUpdateProtocol.ReadVersion(WidgetHost.VersionText);
  if(version<=current)throw new InvalidDataException("不会安装当前版本或更旧版本。");
  PeekUpdateProtocol.VerifyVersion(target,current,false);
  var folder=Path.Combine(WorkbenchHost.DataRoot,"Updates",Guid.NewGuid().ToString("N"));
  Directory.CreateDirectory(folder);
  string part=Path.Combine(folder,"package.part");bool ready=false;
  try{
   bool smoke=WidgetHost.TestMode,installed=PeekUpdateProtocol.InstalledAt(target);string digest;
   if(smoke){
    string testFolder=Path.GetDirectoryName(WorkbenchHost.SmokeRoot);
    if(string.IsNullOrEmpty(testFolder)||!PeekUpdateProtocol.Same(Path.GetDirectoryName(target),testFolder))throw new InvalidOperationException("Updates in test mode require an isolated copy of Peek.exe.");
    var lines=File.ReadAllLines(Path.Combine(WorkbenchHost.SmokeRoot,"peek-update-package.test.txt"));
    if(lines.Length!=2||(lines[0]!="portable"&&lines[0]!="installed"))throw new InvalidDataException("Invalid test asset fixture");
    installed=lines[0]=="installed";digest=lines[1];
    string fixture=Path.Combine(WorkbenchHost.SmokeRoot,"Fixture",PeekUpdateProtocol.AssetName(version,installed));
    PeekUpdateProtocol.CheckMetadata(new FileInfo(fixture).Length,digest);File.Copy(fixture,part,false);
   }else digest=Fetch(version,installed,part,progress,token);
   token.ThrowIfCancellationRequested();
   long size=new FileInfo(part).Length;PeekUpdateProtocol.Verify(part,size,digest,version,installed);
   token.ThrowIfCancellationRequested();
   using(var self=Process.GetCurrentProcess()){
    var job=new PeekUpdateJob(folder,target,WorkbenchHost.DataRoot,current,version,installed,size,digest,self.Id,self.StartTime.ToUniversalTime().Ticks,smoke,smoke?WorkbenchHost.DebugPort:0);
    job.Save();File.Move(part,job.Payload);ready=true;progress(100);return job;
   }
  }finally{if(!ready)try{File.Delete(part);File.Delete(Path.Combine(folder,"job.txt"));Directory.Delete(folder);}catch(IOException){}catch(UnauthorizedAccessException){}}
 }
}
