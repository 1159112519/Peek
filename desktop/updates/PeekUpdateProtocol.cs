using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

internal static class PeekUpdateProtocol {
 internal const string UninstallKey=@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{B86A0A48-66C9-4C84-B53C-6BA90801F43F}_is1";
 internal const string MsiUpgradeCode="{A5890BC5-FE2E-477A-AE36-C0345A415707}";
 internal const string MsiInstallKey=@"Software\Peek\Installer";
 internal const string FailureFile="update-failure.txt";
 internal const long MaxBytes=200L*1024*1024;
 internal static string AssetName(Version version,bool installed,bool msi=false){return installed?"Peek-Setup-v"+version.ToString(3)+(msi?".msi":".exe"):"Peek.exe";}
 internal static bool IsSha(string value){return value!=null&&Regex.IsMatch(value,@"\A[0-9a-fA-F]{64}\z");}
 internal static void CheckMetadata(long size,string sha){if(size<=0||size>MaxBytes||!IsSha(sha))throw new InvalidDataException("官方更新包缺少有效的大小或 SHA-256。");}
 internal static string ManifestDigest(string manifest,string asset){
  string digest=null;
  foreach(string line in manifest.Split('\n')){
   var match=Regex.Match(line.TrimEnd('\r'),@"\A([0-9a-fA-F]{64})[ \t]+\*?(.+)\z",RegexOptions.CultureInvariant);
   if(!match.Success||!string.Equals(match.Groups[2].Value,asset,StringComparison.Ordinal))continue;
   if(digest!=null)throw new InvalidDataException("官方更新校验文件重复列出同一个更新包。");
   digest=match.Groups[1].Value;
  }
  if(digest==null)throw new InvalidDataException("官方更新包缺少 SHA-256。");
  return digest;
 }
 internal static Version ReadVersion(string value){Version v;if(!Version.TryParse(value,out v)||v.Build<0||v.Revision>=0||v.ToString(3)!=value)throw new InvalidDataException("无效的 Peek 更新版本。");return v;}
 internal static bool AllowedDownload(Uri uri){
  return uri!=null&&uri.IsAbsoluteUri&&uri.Scheme=="https"&&uri.IsDefaultPort&&uri.UserInfo.Length==0&&
   (uri.Host=="github.com"||uri.Host=="release-assets.githubusercontent.com"||uri.Host=="objects.githubusercontent.com");
 }
 internal static string Hash(string path){using(var sha=SHA256.Create())using(var stream=File.OpenRead(path))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 internal static void Verify(string path,long size,string expected,Version version,bool installed,bool msi=false){
  CheckMetadata(size,expected);
  if(new FileInfo(path).Length!=size||!string.Equals(Hash(path),expected,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("更新包 SHA-256 校验失败。");
  if(msi)VerifyMsi(path,version);else VerifyVersion(path,version,installed);
 }
 internal static void VerifyVersion(string path,Version version,bool installed){
  var f=FileVersionInfo.GetVersionInfo(path);
  Version detected;
  if(!Version.TryParse((f.ProductVersion??"").Trim(),out detected)||detected.Major!=version.Major||detected.Minor!=version.Minor||detected.Build!=version.Build||detected.Revision>0||(f.ProductName??"").Trim()!="Peek"||(f.FileDescription??"").Trim()!=(installed?"Peek Setup":"Peek"))
   throw new InvalidDataException("更新包的产品或版本信息不匹配。");
 }
 internal static string Quote(string path){
  if(string.IsNullOrWhiteSpace(path)||path.IndexOfAny(new[]{'"','\r','\n','\0'})>=0)throw new ArgumentException("无效的文件路径。");
  // Windows command lines require doubling trailing slashes before the closing quote.
  int extra=path.Length-path.TrimEnd('\\').Length;
  return "\""+path+new string('\\',extra)+"\"";
 }
 internal static string InstallerArguments(string directory,string log){
  return "/VERYSILENT /SUPPRESSMSGBOXES /SP- /NORESTART /NOCLOSEAPPLICATIONS /NORESTARTAPPLICATIONS /DIR="+Quote(directory)+" /LOG="+Quote(log);
 }
 internal static string MsiArguments(string msi,string directory,string log){
  return "/i "+Quote(msi)+" /qn /norestart REBOOT=ReallySuppress INSTALLFOLDER="+Quote(directory)+" /L*v "+Quote(log);
 }
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] static extern uint MsiOpenDatabase(string path,IntPtr mode,out uint database);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] static extern uint MsiDatabaseOpenView(uint database,string sql,out uint view);
 [DllImport("msi.dll")] static extern uint MsiViewExecute(uint view,uint record);
 [DllImport("msi.dll")] static extern uint MsiViewFetch(uint view,out uint record);
 [DllImport("msi.dll",CharSet=CharSet.Unicode)] static extern uint MsiRecordGetString(uint record,uint field,StringBuilder value,ref uint length);
 [DllImport("msi.dll")] static extern uint MsiCloseHandle(uint handle);
 static void CheckMsi(uint result){if(result!=0)throw new InvalidDataException("无法读取 Peek MSI 更新包信息（"+result+"）。");}
 static string MsiProperty(uint database,string name){
  uint view=0,record=0;
  try{
   CheckMsi(MsiDatabaseOpenView(database,"SELECT `Value` FROM `Property` WHERE `Property` = '"+name+"'",out view));
   CheckMsi(MsiViewExecute(view,0));CheckMsi(MsiViewFetch(view,out record));
   var value=new StringBuilder(256);uint length=(uint)value.Capacity;CheckMsi(MsiRecordGetString(record,1,value,ref length));return value.ToString();
  }finally{if(record!=0)MsiCloseHandle(record);if(view!=0)MsiCloseHandle(view);}
 }
 internal static void VerifyMsi(string path,Version version){
  uint database=0;
  try{
   CheckMsi(MsiOpenDatabase(path,IntPtr.Zero,out database));
   if(MsiProperty(database,"ProductName")!="Peek"||MsiProperty(database,"ProductVersion")!=version.ToString(3)||
    !string.Equals(MsiProperty(database,"UpgradeCode"),MsiUpgradeCode,StringComparison.OrdinalIgnoreCase))
    throw new InvalidDataException("更新包的 MSI 产品或版本信息不匹配。");
  }finally{if(database!=0)MsiCloseHandle(database);}
 }
 internal static bool MsiInstalledAt(string exe){
  if(!string.Equals(Path.GetFileName(exe),"Peek.exe",StringComparison.OrdinalIgnoreCase))return false;
  using(var user=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,RegistryView.Registry64))using(var key=user.OpenSubKey(MsiInstallKey)){
   string directory=key==null?null:key.GetValue("InstallLocation") as string;
   return !string.IsNullOrWhiteSpace(directory)&&Same(Path.Combine(directory,"Peek.exe"),exe);
  }
 }
 internal static bool InstalledAt(string exe){
  if(MsiInstalledAt(exe))return true;
  if(!string.Equals(Path.GetFileName(exe),"Peek.exe",StringComparison.OrdinalIgnoreCase))return false;
  foreach(var view in new[]{RegistryView.Registry64,RegistryView.Registry32})using(var user=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))using(var key=user.OpenSubKey(UninstallKey)){
   if(key==null)continue;
   string directory=key.GetValue("InstallLocation") as string??key.GetValue("Inno Setup: App Path") as string;
   if(!string.IsNullOrWhiteSpace(directory)&&Same(Path.Combine(directory,"Peek.exe"),exe))return true;
  }
  return false;
 }
 internal static bool Same(string a,string b){return string.Equals(Path.GetFullPath(a),Path.GetFullPath(b),StringComparison.OrdinalIgnoreCase);}
 internal static string EventName(string id,string purpose){Guid token;if(!Guid.TryParseExact(id,"N",out token))throw new InvalidDataException("无效的更新请求。");return @"Local\PeekUpdate-"+token.ToString("N")+"-"+purpose;}
}

internal sealed class PeekUpdateJob {
 internal readonly string Directory,Target,Payload,DataRoot,Id,Digest;
 internal readonly Version Version,Current;
 internal readonly bool Installed,Smoke,Msi;
 internal readonly int ParentId,DebugPort;
 internal readonly long ParentStart,Size;
 internal PeekUpdateJob(string folder,string target,string dataRoot,Version current,Version next,bool installed,long size,string digest,int pid,long started,bool smoke,int port,bool msi=false){
  Directory=Path.GetFullPath(folder);Target=Path.GetFullPath(target);DataRoot=Path.GetFullPath(dataRoot);Current=current;Version=next;Size=size;Digest=digest;ParentId=pid;ParentStart=started;Installed=installed;Msi=msi;Smoke=smoke;DebugPort=port;
  Id=Path.GetFileName(Directory);PeekUpdateProtocol.EventName(Id,"ready");
  if(!PeekUpdateProtocol.Same(Path.GetDirectoryName(Directory),Path.Combine(DataRoot,"Updates"))||next<=current||pid<=0||started<=0||port<0||port>65535||(!smoke&&port!=0)||(msi&&!installed))throw new InvalidDataException("更新任务不符合要求。");
  Payload=Path.Combine(Directory,PeekUpdateProtocol.AssetName(next,installed,msi));
 }
 internal string JobFile{get{return Path.Combine(Directory,"job.txt");}}
 internal void Save(){File.WriteAllLines(JobFile,new[]{Target,DataRoot,Current.ToString(3),Version.ToString(3),Msi?"2":Installed?"1":"0",Size.ToString(CultureInfo.InvariantCulture),Digest,ParentId.ToString(CultureInfo.InvariantCulture),ParentStart.ToString(CultureInfo.InvariantCulture),Smoke?"1":"0",DebugPort.ToString(CultureInfo.InvariantCulture)});}
 internal static PeekUpdateJob Load(string path){
  var fields=File.ReadAllLines(path);if(fields.Length!=11||Path.GetFileName(path)!="job.txt")throw new InvalidDataException("无法读取更新任务。");
  return new PeekUpdateJob(Path.GetDirectoryName(path),fields[0],fields[1],PeekUpdateProtocol.ReadVersion(fields[2]),PeekUpdateProtocol.ReadVersion(fields[3]),fields[4]=="1"||fields[4]=="2",long.Parse(fields[5],CultureInfo.InvariantCulture),fields[6],int.Parse(fields[7],CultureInfo.InvariantCulture),long.Parse(fields[8],CultureInfo.InvariantCulture),fields[9]=="1",int.Parse(fields[10],CultureInfo.InvariantCulture),fields[4]=="2");
 }
}
