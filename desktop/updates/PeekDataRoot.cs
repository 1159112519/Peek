using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

internal static class PeekDataRoot {
 const string OldName="AsterHubWidgets";
 static string Local{get{return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);}}
 internal static string Legacy{get{return Path.Combine(Local,OldName);}}
 internal static string Default{get{return Path.Combine(Local,"Peek");}}
 internal static string Runtime{get{return Path.Combine(Local,"Peek.Runtime");}}
 internal static string Locator{get{return Path.Combine(Local,"Peek.Location","data-root.txt");}}
 internal static string Status{get{return Path.Combine(Path.GetDirectoryName(Locator),"migration-status.txt");}}
 internal static string Read(){return Read(Locator,Default);}
 internal static string Read(string locator,string fallback){
  if(!File.Exists(locator))return fallback;
  var p=Clean(File.ReadAllText(locator).Trim());
  if(!Directory.Exists(p))throw new DirectoryNotFoundException("Peek 数据目录不可用，请连接原驱动器："+p);
  return p;
 }
 internal static string MoveEvent(string token){Guid value;if(!Guid.TryParseExact(token,"N",out value))throw new IOException("Invalid migration request");return @"Local\PeekMove-"+value.ToString("N");}
 internal static string LockKey(string root){
  using(var sha=SHA256.Create())return @"Local\AsterHubWidgets-"+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToUpperInvariant()))).Replace("-","").Substring(0,24);
 }
 static string Clean(string path){
  if(string.IsNullOrWhiteSpace(path)||!Path.IsPathRooted(path))throw new IOException("请选择本机磁盘上的文件夹。");
  string full=Path.GetFullPath(path);
  if(full.StartsWith(@"\\",StringComparison.Ordinal)||full.Length<3||full[1]!=':'||full[2]!='\\')throw new IOException("不支持迁移到网络位置。");
  return full.Length==3?full:full.TrimEnd('\\');
 }
 static bool Same(string a,string b){return string.Equals(a,b,StringComparison.OrdinalIgnoreCase);}
 static bool Under(string a,string b){return a.StartsWith(b.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase);}
 static bool Overlap(string a,string b){return Same(a,b)||Under(a,b)||Under(b,a);}
 static void CheckParents(string directory){
  for(var d=new DirectoryInfo(directory);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("不支持链接或重定向的目录："+d.FullName);
 }
 internal static string Destination(string source,string parent){
  string target=Clean(Path.Combine(Clean(parent),"Peek"));
  if(Overlap(target,Runtime)||Overlap(target,Path.GetDirectoryName(Locator))||Overlap(target,Clean(source)))throw new IOException("目标不能与当前数据或运行目录重叠。");
  Validate(source,target);return target;
 }
 static void Validate(string source,string target){
  source=Clean(source);target=Clean(target);
  if(Overlap(source,target)||!Directory.Exists(source)||!Directory.Exists(Path.GetDirectoryName(target)))throw new IOException("源和目标必须是不同且可用的文件夹。");
  CheckParents(source);CheckParents(Path.GetDirectoryName(target));
  if(Directory.Exists(target)||File.Exists(target))throw new IOException("目标中已有 Peek 文件夹；请选择其他位置，现有文件不会被覆盖。");
 }
 static readonly string[] Cache={"Runtime","PortableRuntime","WebView","WebViewPopups","Updates"};
 static void CopyTree(string from,string to,bool root){
  Directory.CreateDirectory(to);
  foreach(var entry in new DirectoryInfo(from).EnumerateFileSystemInfos()){
   if(root&&entry is DirectoryInfo&&Cache.Contains(entry.Name,StringComparer.OrdinalIgnoreCase))continue;
   if((entry.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("迁移不会复制链接："+entry.FullName);
   string next=Path.Combine(to,entry.Name);
   if(entry is DirectoryInfo)CopyTree(entry.FullName,next,false);
   else{
    File.Copy(entry.FullName,next,false);
    using(var sha=SHA256.Create())using(var a=File.OpenRead(entry.FullName))using(var b=File.OpenRead(next))if(!sha.ComputeHash(a).SequenceEqual(sha.ComputeHash(b)))throw new IOException("复制校验失败："+entry.Name);
   }
  }
 }
 static void Write(string file,string value){
  Directory.CreateDirectory(Path.GetDirectoryName(file));string temp=file+"."+Guid.NewGuid().ToString("N")+".tmp";
  File.WriteAllText(temp,value);try{if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);}finally{if(File.Exists(temp))File.Delete(temp);}
 }
 internal static void Report(string text){try{Write(Status,text);}catch{}}
 internal static string LegacyStartup(){
  if(File.Exists(Locator)||Directory.Exists(Default)||!Directory.Exists(Legacy))return Read();
  var backup=Migrate(Legacy,Default,Locator);if(backup==Legacy)Report("已切换到 Peek；旧目录被占用，已原样保留："+Legacy);
  return Default;
 }
 internal static string Migrate(string source,string target,string locator){
  source=Clean(source);target=Clean(target);Validate(source,target);
  string staging=Path.Combine(Path.GetDirectoryName(target),".peek-moving-"+Guid.NewGuid().ToString("N"));
  bool moved=false,published=false;
  try{
   CopyTree(source,staging,true);Directory.Move(staging,target);moved=true;
   Write(locator,target);published=true;
  }finally{
   // On failure the old root remains authoritative. Do not delete pre-existing paths.
   if(!published)try{
    if(moved&&Directory.Exists(target))Directory.Move(target,staging);
    if(Directory.Exists(staging)&&Path.GetDirectoryName(staging)==Path.GetDirectoryName(target)&&Path.GetFileName(staging).StartsWith(".peek-moving-",StringComparison.Ordinal))Directory.Delete(staging,true);
   }catch{}
  }
  string backup=source+".backup-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+"-"+Guid.NewGuid().ToString("N").Substring(0,6);
  for(int i=0;i<9;i++)try{Directory.Move(source,backup);return backup;}catch(IOException){Thread.Sleep(250);}catch(UnauthorizedAccessException){break;}
  return source;
 }
}
